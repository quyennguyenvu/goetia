# Service Back Affordance Implementation Plan

> **Status, 2026-08-13: partially reverted. Do not execute this plan.** Task 1 (the `firstRunUrl` teardown) shipped and stands. Tasks 2–7 were implemented, verified green, and then removed the same day on the user's decision — Goetia has no back affordance; reload to `SERVICES[].url` is the only way back. Kept as the execution record. The rejection reasoning, Slack's real logged-out URLs, and the placements and gates that were considered live in `docs/superpowers/specs/2026-08-13-service-back-affordance-design.md`.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete Slack's `firstRunUrl` mechanism and give every service a discoverable way back whenever a view has wandered off the service's own host.

**Architecture:** One pure predicate (`lib/back-affordance.ts`) decides whether back should be offered: the view must have history *and* be on a host other than the service's own. Its answer rides on `ServiceRuntime.backAvailable` through the existing report-on-change broadcast, where the rail renders a chevron. The navigation mechanism itself (`views.goBack`) stays dumb — plain `navigationHistory.goBack()` — so the menu item behaves like a browser back while the two *contextual* surfaces (chevron, keystroke) are the gated ones.

**Tech Stack:** Electron 43 (`webContents.navigationHistory`), TypeScript, React 19 + Tailwind v4 (shell renderer), vitest (unit), Playwright + `_electron` (e2e), biome (lint), markdownlint-cli2 (docs).

## Global Constraints

- Definition of done for the whole plan: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` and `corepack pnpm e2e` all green.
- E2E must run with the VS Code shell variable stripped: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`. Without it Electron launches as plain Node and every spec fails.
- **Never run `git commit`.** Every "Commit" step below means: stop, tell the user what is staged-worthy, and ask them to run `/grimoire-core:commit`. Writing `GRIMOIRE_COMMIT_MSG.txt` is forbidden outside that command.
- Every new IPC channel is classified in `src/shared/ipc.ts`: added to `RendererToMain`, to `R2M_CHANNELS`, and — because the shell frame is the only legitimate sender — to `SHELL_ONLY_CHANNELS`.
- `src/shared/**` stays process-agnostic: no `electron` import, no DOM import.
- Pure decision logic goes in a `lib/` helper with a vitest unit test; `views.ts`, `index.ts` and `ipc-handlers.ts` stay thin wiring.
- Report on change only: route runtime updates through `MainState.setRuntime`, which already skips the broadcast on a no-op patch. Never add a per-navigation broadcast of your own.
- Comments explain *why*, not *what*; match the density of the file you are editing. No changelog or "added X" notes.
- Markdown edits must pass `npx markdownlint-cli2 <file>`; prose is never hard-wrapped (MD013 is off in `.markdownlint-cli2.jsonc`).

---

### Task 1: Remove the firstRunUrl mechanism

This task is a **deletion**, so there is no red-green cycle to fake: `corepack pnpm typecheck` enumerates every site that referenced the removed types, and the existing suite proves no behavior was lost. Slack was the only consumer and `Settings.visited` existed solely to serve it.

**Files:**

- Modify: `src/shared/services.ts` — the `slack` entry and its comment
- Modify: `src/shared/types.ts` — `ServiceMeta.firstRunUrl`, `Settings.visited`, `DEFAULT_SETTINGS.visited`
- Modify: `src/main/settings.ts:42` — the `visited` fill
- Modify: `src/main/views.ts` — the `startUrl` constructor argument and its use in `create()`
- Modify: `src/main/index.ts` — the `startUrl` import and the accessor it passes to `ServiceViewManager`
- Delete: `src/main/lib/start-url.ts`
- Delete: `tests/unit/start-url.test.ts`
- Test: `tests/unit/services.test.ts`, `tests/unit/settings.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `ServiceViewManager`'s constructor loses its 5th parameter (the `startUrl: (id: ServiceId) => string` accessor), so its signature becomes `(win, hooks, railPosition, audioMuted, overlay?)`. Task 3 edits the same class.

- [ ] **Step 1: Drop `firstRunUrl` from the Slack catalog entry**

In `src/shared/services.ts`, replace the `slack` entry and the comment above it:

```ts
  // the whole client under app.slack.com/client is chat (discord precedent);
  // /client lands on the last-active workspace, the built-in switcher rail
  // covers the rest. Logged out it 302s to the workspace-first signin — the
  // off-host back affordance is what gets a first-timer out of that detour.
  {
    id: 'slack',
    name: 'Slack',
    url: 'https://app.slack.com/client',
    color: '#4A154B',
    waitForReady: true,
  },
```

- [ ] **Step 2: Drop the two type members and the defaults record**

In `src/shared/types.ts`, delete from `ServiceMeta` the doc comment and field:

```ts
  /** Loaded instead of `url` the very first time the service's view is
   *  created (Settings.visited), then never again — for sites whose default
   *  logged-out landing is hostile to first-timers (slack's workspace-first
   *  signin). Reload and every later launch use `url`. */
  firstRunUrl?: string;
```

Delete from `Settings`:

```ts
  /** The service's view has been created at least once; the first creation
   *  loads ServiceMeta.firstRunUrl when one is declared. */
  visited: Record<ServiceId, boolean>;
```

Delete from `DEFAULT_SETTINGS` (it sits between `neverHibernate` and `hibernationMinutes`):

```ts
  visited: {
    whatsapp: false,
    messenger: false,
    instagram: false,
    telegram: false,
    discord: false,
    zalo: false,
    tiktok: false,
    shopee: false,
    slack: false,
    teams: false,
  },
```

- [ ] **Step 3: Drop the settings normalization line**

In `src/main/settings.ts`, delete line 42 from the object `normalize()` returns:

```ts
    visited: fill(raw.visited, DEFAULT_SETTINGS.visited),
```

Leave `...raw` alone. A `settings.json` from an older install still carries a `visited` object and it rides along in that spread — harmless, since nothing reads it and it is gone from the `Settings` type.

- [ ] **Step 4: Delete the helper and its test**

```bash
rm src/main/lib/start-url.ts tests/unit/start-url.test.ts
```

- [ ] **Step 5: Drop the constructor parameter from `ServiceViewManager`**

In `src/main/views.ts`, delete this constructor parameter (it sits between `audioMuted` and `overlay`):

```ts
    /** URL for a fresh view — the one-time firstRunUrl on the very first
     *  creation (marking the service visited), the chat url after. */
    private startUrl: (id: ServiceId) => string,
```

And in `create()`, replace the load call:

```ts
    wc.loadURL(svc.url);
```

- [ ] **Step 6: Drop the accessor and import in main**

In `src/main/index.ts`, delete the import:

```ts
import { startUrl } from './lib/start-url';
```

And delete the accessor argument passed to `new ServiceViewManager(...)` — the whole arrow function that currently sits between the `audioMuted` accessor and `overlay`:

```ts
      (id) => {
        const s = settings.get();
        const url = startUrl(serviceById(id), s.visited[id]);
        if (!s.visited[id]) settings.update({ visited: { ...s.visited, [id]: true } });
        return url;
      },
```

`serviceById` is still used elsewhere in the file (`syncOverlay`), so keep its import.

- [ ] **Step 7: Run typecheck to enumerate the remaining references**

Run: `corepack pnpm typecheck`

Expected: FAIL, naming only the two test files — `tests/unit/services.test.ts` (`DEFAULT_SETTINGS.visited`) and `tests/unit/settings.test.ts` (`s.visited.teams`, `s.visited.slack`). If it names any `src/` file, that reference was missed above — fix it before continuing.

- [ ] **Step 8: Update the catalog test**

In `tests/unit/services.test.ts`, delete this whole `it` block:

```ts
  it('defaults: no service visited, so a firstRunUrl fires on first view creation', () => {
    expect(Object.values(DEFAULT_SETTINGS.visited).every((v) => v === false)).toBe(true);
    expect(Object.keys(DEFAULT_SETTINGS.visited).sort()).toEqual(SERVICES.map((s) => s.id).sort());
  });
```

- [ ] **Step 9: Update the settings test and add the legacy-key guard**

In `tests/unit/settings.test.ts`, inside `'surfaces services added after settings.json was written'`, delete these two lines:

```ts
    expect(s.visited.teams).toBe(false);
```

```ts
    expect(s.visited.slack).toBe(false); // first view creation gets firstRunUrl
```

Then add this test after the `'drops unknown service ids from a persisted order'` block — an install that predates the removal must still load:

```ts
  it('loads a settings.json that still carries the removed visited record', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ globalMuted: true, visited: { slack: true, whatsapp: false } }),
    );
    const s = new SettingsStore(dir).get();
    expect(s.globalMuted).toBe(true); // real prefs survive the dead key
    expect(s.order).toEqual(DEFAULT_SETTINGS.order);
    expect(s.disabled).toEqual(DEFAULT_SETTINGS.disabled);
  });
```

- [ ] **Step 10: Run typecheck and the suite**

Run: `corepack pnpm typecheck && corepack pnpm test`

Expected: typecheck clean; vitest PASS with `start-url.test.ts` no longer collected.

- [ ] **Step 11: Confirm no reference survives**

Run: `grep -rn "firstRunUrl\|startUrl\|\.visited\|visited:" src tests`

Expected: no output at all. The bare word "visited" still appears in a few prose comments (`hibernation.ts` says "never-visited services start their idle clock"), which is why the pattern is anchored — leave those alone. Hits inside `docs/` are fine; Task 7 handles the docs.

- [ ] **Step 12: Commit**

Stop here. Report that the `firstRunUrl` mechanism removal is complete and ask the user to run `/grimoire-core:commit` — suggested subject: `refactor: drop the firstRunUrl mechanism`.

---

### Task 2: The `backAvailable` predicate

> **Reverted, 2026-08-13 — this task is history, not instructions.** The host-only rule below was disproved by driving the real app: Slack's logged-out flow stays on `app.slack.com` (`/workspace-signin`, `/get-started`), so the chevron never appeared on the one trap that motivated the feature. It was amended to compare **host plus first path segment**, then the whole affordance was removed on the user's decision. `src/main/lib/back-affordance.ts` no longer exists.

**Files:**

- Create: `src/main/lib/back-affordance.ts`
- Test: `tests/unit/back-affordance.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `backAvailable(a: { currentUrl: string; serviceUrl: string; canGoBack: boolean }): boolean` — imported by Task 3 (`views.ts`) as `import { backAvailable } from './lib/back-affordance';`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/back-affordance.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { backAvailable } from '../../src/main/lib/back-affordance';

const SLACK = 'https://app.slack.com/client';

describe('backAvailable', () => {
  it('is silent on the service’s own host — back belongs to the page there', () => {
    expect(
      backAvailable({
        currentUrl: 'https://app.slack.com/client/T024BE7LD/C02GRQ4NH',
        serviceUrl: SLACK,
        canGoBack: true,
      }),
    ).toBe(false);
  });

  it('offers back once the view has walked off the host', () => {
    expect(
      backAvailable({
        currentUrl: 'https://slack.com/get-started#/find',
        serviceUrl: SLACK,
        canGoBack: true,
      }),
    ).toBe(true);
  });

  it('stays silent off-host with nothing to go back to — the 302 replaced its entry', () => {
    expect(
      backAvailable({
        currentUrl: 'https://slack.com/signin',
        serviceUrl: SLACK,
        canGoBack: false,
      }),
    ).toBe(false);
  });

  it('treats a www. prefix as the same host, in both directions', () => {
    expect(
      backAvailable({
        currentUrl: 'https://facebook.com/messages/t/1',
        serviceUrl: 'https://www.facebook.com/messages/',
        canGoBack: true,
      }),
    ).toBe(false);
    expect(
      backAvailable({
        currentUrl: 'https://www.facebook.com/messages/t/1',
        serviceUrl: 'https://facebook.com/messages/',
        canGoBack: true,
      }),
    ).toBe(false);
  });

  it('offers back on an SSO bounce host', () => {
    expect(
      backAvailable({
        currentUrl: 'https://login.microsoftonline.com/common/oauth2/authorize',
        serviceUrl: 'https://teams.microsoft.com/v2/',
        canGoBack: true,
      }),
    ).toBe(true);
  });

  it('is silent for a hostless or unparseable url', () => {
    for (const currentUrl of ['about:blank', '', 'not a url', 'file:///tmp/x.html']) {
      expect(backAvailable({ currentUrl, serviceUrl: SLACK, canGoBack: true })).toBe(false);
    }
  });

  it('is silent when the service url itself is unparseable', () => {
    expect(
      backAvailable({ currentUrl: 'https://slack.com/get-started', serviceUrl: '', canGoBack: true }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test tests/unit/back-affordance.test.ts`

Expected: FAIL — `Failed to resolve import "../../src/main/lib/back-affordance"`.

- [ ] **Step 3: Write the implementation**

Create `src/main/lib/back-affordance.ts`:

```ts
/** Whether a view should be offered a way back: it has history *and* it has
 *  left the service's own host (a login detour, an external link-out). On the
 *  service's own pages back belongs to the page — Slack binds ⌘[ for its own
 *  history — and gating on history alone would light the affordance up on
 *  every SPA route change, i.e. during all normal chat use. */
export function backAvailable(a: {
  currentUrl: string;
  serviceUrl: string;
  canGoBack: boolean;
}): boolean {
  if (!a.canGoBack) return false;
  const here = hostOf(a.currentUrl);
  const home = hostOf(a.serviceUrl);
  return here !== null && home !== null && here !== home;
}

/** Registrable-enough host for comparison: `www.` is not a different site,
 *  but `app.slack.com` very much is. Hostless (about:blank, file:) and
 *  unparseable urls answer null so they can never read as off-host. */
function hostOf(url: string): string | null {
  try {
    const host = new URL(url).host;
    return host === '' ? null : host.replace(/^www\./, '');
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm test tests/unit/back-affordance.test.ts`

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

Stop and ask the user to run `/grimoire-core:commit` — suggested subject: `feat: add the off-host back predicate`.

---

### Task 3: Runtime state, the hook, and `views.goBack`

**Files:**

- Modify: `src/shared/types.ts` — `ServiceRuntime`
- Modify: `src/main/state.ts` — `defaultRuntime()`
- Modify: `src/main/views.ts` — `ViewHooks`, `create()`, new `goBack()` and private `backOffHost()`
- Modify: `src/main/index.ts` — the `onBackAvailable` hook implementation
- Test: `tests/unit/state.test.ts`

**Interfaces:**

- Consumes: `backAvailable({ currentUrl, serviceUrl, canGoBack })` from Task 2.
- Produces:
  - `ServiceRuntime.backAvailable: boolean` — read by Task 5 in the renderer as `state.runtime[id].backAvailable`.
  - `ViewHooks.onBackAvailable(id: ServiceId, available: boolean): void`.
  - `ServiceViewManager.goBack(id: ServiceId): void` — called by Task 4 (IPC) and Task 6 (menu).
  - `ServiceViewManager` private `backOffHost(id: ServiceId): boolean` — used by Task 6's key handler inside the same class.

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/state.test.ts`, inside `describe('MainState', ...)`:

```ts
  it('new runtimes offer no way back', () => {
    const s = new MainState();
    expect(s.runtime('slack').backAvailable).toBe(false);
  });

  it('does not notify when back availability is unchanged', () => {
    const s = new MainState();
    s.setRuntime('slack', { backAvailable: true }); // first change notifies
    const cb = vi.fn();
    s.onChange(cb);
    s.setRuntime('slack', { backAvailable: true }); // identical -> no notify
    expect(cb).not.toHaveBeenCalled();
    s.setRuntime('slack', { backAvailable: false }); // real change -> notify
    expect(cb).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test tests/unit/state.test.ts`

Expected: FAIL — `backAvailable` does not exist on `ServiceRuntime` (a TS error surfaced by vitest, and `undefined` rather than `false` at runtime).

- [ ] **Step 3: Add the runtime field**

In `src/shared/types.ts`, add to `ServiceRuntime` after `waking`:

```ts
  /** the view has left the service's own host and has somewhere to go back
   *  to, so the rail offers a back chevron — see lib/back-affordance.ts */
  backAvailable: boolean;
```

In `src/main/state.ts`, add to `defaultRuntime()` after `waking: false,`:

```ts
  backAvailable: false,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm test tests/unit/state.test.ts`

Expected: PASS. `setRuntime`'s existing `isNoOp` comparison covers booleans, so no change is needed there.

- [ ] **Step 5: Add the hook to `ViewHooks`**

In `src/main/views.ts`, add to the `ViewHooks` interface after `onNavigate`:

```ts
  /** Off-host with history, so the shell should offer a way back. Fires on
   *  cross-document navigation and on SPA routing, which moves canGoBack
   *  without a document load. */
  onBackAvailable(id: ServiceId, available: boolean): void;
```

- [ ] **Step 6: Add `goBack` and `backOffHost` to `ServiceViewManager`**

In `src/main/views.ts`, add the import:

```ts
import { backAvailable } from './lib/back-affordance';
```

Add these two methods immediately after `refresh()`:

```ts
  /** Plain history back. Deliberately ungated beyond canGoBack: the off-host
   *  rule governs where back is *offered* (rail chevron, keystroke), not what
   *  this does, so the menu item never dead-ends. */
  goBack(id: ServiceId): void {
    const wc = this.views.get(id)?.webContents;
    if (wc && !wc.isDestroyed() && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  }

  /** The affordance predicate against a live view. */
  private backOffHost(id: ServiceId): boolean {
    const wc = this.views.get(id)?.webContents;
    if (!wc || wc.isDestroyed()) return false;
    return backAvailable({
      currentUrl: wc.getURL(),
      serviceUrl: serviceById(id).url,
      canGoBack: wc.navigationHistory.canGoBack(),
    });
  }
```

- [ ] **Step 7: Report availability from `create()`**

In `src/main/views.ts` `create()`, add after the existing `wc.on('did-start-navigation', ...)` listener:

```ts
    const reportBack = () => this.hooks.onBackAvailable(id, this.backOffHost(id));
    wc.on('did-navigate', reportBack);
    wc.on('did-navigate-in-page', (_e, _url, isMainFrame) => {
      if (isMainFrame) reportBack();
    });
```

Both listeners live on the view's own `webContents` and die with it in `destroy()`, so there is nothing extra to clear.

- [ ] **Step 8: Implement the hook in main**

In `src/main/index.ts`, add to the hooks object passed to `new ServiceViewManager(...)`, after `onNavigate`:

```ts
        onBackAvailable: (id, available) => state.setRuntime(id, { backAvailable: available }),
```

- [ ] **Step 9: Run typecheck and the suite**

Run: `corepack pnpm typecheck && corepack pnpm test`

Expected: both clean. The two view listeners cannot be unit-tested without an Electron runtime; Task 7's manual pass is what exercises them.

- [ ] **Step 10: Commit**

Stop and ask the user to run `/grimoire-core:commit` — suggested subject: `feat: track back availability per service view`.

---

### Task 4: The `service:goBack` IPC channel

**Files:**

- Modify: `src/shared/ipc.ts` — `RendererToMain`, `R2M_CHANNELS`, `SHELL_ONLY_CHANNELS`
- Modify: `src/main/ipc-handlers.ts` — the handler
- Test: `tests/unit/ipc-sender-policy.test.ts`

**Interfaces:**

- Consumes: `ServiceViewManager.goBack(id)` and `focusActive()` from Task 3.
- Produces: channel `'service:goBack'` with payload `{ serviceId: ServiceId }`, sent by Task 5 as `window.goetia.send('service:goBack', { serviceId })`.

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/ipc-sender-policy.test.ts`, inside `describe('ipcSenderAllowed', ...)`:

```ts
  it('lets only the shell frame drive navigation back', () => {
    expect(
      ipcSenderAllowed({
        channel: 'service:goBack',
        fromShell: true,
        senderServiceId: null,
        payloadServiceId: 'slack',
      }),
    ).toBe(true);
    // a service page must not be able to walk its own view out of chat
    expect(
      ipcSenderAllowed({
        channel: 'service:goBack',
        fromShell: false,
        senderServiceId: 'slack',
        payloadServiceId: 'slack',
      }),
    ).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test tests/unit/ipc-sender-policy.test.ts`

Expected: FAIL — `'service:goBack'` is not assignable to `keyof RendererToMain`, and the second assertion returns `true` (an unclassified channel falls through to the service branch).

- [ ] **Step 3: Declare and classify the channel**

In `src/shared/ipc.ts`, add to `RendererToMain` next to `'service:reload'`:

```ts
  /** shell-only: the rail's off-host back chevron and the Go ▸ Back item */
  'service:goBack': { serviceId: ServiceId };
```

Add `'service:goBack',` to `R2M_CHANNELS` after `'service:reload',`, and add `'service:goBack',` to `SHELL_ONLY_CHANNELS` after `'service:reload',`.

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm test tests/unit/ipc-sender-policy.test.ts`

Expected: PASS.

- [ ] **Step 5: Handle the channel**

In `src/main/ipc-handlers.ts`, add after the `'service:reload'` handler:

```ts
  on('service:goBack', ({ serviceId }) => {
    ctx.views.goBack(serviceId);
    ctx.views.focusActive(); // keep typing in the page, not in the rail
  });
```

- [ ] **Step 6: Run typecheck and the suite**

Run: `corepack pnpm typecheck && corepack pnpm test`

Expected: both clean.

- [ ] **Step 7: Commit**

Stop and ask the user to run `/grimoire-core:commit` — suggested subject: `feat: add the service:goBack channel`.

---

### Task 5: The rail chevron

**Files:**

- Modify: `src/renderer/src/components/Rail.tsx`
- Test: `tests/e2e/smoke.spec.ts`

**Interfaces:**

- Consumes: `state.runtime[id].backAvailable` (Task 3) and the `'service:goBack'` channel (Task 4).
- Produces: a rail button with `data-testid="back-btn"` and `aria-label="Back"`.

- [ ] **Step 1: Write the failing test**

In `tests/e2e/smoke.spec.ts`, add immediately after the existing rail-visible assertion (`await expect(win.locator('[data-testid="rail"]')).toBeVisible();`):

```ts
  // no back chevron on a fresh launch: every view sits on its own host, and
  // the affordance must never read as permanent browser chrome
  await expect(win.locator('[data-testid="back-btn"]')).toHaveCount(0);
```

- [ ] **Step 2: Run the spec to verify it passes for the wrong reason**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e tests/e2e/smoke.spec.ts`

Expected: PASS — the button does not exist yet. This assertion is a regression guard against the chevron becoming permanent, not a red test; the chevron *appearing* is verified by Task 2's unit table and Task 7's manual pass.

- [ ] **Step 3: Add the chevron icon**

In `src/renderer/src/components/Rail.tsx`, add next to `BellIcon` and `GearIcon`:

```tsx
function ChevronLeftIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}
```

- [ ] **Step 4: Render it, gated on runtime state**

In `Rail.tsx`, after the existing `const updateReady = updatePending(state.update);` line, add:

```tsx
  const activeSvc = byId.get(state.activeId);
  const showBack = !state.homeOpen && state.runtime[state.activeId]?.backAvailable === true;
```

Then insert this block as the **first** child of the `<nav>`, immediately before the existing `home-btn` button:

```tsx
      {showBack && (
        <button
          type="button"
          data-testid="back-btn"
          aria-label="Back"
          title={`Back — you've left ${activeSvc?.name ?? 'chat'} (⌘[)`}
          onClick={() => window.goetia.send('service:goBack', { serviceId: state.activeId })}
          className="flex h-7 w-7 flex-none items-center justify-center rounded-ctl
            bg-accent/15 text-accent transition-colors duration-120 hover:bg-accent/25
            outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ChevronLeftIcon />
        </button>
      )}
```

The button appears and disappears rather than holding a reserved slot: the state is transient and the shift is what draws the eye. In left/right rails the chevron still points left — it means "back", not a direction in the rail.

- [ ] **Step 5: Run lint, typecheck and the suite**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`

Expected: all clean.

- [ ] **Step 6: Re-run the e2e spec**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e tests/e2e/smoke.spec.ts`

Expected: PASS — the chevron is still absent, now because `backAvailable` is false rather than because the button does not exist.

- [ ] **Step 7: Commit**

Stop and ask the user to run `/grimoire-core:commit` — suggested subject: `feat(rail): offer a back chevron off-host`.

---

### Task 6: The menu item and the gated keystroke

**Files:**

- Modify: `src/main/menu.ts` — a `Back` item in the Go submenu
- Modify: `src/main/views.ts` — extend the existing `before-input-event` handler in `create()`

**Interfaces:**

- Consumes: `ServiceViewManager.goBack(id)` and the private `backOffHost(id)` from Task 3.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the menu item**

In `src/main/menu.ts`, insert into the `Go` submenu immediately before the existing `'Reload Service'` item:

```ts
        {
          label: 'Back',
          // shown but deliberately NOT registered: Slack binds ⌘[ for its own
          // in-client history, and every alternative (⌘←, ⌥←, ⌘⌫) is a macOS
          // text-editing key. The view's before-input-event takes the key
          // instead, and only while the view is off-host.
          accelerator: 'CmdOrCtrl+[',
          registerAccelerator: false,
          click: () => ctx.views.goBack(ctx.state.activeId),
        },
```

The item stays always-enabled: the app menu is rebuilt only on settings changes, and rebuilding it per navigation is off the table. The chevron, not the menu, is the contextual signal.

- [ ] **Step 2: Take the keystroke, gated on being off-host**

In `src/main/views.ts` `create()`, replace the whole existing `before-input-event` listener:

```ts
    wc.on('before-input-event', (e, input) => {
      if (input.type !== 'keyDown') return;
      // F5 reload while focus is inside the service page (menu covers Cmd/Ctrl+R)
      if (input.key === 'F5') {
        this.refresh(id);
        return;
      }
      // Back — only off-host, so ⌘[ stays Slack's inside the client. The menu
      // shows this accelerator without registering it for the same reason.
      const wantsBack =
        (input.key === '[' && (input.meta || input.control)) ||
        (input.key === 'ArrowLeft' && input.alt);
      if (wantsBack && this.backOffHost(id)) {
        e.preventDefault();
        this.goBack(id);
      }
    });
```

- [ ] **Step 3: Run lint, typecheck and the suite**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`

Expected: all clean. If TypeScript rejects `registerAccelerator` on the menu item, the Electron typings are older than assumed — stop and report rather than casting.

- [ ] **Step 4: Verify `registerAccelerator: false` on a real run**

Run: `corepack pnpm dev`

Enable Slack from Home, sign in, and press ⌘[ inside the client. Expected: Slack's own back/forward history moves and Goetia does nothing. If instead nothing happens in Slack, Electron registered the accelerator anyway — remove the `accelerator` field from the menu item, leaving the label bare, and note it in Task 7's docs. The chevron and the keystroke are unaffected either way.

- [ ] **Step 5: Commit**

Stop and ask the user to run `/grimoire-core:commit` — suggested subject: `feat: add Go ▸ Back with an unregistered ⌘[`.

---

### Task 7: Docs and full verification

**Files:**

- Modify: `CLAUDE.md` — the chat-only principle section
- Modify: `docs/superpowers/specs/2026-08-12-slack-service-design.md` — supersede the first-run bullet

**Interfaces:**

- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Record the invariant in `CLAUDE.md`**

Add as the last bullet of the **Product principle: chat ONLY** list:

```markdown
- Leaving chat has a way back. When a view's current host differs from its service's own and it has history, `ServiceRuntime.backAvailable` turns on and the rail shows a back chevron (`lib/back-affordance.ts` is the whole rule). The gate is host-based on purpose: gating on history alone would light the chevron on every SPA route change — permanent browser chrome in a chat-only app. `Go ▸ Back` declares ⌘[ with `registerAccelerator: false` and the view's `before-input-event` takes the key only while off-host, so Slack keeps its own ⌘[. Back is never offered on the service's own host; `chatPaths` snapback and `views.refresh` remain the containment.
```

- [ ] **Step 2: Supersede the first-run decision**

In `docs/superpowers/specs/2026-08-12-slack-service-design.md`, prefix the **First-run entry** bullet with:

```markdown
**Superseded 2026-08-13** by `2026-08-13-service-back-affordance-design.md`: `firstRunUrl`, `Settings.visited` and `lib/start-url.ts` are gone. Slack starts on `url` like every other service, and the off-host back affordance is what gets a first-timer out of the workspace-signin detour.
```

- [ ] **Step 3: Lint the docs**

Run: `npx markdownlint-cli2 CLAUDE.md docs/superpowers/specs/2026-08-12-slack-service-design.md docs/superpowers/specs/2026-08-13-service-back-affordance-design.md docs/superpowers/plans/2026-08-13-service-back-affordance.md`

Expected: `Summary: 0 issues in 0 files`.

- [ ] **Step 4: Run the full gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`

Expected: all four green.

- [ ] **Step 5: Manual acceptance pass — the test that actually matters**

Run: `corepack pnpm dev`

1. Enable Slack from Home while signed out. Expected: the view lands on Slack's workspace-URL signin, and **no** chevron (the 302 replaced its history entry, so there is nothing to go back to).
2. Click "Don't know your workspace URL? Find your workspace". Expected: `slack.com/get-started` loads and the chevron appears at the head of the rail.
3. Click the chevron. Expected: back on the workspace signin, chevron gone.
4. Repeat step 2, then press ⌘[ (or Alt+← on Windows/Linux). Expected: same as clicking the chevron.
5. Repeat step 2, then use `Go ▸ Back` from the menu bar. Expected: same.
6. Sign in and reach `app.slack.com/client`. Expected: no chevron, and switching channels never makes one appear.
7. Open Home (⌘0) while a service is off-host. Expected: no chevron — it is gated on `!homeOpen`.

Report exactly which of the seven steps passed. Do not claim the feature works without this pass.

- [ ] **Step 6: Commit**

Stop and ask the user to run `/grimoire-core:commit` — suggested subject: `docs: record the back affordance invariant`.
