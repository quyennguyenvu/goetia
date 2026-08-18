# v0.9 Zoom, Sign-Out, and Quick-Switcher Recents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-service zoom (View menu, `⌘0` becomes Actual Size, Home moves to `⌘⇧H`), a rail-tile menu with local sign-out, and a Recent-conversations section in the quick switcher fed by an in-memory activity log.

**Architecture:** Three independent slices over the existing main/preload/renderer split. Pure decision logic lands in `lib/` helpers with vitest coverage (`zoom-rules`, `activity-log`, `switcher-results`); `views.ts`, `menu.ts`, `ipc-handlers.ts` stay thin wiring. The activity log lives only in main memory, is fed by the already-throttled banner stream, and crosses IPC as display fields + opaque ids — hrefs never leave main; clicks re-validate through `resolveBannerClick`.

**Tech Stack:** Electron 37 / TypeScript / React + zustand + Tailwind (shell) / vitest + Playwright. Spec: `docs/superpowers/specs/2026-08-17-zoom-signout-and-recents-design.md`.

## Global Constraints

- **Commits are user-gated.** NEVER run `git commit` or write `GRIMOIRE_COMMIT_MSG.txt`. At each checkpoint step, STOP and ask the user to run `/grimoire-core:commit`, quoting the suggested message. Continue only after they confirm or decline.
- Definition of done for the release: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` all green, and `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e` green (VS Code shells export `ELECTRON_RUN_AS_NODE`; Playwright needs it unset).
- Run a single test file with `corepack pnpm test tests/unit/<file>.test.ts`.
- `src/shared/**` stays process-agnostic: no `electron`, no DOM imports.
- New IPC channels must be classified in `shared/ipc.ts` and enforced via `ipcSenderAllowed` — this plan adds `service:tileMenu`, `activity:open` (send) and `activity:recent` (invoke), all shell-only.
- No per-tick or per-banner broadcasts: the switcher fetches recents once per open; `MainState` broadcast discipline is untouched.
- `views.ts` contains `[calls-debug]` console lines owned by another workstream — leave every one of them exactly as-is.
- Zoom levels use Chromium's `1.2^level` scale: step `0.5`, clamp `[-3.5, 3.5]`, default `0`.
- Copy rules: menu items are `Zoom In`, `Zoom Out`, `Actual Size`, `Sign Out…`; dialog copy is `Sign out of <name>?` / `This clears its login on this device. An active call on this service would end.`; switcher placeholder is `Search services and recent chats…`.
- Any edited `.md` must pass `npx markdownlint-cli2 <file>` with the repo config.

---

### Task 1: Zoom rules helper

**Files:**

- Create: `src/main/lib/zoom-rules.ts`
- Test: `tests/unit/zoom-rules.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `ZOOM_STEP = 0.5`, `ZOOM_MIN = -3.5`, `ZOOM_MAX = 3.5`, `clampZoom(raw: unknown): number`, `stepZoom(level: unknown, dir: 1 | -1): number`. Tasks 2–4 import `clampZoom`/`stepZoom`.

- [x] **Step 1: Write the failing test**

```ts
// tests/unit/zoom-rules.test.ts
import { describe, expect, it } from 'vitest';
import { clampZoom, stepZoom, ZOOM_MAX, ZOOM_MIN } from '../../src/main/lib/zoom-rules';

describe('clampZoom', () => {
  it('passes finite in-range levels through', () => {
    expect(clampZoom(1.5)).toBe(1.5);
    expect(clampZoom(0)).toBe(0);
  });
  it('coerces corrupt values to 0', () => {
    expect(clampZoom(Number.NaN)).toBe(0);
    expect(clampZoom('2')).toBe(0);
    expect(clampZoom(undefined)).toBe(0);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(0);
  });
  it('clamps out-of-range levels to the bounds', () => {
    expect(clampZoom(99)).toBe(ZOOM_MAX);
    expect(clampZoom(-99)).toBe(ZOOM_MIN);
  });
});

describe('stepZoom', () => {
  it('steps by 0.5 in either direction', () => {
    expect(stepZoom(0, 1)).toBe(0.5);
    expect(stepZoom(0, -1)).toBe(-0.5);
  });
  it('saturates at the bounds', () => {
    expect(stepZoom(ZOOM_MAX, 1)).toBe(ZOOM_MAX);
    expect(stepZoom(ZOOM_MIN, -1)).toBe(ZOOM_MIN);
  });
  it('treats a corrupt current level as 0', () => {
    expect(stepZoom(Number.NaN, 1)).toBe(0.5);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test tests/unit/zoom-rules.test.ts`
Expected: FAIL — cannot resolve `../../src/main/lib/zoom-rules`.

- [x] **Step 3: Write the implementation**

```ts
// src/main/lib/zoom-rules.ts
export const ZOOM_STEP = 0.5;
export const ZOOM_MIN = -3.5;
export const ZOOM_MAX = 3.5;

/** Chromium zoom level (factor = 1.2^level, so ±3.5 ≈ 53%–189%).
 *  Anything non-finite — a hand-mangled settings.json — resets to 0. */
export function clampZoom(raw: unknown): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n));
}

export function stepZoom(level: unknown, dir: 1 | -1): number {
  return clampZoom(clampZoom(level) + dir * ZOOM_STEP);
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `corepack pnpm test tests/unit/zoom-rules.test.ts`
Expected: PASS (7 tests).

- [x] **Step 5: Checkpoint — request commit**

STOP. Ask the user to run `/grimoire-core:commit` (suggested message: `feat(zoom): add zoom level step/clamp rules`). Do not run `git commit` yourself.

---

### Task 2: Persist per-service zoom in settings

**Files:**

- Modify: `src/shared/types.ts` (Settings interface + DEFAULT_SETTINGS)
- Modify: `src/main/settings.ts` (normalize)
- Test: `tests/unit/settings.test.ts` (append cases)

**Interfaces:**

- Consumes: `clampZoom` from Task 1.
- Produces: `Settings.zoom: Record<ServiceId, number>` (default all `0`), reconciled by `normalize`. Tasks 3–4 read `settings.get().zoom[id]` and write via `settings.update({ zoom })`.

- [x] **Step 1: Write the failing tests**

Append to the `describe('SettingsStore', …)` block in `tests/unit/settings.test.ts` (it already imports `mkdtempSync`, `writeFileSync`, `join`, `tmpdir`, `SettingsStore`):

```ts
  it('defaults zoom to 0 for every service', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    const zoom = new SettingsStore(dir).get().zoom;
    expect(Object.keys(zoom)).toHaveLength(SERVICES.length);
    expect(Object.values(zoom).every((z) => z === 0)).toBe(true);
  });

  it('fills missing zoom keys and clamps corrupt values', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ zoom: { whatsapp: 99, telegram: 'big', discord: 1.5 } }),
    );
    const zoom = new SettingsStore(dir).get().zoom;
    expect(zoom.whatsapp).toBe(3.5); // clamped to ZOOM_MAX
    expect(zoom.telegram).toBe(0); // corrupt string coerced
    expect(zoom.discord).toBe(1.5);
    expect(zoom.zalo).toBe(0); // missing key filled
  });

  it('round-trips a zoom update across instances', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    const store = new SettingsStore(dir);
    store.update({ zoom: { ...store.get().zoom, slack: 1 } });
    expect(new SettingsStore(dir).get().zoom.slack).toBe(1);
  });
```

- [x] **Step 2: Run tests to verify they fail**

Run: `corepack pnpm test tests/unit/settings.test.ts`
Expected: FAIL — `zoom` does not exist on `Settings`.

- [x] **Step 3: Add the field to shared types**

In `src/shared/types.ts`, inside `interface Settings` directly after the `neverHibernate` line, add:

```ts
  /** Per-service Chromium zoom level (1.2^level); 0 = 100%. */
  zoom: Record<ServiceId, number>;
```

In `DEFAULT_SETTINGS` directly after the `neverHibernate` record, add:

```ts
  zoom: {
    whatsapp: 0,
    messenger: 0,
    instagram: 0,
    telegram: 0,
    discord: 0,
    zalo: 0,
    tiktok: 0,
    shopee: 0,
    slack: 0,
    teams: 0,
  },
```

- [x] **Step 4: Reconcile it in normalize**

In `src/main/settings.ts`, add the import and a fill helper, and wire it into `normalize`:

```ts
import { clampZoom } from './lib/zoom-rules';
```

Below `fillSummonHotkey`, add:

```ts
/** Number-record twin of fill(): missing keys default to 0, corrupt or
 *  out-of-range levels coerce/clamp via clampZoom. */
function fillZoom(raw: unknown): Record<ServiceId, number> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<ServiceId, number>>;
  return Object.fromEntries(SERVICES.map((s) => [s.id, clampZoom(r[s.id])])) as Record<
    ServiceId,
    number
  >;
}
```

In the `normalize` return object, after `neverHibernate: …`, add:

```ts
      zoom: fillZoom(raw.zoom),
```

- [x] **Step 5: Run tests to verify they pass**

Run: `corepack pnpm test tests/unit/settings.test.ts` then `corepack pnpm typecheck`
Expected: PASS; typecheck clean (DEFAULT_SETTINGS satisfies the new field).

- [x] **Step 6: Checkpoint — request commit**

STOP. Ask the user to run `/grimoire-core:commit` (suggested message: `feat(zoom): persist per-service zoom level in settings`).

---

### Task 3: Apply zoom to service views

**Files:**

- Modify: `src/main/views.ts` (constructor param, create(), new method)
- Modify: `src/main/index.ts` (constructor call site)

**Interfaces:**

- Consumes: `settings.get().zoom` from Task 2.
- Produces: `ServiceViewManager.applyZoom(id: ServiceId): void`; constructor gains a `zoomLevel: (id: ServiceId) => number` getter inserted **between** the existing `waking` getter and the optional `overlay` param. Task 4 calls `applyZoom`.

- [x] **Step 1: Add the getter param**

In `src/main/views.ts`, the constructor becomes (only the new line differs):

```ts
  constructor(
    private win: BrowserWindow,
    private hooks: ViewHooks,
    private railPosition: () => RailPosition,
    private audioMuted: (id: ServiceId) => boolean,
    private waking: (id: ServiceId) => boolean,
    private zoomLevel: (id: ServiceId) => number,
    private overlay?: {
      setBounds(b: { x: number; y: number; width: number; height: number }): void;
      raise(): void;
    },
  ) {
    win.on('resize', () => this.scheduleLayout());
  }
```

- [x] **Step 2: Apply at create and re-assert after every load**

In `create(id)`, directly after `wc.setAudioMuted(this.audioMuted(id));` add:

```ts
    wc.setZoomLevel(this.zoomLevel(id));
```

Change the existing `did-finish-load` listener from:

```ts
    wc.on('did-finish-load', () => this.hooks.onLoading(id, false));
```

to:

```ts
    wc.on('did-finish-load', () => {
      // re-assert: restarts, hibernation wakes, reloads and sign-outs all
      // land here, and the persisted level must survive every one of them
      wc.setZoomLevel(this.zoomLevel(id));
      this.hooks.onLoading(id, false);
    });
```

- [x] **Step 3: Add applyZoom**

Next to `applyAudioMute`, add:

```ts
  /** Re-apply the persisted zoom after a View-menu change. */
  applyZoom(id: ServiceId): void {
    const wc = this.views.get(id)?.webContents;
    if (wc && !wc.isDestroyed()) wc.setZoomLevel(this.zoomLevel(id));
  }
```

- [x] **Step 4: Wire the getter at the call site**

In `src/main/index.ts`, in the `new ServiceViewManager(…)` call, insert between the waking getter `(id) => state.runtime(id).waking,` and `overlay,`:

```ts
      (id) => settings.get().zoom[id],
```

- [x] **Step 5: Verify**

Run: `corepack pnpm typecheck && corepack pnpm test`
Expected: both clean — no unit test drives `views.ts` directly; the full suite guards against regressions.

- [x] **Step 6: Checkpoint — request commit**

STOP. Ask the user to run `/grimoire-core:commit` (suggested message: `feat(zoom): apply persisted zoom level to service views`).

---

### Task 4: View menu + Home moves to ⌘⇧H

**Files:**

- Modify: `src/main/menu.ts` (View submenu, Home accelerator, zoom helpers)
- Modify: `src/renderer/src/components/Rail.tsx:79` (Home tooltip)
- Modify: `src/renderer/src/components/welcome/HomeHero.tsx:89` (hint copy)
- Modify: `src/shared/welcome.ts:3`, `src/main/lib/service-accelerator.ts:1`, `src/main/activate.ts:15` (comments naming ⌘0)

**Interfaces:**

- Consumes: `stepZoom` (Task 1), `Settings.zoom` (Task 2), `views.applyZoom` (Task 3).
- Produces: user-facing accelerators — `CmdOrCtrl+=`/`CmdOrCtrl+-`/`CmdOrCtrl+0` for zoom, `CmdOrCtrl+Shift+H` for Home. No exports.

- [x] **Step 1: Add zoom helpers and the View menu**

In `src/main/menu.ts`, add the import:

```ts
import { stepZoom } from './lib/zoom-rules';
```

Below `toggleHome`, add:

```ts
/** Zoom acts on the active service view; with no view anywhere (fresh
 *  install on Home) it is a silent no-op. Persist first, then re-apply. */
function setActiveZoom(ctx: AppContext, next: (current: number) => number): void {
  const id = ctx.state.activeId;
  if (!ctx.views.has(id)) return;
  const s = ctx.settings.get();
  ctx.settings.update({ zoom: { ...s.zoom, [id]: next(s.zoom[id]) } });
  ctx.views.applyZoom(id);
}
```

In the `template` array, between `{ role: 'editMenu' }` and the `Go` entry, add:

```ts
    {
      label: 'View',
      submenu: [
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+=',
          click: () => setActiveZoom(ctx, (z) => stepZoom(z, 1)),
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => setActiveZoom(ctx, (z) => stepZoom(z, -1)),
        },
        {
          label: 'Actual Size',
          accelerator: 'CmdOrCtrl+0',
          click: () => setActiveZoom(ctx, () => 0),
        },
      ],
    },
```

Change the Home item's accelerator from `'CmdOrCtrl+0'` to `'CmdOrCtrl+Shift+H'`.

- [x] **Step 2: Update the four ⌘0 mentions**

- `Rail.tsx:79`: `title="Home — all services (⌘0)"` → `title="Home — all services (⌘⇧H)"`
- `HomeHero.tsx:89`: `⌘/Ctrl 0 returns you here` → `⌘/Ctrl ⇧ H returns you here`
- `src/shared/welcome.ts:3` comment: replace the `⌘/Ctrl+0 is Home` phrasing with `⌘/Ctrl+0 is Actual Size and ⌘/Ctrl+⇧+H is Home` (keep the rest of the sentence about services taking 1…9).
- `src/main/lib/service-accelerator.ts:1` comment: same substitution.
- `src/main/activate.ts:15` comment: `Both ⌘/Ctrl 0 and the IPC handler` → `Both ⌘/Ctrl ⇧ H and the IPC handler`.

- [x] **Step 3: Verify**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: all clean. Then a quick live check in `corepack pnpm dev`: `⌘=`/`⌘-`/`⌘0` resize the active service and stick per service; `⌘⇧H` opens Home; `⌘0` no longer does.

- [x] **Step 4: Checkpoint — request commit**

STOP. Ask the user to run `/grimoire-core:commit` (suggested message: `feat(zoom): add View menu; move Home to CmdOrCtrl+Shift+H`).

---

### Task 5: Rail tile menu with mute and sign-out

**Files:**

- Modify: `src/shared/ipc.ts` (`service:tileMenu` channel)
- Create: `src/main/signout.ts`
- Modify: `src/main/views.ts` (`loadServiceUrl`)
- Modify: `src/main/ipc-handlers.ts` (`setServiceMuted` extraction + `service:tileMenu` handler)
- Modify: `src/renderer/src/components/Rail.tsx` (context-menu send)
- Test: `tests/unit/ipc-sender-policy.test.ts` (append cases)

**Interfaces:**

- Consumes: `views.refresh` pattern, `serviceById`, existing `register()` wrapper.
- Produces: `RendererToMain['service:tileMenu'] = { serviceId: ServiceId }` (shell-only); `confirmSignOut(ctx: AppContext, id: ServiceId): Promise<void>`; `ServiceViewManager.loadServiceUrl(id: ServiceId): void`.

- [x] **Step 1: Write the failing policy tests**

Append inside the `describe('ipcSenderAllowed', …)` block of `tests/unit/ipc-sender-policy.test.ts`:

```ts
  it('allows the tile menu from the shell frame', () => {
    expect(
      ipcSenderAllowed({
        channel: 'service:tileMenu',
        fromShell: true,
        senderServiceId: null,
        payloadServiceId: 'telegram',
      }),
    ).toBe(true);
  });
  it('rejects the tile menu from a service frame', () => {
    expect(
      ipcSenderAllowed({
        channel: 'service:tileMenu',
        fromShell: false,
        senderServiceId: 'telegram',
        payloadServiceId: 'telegram',
      }),
    ).toBe(false);
  });
```

Run: `corepack pnpm test tests/unit/ipc-sender-policy.test.ts`
Expected: FAIL — `'service:tileMenu'` is not a known channel.

- [x] **Step 2: Declare the channel**

In `src/shared/ipc.ts`: add to `RendererToMain` (after `service:reload`):

```ts
  /** right-click on a rail tile: main pops the native per-service menu */
  'service:tileMenu': { serviceId: ServiceId };
```

Add `'service:tileMenu',` to `R2M_CHANNELS` (after `'service:reload',`) and to `SHELL_ONLY_CHANNELS` (same position). Re-run the policy test file — PASS.

- [x] **Step 3: Add views.loadServiceUrl**

In `src/main/views.ts`, next to `refresh`:

```ts
  /** Post-sign-out reset: land a live view back on the chat URL. Not the ⌘R
   *  path, so no reload-guard — and no ensure: a hibernated service must not
   *  wake just to show a login page. */
  loadServiceUrl(id: ServiceId): void {
    const wc = this.views.get(id)?.webContents;
    if (wc && !wc.isDestroyed()) wc.loadURL(serviceById(id).url);
  }
```

- [x] **Step 4: Create the sign-out flow**

```ts
// src/main/signout.ts
import { dialog, session } from 'electron';
import { serviceById } from '../shared/services';
import type { ServiceId } from '../shared/types';
import type { AppContext } from './ipc-handlers';

/** Local wipe only: clears the persist:<id> partition on this device and
 *  lands the view on the login page. The server session is NOT revoked —
 *  it lingers in the service's own devices list until it expires there. */
export async function confirmSignOut(ctx: AppContext, id: ServiceId): Promise<void> {
  const name = serviceById(id).name;
  const { response } = await dialog.showMessageBox(ctx.win, {
    type: 'warning',
    message: `Sign out of ${name}?`,
    detail: 'This clears its login on this device. An active call on this service would end.',
    buttons: ['Cancel', 'Sign Out'],
    defaultId: 0,
    cancelId: 0,
  });
  if (response !== 1) return;
  await session.fromPartition(`persist:${id}`).clearStorageData();
  ctx.views.loadServiceUrl(id);
  ctx.broadcast();
}
```

- [x] **Step 5: Wire the tile menu handler**

In `src/main/ipc-handlers.ts`: extend the electron import to include `Menu` (`import { app, type BrowserWindow, ipcMain, Menu, shell } from 'electron';`), and add:

```ts
import { serviceById } from '../shared/services';
import { confirmSignOut } from './signout';
```

Below the `register` function, add the extracted mute helper:

```ts
function setServiceMuted(ctx: AppContext, serviceId: ServiceId, muted: boolean): void {
  const s = ctx.settings.get();
  ctx.settings.update({ muted: { ...s.muted, [serviceId]: muted } });
  ctx.views.applyAudioMute(serviceId);
  ctx.broadcast();
}
```

Replace the body of the existing `on('service:setMuted', …)` registration with:

```ts
  on('service:setMuted', ({ serviceId, muted }) => setServiceMuted(ctx, serviceId, muted));
```

Add the new registration next to it:

```ts
  on('service:tileMenu', ({ serviceId }) => {
    const muted = ctx.settings.get().muted[serviceId];
    const name = serviceById(serviceId).name;
    Menu.buildFromTemplate([
      {
        label: muted ? `Unmute ${name}` : `Mute ${name}`,
        click: () => setServiceMuted(ctx, serviceId, !muted),
      },
      { type: 'separator' },
      { label: 'Sign Out…', click: () => void confirmSignOut(ctx, serviceId) },
    ]).popup({ window: ctx.win });
  });
```

- [x] **Step 6: Point the rail at the menu**

In `src/renderer/src/components/Rail.tsx`, replace the `onContextMenu` prop of `ServiceTile`:

```tsx
                onContextMenu={(e) => {
                  e.preventDefault();
                  window.goetia.send('service:tileMenu', { serviceId: svc.id });
                }}
```

- [x] **Step 7: Verify**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: clean. Live check in `corepack pnpm dev`: right-click a tile → native menu; Mute toggles (checkbox parity with app menu is not required — label flips); Sign Out shows the confirm, Cancel is default; confirming lands the service on its login page and Goetia prefs (order, mute, zoom) survive.

- [x] **Step 8: Checkpoint — request commit**

STOP. Ask the user to run `/grimoire-core:commit` (suggested message: `feat(services): rail tile menu with mute and local sign-out`).

---

### Task 6: Activity log

**Files:**

- Modify: `src/shared/types.ts` (`ActivityEntryView`)
- Create: `src/main/lib/activity-log.ts`
- Test: `tests/unit/activity-log.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `ActivityEntryView { id: number; serviceId: ServiceId; title: string; silenced: boolean; at: number }` in shared types; `ACTIVITY_CAP = 50`; `class ActivityLog` with `append(entry: Omit<ActivityEntry, 'id'>): void`, `get(id: number): ActivityEntry | undefined`, `recent(): ActivityEntryView[]`. `ActivityEntry` adds `href?: string` and `synthetic: boolean` on top of the view fields.

- [x] **Step 1: Add the shared view type**

In `src/shared/types.ts`, after the `Counts` interface:

```ts
/** What the switcher renders per recent conversation. Deliberately hrefless:
 *  conversation links never cross IPC — main re-validates at open time. */
export interface ActivityEntryView {
  id: number;
  serviceId: ServiceId;
  title: string;
  /** mute or quiet hours suppressed the banner itself at fire time (🌙) */
  silenced: boolean;
  at: number;
}
```

- [x] **Step 2: Write the failing tests**

```ts
// tests/unit/activity-log.test.ts
import { describe, expect, it } from 'vitest';
import { ACTIVITY_CAP, type ActivityEntry, ActivityLog } from '../../src/main/lib/activity-log';

const entry = (
  n: number,
  over: Partial<Omit<ActivityEntry, 'id'>> = {},
): Omit<ActivityEntry, 'id'> => ({
  serviceId: 'telegram',
  title: `chat ${n}`,
  synthetic: false,
  silenced: false,
  at: n,
  ...over,
});

describe('ActivityLog', () => {
  it('caps at ACTIVITY_CAP, dropping the oldest', () => {
    const log = new ActivityLog();
    for (let i = 1; i <= ACTIVITY_CAP + 5; i++) log.append(entry(i));
    const rows = log.recent();
    expect(rows).toHaveLength(ACTIVITY_CAP);
    expect(rows[0].title).toBe(`chat ${ACTIVITY_CAP + 5}`); // newest first
    expect(rows.at(-1)?.title).toBe('chat 6');
  });

  it('dedupes by href with the newest entry winning', () => {
    const log = new ActivityLog();
    log.append(entry(1, { href: '/t/1' }));
    log.append(entry(2, { title: 'renamed', href: '/t/1', silenced: true }));
    const rows = log.recent();
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('renamed');
    expect(rows[0].silenced).toBe(true);
  });

  it('falls back to service+title as the dedupe key', () => {
    const log = new ActivityLog();
    log.append(entry(1, { title: 'Mẹ' }));
    log.append(entry(2, { title: 'Mẹ' }));
    log.append(entry(3, { title: 'Mẹ', serviceId: 'whatsapp' as const }));
    expect(log.recent()).toHaveLength(2); // same title on two services stays two rows
  });

  it('never exposes hrefs to the renderer view', () => {
    const log = new ActivityLog();
    log.append(entry(1, { href: 'https://web.telegram.org/a/#123' }));
    expect('href' in log.recent()[0]).toBe(false);
  });

  it('resolves an id back to the full entry', () => {
    const log = new ActivityLog();
    log.append(entry(1, { href: '/x' }));
    const id = log.recent()[0].id;
    expect(log.get(id)?.href).toBe('/x');
    expect(log.get(999)).toBeUndefined();
  });
});
```

Run: `corepack pnpm test tests/unit/activity-log.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Write the implementation**

```ts
// src/main/lib/activity-log.ts
import type { ActivityEntryView, ServiceId } from '../../shared/types';

export interface ActivityEntry {
  id: number;
  serviceId: ServiceId;
  title: string;
  /** synthetic banners' conversation link; validated only at open time */
  href?: string;
  synthetic: boolean;
  /** the banner itself was suppressed by mute or quiet hours */
  silenced: boolean;
  at: number;
}

export const ACTIVITY_CAP = 50;

/** Bounded and in-memory only, on purpose: conversation titles never touch
 *  disk (settings.json is plaintext), and the log dies with the process. */
export class ActivityLog {
  private entries: ActivityEntry[] = [];
  private nextId = 1;

  append(entry: Omit<ActivityEntry, 'id'>): void {
    this.entries.push({ ...entry, id: this.nextId++ });
    if (this.entries.length > ACTIVITY_CAP) this.entries.shift();
  }

  get(id: number): ActivityEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  /** Newest-first, one row per conversation (href key, else service+title),
   *  hrefs stripped — the renderer sees display fields and opaque ids only. */
  recent(): ActivityEntryView[] {
    const seen = new Set<string>();
    const rows: ActivityEntryView[] = [];
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i];
      const key = e.href ?? `${e.serviceId}\n${e.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ id: e.id, serviceId: e.serviceId, title: e.title, silenced: e.silenced, at: e.at });
    }
    return rows;
  }
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `corepack pnpm test tests/unit/activity-log.test.ts && corepack pnpm typecheck`
Expected: PASS (5 tests); typecheck clean.

- [x] **Step 5: Checkpoint — request commit**

STOP. Ask the user to run `/grimoire-core:commit` (suggested message: `feat(activity): bounded in-memory activity log`).

---

### Task 7: Router feeds the log; extract performBannerAction

**Files:**

- Modify: `src/main/activate.ts` (`performBannerAction`)
- Modify: `src/main/notifications.ts` (log append incl. silenced; use the helper)
- Modify: `src/main/ipc-handlers.ts` (`AppContext.activity`)
- Modify: `src/main/index.ts` (construct `ActivityLog`)
- Test: `tests/unit/activate.test.ts` (append describe block)

**Interfaces:**

- Consumes: `ActivityLog` (Task 6), `BannerClickAction` from `lib/notification-click`.
- Produces: `performBannerAction(ctx: AppContext, id: ServiceId, action: BannerClickAction): void` exported from `activate.ts`; `AppContext.activity: ActivityLog`. Task 8's `activity:open` handler calls both.

- [x] **Step 1: Write the failing tests**

Append to `tests/unit/activate.test.ts` (imports at top gain `performBannerAction`):

```ts
import { activateService, performBannerAction, setHomeOpen } from '../../src/main/activate';
```

New describe block at the bottom:

```ts
describe('performBannerAction', () => {
  function makeBannerCtx() {
    const state = new MainState();
    const views = {
      activate: vi.fn(),
      hideActive: vi.fn(),
      showActive: vi.fn(),
      openConversation: vi.fn(),
      sendOpenConversation: vi.fn(),
      sendReplayClick: vi.fn(),
    };
    const ctx = {
      state,
      views,
      settings: { update: vi.fn() },
      noteActivated: vi.fn(),
    } as unknown as AppContext;
    return { ctx, views };
  }

  it('does nothing for show-only', () => {
    const { ctx, views } = makeBannerCtx();
    performBannerAction(ctx, 'telegram', { kind: 'show-only' });
    expect(views.activate).not.toHaveBeenCalled();
  });

  it('activates then hands a dead view the conversation URL', () => {
    const { ctx, views } = makeBannerCtx();
    performBannerAction(ctx, 'telegram', { kind: 'navigate', url: 'https://t.example/1' });
    expect(views.activate).toHaveBeenCalledWith('telegram');
    expect(views.openConversation).toHaveBeenCalledWith('telegram', 'https://t.example/1');
  });

  it('routes in-page on a live view', () => {
    const { ctx, views } = makeBannerCtx();
    performBannerAction(ctx, 'telegram', {
      kind: 'open-in-page',
      href: '#123',
      url: 'https://t.example/#123',
    });
    expect(views.sendOpenConversation).toHaveBeenCalledWith(
      'telegram',
      '#123',
      'https://t.example/#123',
    );
  });

  it('replays the page click for shim banners', () => {
    const { ctx, views } = makeBannerCtx();
    performBannerAction(ctx, 'discord', { kind: 'replay', clickId: 7 });
    expect(views.sendReplayClick).toHaveBeenCalledWith('discord', 7);
  });
});
```

Run: `corepack pnpm test tests/unit/activate.test.ts`
Expected: FAIL — `performBannerAction` is not exported.

- [x] **Step 2: Implement the helper**

In `src/main/activate.ts`, add the type import and the function:

```ts
import type { BannerClickAction } from './lib/notification-click';
```

```ts
/** Shared tail of a banner or recents click: land on the service, then route
 *  as deep as the resolved action allows. show-only means the service was
 *  banished after the fact — activate nothing. */
export function performBannerAction(
  ctx: AppContext,
  id: ServiceId,
  action: BannerClickAction,
): void {
  if (action.kind === 'show-only') return;
  activateService(ctx, id);
  if (action.kind === 'navigate') ctx.views.openConversation(id, action.url);
  if (action.kind === 'open-in-page') ctx.views.sendOpenConversation(id, action.href, action.url);
  if (action.kind === 'replay') ctx.views.sendReplayClick(id, action.clickId);
}
```

Run the test file again — PASS.

- [x] **Step 3: Give the context an activity log**

In `src/main/ipc-handlers.ts`, add to the imports:

```ts
import type { ActivityLog } from './lib/activity-log';
```

Add to `interface AppContext` (after `updates`):

```ts
  activity: ActivityLog;
```

In `src/main/index.ts`, import it and construct it:

```ts
import { ActivityLog } from './lib/activity-log';
```

In the `ctx` literal, after `updates,`:

```ts
      activity: new ActivityLog(),
```

- [x] **Step 4: Feed the log from the router**

In `src/main/notifications.ts`, replace the top of `handle` — from `const s = this.ctx.settings.get();` through the throttle check — with:

```ts
    const s = this.ctx.settings.get();
    const silenced = !shouldNotify({
      serviceMuted: s.muted[serviceId],
      globalMuted: s.globalMuted,
      quietNow: this.ctx.quietNow(),
    });
    // the throttle bounds the log too: a spammy page during quiet hours
    // must not flood the recents list any more than it may flood banners
    if (!this.throttle.allow(serviceId, Date.now())) return;
    this.ctx.activity.append({ serviceId, title, href, synthetic, silenced, at: Date.now() });
    if (silenced) return;
```

Replace the whole `notification.on('click', …)` callback body with:

```ts
    notification.on('click', () => {
      this.ctx.win.show();
      const meta = serviceById(serviceId);
      const action = resolveBannerClick({
        // a stale banner can outlive its service being banished on Home
        disabled: this.ctx.settings.get().disabled[serviceId],
        hasView: this.ctx.views.has(serviceId),
        clickId,
        href,
        serviceUrl: meta.url,
        chatPaths: meta.chatPaths,
      });
      performBannerAction(this.ctx, serviceId, action);
    });
```

Update the import from `./activate`:

```ts
import { performBannerAction } from './activate';
```

(`activateService` is no longer imported here once the click body above is in place.)

- [x] **Step 5: Verify**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: all clean; `activate.test.ts` and the full suite pass.

- [x] **Step 6: Checkpoint — request commit**

STOP. Ask the user to run `/grimoire-core:commit` (suggested message: `feat(activity): log throttled banners and share the click tail`).

---

### Task 8: Activity IPC — invoke channel + open channel

**Files:**

- Modify: `src/shared/ipc.ts` (`activity:open`, `RendererInvoke`, `INVOKE_CHANNELS`)
- Modify: `src/main/lib/ipc-sender-policy.ts` (widen channel type)
- Modify: `src/preload/shell.ts` (`invoke`)
- Modify: `src/main/ipc-handlers.ts` (handle + open handler)
- Test: `tests/unit/ipc-sender-policy.test.ts` (append cases)

**Interfaces:**

- Consumes: `ActivityEntryView` (Task 6), `ctx.activity` + `performBannerAction` (Task 7).
- Produces: `window.goetia.invoke('activity:recent'): Promise<ActivityEntryView[]>`; `RendererToMain['activity:open'] = { entryId: number }`. Task 10 calls both.

- [x] **Step 1: Write the failing policy tests**

Append to `tests/unit/ipc-sender-policy.test.ts`:

```ts
  it('allows activity channels from the shell frame', () => {
    expect(
      ipcSenderAllowed({
        channel: 'activity:open',
        fromShell: true,
        senderServiceId: null,
        payloadServiceId: undefined,
      }),
    ).toBe(true);
    expect(
      ipcSenderAllowed({
        channel: 'activity:recent',
        fromShell: true,
        senderServiceId: null,
        payloadServiceId: undefined,
      }),
    ).toBe(true);
  });
  it('rejects activity channels from a service frame', () => {
    expect(
      ipcSenderAllowed({
        channel: 'activity:open',
        fromShell: false,
        senderServiceId: 'messenger',
        payloadServiceId: undefined,
      }),
    ).toBe(false);
    expect(
      ipcSenderAllowed({
        channel: 'activity:recent',
        fromShell: false,
        senderServiceId: 'messenger',
        payloadServiceId: undefined,
      }),
    ).toBe(false);
  });
```

(The `false === true ? false : true` in the first case is a placeholder-free way of saying `true` — write it as plain `.toBe(true)`.)

Run: `corepack pnpm test tests/unit/ipc-sender-policy.test.ts`
Expected: FAIL — unknown channels.

- [x] **Step 2: Declare the channels**

In `src/shared/ipc.ts`: add the type import for the view:

```ts
import type { ActivityEntryView, Counts, ServiceId, Settings, ShellState } from './types';
```

Add to `RendererToMain` (after `notification:fired`):

```ts
  /** open a recents row: main resolves the stored entry and re-validates */
  'activity:open': { entryId: number };
```

Add `'activity:open',` to `R2M_CHANNELS` and to `SHELL_ONLY_CHANNELS`.

After the `MainToService` interface, add:

```ts
/** renderer -> main round-trips, via ipcRenderer.invoke */
export interface RendererInvoke {
  /** recents for the quick switcher: fetched once per open, never broadcast */
  'activity:recent': { result: ActivityEntryView[] };
}

export const INVOKE_CHANNELS = ['activity:recent'] as const satisfies readonly (keyof RendererInvoke)[];
```

Widen the shell-only set so invoke channels classify through the same policy:

```ts
export const SHELL_ONLY_CHANNELS = new Set<keyof RendererToMain | keyof RendererInvoke>([
```

and add `'activity:recent',` to its entries.

In `src/main/lib/ipc-sender-policy.ts`, widen the channel parameter:

```ts
import { type RendererInvoke, type RendererToMain, SHELL_ONLY_CHANNELS } from '../../shared/ipc';
```

```ts
  channel: keyof RendererToMain | keyof RendererInvoke;
```

Re-run the policy tests — PASS.

- [x] **Step 3: Expose invoke in the shell preload**

In `src/preload/shell.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron';
import {
  INVOKE_CHANNELS,
  R2M_CHANNELS,
  type RendererInvoke,
  type RendererToMain,
} from '../shared/ipc';
import type { ShellState } from '../shared/types';

const allowed = new Set<string>(R2M_CHANNELS);
const invokable = new Set<string>(INVOKE_CHANNELS);

const api = {
  send<C extends keyof RendererToMain>(channel: C, payload: RendererToMain[C]): void {
    if (allowed.has(channel)) ipcRenderer.send(channel, payload);
  },
  invoke<C extends keyof RendererInvoke>(channel: C): Promise<RendererInvoke[C]['result']> {
    if (!invokable.has(channel)) return Promise.reject(new Error(`blocked channel: ${channel}`));
    return ipcRenderer.invoke(channel) as Promise<RendererInvoke[C]['result']>;
  },
  onState(cb: (s: ShellState) => void): () => void {
    const listener = (_e: unknown, s: ShellState) => cb(s);
    ipcRenderer.on('shell:state', listener);
    return () => {
      ipcRenderer.removeListener('shell:state', listener);
    };
  },
};

contextBridge.exposeInMainWorld('goetia', api);
export type GoetiaApi = typeof api;
```

(`window.goetia` is typed as `GoetiaApi`, so `invoke` flows to the renderer with no further declaration changes — confirm with typecheck.)

- [x] **Step 4: Handle both channels in main**

In `src/main/ipc-handlers.ts`, add imports:

```ts
import { performBannerAction } from './activate';
import { resolveBannerClick } from './lib/notification-click';
```

(`activateService`, `rememberSurface`, `setHomeOpen` are already imported from `./activate` — extend that line.)

Inside `registerIpcHandlers`, add:

```ts
  ipcMain.handle('activity:recent', (e) => {
    const fromShell = e.sender.id === ctx.win.webContents.id;
    const senderServiceId = ctx.views.serviceIdForWebContentsId(e.sender.id);
    if (
      !ipcSenderAllowed({
        channel: 'activity:recent',
        fromShell,
        senderServiceId,
        payloadServiceId: undefined,
      })
    ) {
      return [];
    }
    return ctx.activity.recent();
  });
  on('activity:open', ({ entryId }) => {
    const entry = ctx.activity.get(entryId);
    if (!entry) return; // rotated out of the ring since the switcher fetched
    const meta = serviceById(entry.serviceId);
    const action = resolveBannerClick({
      disabled: ctx.settings.get().disabled[entry.serviceId],
      hasView: ctx.views.has(entry.serviceId),
      href: entry.synthetic ? entry.href : undefined,
      serviceUrl: meta.url,
      chatPaths: meta.chatPaths,
    });
    performBannerAction(ctx, entry.serviceId, action);
  });
```

- [x] **Step 5: Verify**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: all clean.

- [x] **Step 6: Checkpoint — request commit**

STOP. Ask the user to run `/grimoire-core:commit` (suggested message: `feat(activity): expose recents over validated shell-only IPC`).

---

### Task 9: Switcher result rules

**Files:**

- Create: `src/renderer/src/components/switcher-results.ts`
- Test: `tests/unit/switcher-results.test.ts`

**Interfaces:**

- Consumes: `fuzzyScore` from `./fuzzy`, `ActivityEntryView` from shared types.
- Produces: `MAX_RECENTS = 8`; `switcherRows(opts: { query: string; recents: ActivityEntryView[]; services: SwitcherService[] }): { recents: ActivityEntryView[]; services: SwitcherService[] }` where `SwitcherService = { id: ServiceId; name: string }`; `relativeTime(at: number, now: number): string`. Task 10 renders these.

- [x] **Step 1: Write the failing tests**

```ts
// tests/unit/switcher-results.test.ts
import { describe, expect, it } from 'vitest';
import {
  MAX_RECENTS,
  relativeTime,
  switcherRows,
} from '../../src/renderer/src/components/switcher-results';
import type { ActivityEntryView } from '../../src/shared/types';

const recent = (id: number, title: string, over: Partial<ActivityEntryView> = {}): ActivityEntryView => ({
  id,
  serviceId: 'telegram',
  title,
  silenced: false,
  at: id,
  ...over,
});

const services = [
  { id: 'whatsapp' as const, name: 'WhatsApp' },
  { id: 'telegram' as const, name: 'Telegram' },
];

describe('switcherRows', () => {
  it('empty query: caps recents at MAX_RECENTS and keeps service order', () => {
    const recents = Array.from({ length: 12 }, (_, i) => recent(i + 1, `chat ${i + 1}`));
    const rows = switcherRows({ query: '', recents, services });
    expect(rows.recents).toHaveLength(MAX_RECENTS);
    expect(rows.recents[0].title).toBe('chat 1'); // input order preserved (main sends newest-first)
    expect(rows.services.map((s) => s.id)).toEqual(['whatsapp', 'telegram']);
  });

  it('drops recents from services not in the enabled list', () => {
    const rows = switcherRows({
      query: '',
      recents: [recent(1, 'gone', { serviceId: 'discord' }), recent(2, 'kept')],
      services,
    });
    expect(rows.recents.map((r) => r.title)).toEqual(['kept']);
  });

  it('a query fuzzy-filters recents titles and service names together', () => {
    const rows = switcherRows({
      query: 'an',
      recents: [recent(1, 'Anh Tuấn'), recent(2, 'Design group')],
      services,
    });
    expect(rows.recents.map((r) => r.title)).toEqual(['Anh Tuấn']);
    expect(rows.services).toHaveLength(0); // neither service name matches "an"
  });

  it('ranks better fuzzy matches first within recents', () => {
    const rows = switcherRows({
      query: 'me',
      recents: [recent(1, 'some metal'), recent(2, 'Mẹ ơi me')],
      services: [],
    });
    expect(rows.recents[0].id).toBe(1); // leading-run match outscores scattered
  });
});

describe('relativeTime', () => {
  it('buckets into now / minutes / hours / days', () => {
    expect(relativeTime(0, 59_000)).toBe('now');
    expect(relativeTime(0, 60_000)).toBe('1 m');
    expect(relativeTime(0, 3_599_000)).toBe('59 m');
    expect(relativeTime(0, 3_600_000)).toBe('1 h');
    expect(relativeTime(0, 86_400_000)).toBe('1 d');
  });
});
```

Run: `corepack pnpm test tests/unit/switcher-results.test.ts`
Expected: FAIL — module not found.

- [x] **Step 2: Write the implementation**

```ts
// src/renderer/src/components/switcher-results.ts
import type { ActivityEntryView, ServiceId } from '../../../shared/types';
import { fuzzyScore } from './fuzzy';

export const MAX_RECENTS = 8;

export interface SwitcherService {
  id: ServiceId;
  name: string;
}

/** The switcher's two sections from one query. Recents arrive newest-first
 *  from main; rows for since-disabled services are dropped so Enter is
 *  always actionable. Empty query keeps main's order and the user's rail
 *  order; a query fuzzy-ranks each section independently. */
export function switcherRows(opts: {
  query: string;
  recents: ActivityEntryView[];
  services: SwitcherService[];
}): { recents: ActivityEntryView[]; services: SwitcherService[] } {
  const enabled = new Set(opts.services.map((s) => s.id));
  const live = opts.recents.filter((r) => enabled.has(r.serviceId));
  if (opts.query.length === 0) {
    return { recents: live.slice(0, MAX_RECENTS), services: opts.services };
  }
  const recents = live
    .map((r) => ({ r, score: fuzzyScore(opts.query, r.title) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RECENTS)
    .map((x) => x.r);
  const services = opts.services
    .map((svc) => ({ svc, score: fuzzyScore(opts.query, svc.name) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.svc);
  return { recents, services };
}

export function relativeTime(at: number, now: number): string {
  const d = Math.max(0, now - at);
  if (d < 60_000) return 'now';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} m`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} h`;
  return `${Math.floor(d / 86_400_000)} d`;
}
```

- [x] **Step 3: Run tests to verify they pass**

Run: `corepack pnpm test tests/unit/switcher-results.test.ts`
Expected: PASS. If the ranking assertion in "ranks better fuzzy matches first" fails, verify against `fuzzyScore` (leading-character bonus is `+3`, streaks compound) and fix the test's expectation — not the scorer.

- [x] **Step 4: Checkpoint — request commit**

STOP. Ask the user to run `/grimoire-core:commit` (suggested message: `feat(switcher): pure recents merge and relative-time rules`).

---

### Task 10: Recent conversations in the quick switcher

**Files:**

- Modify: `src/renderer/src/components/QuickSwitcher.tsx` (full replacement below)

**Interfaces:**

- Consumes: `window.goetia.invoke('activity:recent')` + `send('activity:open', …)` (Task 8), `switcherRows`/`relativeTime`/`MAX_RECENTS` (Task 9).
- Produces: UI only.

- [x] **Step 1: Replace the component**

```tsx
// src/renderer/src/components/QuickSwitcher.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { badgeLabel } from '../../../shared/badges';
import type { ActivityEntryView, ServiceId } from '../../../shared/types';
import { useShell } from '../store';
import { relativeTime, switcherRows } from './switcher-results';

const logos = import.meta.glob<string>('../assets/logos/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

function SectionLabel({ children }: { children: string }) {
  return (
    <li aria-hidden="true" className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-2">
      {children}
    </li>
  );
}

export default function QuickSwitcher() {
  const state = useShell((s) => s.state);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [recents, setRecents] = useState<ActivityEntryView[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const open = state?.switcherOpen ?? false;

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      // one fetch per open — recents are never broadcast
      window.goetia
        .invoke('activity:recent')
        .then(setRecents)
        .catch(() => setRecents([]));
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const enabled = useMemo(
    () => (state ? state.services.filter((svc) => !state.settings.disabled[svc.id]) : []),
    [state],
  );

  const rows = useMemo(
    () =>
      switcherRows({
        query,
        recents,
        services: enabled.map((svc) => ({ id: svc.id, name: svc.name })),
      }),
    [query, recents, enabled],
  );
  const total = rows.recents.length + rows.services.length;

  if (!state || !open) return null;

  const close = () => window.goetia.send('switcher:setOpen', { open: false });
  const pick = (id: ServiceId) => {
    window.goetia.send('service:activate', { serviceId: id });
    close();
  };
  const openRecent = (entryId: number) => {
    window.goetia.send('activity:open', { entryId });
    close();
  };
  const submit = (i: number) => {
    if (rows.recents[i]) openRecent(rows.recents[i].id);
    else if (rows.services[i - rows.recents.length]) pick(rows.services[i - rows.recents.length].id);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop; Escape handled on the input
    <div
      role="presentation"
      className="absolute inset-0 z-10 flex items-start justify-center bg-black/40 pt-32"
      onMouseDown={close}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: swallows backdrop mousedown */}
      <div
        role="presentation"
        data-testid="switcher"
        className="w-[560px] overflow-hidden rounded-modal border border-border bg-bg-2 shadow-[0_8px_32px_rgba(0,0,0,.4)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close();
            if (e.key === 'ArrowDown') setCursor((c) => Math.min(c + 1, total - 1));
            if (e.key === 'ArrowUp') setCursor((c) => Math.max(c - 1, 0));
            if (e.key === 'Enter') submit(cursor);
          }}
          placeholder="Search services and recent chats…"
          className="w-full border-b border-border bg-transparent px-4 py-3 text-[15px] text-text-1 outline-none placeholder:text-text-2"
        />
        <ul className="max-h-[420px] overflow-y-auto">
          {rows.recents.length > 0 && <SectionLabel>Recent</SectionLabel>}
          {rows.recents.map((r, i) => (
            <li key={`recent-${r.id}`}>
              <button
                type="button"
                onClick={() => openRecent(r.id)}
                onMouseEnter={() => setCursor(i)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${i === cursor ? 'bg-accent/15' : ''}`}
              >
                <img src={logos[`../assets/logos/${r.serviceId}.svg`]} alt="" className="h-5 w-5" />
                <span className="flex-1 truncate text-text-1">{r.title}</span>
                <span className="tabular text-[11px] text-text-2">
                  {relativeTime(r.at, Date.now())}
                  {r.silenced && <span title="Silenced by mute or quiet hours"> 🌙</span>}
                </span>
              </button>
            </li>
          ))}
          {rows.recents.length > 0 && rows.services.length > 0 && (
            <SectionLabel>Services</SectionLabel>
          )}
          {rows.services.map((svc, j) => {
            const i = rows.recents.length + j;
            const unread = state.runtime[svc.id].unread.direct;
            const accel = enabled.findIndex((s) => s.id === svc.id) + 1;
            return (
              <li key={svc.id}>
                <button
                  type="button"
                  onClick={() => pick(svc.id)}
                  onMouseEnter={() => setCursor(i)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${i === cursor ? 'bg-accent/15' : ''}`}
                >
                  <img src={logos[`../assets/logos/${svc.id}.svg`]} alt="" className="h-5 w-5" />
                  <span className="flex-1 text-text-1">{svc.name}</span>
                  <span className="tabular text-text-2">⌘{accel}</span>
                  {unread > 0 && (
                    <span className="tabular rounded-full bg-badge px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {badgeLabel(unread)}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
```

- [x] **Step 2: Verify**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: all clean (Tailwind class names match the existing design tokens; `fuzzy.ts` is now consumed via `switcher-results.ts` — if lint flags the old direct import as unused anywhere, remove it).

Live check in `corepack pnpm dev`: with no banners yet, ⌘K shows the plain services list (no headers); after a banner fires (or during quiet hours), reopening ⌘K shows Recent rows, 🌙 on silenced ones, ArrowDown walks recents into services, Enter on a recent lands in the conversation, Enter on a service switches to it.

- [x] **Step 3: Checkpoint — request commit**

STOP. Ask the user to run `/grimoire-core:commit` (suggested message: `feat(switcher): recent conversations section fed by the activity log`).

---

### Task 11: Documentation

**Files:**

- Modify: `README.md:170-171`
- Modify: `CLAUDE.md` (product-principle Home line; Notifications & mute section)
- Modify: `docs/FEATURES.md` (mute bullet, quick-switcher bullet, persisted-settings list)

**Interfaces:** none — prose only. Every claim must match what Tasks 1–10 shipped.

- [x] **Step 1: README**

In the line-170 bullet, change `press ⌘/Ctrl+0` to `press ⌘/Ctrl+⇧+H`. Rewrite line 171 as:

```markdown
- **Shortcuts**: ⌘/Ctrl+1…9 jump to a service, ⌘/Ctrl+K opens a quick switcher (recent conversations on top — 🌙 marks ones quiet hours or mute silenced; the list lives in memory and clears on quit), ⌘/Ctrl+⇧+H opens Home, ⌘/Ctrl + / − / 0 zoom the current service (remembered per service), ⌘/Ctrl+R (or F5) reloads the current service, ⌘/Ctrl+⇧+M mutes everything, right-click an icon to mute it or sign out (sign-out clears the login on this device only), and drag icons to reorder them. A **system-wide summoning hotkey** (Settings → General, off by default) shows or hides Goetia from inside any app.
```

- [x] **Step 2: CLAUDE.md**

In the product-principle bullet, replace the Home-shortcut phrase:

```text
old: reachable from the rail sigil and `⌘/Ctrl 0`
new: reachable from the rail sigil and `⌘/Ctrl ⇧ H` (`⌘/Ctrl 0` is zoom's Actual Size)
```

Append one bullet to **Notifications & mute**:

```markdown
- **Recents are the banner stream remembered.** The activity log (`lib/activity-log.ts`) is bounded and in-memory only — conversation titles never touch disk; it is fed by throttled `notification:fired` events including silenced ones. The switcher fetches once per open (`activity:recent`, invoke) — never a per-banner broadcast — and `activity:open` carries an opaque id: hrefs stay in main and re-validate through `resolveBannerClick` at click time.
```

- [x] **Step 3: FEATURES.md**

Replace the quick-switcher bullet:

```text
new: - **Quick switcher** (`⌘/Ctrl+K`) with fuzzy search over services and recent
conversations (activity log, in-memory). Impl: `QuickSwitcher.tsx`,
`components/switcher-results.ts`, `main/lib/activity-log.ts`. Verified:
`fuzzy.test.ts`, `switcher-results.test.ts`, `activity-log.test.ts`.
```

(written as one line in FEATURES.md — the wrap above is only for this plan). Update the mute bullet's opening:

```text
old: **Mute** per-service (right-click a tile)
new: **Mute / Sign Out** per-service (right-click a tile opens a native menu;
sign-out clears the `persist:<id>` partition locally after a confirm)
```

(same one-line rule). Finally, add `zoom` to the persisted-settings bullet's enumerated keys.

- [x] **Step 4: Lint the markdown**

Run: `npx markdownlint-cli2 README.md CLAUDE.md docs/FEATURES.md`
Expected: 0 issues.

- [x] **Step 5: Checkpoint — request commit**

STOP. Ask the user to run `/grimoire-core:commit` (suggested message: `docs: v0.9 shortcuts, sign-out, and switcher recents`).

---

### Task 12: Full verification

**Files:** none (verification only).

- [x] **Step 1: The four gates**

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e
```

Expected: lint/typecheck clean; unit suite green (existing 147 + new files); both e2e specs green.

- [x] **Step 2: Manual matrix (report results, fix regressions before claiming done)**

In `corepack pnpm dev`:

1. Zoom: `⌘=` ×3 on WhatsApp → text grows; switch to Telegram → 100%; back to WhatsApp → still zoomed; restart the app → WhatsApp still zoomed; `⌘0` resets it.
2. Zoom no-op: fresh profile (all services disabled) → `⌘=` does nothing, no crash.
3. Home: `⌘⇧H` toggles Home; `⌘0` no longer opens it; rail tooltip shows ⌘⇧H.
4. Tile menu: right-click → Mute/Unmute flips the bell state everywhere (rail, tray, app menu); Sign Out → Cancel does nothing; Sign Out → confirm lands on the login page, mute/zoom/order survive, re-login works.
5. Recents: trigger a banner (or wait for one), ⌘K → row appears with time label; Enter lands in that conversation on a live view without the waking cover; enable quiet hours, trigger another → 🌙 row; restart → list empty (by design).
6. Recents degradation: banish a service on Home after it banners → its rows disappear from ⌘K.

- [x] **Step 3: Close out**

Report the manual-matrix results to the user. Remaining release steps (version bump, packaging) are outside this plan.
