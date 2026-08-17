# Banner → Exact Conversation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking a Goetia banner lands the user in the conversation that fired it — by replaying the site's own notification `onclick` (lane A) or navigating to the thread href a synthetic recipe already held (lane B) — with every failure mode degrading to today's activate-the-service behavior.

**Architecture:** The notification shim keeps each page `Notification` in a capped registry and returns a replay handle; `notification:fired` carries `clickId`/`href`; a pure `resolveBannerClick` in `lib/` picks show-only / activate / navigate / replay; a 2-minute banner grace in `HibernationController` stops Light Sleep from destroying a peek view before its banner can be clicked.

**Tech Stack:** Electron main + unisolated service preload (TypeScript), vitest (happy-dom for preload tests).

**Spec:** `docs/superpowers/specs/2026-08-17-banner-to-conversation-design.md`

## Global Constraints

- Definition of done for every task: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` all green; final task runs `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e` (VS Code shells export `ELECTRON_RUN_AS_NODE`, which breaks Electron launches).
- **Commits:** never run `git commit` directly. At each commit checkpoint, STOP and ask the user to run `/grimoire-core:commit` with the suggested message (batch if the user said to).
- `src/shared/**` stays free of `electron` and DOM imports.
- The only new IPC surface is the main→service-view `notification:replayClick`; `notification:fired` keeps its channel, sender validation, and throttle.
- Goetia never learns a service's conversation DOM: main holds only the pure validation rule; routing knowledge stays in the page (lane A) or the recipe's existing row anchor (lane B).
- All new timers are bounded, cleared on `dispose()`/activation, and tolerate an already-destroyed view.
- Comments: concise, explain why not what, match surrounding density.

---

### Task 1: shared contracts — IPC payload, `MainToService`, `ServiceMeta.chatPaths` mirror

**Files:**

- Modify: `src/shared/ipc.ts` (payload ~line 19, new interface after `MainToRenderer`)
- Modify: `src/shared/types.ts` (`ServiceMeta`, ~line 28)
- Modify: `src/shared/services.ts` (instagram, messenger, teams, tiktok entries)
- Test: `tests/unit/recipes.test.ts` (new sync assertion)

**Interfaces:**

- Produces: `RendererToMain['notification:fired']` = `{ serviceId; title; body; synthetic: boolean; clickId?: number; href?: string }`; `MainToService` interface with `'notification:replayClick': { clickId: number }`; `ServiceMeta.chatPaths?: string[]` mirroring each recipe's `chatPaths` (enforced by test).

- [x] **Step 1: Write the failing sync test**

Append to `tests/unit/recipes.test.ts` (add these imports at the top if not already present: `import { recipes } from '../../src/preload/recipes';` and `import { SERVICES } from '../../src/shared/services';`):

```ts
describe('chatPaths mirror', () => {
  // main validates lane-B hrefs against ServiceMeta.chatPaths; the recipe's
  // copy is what the runner contains with — they must never drift
  it('ServiceMeta.chatPaths matches each recipe', () => {
    for (const s of SERVICES) {
      expect(s.chatPaths ?? null, s.id).toEqual(recipes[s.id].chatPaths ?? null);
    }
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test tests/unit/recipes.test.ts`
Expected: FAIL — `SERVICES` entries have no `chatPaths` while messenger/instagram/teams/tiktok recipes do (the assertion messages name the failing ids).

- [x] **Step 3: Add the field and the four mirrors**

In `src/shared/types.ts`, add to `ServiceMeta` after `waitForReady?: boolean;`:

```ts
  /** Mirror of the recipe's chatPaths (recipes.test.ts enforces sync) — main
   *  validates banner hrefs against it without importing preload code. */
  chatPaths?: string[];
```

In `src/shared/services.ts`, add to the four entries:

- instagram: `chatPaths: ['/direct'],`
- messenger: `chatPaths: ['/messages', '/messenger_media'],`
- teams: `chatPaths: ['/v2/#/chat', '/v2/#/conversations'],`
- tiktok: `chatPaths: ['/messages'],`

- [x] **Step 4: Extend the IPC payload and add `MainToService`**

In `src/shared/ipc.ts`, replace the `notification:fired` line:

```ts
  /** `synthetic`: the recipe built this because the site notifies nowhere
   *  in-page, so no page sound accompanied it — see soundOptions.
   *  `clickId`: shim registry id for replaying the page's own click handler.
   *  `href`: synthetic banners' conversation link (validated in main). */
  'notification:fired': {
    serviceId: ServiceId;
    title: string;
    body: string;
    synthetic: boolean;
    clickId?: number;
    href?: string;
  };
```

After the `MainToRenderer` interface, add:

```ts
/** main -> service view preload, via webContents.send */
export interface MainToService {
  'notification:replayClick': { clickId: number };
}
```

- [x] **Step 5: Verify**

Run: `corepack pnpm test tests/unit/recipes.test.ts && corepack pnpm typecheck`
Expected: PASS / clean.

- [ ] **Step 6: Commit checkpoint**

Ask the user to run `/grimoire-core:commit`. Suggested message: `feat(ipc): banner click payload and chatPaths mirror`

---

### Task 2: shim — notification registry and click replay

**Files:**

- Modify: `src/preload/lib/notification-shim.ts` (full rewrite below)
- Test: `tests/unit/notification-shim.test.ts`

**Interfaces:**

- Produces (Task 4 consumes): `NotifyForward = (title: string, body: string, clickId: number) => void`; `installNotificationShim(win, forward): NotificationShimHandle` where `NotificationShimHandle = { replayClick(clickId: number): void }`.

- [x] **Step 1: Write the failing tests**

In `tests/unit/notification-shim.test.ts`, update the two existing `toHaveBeenCalledWith` assertions to include the new id argument — `expect(forward).toHaveBeenCalledWith('hello', 'world', 1);` and `expect(forward).toHaveBeenCalledWith('sw title', 'sw body', 1);` — then append inside the top-level `describe`:

```ts
  it('replays the page onclick and click listeners for a registered id', () => {
    const forward = vi.fn();
    const win = freshWindow();
    const shim = installNotificationShim(win, forward);
    const n = new win.Notification('t');
    const id = forward.mock.calls[0][2] as number;
    const onclick = vi.fn();
    const listener = vi.fn();
    // biome-ignore lint/suspicious/noExplicitAny: page-side assignment
    (n as any).onclick = onclick;
    n.addEventListener('click', listener);
    shim.replayClick(id);
    expect(onclick).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(onclick.mock.calls[0][0].type).toBe('click');
  });

  it('a throwing page handler does not break replay of the rest', () => {
    const forward = vi.fn();
    const win = freshWindow();
    const shim = installNotificationShim(win, forward);
    const n = new win.Notification('t');
    const id = forward.mock.calls[0][2] as number;
    const listener = vi.fn();
    // biome-ignore lint/suspicious/noExplicitAny: page-side assignment
    (n as any).onclick = () => {
      throw new Error('page bug');
    };
    n.addEventListener('click', listener);
    expect(() => shim.replayClick(id)).not.toThrow();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('a closed notification no longer replays', () => {
    const forward = vi.fn();
    const win = freshWindow();
    const shim = installNotificationShim(win, forward);
    const n = new win.Notification('t');
    const id = forward.mock.calls[0][2] as number;
    const onclick = vi.fn();
    // biome-ignore lint/suspicious/noExplicitAny: page-side assignment
    (n as any).onclick = onclick;
    n.close();
    shim.replayClick(id);
    expect(onclick).not.toHaveBeenCalled();
  });

  it('caps the registry at 20, evicting the oldest', () => {
    const forward = vi.fn();
    const win = freshWindow();
    const shim = installNotificationShim(win, forward);
    const first = new win.Notification('first');
    const firstId = forward.mock.calls[0][2] as number;
    const onclick = vi.fn();
    // biome-ignore lint/suspicious/noExplicitAny: page-side assignment
    (first as any).onclick = onclick;
    for (let i = 0; i < 20; i++) new win.Notification(`n${i}`);
    shim.replayClick(firstId);
    expect(onclick).not.toHaveBeenCalled();
  });

  it('an unknown id is a no-op', () => {
    const shim = installNotificationShim(freshWindow(), vi.fn());
    expect(() => shim.replayClick(999)).not.toThrow();
  });
```

- [x] **Step 2: Run tests to verify they fail**

Run: `corepack pnpm test tests/unit/notification-shim.test.ts`
Expected: FAIL — `forward` called with 2 args, `installNotificationShim` returns void (no `replayClick`), `addEventListener` is a no-op.

- [x] **Step 3: Rewrite the shim**

Replace the entire contents of `src/preload/lib/notification-shim.ts`:

```ts
export type NotifyForward = (title: string, body: string, clickId: number) => void;

export interface NotificationShimHandle {
  /** Fire the page's own click handlers for the banner the user clicked. */
  replayClick(clickId: number): void;
}

/** Registered instances kept for replay; oldest evicted past this. The
 *  registry lives and dies with the page's JS context — correct, since the
 *  handlers it holds are page closures. */
const REGISTRY_CAP = 20;

/** Replace the page's Notification API with a proxy that forwards to main.
 *  Covers the constructor, the legacy callback form of requestPermission
 *  (old Facebook code awaits the callback, not the promise), and page-side
 *  ServiceWorkerRegistration.showNotification (Messenger fires through it;
 *  Electron never displays SW notifications, so reroute them here). Each
 *  instance registers under a clickId so main can replay the site's own
 *  onclick — the site's "focus this thread" code — when the user clicks
 *  Goetia's banner. */
export function installNotificationShim(
  win: Window & typeof globalThis,
  forward: NotifyForward,
): NotificationShimHandle {
  let nextId = 1;
  const live = new Map<number, GoetiaNotification>();
  const ids = new WeakMap<GoetiaNotification, number>();
  const clickListeners = new WeakMap<GoetiaNotification, Set<EventListener>>();

  class GoetiaNotification {
    static permission: NotificationPermission = 'granted';
    static requestPermission(
      cb?: (permission: NotificationPermission) => void,
    ): Promise<NotificationPermission> {
      cb?.('granted');
      return Promise.resolve('granted');
    }
    onclick: unknown = null;
    onshow: unknown = null;
    onerror: unknown = null;
    onclose: unknown = null;
    constructor(title: string, options?: NotificationOptions) {
      const id = nextId++;
      ids.set(this, id);
      clickListeners.set(this, new Set());
      live.set(id, this);
      if (live.size > REGISTRY_CAP) {
        const oldest = live.keys().next().value;
        if (oldest !== undefined) live.delete(oldest);
      }
      forward(title, typeof options?.body === 'string' ? options.body : '', id);
    }
    close(): void {
      // a banner the site closed (read elsewhere) must not replay
      const id = ids.get(this);
      if (id !== undefined) live.delete(id);
    }
    addEventListener(type: string, fn: EventListener): void {
      if (type === 'click' && typeof fn === 'function') clickListeners.get(this)?.add(fn);
    }
    removeEventListener(type: string, fn: EventListener): void {
      if (type === 'click') clickListeners.get(this)?.delete(fn);
    }
    dispatchEvent(): boolean {
      return false;
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: intentionally replacing page globals
  (win as any).Notification = GoetiaNotification;

  // biome-ignore lint/suspicious/noExplicitAny: intentionally replacing page globals
  const swReg = (win as any).ServiceWorkerRegistration;
  if (swReg?.prototype) {
    // the page never holds the SW-rerouted instance, so no handler can
    // attach — it registers harmlessly and only ever falls back
    swReg.prototype.showNotification = function showNotification(
      title = '',
      options?: NotificationOptions,
    ): Promise<void> {
      new GoetiaNotification(title, options);
      return Promise.resolve();
    };
  }

  return {
    replayClick(clickId: number): void {
      const n = live.get(clickId);
      if (!n) return;
      const ev = new win.Event('click');
      const handlers: unknown[] = [n.onclick, ...(clickListeners.get(n) ?? [])];
      for (const fn of handlers) {
        if (typeof fn !== 'function') continue;
        try {
          fn.call(n, ev);
        } catch {
          // page handler errors stay the page's problem
        }
      }
    },
  };
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `corepack pnpm test tests/unit/notification-shim.test.ts`
Expected: PASS (9 tests). Then `corepack pnpm typecheck` — expect ONE error in `src/preload/service.ts` (forward now takes 3 args): that call site is Task 4's job; if it blocks the commit, fold Task 4's `service.ts` change forward or commit Tasks 2+4 together. (`corepack pnpm test` alone stays green — vitest doesn't typecheck across files.)

- [ ] **Step 5: Commit checkpoint**

Ask the user to run `/grimoire-core:commit` (optionally batched with Task 4). Suggested message: `feat(shim): notification registry and click replay`

---

### Task 3: pure `resolveBannerClick` decision

**Files:**

- Create: `src/main/lib/notification-click.ts`
- Test: `tests/unit/notification-click.test.ts`

**Interfaces:**

- Produces (Task 5 consumes):

```ts
export type BannerClickAction =
  | { kind: 'show-only' }
  | { kind: 'activate' }
  | { kind: 'navigate'; url: string }
  | { kind: 'replay'; clickId: number };
export function resolveBannerClick(input: {
  disabled: boolean;
  hasView: boolean;
  clickId?: number;
  href?: string;
  serviceUrl: string;
  chatPaths?: string[];
}): BannerClickAction;
```

- [x] **Step 1: Write the failing test**

Create `tests/unit/notification-click.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveBannerClick } from '../../src/main/lib/notification-click';

const base = {
  disabled: false,
  hasView: true,
  serviceUrl: 'https://www.facebook.com/messages/',
  chatPaths: ['/messages', '/messenger_media'],
};

describe('resolveBannerClick', () => {
  it('disabled service: show the window only (stale banner)', () => {
    expect(resolveBannerClick({ ...base, disabled: true, clickId: 1 })).toEqual({
      kind: 'show-only',
    });
  });

  it('valid href navigates (relative, inside chatPaths)', () => {
    expect(resolveBannerClick({ ...base, href: '/messages/e2ee/t/111' })).toEqual({
      kind: 'navigate',
      url: 'https://www.facebook.com/messages/e2ee/t/111',
    });
  });

  it('href wins over clickId — it works dead or alive', () => {
    expect(resolveBannerClick({ ...base, href: '/messages/t/222', clickId: 4 })).toEqual({
      kind: 'navigate',
      url: 'https://www.facebook.com/messages/t/222',
    });
  });

  it('href on the wrong host downgrades to activate', () => {
    expect(resolveBannerClick({ ...base, href: 'https://evil.example/messages/t/1' })).toEqual({
      kind: 'activate',
    });
  });

  it('href outside chatPaths downgrades to activate', () => {
    expect(resolveBannerClick({ ...base, href: '/marketplace/item/9' })).toEqual({
      kind: 'activate',
    });
  });

  it('unparseable href downgrades to activate', () => {
    expect(resolveBannerClick({ ...base, href: 'http://' })).toEqual({ kind: 'activate' });
  });

  it('no chatPaths: the service URL own path is the boundary', () => {
    const insta = {
      ...base,
      serviceUrl: 'https://www.instagram.com/direct/inbox/',
      chatPaths: undefined,
    };
    expect(resolveBannerClick({ ...insta, href: '/direct/inbox/x' })).toEqual({
      kind: 'navigate',
      url: 'https://www.instagram.com/direct/inbox/x',
    });
    expect(resolveBannerClick({ ...insta, href: '/direct/t/17801' })).toEqual({
      kind: 'activate',
    });
  });

  it('hash-routed chatPaths match pathname + hash (teams)', () => {
    const teams = {
      disabled: false,
      hasView: true,
      serviceUrl: 'https://teams.microsoft.com/v2/#/chat',
      chatPaths: ['/v2/#/chat', '/v2/#/conversations'],
    };
    expect(resolveBannerClick({ ...teams, href: '/v2/#/chat/19:abc' })).toEqual({
      kind: 'navigate',
      url: 'https://teams.microsoft.com/v2/#/chat/19:abc',
    });
  });

  it('clickId replays only while the view is alive', () => {
    expect(resolveBannerClick({ ...base, clickId: 7 })).toEqual({ kind: 'replay', clickId: 7 });
    expect(resolveBannerClick({ ...base, clickId: 7, hasView: false })).toEqual({
      kind: 'activate',
    });
  });

  it('nothing to go on: activate', () => {
    expect(resolveBannerClick({ ...base })).toEqual({ kind: 'activate' });
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test tests/unit/notification-click.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement**

Create `src/main/lib/notification-click.ts`:

```ts
export type BannerClickAction =
  | { kind: 'show-only' }
  | { kind: 'activate' }
  | { kind: 'navigate'; url: string }
  | { kind: 'replay'; clickId: number };

/** What a banner click does. Lane B (href) beats lane A (replay) — a URL
 *  works whether the view lived or died; replay needs the page's JS alive.
 *  Every rejection falls through to plain activation, never worse than
 *  the pre-feature behavior. */
export function resolveBannerClick(input: {
  disabled: boolean;
  hasView: boolean;
  clickId?: number;
  href?: string;
  serviceUrl: string;
  chatPaths?: string[];
}): BannerClickAction {
  if (input.disabled) return { kind: 'show-only' };
  if (input.href !== undefined) {
    const url = conversationUrl(input.href, input.serviceUrl, input.chatPaths);
    if (url !== null) return { kind: 'navigate', url };
  }
  if (input.clickId !== undefined && input.hasView) {
    return { kind: 'replay', clickId: input.clickId };
  }
  return { kind: 'activate' };
}

/** The href resolved against the service URL, or null unless it stays on the
 *  service's origin and inside its chat surface (chatPaths prefixes, matched
 *  against pathname + hash like the runner's containment; the service URL's
 *  own pathname when no chatPaths are declared). */
function conversationUrl(
  href: string,
  serviceUrl: string,
  chatPaths: string[] | undefined,
): string | null {
  let url: URL;
  try {
    url = new URL(href, serviceUrl);
  } catch {
    return null;
  }
  const base = new URL(serviceUrl);
  if (url.origin !== base.origin) return null;
  const path = url.pathname + url.hash;
  const prefixes = chatPaths ?? [base.pathname];
  return prefixes.some((p) => path.startsWith(p)) ? url.toString() : null;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `corepack pnpm test tests/unit/notification-click.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit checkpoint**

Ask the user to run `/grimoire-core:commit`. Suggested message: `feat(notifications): pure banner-click resolution`

---

### Task 4: preload wiring — synth href, forward clickId, replay listener

**Files:**

- Modify: `src/preload/recipes/types.ts` (`synthNotification` return type, ~line 36)
- Modify: `src/preload/recipes/meta-unread.ts` (`synthFromRows`, ~lines 58–81)
- Modify: `src/preload/recipes/runner.ts` (`reportNotification` param type, ~line 22)
- Modify: `src/preload/service.ts` (~lines 29–31 and 48–49)
- Test: `tests/unit/messenger-synth.test.ts`, `tests/unit/instagram-synth.test.ts`

**Interfaces:**

- Consumes: `NotifyForward`/`NotificationShimHandle` from Task 2; `notification:fired` payload from Task 1.
- Produces: `synthNotification` returns `{ title: string; body: string; href?: string } | null`; `notification:fired` sends now carry `clickId` (shim lane) or `href` (synthetic lane); the preload listens on `notification:replayClick`.

- [x] **Step 1: Write the failing tests**

In `tests/unit/messenger-synth.test.ts`, extend the two non-null expectations:

```ts
    expect(messenger.synthNotification?.(load('messenger'))).toEqual({
      title: 'Alice',
      body: 'sent a photo',
      href: '/messages/e2ee/t/111',
    });
```

```ts
    expect(messenger.synthNotification?.(load('messenger-reaction'))).toEqual({
      title: 'Hồ Nguyễn Tiến Hưng',
      body: 'Reacted 😆 to your message',
      href: '/messages/e2ee/t/777',
    });
```

In `tests/unit/instagram-synth.test.ts`, extend the non-null expectation:

```ts
    expect(instagram.synthNotification?.(load('instagram'))).toEqual({
      title: 'bao.tran',
      body: 'Sent a photo',
      href: '/direct/t/17801',
    });
```

- [x] **Step 2: Run tests to verify they fail**

Run: `corepack pnpm test tests/unit/messenger-synth.test.ts tests/unit/instagram-synth.test.ts`
Expected: FAIL — objects lack `href`.

- [x] **Step 3: Implement the preload changes**

`src/preload/recipes/types.ts` — change the `synthNotification` signature (keep its doc comment, append one line):

```ts
  /** Build a notification for the newest unread conversation. For sites that
   *  never notify in-page (facebook.com delegates to browser push, which
   *  Electron doesn't support) — the runner calls this when the direct count
   *  rises while the page is unfocused. `href`: the conversation's own link,
   *  so the banner click can land on the thread (validated in main). */
  synthNotification?(doc: Document): { title: string; body: string; href?: string } | null;
```

`src/preload/recipes/meta-unread.ts` — in `synthFromRows`, change the return type and the return statement:

```ts
export function synthFromRows(
  doc: Document,
  linkSelector: string,
  rowFor: (link: Element) => Element,
): { title: string; body: string; href?: string } | null {
```

and where the object is built (the `return { title..., body... }`):

```ts
    return {
      title: texts[0],
      body: (texts[1] ?? '').replace(/\s*·\s*\S{1,4}$/u, ''),
      href: link.getAttribute('href') ?? undefined,
    };
```

`src/preload/recipes/runner.ts` — widen the callback type (line ~22):

```ts
  reportNotification?: (n: { title: string; body: string; href?: string }) => void,
```

(The call site `reportNotification(n)` already passes the whole object through.)

`src/preload/service.ts` — replace the shim install (lines 29–31) with:

```ts
  const shim = installNotificationShim(window, (title, body, clickId) =>
    ipcRenderer.send('notification:fired', { serviceId, title, body, synthetic: false, clickId }),
  );
  // banner click, lane A: main asks the page to run its own onclick
  ipcRenderer.on('notification:replayClick', (_e, payload: { clickId: number }) =>
    shim.replayClick(payload.clickId),
  );
```

and the synthetic sender (lines 48–49) with:

```ts
      ({ title, body, href }) =>
        ipcRenderer.send('notification:fired', { serviceId, title, body, synthetic: true, href }),
```

- [x] **Step 4: Verify**

Run: `corepack pnpm test && corepack pnpm typecheck && corepack pnpm lint`
Expected: all green (the Task 2 typecheck gap closes here; `runner-synth.test.ts` keeps passing — its mock recipes return no `href` and the pass-through is unchanged).

- [ ] **Step 5: Commit checkpoint**

Ask the user to run `/grimoire-core:commit`. Suggested message: `feat(preload): banner clickId forwarding, synth href, replay listener`

---

### Task 5: main wiring — click execution, view helpers, grace stamp hook

**Files:**

- Modify: `src/main/views.ts` (two new methods after `refresh`, ~line 473)
- Modify: `src/main/notifications.ts` (imports, `handle` signature, click handler)
- Modify: `src/main/ipc-handlers.ts` (`AppContext`, after `noteUnreadReport`)
- Modify: `src/main/index.ts` (ctx literal, after `noteUnreadReport`)

**Interfaces:**

- Consumes: `resolveBannerClick`/`BannerClickAction` (Task 3); `serviceById(id).chatPaths` (Task 1); `HibernationController.noteBannerFired` (Task 6 — stubbed here first).
- Produces: `views.openConversation(id: ServiceId, url: string): void`; `views.sendReplayClick(id: ServiceId, clickId: number): void`; `AppContext.noteBannerFired(id: ServiceId): void` (late-bound).

- [x] **Step 1: Add the two view helpers**

In `src/main/views.ts`, directly after the `refresh` method:

```ts
  /** Banner click, lane B: land the (possibly just-woken) view on the
   *  conversation URL itself. The URL was validated by resolveBannerClick. */
  openConversation(id: ServiceId, url: string): void {
    this.ensure(id);
    const wc = this.views.get(id)?.webContents;
    if (wc && !wc.isDestroyed()) wc.loadURL(url);
  }

  /** Banner click, lane A: ask the page to run its own notification onclick. */
  sendReplayClick(id: ServiceId, clickId: number): void {
    const wc = this.views.get(id)?.webContents;
    if (wc && !wc.isDestroyed()) wc.send('notification:replayClick', { clickId });
  }
```

- [x] **Step 2: Add the `noteBannerFired` hook**

In `src/main/ipc-handlers.ts`, after the `noteUnreadReport` member of `AppContext`:

```ts
  /** stamps banner-grace so a peek view survives long enough to click;
   *  late-bound in index.ts */
  noteBannerFired(id: import('../shared/types').ServiceId): void;
```

In `src/main/index.ts`, after the `noteUnreadReport` entry of the ctx literal:

```ts
      noteBannerFired: (id: Parameters<HibernationController['noteBannerFired']>[0]) =>
        hibernation.noteBannerFired(id),
```

Then in `src/main/hibernation.ts`, add a stub so this compiles before Task 6 fills it in — after `noteUnreadReport`:

```ts
  noteBannerFired(id: ServiceId): void {
    this.lastBannerAt.set(id, Date.now());
  }
```

and the field beside the other maps:

```ts
  /** epoch ms of each service's last shown banner — the grace anchor */
  private lastBannerAt = new Map<ServiceId, number>();
```

- [x] **Step 3: Rewire the notification click**

In `src/main/notifications.ts`: add the import `import { resolveBannerClick } from './lib/notification-click';`, change `handle`'s destructuring to `handle({ serviceId, title, body, synthetic, clickId, href }: RendererToMain['notification:fired']): void {`, and replace the click handler plus show:

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
      if (action.kind === 'show-only') return;
      activateService(this.ctx, serviceId);
      if (action.kind === 'navigate') this.ctx.views.openConversation(serviceId, action.url);
      if (action.kind === 'replay') this.ctx.views.sendReplayClick(serviceId, action.clickId);
    });
    this.ctx.noteBannerFired(serviceId);
    notification.show();
```

(This absorbs the previous inline disabled-guard — the `show-only` branch is its new home.)

- [x] **Step 4: Verify**

Run: `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test`
Expected: all green.

- [ ] **Step 5: Commit checkpoint**

Ask the user to run `/grimoire-core:commit`. Suggested message: `feat(notifications): banner click lands in the conversation`

---

### Task 6: banner grace — never destroy a view right after its banner

**Files:**

- Modify: `src/main/lib/hibernation-rules.ts`
- Modify: `src/main/hibernation.ts`
- Test: `tests/unit/hibernation-rules.test.ts`

**Interfaces:**

- Consumes: `noteBannerFired`/`lastBannerAt` stub from Task 5.
- Produces: `BANNER_GRACE_MS = 120_000` exported from `hibernation-rules.ts`; `HibernationCandidate.lastBannerAt: number`; `shouldHibernate(s, now, timeoutMinutes, graceMs?)`.

- [x] **Step 1: Write the failing tests**

In `tests/unit/hibernation-rules.test.ts`, add `lastBannerAt: 0` to the `base` object, then append:

```ts
  it('never within banner grace — the click target must survive', () => {
    expect(shouldHibernate({ ...base, lastBannerAt: 30 * MIN }, 31 * MIN, 30)).toBe(false);
  });
  it('hibernates again once the grace has passed', () => {
    expect(shouldHibernate({ ...base, lastBannerAt: 28 * MIN }, 31 * MIN, 30)).toBe(true);
  });
```

- [x] **Step 2: Run tests to verify they fail**

Run: `corepack pnpm test tests/unit/hibernation-rules.test.ts`
Expected: FAIL — `lastBannerAt` is not part of the candidate (TS error) or the grace case returns true.

- [x] **Step 3: Extend the rule**

Replace `src/main/lib/hibernation-rules.ts`:

```ts
/** A banner's in-page click handler must survive long enough to be clicked —
 *  no view teardown this close behind a shown banner. */
export const BANNER_GRACE_MS = 120_000;

export interface HibernationCandidate {
  active: boolean;
  hibernated: boolean;
  neverHibernate: boolean;
  lastActiveAt: number;
  /** epoch ms of the service's last shown banner; 0 = never */
  lastBannerAt: number;
}

export function shouldHibernate(
  s: HibernationCandidate,
  now: number,
  timeoutMinutes: number,
  graceMs: number = BANNER_GRACE_MS,
): boolean {
  if (s.active || s.hibernated || s.neverHibernate) return false;
  if (now - s.lastBannerAt < graceMs) return false;
  return now - s.lastActiveAt >= timeoutMinutes * 60_000;
}
```

- [x] **Step 4: Wire grace into the controller**

In `src/main/hibernation.ts`:

Add to the imports and constants:

```ts
import { BANNER_GRACE_MS, shouldHibernate } from './lib/hibernation-rules';
```

```ts
const GRACE_MS = Number(process.env.GOETIA_BANNER_GRACE_MS) || BANNER_GRACE_MS;
```

Add the timer map beside the other fields:

```ts
  private graceTimers = new Map<ServiceId, NodeJS.Timeout>();
```

In `noteActivated`, after the existing lines (an activated view must never be torn down by a stale grace timer):

```ts
    const grace = this.graceTimers.get(id);
    if (grace) {
      clearTimeout(grace);
      this.graceTimers.delete(id);
    }
```

In `sweep()`, extend the candidate and the call:

```ts
      const candidate = {
        active: this.ctx.state.activeId === id,
        hibernated: this.ctx.state.runtime(id).hibernated,
        neverHibernate: s.neverHibernate[id],
        lastActiveAt: this.lastActiveAt.get(id) ?? now,
        lastBannerAt: this.lastBannerAt.get(id) ?? 0,
      };
      if (
        shouldHibernate(candidate, now, s.hibernationMinutes, GRACE_MS) &&
        this.ctx.views.has(id)
      ) {
```

In `endPeek`, replace the destroy branch with a call to the new helper:

```ts
  private endPeek(destroy: boolean): void {
    if (!this.peeking) return;
    const { id, timer } = this.peeking;
    clearTimeout(timer);
    this.peeking = null;
    this.lastPeekEndedAt.set(id, Date.now());
    if (destroy) this.destroyOrGrace(id);
    // chain straight to the next due service so boot warm-up walks the roster
    this.sweep();
  }

  /** Tear the peeked view down now — or, within banner grace, defer to the
   *  grace boundary so the banner's in-page click handler survives a prompt
   *  click. Re-entered from its own timer: a newer banner mid-grace extends. */
  private destroyOrGrace(id: ServiceId): void {
    const pending = this.graceTimers.get(id);
    if (pending) {
      clearTimeout(pending);
      this.graceTimers.delete(id);
    }
    // tolerate a view already gone (service disabled mid-peek) and never
    // destroy under the user (activated mid-peek or mid-grace)
    if (this.ctx.state.activeId === id || !this.ctx.views.has(id)) return;
    const remaining = GRACE_MS - (Date.now() - (this.lastBannerAt.get(id) ?? 0));
    if (remaining > 0) {
      this.graceTimers.set(
        id,
        setTimeout(() => {
          this.graceTimers.delete(id);
          this.destroyOrGrace(id);
        }, remaining),
      );
      return;
    }
    this.ctx.views.destroy(id);
    this.ctx.waking.end(id, 'destroyed');
    this.ctx.state.setRuntime(id, { hibernated: true });
  }
```

In `dispose()`, add:

```ts
    for (const t of this.graceTimers.values()) clearTimeout(t);
    this.graceTimers.clear();
```

- [x] **Step 5: Verify**

Run: `corepack pnpm test && corepack pnpm typecheck && corepack pnpm lint`
Expected: all green (hibernation-rules tests now 7+).

- [ ] **Step 6: Commit checkpoint**

Ask the user to run `/grimoire-core:commit`. Suggested message: `feat(hibernation): banner grace keeps peek views clickable`

---

### Task 7: full suite, docs, and the live checklist

**Files:**

- Modify: `CLAUDE.md` (Notifications & mute section)
- Modify: `README.md` (the "Notifications done properly." bullet)

- [x] **Step 1: Full verification**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm build && env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`
Expected: all green (no e2e changes — native banners are outside the harness; `peek.spec.ts` is unaffected because no banner fires in it, so no grace engages).

- [x] **Step 2: CLAUDE.md invariant**

Add to the "Notifications & mute" bullet list:

```markdown
- **Banner click lands in the conversation.** `resolveBannerClick` (`lib/notification-click.ts`) is the single decision: a synthetic banner's `href` navigates only after validating service origin + `chatPaths` prefix (mirrored on `ServiceMeta`, sync-enforced by `recipes.test.ts`); shim banners replay the page's own `onclick` via `notification:replayClick`. Main never learns per-service conversation DOM. Peek views live `BANNER_GRACE_MS` past their last banner so the replay target survives a prompt click; every failure falls back to plain activation.
```

- [x] **Step 3: README**

Extend the "Notifications done properly." bullet by appending one sentence after "…synthetic notifications for the services that never fire one in-page":

```markdown
Click a banner and you land in that conversation, not just the app — even if the service was asleep when it fired.
```

- [x] **Step 4: Lint the markdown**

Run: `npx markdownlint-cli2 README.md CLAUDE.md`
Expected: 0 issues.

- [ ] **Step 5: Commit checkpoint**

Ask the user to run `/grimoire-core:commit`. Suggested message: `docs: banner-to-conversation invariants and selling point`

- [ ] **Step 6: Live checklist (manual, per service — record results in this table)**

Launch a dev build (`corepack pnpm dev`), log into each service, trigger a message from another account, click the Goetia banner, and record which lane fired. Expected lane is a hypothesis, not a promise:

| Service | Expected | Verified lane | Notes |
| --- | --- | --- | --- |
| WhatsApp | A (replay) | | |
| Telegram | A (replay) | | |
| Discord | A (replay) | | |
| Slack | A (replay) | | |
| Zalo | A (replay) | | |
| Teams | fallback (SW) | | |
| Messenger | B (href) | | |
| Instagram | B (href) | | |
| TikTok | unknown | | |
| Shopee | unknown | | |

Also verify: a banner from a *sleeping* service (wait for a peek to fire one), clicked within 2 minutes, still routes via lane A; clicked after >2 minutes, falls back to activation with the view gone.
