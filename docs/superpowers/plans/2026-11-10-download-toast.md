# Download toast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While Goetia's window is in front, a finished download is announced by an in-app toast (the pin toast's shape, top centre of the content area) whose one action reveals the file; out of view or locked, today's OS banner stays.

**Architecture:** `DownloadManager.finish` asks one pure rule (`announceVia`) whether to toast or banner. The toast is drawn by `ToastLayer`, a sandboxed, isolated `WebContentsView` stacked above the service view (the waking cover's pattern), created at the first toast and destroyed 60 s after the last. Its page answers on a `MessagePort` main mints per toast, so no IPC channel is added; main owns the 8 s clock and the page only reports hover.

**Tech Stack:** TypeScript, Electron 43 (`WebContentsView`, `MessageChannelMain`), electron-vite multi-entry build, vitest, Playwright, biome.

**Spec:** `docs/superpowers/specs/2026-11-10-download-toast-design.md`

## Global Constraints

- Definition of done: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` all green, plus `corepack pnpm e2e` (this touches main/preload/renderer wiring).
- Run heavy toolchain commands (build, typecheck, test suites, e2e) one at a time from the main thread, never in parallel subagents and never while another is running.
- E2E commands need `ELECTRON_RUN_AS_NODE` unset: prefix them with `env -u ELECTRON_RUN_AS_NODE`. A single spec runs with `npx playwright test <spec>` after a build; `pnpm e2e -- <spec>` runs the whole suite.
- No `git commit` from the plan. There are no per-task commit steps; the last task stops and asks the user to run `/grimoire-core:commit`.
- **Never Open a file.** The toast's only file action is the reveal, through `DownloadManager`. Do not add `shell.openPath` anywhere.
- **No new IPC channel.** Nothing is added to `RendererToMain`, `RendererInvoke` or `SHELL_ONLY_CHANNELS`; `ipcSenderAllowed` and `register()` are not touched. The toast page talks to main only on the port main mints.
- The toast layer's view is `contextIsolation: true` + `sandbox: true`. Its page keeps `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `frame-src 'none'`, and sets page-fed text with `textContent` only.
- `src/shared/**` stays process-agnostic: no `electron`, no DOM imports.
- Pure decisions live in `lib/` helpers with vitest tests; `toast-layer.ts`, `downloads.ts` and `index.ts` stay thin wiring.
- Evidence lines go through `diag.note`, never a bare `console.warn`, and only for something going wrong.
- Every timer and listener added is cleared on destroy and on quit; deferred callbacks check `isDestroyed()`.
- Copy, verbatim: `Show in Finder` (macOS) / `Show in folder` (elsewhere); `Saved from <Service>`; `Could not save <filename>`.
- Constants, verbatim: `TOAST_MS = 8000`, `TOAST_LAYER_IDLE_MS = 60_000`, `TOAST_WIDTH = 360`, `TOAST_INSET = 12`, `TOAST_GUTTER = 16`.
- Comments explain why, concisely, matching the surrounding file's density.
- Any edited Markdown passes `npx markdownlint-cli2 <file>`; never hard-wrap prose (MD013 is off in this repo).
- If `corepack pnpm lint` reports only formatting or import order in files this plan touched, fix with `corepack pnpm exec biome check --write <those files>`.

---

### Task 1: Shared toast constants and the toast-or-banner rule

**Files:**

- Create: `src/shared/toast.ts`
- Create: `tests/unit/shared-toast.test.ts`
- Modify: `src/renderer/src/components/toast-rules.ts:1`
- Modify: `src/renderer/src/components/DownloadsPane.tsx:1-16`
- Modify: `src/main/lib/download-rules.ts` (after `bannerFor`, ~line 95)
- Test: `tests/unit/download-rules.test.ts` (new `describe` after `bannerFor`, ~line 180)

**Interfaces:**

- Consumes: nothing.
- Produces: `TOAST_MS: number` and `revealLabel(platform: string): string` from `src/shared/toast.ts`; `announceVia(w: { visible: boolean; minimized: boolean; focused: boolean; locked: boolean }): 'toast' | 'banner'` and `type Announce = 'toast' | 'banner'` from `src/main/lib/download-rules.ts`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/shared-toast.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { revealLabel, TOAST_MS } from '../../src/shared/toast';

describe('shared toast constants', () => {
  it('keeps the toasts at eight seconds', () => {
    expect(TOAST_MS).toBe(8000);
  });

  it('names the reveal the way each platform does', () => {
    expect(revealLabel('darwin')).toBe('Show in Finder');
    expect(revealLabel('win32')).toBe('Show in folder');
    expect(revealLabel('linux')).toBe('Show in folder');
  });
});
```

In `tests/unit/download-rules.test.ts`, add `announceVia,` to the existing import from `'../../src/main/lib/download-rules'` (keep the list alphabetical: it goes before `ASK_URL_CAP` only if biome asks; otherwise after `ASK_URL_CAP`), and add this block after the `bannerFor` describe:

```ts
describe('announceVia', () => {
  const front = { visible: true, minimized: false, focused: true, locked: false };

  it('toasts only while the window is in front and unlocked', () => {
    expect(announceVia(front)).toBe('toast');
  });

  it('banners when the window is hidden, minimized or behind another app', () => {
    expect(announceVia({ ...front, visible: false })).toBe('banner');
    expect(announceVia({ ...front, minimized: true })).toBe('banner');
    expect(announceVia({ ...front, focused: false })).toBe('banner');
  });

  // a filename must never be drawn over the lock screen
  it('banners while locked, even in front', () => {
    expect(announceVia({ ...front, locked: true })).toBe('banner');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `corepack pnpm vitest run tests/unit/shared-toast.test.ts tests/unit/download-rules.test.ts`

Expected: FAIL — `shared-toast.test.ts` cannot resolve `../../src/shared/toast`; `download-rules.test.ts` fails on `announceVia is not a function`.

- [ ] **Step 3: Implement**

Create `src/shared/toast.ts`:

```ts
/** How long a toast stays before it leaves by itself. Shared because main
 *  runs the download toast's clock and the renderer runs every other one. */
export const TOAST_MS = 8000;

/** The reveal action's name. The Downloads pane and the download toast must
 *  read the same words, and only main knows the platform for the toast. */
export function revealLabel(platform: string): string {
  return platform === 'darwin' ? 'Show in Finder' : 'Show in folder';
}
```

In `src/renderer/src/components/toast-rules.ts`, replace line 1 (`export const TOAST_MS = 8000;`) with:

```ts
export { TOAST_MS } from '../../../shared/toast';
```

In `src/renderer/src/components/DownloadsPane.tsx`, add the import beside the other `shared/` imports and replace the `REVEAL_LABEL` line:

```ts
import { revealLabel } from '../../../shared/toast';
```

```ts
const isMac = navigator.platform.startsWith('Mac');
export const REVEAL_LABEL = revealLabel(isMac ? 'darwin' : 'other');
```

In `src/main/lib/download-rules.ts`, add after `bannerFor`:

```ts
export type Announce = 'toast' | 'banner';

/** An in-app toast can only be seen while the shell window is in front, and
 *  must never be drawn over the lock screen; everything else is the banner. */
export function announceVia(w: {
  visible: boolean;
  minimized: boolean;
  focused: boolean;
  locked: boolean;
}): Announce {
  return w.visible && !w.minimized && w.focused && !w.locked ? 'toast' : 'banner';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `corepack pnpm vitest run tests/unit/shared-toast.test.ts tests/unit/download-rules.test.ts tests/unit/toast-rules.test.ts`

Expected: PASS (the existing `toast-rules.test.ts` still imports `TOAST_MS` through the re-export).

---

### Task 2: Toast layer rules (bounds, clock, reply parsing)

**Files:**

- Create: `src/main/lib/toast-layer-rules.ts`
- Test: `tests/unit/toast-layer-rules.test.ts`

**Interfaces:**

- Consumes: `TOAST_MS` from `src/shared/toast.ts`; `ViewBounds` from `src/main/lib/layout.ts` (`{ x: number; y: number; width: number; height: number }`).
- Produces, all from `src/main/lib/toast-layer-rules.ts`:
  - `TOAST_WIDTH = 360`, `TOAST_HEIGHT = 64`, `TOAST_INSET = 12`, `TOAST_GUTTER = 16`, `TOAST_LAYER_IDLE_MS = 60_000`
  - `toastBounds(content: ViewBounds): ViewBounds`
  - `interface ToastClock { remaining: number; runningSince: number | null }`
  - `startClock(now: number): ToastClock`, `pauseClock(c: ToastClock, now: number): ToastClock`, `resumeClock(c: ToastClock, now: number): ToastClock`
  - `type ToastReply = 'enter' | 'leave' | 'dismiss' | 'reveal'`
  - `parseToastReply(data: unknown): ToastReply | null`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/toast-layer-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { viewBounds } from '../../src/main/lib/layout';
import {
  parseToastReply,
  pauseClock,
  resumeClock,
  startClock,
  TOAST_GUTTER,
  TOAST_HEIGHT,
  TOAST_INSET,
  TOAST_LAYER_IDLE_MS,
  TOAST_WIDTH,
  toastBounds,
} from '../../src/main/lib/toast-layer-rules';
import { TOAST_MS } from '../../src/shared/toast';

describe('toastBounds', () => {
  const height = TOAST_INSET + TOAST_HEIGHT + TOAST_GUTTER;

  it('centres the card under a top rail, flush with the content area', () => {
    const content = viewBounds(1280, 800, 'top');
    expect(toastBounds(content)).toEqual({ x: 444, y: content.y, width: 392, height });
  });

  it('centres inside the content area beside a left rail, not the window', () => {
    const content = viewBounds(1280, 800, 'left');
    expect(toastBounds(content)).toEqual({ x: content.x + 416, y: 0, width: 392, height });
  });

  it('never leaves the content area on a window narrower than the card', () => {
    const b = toastBounds({ x: 56, y: 0, width: 300, height: 600 });
    expect(b).toEqual({ x: 56, y: 0, width: 300, height });
  });

  it('survives a content area with no room at all', () => {
    expect(toastBounds({ x: 0, y: 44, width: 0, height: 0 }).width).toBe(0);
  });

  it('keeps the spec sizes', () => {
    expect([TOAST_WIDTH, TOAST_INSET, TOAST_GUTTER, TOAST_LAYER_IDLE_MS]).toEqual([
      360, 12, 16, 60_000,
    ]);
  });
});

describe('toast clock', () => {
  it('starts with the whole toast time, running', () => {
    expect(startClock(1000)).toEqual({ remaining: TOAST_MS, runningSince: 1000 });
  });

  it('banks the remainder while hovered and resumes with it', () => {
    const paused = pauseClock(startClock(1000), 4000);
    expect(paused).toEqual({ remaining: TOAST_MS - 3000, runningSince: null });
    expect(resumeClock(paused, 9000)).toEqual({ remaining: TOAST_MS - 3000, runningSince: 9000 });
  });

  it('never banks below zero', () => {
    expect(pauseClock(startClock(0), TOAST_MS * 2).remaining).toBe(0);
  });

  // a second enter or a leave with no enter must not move the clock
  it('ignores a pause while paused and a resume while running', () => {
    const paused = pauseClock(startClock(0), 1000);
    expect(pauseClock(paused, 5000)).toBe(paused);
    const running = startClock(0);
    expect(resumeClock(running, 5000)).toBe(running);
  });
});

describe('parseToastReply', () => {
  it('accepts the four things the page may say', () => {
    for (const r of ['enter', 'leave', 'dismiss', 'reveal']) expect(parseToastReply(r)).toBe(r);
  });

  it('drops everything else', () => {
    for (const bad of [null, undefined, 7, '', 'open', { type: 'reveal' }, ['reveal']]) {
      expect(parseToastReply(bad)).toBeNull();
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/toast-layer-rules.test.ts`

Expected: FAIL — cannot resolve `../../src/main/lib/toast-layer-rules`.

- [ ] **Step 3: Implement**

Create `src/main/lib/toast-layer-rules.ts`:

```ts
import { TOAST_MS } from '../../shared/toast';
import type { ViewBounds } from './layout';

/** the card: PinToast's 340 plus room for a filename beside the action */
export const TOAST_WIDTH = 360;
/** fixed, so main can size the layer without asking the page */
export const TOAST_HEIGHT = 64;
/** below the content area's top edge: clear of the rail, over the chat header */
export const TOAST_INSET = 12;
/** the transparent margin the shadow draws in, and the gutter a narrow window keeps */
export const TOAST_GUTTER = 16;
/** the layer's renderer is dropped this long after the last toast leaves */
export const TOAST_LAYER_IDLE_MS = 60_000;

/** The layer's rect inside the content area: the card plus its shadow margin,
 *  top centre. Only this rectangle takes clicks from the service page. */
export function toastBounds(content: ViewBounds): ViewBounds {
  const card = Math.max(0, Math.min(TOAST_WIDTH, content.width - 2 * TOAST_GUTTER));
  const width = Math.min(content.width, card + 2 * TOAST_GUTTER);
  return {
    x: content.x + Math.round((content.width - width) / 2),
    y: content.y,
    width,
    height: TOAST_INSET + TOAST_HEIGHT + TOAST_GUTTER,
  };
}

/** `remaining` is what was left at `runningSince`; null while hover banks it. */
export interface ToastClock {
  remaining: number;
  runningSince: number | null;
}

export function startClock(now: number): ToastClock {
  return { remaining: TOAST_MS, runningSince: now };
}

export function pauseClock(c: ToastClock, now: number): ToastClock {
  if (c.runningSince === null) return c;
  return { remaining: Math.max(0, c.remaining - (now - c.runningSince)), runningSince: null };
}

export function resumeClock(c: ToastClock, now: number): ToastClock {
  return c.runningSince === null ? { remaining: c.remaining, runningSince: now } : c;
}

export type ToastReply = 'enter' | 'leave' | 'dismiss' | 'reveal';

/** The port's whole vocabulary. No reply carries a path, an id or a URL, so
 *  the page can never name a file: main already holds the one the toast is for. */
export function parseToastReply(data: unknown): ToastReply | null {
  return data === 'enter' || data === 'leave' || data === 'dismiss' || data === 'reveal'
    ? data
    : null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/toast-layer-rules.test.ts`

Expected: PASS.

---

### Task 3: `DownloadManager` chooses toast or banner

**Files:**

- Modify: `src/main/downloads.ts` (imports; `DownloadManagerDeps`; `finish`; new `toastAction`)
- Test: `tests/unit/downloads.test.ts` (harness defaults; new `describe`)

**Interfaces:**

- Consumes: `announceVia` (Task 1).
- Produces, from `src/main/downloads.ts`:
  - `interface DownloadToast { rowId: number | null; serviceId: ServiceId; small: string; main: string; action: string | null }`
  - three new `DownloadManagerDeps` members: `inFront(): { visible: boolean; minimized: boolean; focused: boolean }`, `toast(t: DownloadToast, unavailable: () => void): void`, `revealLabel: string`
  - `DownloadManager.toastAction(id: number): void`

Behaviour note for the reviewer: the announcement (banner and toast alike) now names the file **as saved on disk** (`note (1).txt` for a de-duplicated save), the way the history row already does. Before, the banner used the name the page asked for.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/downloads.test.ts`, extend the import from `'../../src/main/downloads'` with `type DownloadToast,` and add three defaults to the `deps` object inside `harness` (before `...over`), so every existing test keeps exercising the banner:

```ts
    inFront: () => ({ visible: false, minimized: false, focused: false }),
    toast: vi.fn(),
    revealLabel: 'Show in Finder',
```

Add this block after the `DownloadManager` describe:

```ts
describe('toast or banner', () => {
  const inFront = () => ({ visible: true, minimized: false, focused: true });
  const toastSpy = () => vi.fn<(t: DownloadToast, unavailable: () => void) => void>();

  it('toasts instead of bannering while the window is in front', () => {
    const toast = toastSpy();
    const { ses, deps, banners, files } = harness({ inFront, toast });
    const item = new FakeItem('photo.jpg');
    ses.fire(item);
    files.add(join(DIR, 'photo.jpg'));
    item.finish('completed');
    expect(banners).toHaveLength(0);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0][0]).toEqual({
      rowId: 1,
      serviceId: 'whatsapp',
      small: 'Saved from WhatsApp',
      main: 'photo.jpg',
      action: 'Show in Finder',
    });
    // the bounce is not the banner's: it rides either announcement
    expect(deps.dockFinished).toHaveBeenCalledWith(join(DIR, 'photo.jpg'));
  });

  it('names the file as saved on disk', () => {
    const toast = toastSpy();
    const { ses } = harness({ inFront, toast, files: new Set([join(DIR, 'photo.jpg')]) });
    const item = new FakeItem('photo.jpg');
    ses.fire(item);
    item.finish('completed');
    expect(toast.mock.calls[0][0].main).toBe('photo (1).jpg');
  });

  it('a failed download toasts with nothing to reveal', () => {
    const toast = toastSpy();
    const { ses, banners } = harness({ inFront, toast });
    const item = new FakeItem('a.pdf');
    ses.fire(item);
    item.finish('interrupted');
    expect(banners).toHaveLength(0);
    expect(toast.mock.calls[0][0]).toEqual({
      rowId: null,
      serviceId: 'whatsapp',
      small: 'WhatsApp',
      main: 'Could not save a.pdf',
      action: null,
    });
  });

  it('a cancelled download announces nothing either way', () => {
    const toast = toastSpy();
    const { ses, banners } = harness({ inFront, toast });
    const item = new FakeItem('a.pdf');
    ses.fire(item);
    item.finish('cancelled');
    expect(toast).not.toHaveBeenCalled();
    expect(banners).toHaveLength(0);
  });

  it('banners when the window is not in front', () => {
    const toast = toastSpy();
    const { ses, banners } = harness({
      inFront: () => ({ visible: true, minimized: false, focused: false }),
      toast,
    });
    const item = new FakeItem('photo.jpg');
    ses.fire(item);
    item.finish('completed');
    expect(toast).not.toHaveBeenCalled();
    expect(banners[0]).toMatchObject({ title: 'photo.jpg', body: 'Saved from WhatsApp' });
  });

  it('banners, redacted, while locked even in front', () => {
    const toast = toastSpy();
    const { ses, banners, box } = harness({ inFront, toast });
    const item = new FakeItem('secret.pdf');
    ses.fire(item);
    box.locked = true;
    item.finish('completed');
    expect(toast).not.toHaveBeenCalled();
    expect(banners[0]).toMatchObject({ title: 'WhatsApp', body: '' });
  });

  it('falls back to the banner when the layer cannot show the toast', () => {
    const toast = toastSpy().mockImplementation((_t, unavailable) => unavailable());
    const { ses, banners } = harness({ inFront, toast });
    const item = new FakeItem('photo.jpg');
    ses.fire(item);
    item.finish('completed');
    expect(banners).toHaveLength(1);
    expect(banners[0]).toMatchObject({ title: 'photo.jpg', body: 'Saved from WhatsApp' });
  });

  it('the fallback redacts if the lock engaged in between', () => {
    let fallback = () => {};
    const toast = toastSpy().mockImplementation((_t, unavailable) => {
      fallback = unavailable;
    });
    const { ses, banners, box } = harness({ inFront, toast });
    const item = new FakeItem('secret.pdf');
    ses.fire(item);
    item.finish('completed');
    box.locked = true;
    fallback();
    expect(banners[0]).toMatchObject({ title: 'WhatsApp', body: '' });
  });

  it("the toast's action reveals, opens the pane once the file is gone, and is inert while locked", () => {
    const { dm, ses, deps, files, box } = harness({ inFront, toast: toastSpy() });
    const item = new FakeItem('photo.jpg');
    ses.fire(item);
    files.add(join(DIR, 'photo.jpg'));
    item.finish('completed');

    dm.toastAction(1);
    expect(deps.reveal).toHaveBeenCalledWith(join(DIR, 'photo.jpg'));
    expect(deps.openDownloads).not.toHaveBeenCalled();

    files.delete(join(DIR, 'photo.jpg'));
    dm.toastAction(1);
    expect(deps.reveal).toHaveBeenCalledTimes(1);
    expect(deps.openDownloads).toHaveBeenCalledTimes(1);

    box.locked = true;
    dm.toastAction(1);
    expect(deps.reveal).toHaveBeenCalledTimes(1);
    expect(deps.openDownloads).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `corepack pnpm vitest run tests/unit/downloads.test.ts`

Expected: FAIL — the new describe's tests fail (`toast` never called, `dm.toastAction is not a function`); typecheck-level errors about unknown deps members are fine at this stage.

- [ ] **Step 3: Implement**

In `src/main/downloads.ts`:

Add `announceVia,` to the import from `'./lib/download-rules'` (alphabetical, before `ASK_URL_CAP` or wherever biome sorts it).

Add after the `DownloadBanner` interface:

```ts
/** The in-app announcement. `rowId` is the history row the action reveals;
 *  null (with a null `action`) when there is nothing to reveal. */
export interface DownloadToast {
  rowId: number | null;
  serviceId: ServiceId;
  small: string;
  main: string;
  action: string | null;
}
```

Add to `DownloadManagerDeps`, after `notify`:

```ts
  /** the shell window right now; all false once it is destroyed */
  inFront(): { visible: boolean; minimized: boolean; focused: boolean };
  /** the in-app toast on its own layer above the service page; `unavailable`
   *  runs if the layer cannot show it, and is the banner */
  toast(t: DownloadToast, unavailable: () => void): void;
  /** `revealLabel(process.platform)` — the toast action's words */
  revealLabel: string;
```

In `finish`, replace everything from `const name = this.deps.serviceName(id);` to the end of the method with:

```ts
    const name = this.deps.serviceName(id);
    // named by the file on disk, as the history row is: a de-duplicated save
    // is `note (1).txt`, not the `note.txt` the page asked for
    const banner = bannerFor(state, record?.filename ?? item.getFilename(), name);
    if (!banner) return;
    if (state === 'completed') this.deps.dockFinished(path);
    const showBanner = () => {
      // read here, not above: the toast's fallback can run after a lock engaged
      const shown = this.deps.locked() ? redactBanner(name) : banner;
      const icon = this.deps.icons.get(id);
      this.deps.notify({
        ...shown,
        ...(icon ? { icon } : {}),
        onClick: () => {
          // re-checked at click time: a banner clicked hours later must not be
          // a way to reveal a file past a lock that has since engaged
          if (state === 'completed' && !this.deps.locked()) {
            if (this.deps.exists(path)) this.deps.reveal(path);
            else this.deps.openDownloads(); // the row there reads "moved or deleted since"
          } else this.deps.showWindow();
        },
      });
    };
    if (announceVia({ ...this.deps.inFront(), locked: this.deps.locked() }) === 'banner') {
      showBanner();
      return;
    }
    const rowId = state === 'completed' && record ? record.id : null;
    this.deps.toast(
      {
        rowId,
        serviceId: id,
        small: banner.body,
        main: banner.title,
        action: rowId !== null ? this.deps.revealLabel : null,
      },
      showBanner,
    );
  }
```

Update the class doc comment's second sentence so it stays true:

```ts
/** One will-download listener per service partition; the decision is
 *  decideSave, the completion is an announcement of its own — a toast in
 *  front, a banner otherwise (never the message router: no activity log, no
 *  mute gating, always silent). */
```

Add after the existing `reveal(id)` method:

```ts
  /** The toast's action: the reveal, or the pane once the file has gone —
   *  the banner click's rule. Inert while locked. */
  toastAction(id: number): void {
    if (this.deps.locked()) return;
    if (!this.reveal(id)) this.deps.openDownloads();
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `corepack pnpm vitest run tests/unit/downloads.test.ts`

Expected: PASS, including every pre-existing banner test.

`corepack pnpm typecheck` fails at this point in `src/main/index.ts` (the three new deps are not supplied yet). That is expected and is fixed in Task 5; do not stub them here.

---

### Task 4: The toast page (preload, HTML, script, styles, build entries)

**Files:**

- Create: `src/preload/toast.ts`
- Create: `src/renderer/toast.html`
- Create: `src/renderer/src/toast.ts`
- Create: `src/renderer/src/toast.css`
- Create: `tests/unit/toast-page.test.ts`
- Modify: `src/shared/ipc.ts:121-125` (`MainToRenderer`)
- Modify: `src/renderer/src/env.d.ts`
- Modify: `electron.vite.config.ts`

**Interfaces:**

- Consumes: `TOAST_MS` (Task 1). The CSS depends on the sizes fixed in Task 2: the body padding is `TOAST_INSET` top and `TOAST_GUTTER` sides and bottom, and the card is `TOAST_HEIGHT` tall.
- Produces:
  - `MainToRenderer['toast:show']`: `{ theme: 'light' | 'dark'; serviceId: ServiceId; color: string; small: string; main: string; action: string | null }` — the message main posts, with one transferred port.
  - `window.goetiaToast: { onToast(cb: (t: MainToRenderer['toast:show']) => void): void; reply(kind: 'enter' | 'leave' | 'dismiss' | 'reveal'): void }`
  - Build outputs `out/preload/toast.cjs` and `out/renderer/toast.html`.
  - DOM test ids `download-toast` (the card) and `download-toast-action` (the button).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/toast-page.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The toast layer is a third Goetia page, so it holds the shell's CSP and
 *  carries no script of its own in the markup. */
describe('toast.html', () => {
  const html = readFileSync(join(__dirname, '../../src/renderer/toast.html'), 'utf8');

  it('keeps the renderer CSP', () => {
    for (const directive of [
      "default-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-src 'none'",
    ]) {
      expect(html).toContain(directive);
    }
  });

  it('loads its script from a file, never inline', () => {
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toContain('src="/src/toast.ts"');
  });

  // the card must not flash empty before the first toast arrives
  it('starts with the card hidden', () => {
    expect(html).toMatch(/id="toast"[^>]*\bhidden\b/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/toast-page.test.ts`

Expected: FAIL — `ENOENT` reading `src/renderer/toast.html`.

- [ ] **Step 3: Implement**

In `src/shared/ipc.ts`, extend `MainToRenderer` (`ServiceId` is already imported there):

```ts
/** main -> shell renderer, via webContents.send */
export interface MainToRenderer {
  'shell:state': ShellState;
  /** main -> loading overlay page */
  'loading:state': { theme: 'light' | 'dark'; caption: string };
  /** main -> toast layer page, posted with the port the page answers on */
  'toast:show': {
    theme: 'light' | 'dark';
    serviceId: ServiceId;
    color: string;
    small: string;
    main: string;
    action: string | null;
  };
}
```

Create `src/preload/toast.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron';
import type { MainToRenderer } from '../shared/ipc';

type Toast = MainToRenderer['toast:show'];
type Reply = 'enter' | 'leave' | 'dismiss' | 'reveal';

// main mints one port per toast, so a reply can only travel on the newest;
// the port stays on this side of the bridge
let port: MessagePort | null = null;
let latest: Toast | null = null;
let listener: ((t: Toast) => void) | null = null;

ipcRenderer.on('toast:show', (e, t: Toast) => {
  port?.close();
  port = e.ports[0] ?? null;
  latest = t;
  listener?.(t);
});

const api = {
  /** the page's one subscriber; a toast that beat it here is replayed */
  onToast(cb: (t: Toast) => void): void {
    listener = cb;
    if (latest) cb(latest);
  },
  reply(kind: Reply): void {
    port?.postMessage(kind);
  },
};

contextBridge.exposeInMainWorld('goetiaToast', api);
export type GoetiaToastApi = typeof api;
```

Create `src/renderer/toast.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-src 'none'"
    />
    <title>Goetia — toast</title>
    <style>
      /* the view is transparent; nothing may paint before the first toast */
      html,
      body {
        margin: 0;
        background: transparent;
      }
      [hidden] {
        display: none;
      }
    </style>
  </head>
  <body>
    <div id="toast" class="toast" role="status" aria-live="polite" data-testid="download-toast" hidden>
      <span id="chip" class="chip"><span id="glyph" class="glyph"></span></span>
      <span class="lines">
        <span id="small" class="small"></span>
        <span id="main" class="main"></span>
      </span>
      <button id="action" class="action" type="button" data-testid="download-toast-action" hidden></button>
      <span id="drain" class="drain" aria-hidden="true"></span>
    </div>
    <script type="module" src="/src/toast.ts"></script>
  </body>
</html>
```

Create `src/renderer/src/toast.css`:

```css
/* The layer is exactly this page: TOAST_INSET above the card, TOAST_GUTTER
   beside and below it for the shadow (lib/toast-layer-rules.ts). */
html,
body {
  height: 100%;
  overflow: hidden;
  background: transparent;
}
body {
  box-sizing: border-box;
  padding: 12px 16px 16px;
}
/* PinToast's card, at a fixed height so main can size the layer */
.toast {
  position: relative;
  display: flex;
  box-sizing: border-box;
  height: 64px;
  align-items: center;
  gap: 12px;
  overflow: hidden;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--bg-1);
  color: var(--text-1);
  /* tighter than PinToast's: the shadow has to fit the 16px margin */
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  cursor: default;
}
.toast[hidden],
.action[hidden] {
  display: none;
}
/* it arrives from the rail above, where the shell's toasts rise from below */
.toast-drop {
  animation: toast-drop 240ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes toast-drop {
  from {
    opacity: 0;
    transform: translateY(-8px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.chip {
  display: flex;
  width: 28px;
  height: 28px;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  color: #fff;
}
.chip .glyph {
  width: 16px;
  height: 16px;
}
.lines {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}
.small,
.main {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.small {
  color: var(--text-2);
  font-size: 11px;
  line-height: 16px;
}
.main {
  line-height: 20px;
}
.action {
  flex: none;
  padding: 4px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  font: inherit;
  font-weight: 600;
  white-space: nowrap;
}
.action:hover {
  background: var(--bg-2);
}
.drain {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 2px;
  background: var(--accent);
}
```

Create `src/renderer/src/toast.ts`:

```ts
import './tokens.css';
import './toast.css';
import { TOAST_MS } from '../../shared/toast';

const logos = import.meta.glob<string>('./assets/logos/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

const el = (id: string) => document.getElementById(id) as HTMLElement;
const card = el('toast');
const chip = el('chip');
const glyph = el('glyph');
const small = el('small');
const main = el('main');
const action = el('action');
const drain = el('drain');

/** Remove and re-add so a toast that replaces one on screen replays it. */
function replay(node: HTMLElement, cls: string): void {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

function setPaused(paused: boolean): void {
  // decorative: main owns the clock, this only draws it
  drain.style.animationPlayState = paused ? 'paused' : 'running';
}

window.goetiaToast.onToast((t) => {
  document.documentElement.dataset.theme = t.theme;
  chip.style.background = t.color;
  glyph.style.setProperty('--glyph', `url("${logos[`./assets/logos/${t.serviceId}.svg`]}")`);
  // the filename is page-controlled: text only, never markup
  small.textContent = t.small;
  main.textContent = t.main;
  action.textContent = t.action ?? '';
  action.hidden = t.action === null;
  card.hidden = false;
  drain.style.animationDuration = `${TOAST_MS}ms`;
  replay(card, 'toast-drop');
  replay(drain, 'toast-drain');
  // a toast can land under a resting pointer, which never "enters"
  const hovered = card.matches(':hover');
  setPaused(hovered);
  if (hovered) window.goetiaToast.reply('enter');
});

card.addEventListener('mouseenter', () => {
  setPaused(true);
  window.goetiaToast.reply('enter');
});
card.addEventListener('mouseleave', () => {
  setPaused(false);
  window.goetiaToast.reply('leave');
});

// every click answers: the action reveals, anything else (the card's body,
// the shadow margin) dismisses, so a click never strands focus on this layer
document.addEventListener('click', (e) => {
  const onAction = !action.hidden && e.target instanceof Node && action.contains(e.target);
  window.goetiaToast.reply(onAction ? 'reveal' : 'dismiss');
});
```

In `src/renderer/src/env.d.ts`, add the toast API:

```ts
import type { GoetiaLoadingApi } from '../../preload/loading';
import type { GoetiaApi } from '../../preload/shell';
import type { GoetiaToastApi } from '../../preload/toast';

declare global {
  interface Window {
    goetia: GoetiaApi;
    goetiaLoading: GoetiaLoadingApi;
    goetiaToast: GoetiaToastApi;
  }
}
```

In `electron.vite.config.ts`, add one entry to each `input`:

```ts
          loading: resolve(__dirname, 'src/preload/loading.ts'),
          toast: resolve(__dirname, 'src/preload/toast.ts'),
```

```ts
          loading: resolve(__dirname, 'src/renderer/loading.html'),
          toast: resolve(__dirname, 'src/renderer/toast.html'),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/toast-page.test.ts`

Expected: PASS.

- [ ] **Step 5: Confirm the build emits both entries**

Run: `corepack pnpm build && ls out/preload/toast.cjs out/renderer/toast.html`

Expected: the build succeeds (it does not typecheck `index.ts`'s missing deps) and both paths are listed. If the preload is emitted under another extension, note the real name: Task 5 loads it by path and must match `loading.cjs`'s pattern.

---

### Task 5: `ToastLayer`, wiring in `index.ts`, and the e2e

**Files:**

- Create: `src/main/toast-layer.ts`
- Modify: `src/main/index.ts` (imports; an e2e const near line 68; after the `LoadingOverlay` construction ~line 253; `DownloadManager` deps ~line 269; the `ServiceViewManager` overlay argument ~line 367; `syncOverlay` ~line 443; window listeners ~line 523; `syncLocked` ~line 589; `before-quit` ~line 610)
- Test: `tests/e2e/downloads.spec.ts`

**Interfaces:**

- Consumes: `toastBounds`, `startClock`, `pauseClock`, `resumeClock`, `parseToastReply`, `TOAST_LAYER_IDLE_MS`, `ToastClock` (Task 2); `DownloadToast`, `DownloadManager.toastAction`, the three new deps (Task 3); `MainToRenderer['toast:show']`, `out/preload/toast.cjs`, `out/renderer/toast.html`, test ids `download-toast` / `download-toast-action` (Task 4); `revealLabel` (Task 1).
- Produces, from `src/main/toast-layer.ts`:
  - `interface ToastCard { serviceId: ServiceId; small: string; main: string; action: string | null }`
  - `interface ToastHandlers { action(): void; unavailable(): void }`
  - `interface ToastLayerDeps { win: BrowserWindow; theme(): 'light' | 'dark'; color(id: ServiceId): string; contentBounds(): ViewBounds; restoreFocus(): void; note(line: string): void }`
  - `class ToastLayer` with `show(card: ToastCard, on: ToastHandlers): void`, `hide(): void`, `layout(): void`, `raise(): void`, `dispose(): void`
  - The env switch `GOETIA_E2E_IN_FRONT=1`, honoured only under `--goetia-e2e`.

- [ ] **Step 1: Write the failing e2e**

In `tests/e2e/downloads.spec.ts`:

Replace the `isShell` line and add `isToast` under it:

```ts
const isShell = (p: Page) =>
  p.url().startsWith('file://') &&
  !p.url().includes('loading.html') &&
  !p.url().includes('toast.html');
const isToast = (p: Page) => p.url().includes('toast.html');
```

Replace the `launch` helper so a test can pass environment:

```ts
async function launch(profile: string, env: Record<string, string> = {}) {
  const app = await electron.launch({
    args: ['out/main/index.js', '--goetia-e2e', `--goetia-user-data=${profile}`],
    env: { ...(process.env as Record<string, string>), ...env },
  });
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
  await win.waitForLoadState('domcontentloaded');
  return { app, win };
}
```

Add these helpers after `trigger`:

```ts
/** the toast layer's view is attached to the window and visible — the DOM
 *  alone cannot say so, since a hidden view still has a rendered page */
const toastVisible = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().some((w) =>
      w.contentView.children.some((v) => {
        const wc = (v as unknown as { webContents?: { getURL(): string } }).webContents;
        return (wc?.getURL().includes('toast.html') ?? false) && v.getVisible();
      }),
    ),
  );

/** e2e must not open Finder: record what the reveal was asked for instead */
const stubReveal = (app: ElectronApplication) =>
  app.evaluate(({ shell }) => {
    const g = globalThis as unknown as { __revealed: string[] };
    g.__revealed = [];
    shell.showItemInFolder = (p: string) => {
      g.__revealed.push(p);
    };
  });

const revealed = (app: ElectronApplication) =>
  app.evaluate(() => (globalThis as unknown as { __revealed: string[] }).__revealed);
```

Add the test after the first test:

```ts
test('in front, a download raises the toast; a newer one replaces it; the action reveals and the body dismisses', async () => {
  const { profile, downloads } = makeProfile();
  // focus cannot be relied on under Playwright; the switch only exists under --goetia-e2e
  const { app } = await launch(profile, { GOETIA_E2E_IN_FRONT: '1' });
  await waitForService(app);
  await stubReveal(app);

  // the layer is created by the first toast, never before
  expect(app.windows().some(isToast)).toBe(false);

  await trigger(app);
  await expect.poll(() => app.windows().some(isToast), { timeout: 15_000 }).toBe(true);
  const toast = app.windows().find(isToast) as Page;
  const card = toast.getByTestId('download-toast');
  const action = toast.getByTestId('download-toast-action');
  await expect(card).toContainText('note.txt');
  await expect(card).toContainText('Saved from Zalo');
  await expect(action).toHaveText(
    process.platform === 'darwin' ? 'Show in Finder' : 'Show in folder',
  );
  await expect.poll(() => toastVisible(app)).toBe(true);

  // one slot, newest wins, named by the file on disk
  await trigger(app);
  await expect(card).toContainText('note (1).txt');

  await action.click();
  await expect.poll(() => toastVisible(app)).toBe(false);
  expect(await revealed(app)).toEqual([join(downloads, 'note (1).txt')]);

  // the body dismisses and reveals nothing
  await trigger(app);
  await expect(card).toContainText('note (2).txt');
  await expect.poll(() => toastVisible(app)).toBe(true);
  await card.click({ position: { x: 80, y: 20 } });
  await expect.poll(() => toastVisible(app)).toBe(false);
  expect(await revealed(app)).toHaveLength(1);

  await app.close();
});
```

If `shell.showItemInFolder = …` throws inside `stubReveal` (a non-writable export), replace the assignment with `Object.defineProperty(shell, 'showItemInFolder', { value: (p: string) => { g.__revealed.push(p); }, configurable: true })`.

- [ ] **Step 2: Run the e2e to verify it fails**

Run: `corepack pnpm build && env -u ELECTRON_RUN_AS_NODE npx playwright test tests/e2e/downloads.spec.ts -g "in front"`

Expected: FAIL — polling `app.windows().some(isToast)` times out (nothing creates the toast page yet). If the build itself fails on `index.ts`, that is the missing deps from Task 3; go on to Step 3 and treat this step as satisfied.

- [ ] **Step 3: Implement `ToastLayer`**

Create `src/main/toast-layer.ts`:

```ts
import { join } from 'node:path';
import {
  type BrowserWindow,
  MessageChannelMain,
  type MessagePortMain,
  WebContentsView,
} from 'electron';
import type { MainToRenderer } from '../shared/ipc';
import type { ServiceId } from '../shared/types';
import type { ViewBounds } from './lib/layout';
import {
  parseToastReply,
  pauseClock,
  resumeClock,
  startClock,
  TOAST_LAYER_IDLE_MS,
  type ToastClock,
  type ToastReply,
  toastBounds,
} from './lib/toast-layer-rules';

export interface ToastCard {
  serviceId: ServiceId;
  small: string;
  main: string;
  action: string | null;
}

export interface ToastHandlers {
  /** the card's action was clicked */
  action(): void;
  /** the layer could not show this toast; the caller announces another way */
  unavailable(): void;
}

export interface ToastLayerDeps {
  win: BrowserWindow;
  theme(): 'light' | 'dark';
  color(id: ServiceId): string;
  /** the service views' rect, so the toast follows the rail position */
  contentBounds(): ViewBounds;
  /** hand the keyboard back to whatever had it before a click on the toast */
  restoreFocus(): void;
  note(line: string): void;
}

interface Current {
  card: ToastCard;
  on: ToastHandlers;
  shown: boolean;
}

/** One toast at a time on its own view above the service page — the only way
 *  a toast is seen while a page covers the shell. The view exists only around
 *  toasts; the page is told what to draw and answers on a port minted here,
 *  so the layer adds no IPC channel and can never name a file. */
export class ToastLayer {
  private view: WebContentsView | null = null;
  private loaded = false;
  private visible = false;
  private current: Current | null = null;
  private port: MessagePortMain | null = null;
  private clock: ToastClock | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private idle: ReturnType<typeof setTimeout> | null = null;

  constructor(private deps: ToastLayerDeps) {}

  /** Newest wins: a toast replaces the one on screen and restarts the clock. */
  show(card: ToastCard, on: ToastHandlers): void {
    if (this.deps.win.isDestroyed()) {
      on.unavailable();
      return;
    }
    this.clearIdle();
    this.current = { card, on, shown: false };
    if (!this.view) this.create();
    else if (this.loaded) this.present();
    // else: still loading, did-finish-load presents whatever is current
  }

  /** Take the toast down. One that never reached the screen is handed back
   *  to its caller, so a lock or a hidden window turns it into the banner. */
  hide(): void {
    const cur = this.current;
    this.current = null;
    this.disarm();
    this.clock = null;
    this.port?.close();
    this.port = null;
    if (this.visible && this.view) {
      // a click focused this view, which has no chord interceptor
      const focused =
        !this.view.webContents.isDestroyed() && this.view.webContents.isFocused();
      this.view.setVisible(false);
      this.visible = false;
      if (focused) this.deps.restoreFocus();
    }
    if (cur && !cur.shown) cur.on.unavailable();
    this.armIdle();
  }

  /** The content rect moved (resize, rail position). */
  layout(): void {
    if (this.visible && this.view) this.view.setBounds(toastBounds(this.deps.contentBounds()));
  }

  /** Back to the top after a service view or the waking cover was re-stacked. */
  raise(): void {
    if (!this.visible || !this.view || this.deps.win.isDestroyed()) return;
    this.deps.win.contentView.addChildView(this.view);
  }

  dispose(): void {
    this.current = null;
    this.disarm();
    this.clearIdle();
    this.clock = null;
    this.port?.close();
    this.port = null;
    this.destroyView();
  }

  private create(): void {
    const view = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, '../preload/toast.cjs'),
        contextIsolation: true,
        sandbox: true,
      },
    });
    view.setBackgroundColor('#00000000');
    view.setVisible(false);
    this.view = view;
    this.loaded = false;
    const wc = view.webContents;
    // the page never goes anywhere: only a reload of itself (dev HMR) passes
    wc.on('will-navigate', (e, url) => {
      if (url !== wc.getURL()) e.preventDefault();
    });
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    wc.on('did-finish-load', () => {
      if (this.view !== view) return;
      this.loaded = true;
      if (this.current && !this.current.shown) this.present();
    });
    wc.on('did-fail-load', (_e, code, _desc, _url, isMainFrame) => {
      if (this.view === view && isMainFrame && code !== -3) this.fail(`load ${code}`);
    });
    wc.on('render-process-gone', (_e, details) => {
      if (this.view === view) this.fail(details.reason);
    });
    if (process.env.ELECTRON_RENDERER_URL) {
      wc.loadURL(`${process.env.ELECTRON_RENDERER_URL}/toast.html`);
    } else {
      wc.loadFile(join(__dirname, '../renderer/toast.html'));
    }
  }

  private present(): void {
    const cur = this.current;
    const view = this.view;
    if (!cur || !view || this.deps.win.isDestroyed() || view.webContents.isDestroyed()) return;
    cur.shown = true;
    this.port?.close();
    const { port1, port2 } = new MessageChannelMain();
    this.port = port1;
    // a late message on a replaced toast's port is not this toast's
    port1.on('message', (e) => {
      if (this.port === port1) this.onReply(parseToastReply(e.data));
    });
    port1.start();
    const payload: MainToRenderer['toast:show'] = {
      ...cur.card,
      color: this.deps.color(cur.card.serviceId),
      theme: this.deps.theme(),
    };
    view.webContents.postMessage('toast:show', payload, [port2]);
    view.setBounds(toastBounds(this.deps.contentBounds()));
    // re-added every time, so it lands above the views and the waking cover
    this.deps.win.contentView.addChildView(view);
    view.setVisible(true);
    this.visible = true;
    this.clock = startClock(Date.now());
    this.arm();
  }

  private onReply(reply: ToastReply | null): void {
    if (!reply || !this.visible || !this.clock) return;
    if (reply === 'enter') {
      this.clock = pauseClock(this.clock, Date.now());
      this.disarm();
      return;
    }
    if (reply === 'leave') {
      this.clock = resumeClock(this.clock, Date.now());
      this.arm();
      return;
    }
    const cur = this.current;
    this.hide();
    if (reply === 'reveal' && cur && cur.card.action !== null) cur.on.action();
  }

  /** The page failed to load or its renderer died. The next toast builds a
   *  fresh view; one that had not been shown yet falls back to the banner. */
  private fail(reason: string): void {
    const cur = this.current;
    this.current = null;
    this.disarm();
    this.clearIdle();
    this.clock = null;
    this.port?.close();
    this.port = null;
    this.destroyView();
    this.deps.note(`toast layer failed: ${reason}`);
    if (cur && !cur.shown) cur.on.unavailable();
  }

  private arm(): void {
    this.disarm();
    if (!this.clock || this.clock.runningSince === null) return;
    this.timer = setTimeout(() => this.hide(), this.clock.remaining);
  }

  private disarm(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private armIdle(): void {
    this.clearIdle();
    if (!this.view) return;
    this.idle = setTimeout(() => {
      this.idle = null;
      if (!this.current) this.destroyView();
    }, TOAST_LAYER_IDLE_MS);
  }

  private clearIdle(): void {
    if (this.idle !== null) clearTimeout(this.idle);
    this.idle = null;
  }

  private destroyView(): void {
    const view = this.view;
    if (!view) return;
    // cleared first: the close below must not read as a renderer death
    this.view = null;
    this.loaded = false;
    this.visible = false;
    const { win } = this.deps;
    if (!win.isDestroyed() && win.contentView.children.includes(view)) {
      win.contentView.removeChildView(view);
    }
    if (!view.webContents.isDestroyed()) view.webContents.close();
  }
}
```

- [ ] **Step 4: Wire it in `src/main/index.ts`**

Imports — add beside their neighbours (keep each group's order):

```ts
import { revealLabel } from '../shared/toast';
import { viewBounds } from './lib/layout';
import { ToastLayer } from './toast-layer';
```

Under the existing `e2eCallsOff` const (~line 69):

```ts
// focus cannot be driven under Playwright; never consulted outside e2e
const e2eInFront =
  process.argv.includes('--goetia-e2e') && process.env.GOETIA_E2E_IN_FRONT === '1';
```

Right after `const overlay = new LoadingOverlay(win, effectiveTheme());`:

```ts
    const toastLayer = new ToastLayer({
      win,
      theme: effectiveTheme,
      color: (id) => serviceById(id).color,
      contentBounds: () => {
        const [w, h] = win.getContentSize();
        return viewBounds(w, h, settings.get().railPosition);
      },
      // views is assembled below; a toast cannot be clicked before it exists
      restoreFocus: () => {
        if (win.isDestroyed()) return;
        if (anyOverlayOpen(state)) win.webContents.focus();
        else views.focusActive();
      },
      note: (line) => diag.note('downloads', line),
    });
```

In the `new DownloadManager({ … })` deps, after the `notify` member:

```ts
      inFront: () => {
        if (win.isDestroyed()) return { visible: false, minimized: false, focused: false };
        if (e2eInFront) return { visible: true, minimized: false, focused: true };
        return {
          visible: win.isVisible(),
          minimized: win.isMinimized(),
          focused: win.isFocused(),
        };
      },
      toast: (t, unavailable) =>
        toastLayer.show(
          { serviceId: t.serviceId, small: t.small, main: t.main, action: t.action },
          {
            // the row id never leaves main: the page can only say "reveal"
            action: () => {
              if (t.rowId !== null) downloads.toastAction(t.rowId);
            },
            unavailable,
          },
        ),
      revealLabel: revealLabel(process.platform),
```

In the `new ServiceViewManager(…)` call, replace the last argument `overlay,` with:

```ts
      // the toast layer rides the cover's two seams: it re-centres when the
      // content rect moves and goes back on top when a view is re-stacked
      {
        setBounds: (b) => {
          overlay.setBounds(b);
          toastLayer.layout();
        },
        raise: () => {
          overlay.raise();
          toastLayer.raise();
        },
      },
```

In `syncOverlay`, after `overlay.show();`:

```ts
      toastLayer.raise(); // the cover just re-added itself on top
```

After the existing `win.on('show', () => updates.flushAnnounce());`:

```ts
    // a toast nobody can see is the banner's job (hide hands an unshown one back)
    win.on('hide', () => toastLayer.hide());
    win.on('minimize', () => toastLayer.hide());
```

In `syncLocked`, after `if (!applyLocked(ctx, lock.locked)) return;`:

```ts
        // a filename must never sit over the lock screen
        if (lock.locked) toastLayer.hide();
```

In the `before-quit` handler, after `downloads.dispose();`:

```ts
      toastLayer.dispose();
```

- [ ] **Step 5: Typecheck and unit tests**

Run: `corepack pnpm typecheck`

Expected: PASS (the Task 3 deps are now supplied).

Run: `corepack pnpm test`

Expected: PASS.

- [ ] **Step 6: Run the e2e to verify it passes**

Run: `corepack pnpm build && env -u ELECTRON_RUN_AS_NODE npx playwright test tests/e2e/downloads.spec.ts`

Expected: all three tests in the file PASS — the new one, and the two existing ones (which run without `GOETIA_E2E_IN_FRONT` and so take whichever path the real focus gives; neither asserts on the announcement).

If the new test fails at `toastVisible` staying false while the card's text is right, the view was presented but something re-stacked above or hid it: check that `present()` ran after the service view's `activate` and that no `hide()` came from a `minimize`/`hide` window event during launch.

---

### Task 6: Docs, full verification, hand-off

**Files:**

- Modify: `CLAUDE.md` (the "Downloads are saved, never opened" bullet under Security)
- Modify: `docs/FEATURES.md:45` and `:110`
- Modify: `docs/superpowers/specs/2026-09-18-downloads-design.md:25`

**Interfaces:**

- Consumes: everything above, as shipped.
- Produces: nothing code-facing.

- [ ] **Step 1: Amend CLAUDE.md**

In the bullet that starts `**Downloads are saved, never opened**`, replace this sentence:

```text
The completion banner is its own silent path — not `NotificationRouter`, so no activity log and no mute gating — and its click is `shell.showItemInFolder`, never `openPath`.
```

with:

```text
The completion announcement is its own silent path — not `NotificationRouter`, so no activity log and no mute gating — and its only file action is `shell.showItemInFolder`, never `openPath`. **In front it is a toast, otherwise the banner** (2026-11-10, user decision; spec `docs/superpowers/specs/2026-11-10-download-toast-design.md`): `announceVia` (`lib/download-rules.ts`) answers `toast` only while the shell window is visible, focused, not minimized and unlocked, and the banner — redacted while locked — is every other case and the fallback when the layer cannot load. The toast is drawn by `ToastLayer` (`src/main/toast-layer.ts`, rules in `lib/toast-layer-rules.ts`), a sandboxed, isolated `WebContentsView` above the service page at the top centre of the content rect, because a shell toast is invisible under a page; it exists only around toasts (`TOAST_LAYER_IDLE_MS`), rides the waking cover's `setBounds`/`raise` seams, hides the moment the lock engages, and hands focus back after a click since it has no chord interceptor. **It adds no IPC channel**: main posts `toast:show` with a `MessageChannelMain` port and the page may answer only `enter`, `leave`, `dismiss` or `reveal` (`parseToastReply`) — never a path or an id, so `reveal` can only mean the row main tied to that toast (`DownloadManager.toastAction`, which re-checks the lock and the file). Main owns the 8 s clock; the page reports hover. An Open button was asked for and declined the same day — Never Open stands.
```

- [ ] **Step 2: Amend `docs/FEATURES.md`**

On line 45, replace:

```text
Completion is a silent native banner (`<file>` / `Saved from <Service>`, service icon) whose click reveals the file — Goetia never opens one — plus the macOS dock bounce;
```

with:

```text
Completion is announced in front by an in-app toast at the top centre of the content area (`Saved from <Service>` / `<file>`, the service chip, **Show in Finder** / **Show in folder**; 8 s, hover banks the clock, the body dismisses, a newer download replaces it) drawn on its own layer above the service page, and otherwise — window hidden, minimized, behind another app, or locked — by a silent native banner (`<file>` / `Saved from <Service>`, service icon) whose click reveals the file. Goetia never opens one. Either way the macOS dock bounces;
```

On the same line, in the `Impl:` list, insert this right after the `src/main/download-history.ts` entry:

```text
`src/main/toast-layer.ts`, `lib/toast-layer-rules.ts`, `src/preload/toast.ts`, `renderer/toast.html`, `renderer/src/toast.ts`, `shared/toast.ts`,
```

In the `Verified:` list, insert this right after the `download-rules.test.ts` entry:

```text
`toast-layer-rules.test.ts`, `toast-page.test.ts`, `shared-toast.test.ts`,
```

and replace the parenthesis after the e2e spec's name:

```text
(incl. the history surviving a relaunch and the guard in front of Remove)
```

with:

```text
(incl. the toast, its reveal and its replacement, the history surviving a relaunch and the guard in front of Remove)
```

On line 110, replace `a download's banner and its reveal-in-Finder click,` with:

```text
a download's toast over a live service page (each rail position, both themes, hover banking, typing in the chat while it shows, a chord pressed right after clicking it), its banner and reveal-in-Finder click with another app in front, nothing shown while locked,
```

- [ ] **Step 3: Mark the old decision superseded**

In `docs/superpowers/specs/2026-09-18-downloads-design.md`, append to the end of the bullet that starts `**Completion is a native notification plus the dock bounce**`:

```text
 Superseded in part 2026-11-10: with the window in front the announcement is an in-app toast on its own layer (`2026-11-10-download-toast-design.md`); the banner remains for a window out of view or locked. Never Open stands.
```

- [ ] **Step 4: Lint the Markdown**

Run: `npx markdownlint-cli2 CLAUDE.md docs/FEATURES.md docs/superpowers/specs/2026-09-18-downloads-design.md docs/superpowers/specs/2026-11-10-download-toast-design.md docs/superpowers/plans/2026-11-10-download-toast.md`

Expected: `Summary: 0 issues`.

- [ ] **Step 5: Full verification, one command at a time**

Run: `corepack pnpm lint`

Expected: PASS. (Formatting or import-order findings in touched files: `corepack pnpm exec biome check --write <files>`, then re-run.)

Run: `corepack pnpm typecheck`

Expected: PASS.

Run: `corepack pnpm test`

Expected: PASS.

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`

Expected: PASS. Drag and restart specs are known to flake under load; rerun a failing one alone (`env -u ELECTRON_RUN_AS_NODE npx playwright test <spec>`) before treating it as real.

- [ ] **Step 6: Live check**

The packaged Goetia must not be running (one instance per profile). Run `corepack pnpm dev`, then in a signed-in service:

1. Save a file from a chat with the window focused: the toast drops in at the top centre, names the file, drains over 8 s; the service page under and around it stays clickable; typing in the composer is uninterrupted.
2. Hover it: the bar stops; leave: it resumes.
3. Click **Show in Finder**: Finder reveals the file, the toast leaves, and `⌘K` still opens the switcher straight after.
4. Save a file, then switch to another app before it lands: the OS banner appears, no toast.
5. With the lock on and engaged, a finishing download shows only the redacted banner.
6. Move the rail to the left and right in Settings and repeat step 1: the toast stays centred over the content area.

Report each as seen or not seen; do not mark the task done on the automated runs alone.

- [ ] **Step 7: Hand off for commit**

Stop and ask the user to run `/grimoire-core:commit`. Do not run `git commit`.
