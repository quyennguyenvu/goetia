# Banner auto-clear Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A message banner leaves Notification Center once its conversation is read — per service when the unread count stands at zero, per conversation when the chat is opened in Goetia — and every banner still there keeps a working click.

**Architecture:** `BannerRegistry` (main, electron-free) holds one `Notification` handle per `ActivityLog` entry id; whatever removes an entry closes its banner, so the registry never outgrows the log. A pure reducer (`zeroStep`) decides when a service's zero can be trusted (ready document, zero from this document, held for a dwell), and a pure matcher (`matchesSighting`) decides which entries an accepted `conversation:active` report names. Everything else is wiring in `notifications.ts`, `ipc-handlers.ts`, `activate.ts` and `index.ts`.

**Tech Stack:** TypeScript, Electron 43 (`Notification#close`, `Notification.removeAll` on macOS), vitest (fake timers), biome.

**Spec:** `docs/superpowers/specs/2026-11-12-banner-auto-clear-design.md`

## Global Constraints

- Definition of done: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` all green, plus `corepack pnpm e2e` (this touches main wiring and the boot path).
- Run heavy toolchain commands (typecheck, test suites, e2e, builds) one at a time from the main thread, never in parallel subagents and never while another is running.
- E2E commands need `ELECTRON_RUN_AS_NODE` unset: prefix them with `env -u ELECTRON_RUN_AS_NODE`.
- No `git commit` from the plan. There are no per-task commit steps; the last task stops and asks the user to run `/grimoire-core:commit`.
- **No new IPC channel.** Nothing is added to `RendererToMain`, `RendererInvoke` or `SHELL_ONLY_CHANNELS`; `ipcSenderAllowed` and `register()` are not touched. No payload shape changes.
- **Nothing new on disk.** The registry is in-memory and holds handles, never text.
- The registry is only ever searched by a `serviceId` main already validated against the sending frame. `conversation:active` is acted on only after `acceptReport`.
- `aggregateBadges`, `shouldNotify`, `audioMuted` and the quiet-hours rules are not touched. Muting never closes a banner.
- The download banner (`index.ts`, `notify:`) and the toast layer are not touched.
- **No Diagnostics line for a cleared banner** — a success is not evidence. The existing `failed` note stays.
- `src/shared/**` stays process-agnostic: no `electron`, no DOM imports.
- Pure decisions live in `lib/` helpers with vitest tests; `notifications.ts`, `ipc-handlers.ts`, `activate.ts` and `index.ts` stay thin wiring.
- Every timer added is cleared on cancel, on `dispose()` and on quit.
- Constants, verbatim: `ZERO_DWELL_MS = 6_000`; `BANNER_ROWS_MAX = ACTIVITY_CAP * 2`.
- Zero means `direct === 0 && indirect === 0`, strictly.
- Name matching is exact on `nameKey` — no prefix, no `…` matching.
- Comments explain why, concisely, matching the surrounding file's density.
- Any edited Markdown passes `npx markdownlint-cli2 <file>`; never hard-wrap prose (MD013 is off in this repo).
- If `corepack pnpm lint` reports only formatting or import order in files this plan touched, fix with `corepack pnpm exec biome check --write <those files>`.

## File map

| File | Change | Responsibility |
| --- | --- | --- |
| `src/shared/name-key.ts` | create | `nameKey`, the one name-comparison form, importable by main and preload |
| `src/preload/lib/conversation-open.ts` | modify | import `nameKey` from shared instead of defining it |
| `src/preload/recipes/whatsapp.ts` | modify | import `nameKey` from shared |
| `src/main/lib/recents-rules.ts` | modify | export `sameUrl` |
| `src/main/lib/banner-clear-rules.ts` | create | `ZERO_DWELL_MS`, `zeroStep`, `matchesSighting` |
| `src/main/lib/activity-log.ts` | modify | `onDrop` callback, `ids()` |
| `src/main/banners.ts` | create | `BannerRegistry` |
| `src/main/notifications.ts` | modify | register each banner, report `show`, forget on `failed` |
| `src/main/activate.ts` | modify | an opened entry closes its conversation's banners |
| `src/main/ipc-handlers.ts` | modify | `AppContext.banners`; zero events; sighting match; banish |
| `src/main/index.ts` | modify | construct, launch sweep, navigation/destroy events, quit |
| `CLAUDE.md` | modify | the guardrail |

---

### Task 1: Pure rules — the trusted zero and the sighting match

**Files:**

- Create: `src/shared/name-key.ts`
- Create: `src/main/lib/banner-clear-rules.ts`
- Create: `tests/unit/banner-clear-rules.test.ts`
- Modify: `src/preload/lib/conversation-open.ts` (the `nameKey` definition near line 108)
- Modify: `src/preload/recipes/whatsapp.ts:2`
- Modify: `src/main/lib/recents-rules.ts` (`function sameUrl`)

**Interfaces:**

- Consumes: `ActivityEntry`, `openHref` from `src/main/lib/activity-log.ts` (existing).
- Produces:
  - `nameKey(name: string): string` from `src/shared/name-key.ts`
  - `sameUrl(a: string, b: string): boolean` exported from `src/main/lib/recents-rules.ts`
  - `ZERO_DWELL_MS: number`, `ZERO_IDLE: ZeroState`, `interface ZeroState { ready: boolean; zero: boolean }`
  - `type ZeroEvent = { kind: 'ready' } | { kind: 'count'; direct: number; indirect: number } | { kind: 'stale' } | { kind: 'navigated' } | { kind: 'destroyed' }`
  - `type ZeroEffect = 'arm' | 'cancel' | 'none'`
  - `zeroStep(state: ZeroState, event: ZeroEvent): { state: ZeroState; effect: ZeroEffect }`
  - `matchesSighting(entry: ActivityEntry, sighting: { label: string; url: string }, serviceUrl: string): boolean`

- [ ] **Step 1: Move `nameKey` to shared**

Create `src/shared/name-key.ts`:

```ts
/** Comparison form of a conversation name: composed, without the variation
 *  selectors (U+FE0E/U+FE0F) that pick an emoji's text or colour presentation. */
export function nameKey(name: string): string {
  return name.normalize('NFC').replace(/[\uFE0E\uFE0F]/g, '');
}
```

In `src/preload/lib/conversation-open.ts`, delete the existing definition:

```ts
/** Comparison form of a conversation name: composed, without the variation
 *  selectors (U+FE0E/U+FE0F) that pick an emoji's text or colour presentation. */
export function nameKey(name: string): string {
  return name.normalize('NFC').replace(/[\uFE0E\uFE0F]/g, '');
}
```

and add to the import block at the top of that file (after the existing `import type { OpenLane, OpenRequest } from '../../shared/ipc';`):

```ts
import { nameKey } from '../../shared/name-key';
```

In `src/preload/recipes/whatsapp.ts`, replace line 2

```ts
import { nameKey, nameMatches } from '../lib/conversation-open';
```

with

```ts
import { nameKey } from '../../shared/name-key';
import { nameMatches } from '../lib/conversation-open';
```

Then find any other importer: `grep -rn "nameKey" src tests --include="*.ts"`. Every hit outside `src/shared/name-key.ts` must import it from `shared/name-key` (at the time of writing the only ones are `conversation-open.ts` and `whatsapp.ts`).

- [ ] **Step 2: Export `sameUrl`**

In `src/main/lib/recents-rules.ts` change

```ts
function sameUrl(a: string, b: string): boolean {
```

to

```ts
/** Same origin, path and hash; the query and a trailing slash are ignored. */
export function sameUrl(a: string, b: string): boolean {
```

- [ ] **Step 3: Write the failing test**

Create `tests/unit/banner-clear-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ActivityEntry } from '../../src/main/lib/activity-log';
import {
  matchesSighting,
  ZERO_IDLE,
  type ZeroEvent,
  zeroStep,
} from '../../src/main/lib/banner-clear-rules';

const zero: ZeroEvent = { kind: 'count', direct: 0, indirect: 0 };
const ready: ZeroEvent = { kind: 'ready' };

/** the effects a sequence of events produces, starting from an idle service */
function effects(events: ZeroEvent[]): string[] {
  let state = ZERO_IDLE;
  return events.map((e) => {
    const out = zeroStep(state, e);
    state = out.state;
    return out.effect;
  });
}

describe('zeroStep', () => {
  it('a zero before ready means nothing; ready then arms it', () => {
    // the runner reports its first count before the chat list has rendered
    expect(effects([zero, ready])).toEqual(['none', 'arm']);
  });

  it('ready then zero arms', () => {
    expect(effects([ready, zero])).toEqual(['none', 'arm']);
  });

  it('a repeated zero does not restart the dwell', () => {
    expect(effects([ready, zero, zero])).toEqual(['none', 'arm', 'none']);
  });

  it('a non-zero count cancels, and an indirect dot is not zero', () => {
    expect(effects([ready, zero, { kind: 'count', direct: 1, indirect: 0 }])).toEqual([
      'none',
      'arm',
      'cancel',
    ]);
    expect(effects([ready, { kind: 'count', direct: 0, indirect: 1 }])).toEqual(['none', 'none']);
  });

  it('stale cancels and the old zero is not trusted again', () => {
    expect(effects([ready, zero, { kind: 'stale' }, ready])).toEqual([
      'none',
      'arm',
      'cancel',
      'none',
    ]);
  });

  it('a navigation cancels and forgets both halves', () => {
    expect(effects([ready, zero, { kind: 'navigated' }, zero, ready])).toEqual([
      'none',
      'arm',
      'cancel',
      'none',
      'arm',
    ]);
  });

  it('a zero remembered from the previous document never arms', () => {
    expect(effects([zero, { kind: 'navigated' }, ready])).toEqual(['none', 'none', 'none']);
  });

  it('a destroyed view cancels like a navigation', () => {
    expect(effects([ready, zero, { kind: 'destroyed' }, ready])).toEqual([
      'none',
      'arm',
      'cancel',
      'none',
    ]);
  });
});

const entry = (over: Partial<ActivityEntry> = {}): ActivityEntry => ({
  id: 1,
  serviceId: 'messenger',
  title: 'Mẹ',
  conversation: 'Mẹ',
  synthetic: false,
  silenced: false,
  at: 1,
  ...over,
});

const FB = 'https://www.facebook.com/messages/';

describe('matchesSighting', () => {
  it('matches the conversation by name', () => {
    expect(matchesSighting(entry(), { label: 'Mẹ', url: `${FB}t/1` }, FB)).toBe(true);
  });

  it('compares names composed and without emoji presentation selectors', () => {
    const decomposed = 'Mẹ'.normalize('NFD');
    expect(
      matchesSighting(entry({ conversation: decomposed }), { label: 'Mẹ', url: FB }, FB),
    ).toBe(true);
    expect(
      matchesSighting(entry({ conversation: 'Nhà ❤' }), { label: 'Nhà ❤️', url: FB }, FB),
    ).toBe(true);
  });

  it('refuses a prefix, a truncation and an empty name', () => {
    expect(matchesSighting(entry({ conversation: 'An' }), { label: 'An Nguyen', url: FB }, FB)).toBe(
      false,
    );
    expect(
      matchesSighting(entry({ conversation: 'An Ngu…' }), { label: 'An Nguyen', url: FB }, FB),
    ).toBe(false);
    expect(matchesSighting(entry({ conversation: '' }), { label: '', url: FB }, FB)).toBe(false);
  });

  it("matches a synthetic banner's relative href against the page URL", () => {
    const e = entry({ conversation: 'x', synthetic: true, href: '/messages/t/123/' });
    expect(matchesSighting(e, { label: 'y', url: `${FB}t/123` }, FB)).toBe(true);
    expect(matchesSighting(e, { label: 'y', url: `${FB}t/999` }, FB)).toBe(false);
  });

  it("never trusts a shim banner's own href, only a learned URL", () => {
    const shim = entry({ conversation: 'x', href: '/messages/t/123/' });
    expect(matchesSighting(shim, { label: 'y', url: `${FB}t/123` }, FB)).toBe(false);
    const learned = entry({
      serviceId: 'discord',
      conversation: '#release',
      landedUrl: 'https://discord.com/channels/1/2',
    });
    expect(
      matchesSighting(
        learned,
        { label: '#release | Ticketbox', url: 'https://discord.com/channels/1/2' },
        'https://discord.com/channels/@me',
      ),
    ).toBe(true);
  });

  it('refuses another origin and an href that does not parse', () => {
    const e = entry({ conversation: 'x', synthetic: true, href: 'https://evil.example/messages/t/1' });
    expect(matchesSighting(e, { label: 'y', url: `${FB}t/1` }, FB)).toBe(false);
    const bad = entry({ conversation: 'x', synthetic: true, href: 'http://[' });
    expect(matchesSighting(bad, { label: 'y', url: FB }, FB)).toBe(false);
  });

  it("never matches on the service's own URL — it names no thread", () => {
    const shop = 'https://shopee.vn/';
    const e = entry({ serviceId: 'shopee', conversation: 'Shop A', synthetic: true, href: shop });
    expect(matchesSighting(e, { label: 'Shop B', url: shop }, shop)).toBe(false);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `corepack pnpm exec vitest run tests/unit/banner-clear-rules.test.ts`

Expected: FAIL — cannot resolve `../../src/main/lib/banner-clear-rules`.

- [ ] **Step 5: Write the implementation**

Create `src/main/lib/banner-clear-rules.ts`:

```ts
import { nameKey } from '../../shared/name-key';
import { type ActivityEntry, openHref } from './activity-log';
import { sameUrl } from './recents-rules';

/** How long a ready page's zero must stand before its banners go: three
 *  recipe ticks, so one empty read of a list mid-swap never clears. */
export const ZERO_DWELL_MS = 6_000;

/** What main knows about one service's current document. */
export interface ZeroState {
  /** service:ready arrived since the last cross-document navigation */
  ready: boolean;
  /** this document's latest count is 0/0 */
  zero: boolean;
}

export const ZERO_IDLE: ZeroState = { ready: false, zero: false };

export type ZeroEvent =
  | { kind: 'ready' }
  | { kind: 'count'; direct: number; indirect: number }
  | { kind: 'stale' }
  | { kind: 'navigated' }
  | { kind: 'destroyed' };

/** arm: start the dwell; cancel: drop a pending one; none: leave it be */
export type ZeroEffect = 'arm' | 'cancel' | 'none';

const armed = (s: ZeroState): boolean => s.ready && s.zero;

/** A zero is believed only from a ready document that reported it itself:
 *  the runner sends its first count before the chat list renders, so every
 *  cold load, reload and wake opens with a 0/0 that means nothing. */
export function zeroStep(
  state: ZeroState,
  event: ZeroEvent,
): { state: ZeroState; effect: ZeroEffect } {
  let next: ZeroState;
  switch (event.kind) {
    case 'ready':
      next = { ...state, ready: true };
      break;
    case 'count':
      next = { ...state, zero: event.direct === 0 && event.indirect === 0 };
      break;
    case 'stale':
      next = { ...state, zero: false };
      break;
    default:
      // the document is gone, and both halves went with it
      next = ZERO_IDLE;
  }
  if (armed(next)) return { state: next, effect: armed(state) ? 'none' : 'arm' };
  return { state: next, effect: armed(state) ? 'cancel' : 'none' };
}

/** Whether a banner's entry belongs to the conversation now on screen. Exact
 *  by design: a wrong match removes a banner for a chat nobody has read. */
export function matchesSighting(
  entry: ActivityEntry,
  sighting: { label: string; url: string },
  serviceUrl: string,
): boolean {
  if (entry.conversation !== '' && nameKey(entry.conversation) === nameKey(sighting.label)) {
    return true;
  }
  const href = openHref(entry);
  if (!href) return false;
  let url: string;
  try {
    url = new URL(href, serviceUrl).href;
  } catch {
    return false;
  }
  // a site whose address names no thread would match every chat this way
  if (sameUrl(url, serviceUrl)) return false;
  return sameUrl(url, sighting.url);
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `corepack pnpm exec vitest run tests/unit/banner-clear-rules.test.ts tests/unit/conversation-open.test.ts tests/unit/recents-rules.test.ts tests/unit/recipes.test.ts`

Expected: PASS, all four files (the last three prove the `nameKey` move and the `sameUrl` export broke nothing).

---

### Task 2: `ActivityLog` reports what it drops and names a conversation's entries

**Files:**

- Modify: `src/main/lib/activity-log.ts`
- Modify: `tests/unit/activity-log.test.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces:
  - `new ActivityLog(onDrop?: (ids: number[]) => void)` — called with the ids of entries leaving the log (cap eviction, `clear`); never called with an empty array.
  - `ActivityLog#ids(serviceId: ServiceId, match: (e: ActivityEntry) => boolean): number[]`

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe('ActivityLog', …)` block in `tests/unit/activity-log.test.ts` (add `vi` to the `vitest` import at the top of the file):

```ts
  it('reports the entry the cap evicts', () => {
    const onDrop = vi.fn();
    const log = new ActivityLog(onDrop);
    const first = log.append(entry(0));
    for (let i = 1; i < ACTIVITY_CAP; i++) log.append(entry(i));
    expect(onDrop).not.toHaveBeenCalled();
    log.append(entry(ACTIVITY_CAP));
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledWith([first]);
  });

  it('reports what clear drops, per service and whole', () => {
    const onDrop = vi.fn();
    const log = new ActivityLog(onDrop);
    const tg = log.append(entry(1));
    const dc = log.append(entry(2, { serviceId: 'discord' }));
    log.clear('telegram');
    expect(onDrop).toHaveBeenLastCalledWith([tg]);
    log.clear();
    expect(onDrop).toHaveBeenLastCalledWith([dc]);
    // nothing left: an empty drop is not reported
    log.clear();
    expect(onDrop).toHaveBeenCalledTimes(2);
  });

  it('names the entries of one service that satisfy a predicate', () => {
    const log = new ActivityLog();
    const a1 = log.append(entry(1, { conversation: 'A' }));
    log.append(entry(2, { conversation: 'B' }));
    const a2 = log.append(entry(3, { conversation: 'A' }));
    log.append(entry(4, { conversation: 'A', serviceId: 'discord' }));
    expect(log.ids('telegram', (e) => e.conversation === 'A')).toEqual([a1, a2]);
    expect(log.ids('zalo', () => true)).toEqual([]);
  });
```

Note the file's `entry` helper sets `conversation: over.title ?? …` *before* spreading `over`, so an explicit `conversation` in `over` wins — the cases above rely on that.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `corepack pnpm exec vitest run tests/unit/activity-log.test.ts`

Expected: FAIL — `onDrop` never called; `log.ids is not a function`.

- [ ] **Step 3: Implement**

In `src/main/lib/activity-log.ts`, inside `class ActivityLog`, add the constructor directly above `append`:

```ts
  /** `onDrop` hears the ids of entries leaving the log, so whatever was held
   *  per entry (its banner) can go with it. */
  constructor(private onDrop?: (ids: number[]) => void) {}
```

In `append`, replace

```ts
    if (this.entries.length > ACTIVITY_CAP) this.entries.shift();
    return id;
```

with

```ts
    if (this.entries.length > ACTIVITY_CAP) {
      const gone = this.entries.shift();
      if (gone) this.onDrop?.([gone.id]);
    }
    return id;
```

Replace the body of `clear`

```ts
  clear(id?: ServiceId): void {
    this.entries = id ? this.entries.filter((e) => e.serviceId !== id) : [];
  }
```

with

```ts
  clear(id?: ServiceId): void {
    const gone = this.entries.filter((e) => !id || e.serviceId === id).map((e) => e.id);
    this.entries = id ? this.entries.filter((e) => e.serviceId !== id) : [];
    if (gone.length > 0) this.onDrop?.(gone);
  }
```

Add above `get`:

```ts
  /** Ids of one service's entries that satisfy `match` — how a caller names
   *  a conversation's banners without the log learning what a banner is. */
  ids(serviceId: ServiceId, match: (e: ActivityEntry) => boolean): number[] {
    return this.entries.filter((e) => e.serviceId === serviceId && match(e)).map((e) => e.id);
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `corepack pnpm exec vitest run tests/unit/activity-log.test.ts`

Expected: PASS.

---

### Task 3: `BannerRegistry`

**Files:**

- Create: `src/main/banners.ts`
- Create: `tests/unit/banners.test.ts`

**Interfaces:**

- Consumes: `ZERO_DWELL_MS`, `ZERO_IDLE`, `ZeroEvent`, `ZeroState`, `zeroStep` from `src/main/lib/banner-clear-rules.ts` (Task 1); `ACTIVITY_CAP` from `src/main/lib/activity-log.ts`.
- Produces (all on `class BannerRegistry`, exported from `src/main/banners.ts` with `interface BannerHandle { close(): void }` and `BANNER_ROWS_MAX`):
  - `add(entryId: number, serviceId: ServiceId, handle: BannerHandle): void`
  - `noteShown(entryId: number): void`
  - `forget(entryId: number): void`
  - `closeEntries(ids: readonly number[]): void`
  - `closeService(id: ServiceId): void`
  - `closeAll(): void`
  - `noteZero(id: ServiceId, event: ZeroEvent): void`
  - `dispose(): void`
  - `readonly size: number`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/banners.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BANNER_ROWS_MAX, BannerRegistry } from '../../src/main/banners';
import { ZERO_DWELL_MS } from '../../src/main/lib/banner-clear-rules';
import type { ServiceId } from '../../src/shared/types';

/** a banner the OS already has */
function shown(reg: BannerRegistry, id: number, serviceId: ServiceId = 'telegram') {
  const handle = { close: vi.fn() };
  reg.add(id, serviceId, handle);
  reg.noteShown(id);
  return handle;
}

describe('BannerRegistry', () => {
  it('closes an entry once and forgets it', () => {
    const reg = new BannerRegistry();
    const h = shown(reg, 1);
    reg.closeEntries([1, 99]);
    reg.closeEntries([1]);
    expect(h.close).toHaveBeenCalledTimes(1);
    expect(reg.size).toBe(0);
  });

  it('closes one service and leaves the others', () => {
    const reg = new BannerRegistry();
    const a = shown(reg, 1, 'telegram');
    const b = shown(reg, 2, 'discord');
    const c = shown(reg, 3, 'telegram');
    reg.closeService('telegram');
    expect(a.close).toHaveBeenCalled();
    expect(c.close).toHaveBeenCalled();
    expect(b.close).not.toHaveBeenCalled();
    expect(reg.size).toBe(1);
  });

  it('closes everything', () => {
    const reg = new BannerRegistry();
    const a = shown(reg, 1, 'telegram');
    const b = shown(reg, 2, 'discord');
    reg.closeAll();
    expect(a.close).toHaveBeenCalled();
    expect(b.close).toHaveBeenCalled();
  });

  it('defers a close asked before the OS has the banner', () => {
    // on macOS close() before the request is scheduled removes nothing
    const reg = new BannerRegistry();
    const h = { close: vi.fn() };
    reg.add(1, 'telegram', h);
    reg.closeEntries([1]);
    expect(h.close).not.toHaveBeenCalled();
    reg.noteShown(1);
    expect(h.close).toHaveBeenCalledTimes(1);
    expect(reg.size).toBe(0);
  });

  it('forgets a banner that never reached the OS', () => {
    const reg = new BannerRegistry();
    const h = { close: vi.fn() };
    reg.add(1, 'telegram', h);
    reg.forget(1);
    reg.noteShown(1);
    reg.closeEntries([1]);
    expect(h.close).not.toHaveBeenCalled();
  });

  it('survives a close that re-enters the registry', () => {
    // Electron emits `close` synchronously from close()
    const reg = new BannerRegistry();
    const h = { close: vi.fn(() => reg.closeEntries([1])) };
    reg.add(1, 'telegram', h);
    reg.noteShown(1);
    reg.closeEntries([1]);
    expect(h.close).toHaveBeenCalledTimes(1);
  });

  it('never outgrows its hard cap, even if show is never reported', () => {
    const reg = new BannerRegistry();
    for (let i = 1; i <= BANNER_ROWS_MAX + 3; i++) reg.add(i, 'telegram', { close: vi.fn() });
    expect(reg.size).toBe(BANNER_ROWS_MAX);
  });
});

describe('BannerRegistry zero dwell', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const zero = { kind: 'count', direct: 0, indirect: 0 } as const;

  it("closes a service's banners once its zero has stood for the dwell", () => {
    const reg = new BannerRegistry();
    const mine = shown(reg, 1, 'telegram');
    const other = shown(reg, 2, 'discord');
    reg.noteZero('telegram', { kind: 'ready' });
    reg.noteZero('telegram', zero);
    vi.advanceTimersByTime(ZERO_DWELL_MS - 1);
    expect(mine.close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(mine.close).toHaveBeenCalledTimes(1);
    expect(other.close).not.toHaveBeenCalled();
  });

  it('a bare zero from an unready page clears nothing', () => {
    const reg = new BannerRegistry();
    const h = shown(reg, 1);
    reg.noteZero('telegram', zero);
    vi.advanceTimersByTime(ZERO_DWELL_MS * 2);
    expect(h.close).not.toHaveBeenCalled();
  });

  it.each([
    ['a new count', { kind: 'count', direct: 2, indirect: 0 }],
    ['a stale report', { kind: 'stale' }],
    ['a navigation', { kind: 'navigated' }],
    ['a destroyed view', { kind: 'destroyed' }],
  ] as const)('%s inside the dwell cancels the clear', (_name, event) => {
    const reg = new BannerRegistry();
    const h = shown(reg, 1);
    reg.noteZero('telegram', { kind: 'ready' });
    reg.noteZero('telegram', zero);
    vi.advanceTimersByTime(ZERO_DWELL_MS - 1);
    reg.noteZero('telegram', event);
    vi.advanceTimersByTime(ZERO_DWELL_MS * 2);
    expect(h.close).not.toHaveBeenCalled();
  });

  it('dispose drops a pending clear and arms nothing afterwards', () => {
    const reg = new BannerRegistry();
    const h = shown(reg, 1);
    reg.noteZero('telegram', { kind: 'ready' });
    reg.noteZero('telegram', zero);
    reg.dispose();
    reg.noteZero('telegram', { kind: 'navigated' });
    reg.noteZero('telegram', { kind: 'ready' });
    reg.noteZero('telegram', zero);
    vi.advanceTimersByTime(ZERO_DWELL_MS * 2);
    expect(h.close).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm exec vitest run tests/unit/banners.test.ts`

Expected: FAIL — cannot resolve `../../src/main/banners`.

- [ ] **Step 3: Write the implementation**

Create `src/main/banners.ts`:

```ts
import type { ServiceId } from '../shared/types';
import { ACTIVITY_CAP } from './lib/activity-log';
import {
  ZERO_DWELL_MS,
  ZERO_IDLE,
  type ZeroEvent,
  type ZeroState,
  zeroStep,
} from './lib/banner-clear-rules';

/** All the registry needs of an Electron Notification — tests pass a stub. */
export interface BannerHandle {
  close(): void;
}

/** ActivityLog.onDrop keeps the registry at the log's size; this only bounds
 *  a platform that never reports `show`, whose deferred closes would pile up. */
export const BANNER_ROWS_MAX = ACTIVITY_CAP * 2;

interface Row {
  serviceId: ServiceId;
  handle: BannerHandle;
  /** the OS has the banner; on macOS a close() before this removes nothing */
  shown: boolean;
  closeOnShow: boolean;
}

/** Every message banner still in Notification Center, by ActivityLog entry
 *  id. Holding the handle is what keeps the banner's click alive — Electron's
 *  object is V8-owned with no keep-alive — and what lets it be removed once
 *  its conversation is read. No text is kept here, only handles. */
export class BannerRegistry {
  private rows = new Map<number, Row>();
  private zero = new Map<ServiceId, ZeroState>();
  private timers = new Map<ServiceId, NodeJS.Timeout>();
  private disposed = false;

  get size(): number {
    return this.rows.size;
  }

  add(entryId: number, serviceId: ServiceId, handle: BannerHandle): void {
    this.rows.set(entryId, { serviceId, handle, shown: false, closeOnShow: false });
    for (const oldest of this.rows.keys()) {
      if (this.rows.size <= BANNER_ROWS_MAX) break;
      this.rows.delete(oldest);
    }
  }

  noteShown(entryId: number): void {
    const row = this.rows.get(entryId);
    if (!row) return;
    row.shown = true;
    if (row.closeOnShow) this.closeEntries([entryId]);
  }

  /** The banner never reached the OS: there is nothing to close. */
  forget(entryId: number): void {
    this.rows.delete(entryId);
  }

  closeEntries(ids: readonly number[]): void {
    for (const id of ids) {
      const row = this.rows.get(id);
      if (!row) continue;
      if (!row.shown) {
        row.closeOnShow = true;
        continue;
      }
      // deleted first: close() emits `close` synchronously
      this.rows.delete(id);
      row.handle.close();
    }
  }

  closeService(id: ServiceId): void {
    this.closeEntries([...this.rows].filter(([, row]) => row.serviceId === id).map(([key]) => key));
  }

  closeAll(): void {
    this.closeEntries([...this.rows.keys()]);
  }

  /** Feed one service's document events to the trusted-zero rule; a zero
   *  that stands for the dwell closes the service's banners. */
  noteZero(id: ServiceId, event: ZeroEvent): void {
    if (this.disposed) return;
    const { state, effect } = zeroStep(this.zero.get(id) ?? ZERO_IDLE, event);
    this.zero.set(id, state);
    if (effect === 'none') return;
    const pending = this.timers.get(id);
    if (pending) clearTimeout(pending);
    this.timers.delete(id);
    if (effect !== 'arm') return;
    this.timers.set(
      id,
      setTimeout(() => {
        this.timers.delete(id);
        this.closeService(id);
      }, ZERO_DWELL_MS),
    );
  }

  dispose(): void {
    this.disposed = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `corepack pnpm exec vitest run tests/unit/banners.test.ts`

Expected: PASS, every case.

---

### Task 4: Wire the registry into main

**Files:**

- Modify: `src/main/ipc-handlers.ts` (`AppContext`; `applyDisabledChange`; the `service:ready`, `unread:update`, `unread:stale`, `conversation:active` handlers)
- Modify: `src/main/notifications.ts` (`NotificationRouter.handle`)
- Modify: `src/main/activate.ts` (`openActivityEntry`)
- Modify: `src/main/index.ts` (construction near `new ActivityLog()`, `onNavigate`, `onDestroyed`, the `ctx` literal, `before-quit`)
- Modify: `tests/unit/activate.test.ts` (`makeEntryCtx`, one new case)

**Interfaces:**

- Consumes: `BannerRegistry` (Task 3); `ActivityLog` constructor callback and `ids()` (Task 2); `matchesSighting` (Task 1).
- Produces: `AppContext.banners: BannerRegistry`.

- [ ] **Step 1: Write the failing test for the click path**

In `tests/unit/activate.test.ts`, inside `describe('openActivityEntry', …)`, the `makeEntryCtx` helper builds its context like this:

```ts
    const ctx = {
      state,
      views,
      activity: { learnUrl: vi.fn() },
      settings: {
        update: vi.fn(),
        get: () => ({ ...DEFAULT_SETTINGS, disabled: { ...summoned, ...disabled } }),
      },
      noteActivated: vi.fn(),
    } as unknown as AppContext;
    return { ctx, views };
```

Replace it with:

```ts
    const activity = { learnUrl: vi.fn(), ids: vi.fn().mockReturnValue([4, 9]) };
    const banners = { closeEntries: vi.fn() };
    const ctx = {
      state,
      views,
      activity,
      banners,
      settings: {
        update: vi.fn(),
        get: () => ({ ...DEFAULT_SETTINGS, disabled: { ...summoned, ...disabled } }),
      },
      noteActivated: vi.fn(),
    } as unknown as AppContext;
    return { ctx, views, activity, banners };
```

and add this case at the end of the same `describe` block (after the last existing `it`):

```ts
  // five messages from one chat are five banners; reading the chat answers all
  it('closes every banner of the conversation, whichever one was clicked', () => {
    const { ctx, activity, banners } = makeEntryCtx();
    openActivityEntry(ctx, entry({ conversation: 'TICKETBOX' }));
    expect(banners.closeEntries).toHaveBeenCalledWith([4, 9]);
    const [serviceId, match] = activity.ids.mock.calls[0];
    expect(serviceId).toBe('whatsapp');
    expect(match(entry({ conversation: 'TICKETBOX' }))).toBe(true);
    expect(match(entry({ conversation: 'Mẹ' }))).toBe(false);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `corepack pnpm exec vitest run tests/unit/activate.test.ts`

Expected: FAIL — `banners.closeEntries` was not called. Every other case in the file still passes.

- [ ] **Step 3: `AppContext` gains `banners`**

In `src/main/ipc-handlers.ts`, add to the type imports near the other `./…` type imports:

```ts
import type { BannerRegistry } from './banners';
```

and in `interface AppContext`, directly under the `activity: ActivityLog;` member:

```ts
  /** the message banners still in Notification Center, and when they leave;
   *  see banners.ts */
  banners: BannerRegistry;
```

- [ ] **Step 4: An opened entry closes its conversation's banners**

In `src/main/activate.ts`, `openActivityEntry` begins:

```ts
export function openActivityEntry(ctx: AppContext, entry: ActivityEntry): void {
  const meta = serviceById(entry.serviceId);
```

Change it to:

```ts
export function openActivityEntry(ctx: AppContext, entry: ActivityEntry): void {
  // the chat is being opened: every banner it left has done its job
  ctx.banners.closeEntries(
    ctx.activity.ids(entry.serviceId, (e) => e.conversation === entry.conversation),
  );
  const meta = serviceById(entry.serviceId);
```

Run: `corepack pnpm exec vitest run tests/unit/activate.test.ts`

Expected: PASS, including the new case.

- [ ] **Step 5: Register each banner in `NotificationRouter`**

In `src/main/notifications.ts`, replace

```ts
    notification.on('failed', (_e, err) =>
      this.ctx.diag.note('notifications', `${serviceId}: ${err}`, serviceId),
    );
```

with

```ts
    notification.on('failed', (_e, err) => {
      this.ctx.banners.forget(entryId);
      this.ctx.diag.note('notifications', `${serviceId}: ${err}`, serviceId);
    });
    // no `close` listener on purpose: Windows fires it when a toast times out
    // into Action Center, where the banner still needs its handle
    notification.on('show', () => this.ctx.banners.noteShown(entryId));
```

and replace the last two lines of `handle`

```ts
    this.ctx.noteBannerFired(serviceId);
    notification.show();
```

with

```ts
    // held until its entry leaves the log: an unreferenced Notification can
    // be collected, and then its click fires nothing
    this.ctx.banners.add(entryId, serviceId, notification);
    this.ctx.noteBannerFired(serviceId);
    notification.show();
```

Also update the stale comment in the click handler. Replace

```ts
      // a Notification Center banner outlives ACTIVITY_CAP newer ones only
      // rarely; with its entry rotated out there is nothing safe left to open
      const entry = this.ctx.activity.get(entryId);
```

with

```ts
      // a banner is closed when its entry leaves the log, so this lookup
      // misses only if the OS delivered a click for a banner already closed
      const entry = this.ctx.activity.get(entryId);
```

- [ ] **Step 6: Zero events, the sighting match and banish in `ipc-handlers.ts`**

Add to the imports, directly after the existing `import { stampSummoned, summonedIds } from './lib/banish-rules';` (biome's import order):

```ts
import { matchesSighting } from './lib/banner-clear-rules';
```

In `applyDisabledChange`, the loop begins:

```ts
  for (const id of after.order) {
    if (after.disabled[id] && ctx.views.has(id)) {
```

Change it to:

```ts
  for (const id of after.order) {
    // a banished service's banner opens nothing (show-only): it does not stay
    if (after.disabled[id] && !before.disabled[id]) ctx.banners.closeService(id);
    if (after.disabled[id] && ctx.views.has(id)) {
```

In the `service:ready` handler, add one line after `ctx.waking.end(serviceId, 'recipe-ready');`:

```ts
    ctx.banners.noteZero(serviceId, { kind: 'ready' });
```

Replace the two unread handlers

```ts
  on('unread:update', ({ serviceId, direct, indirect }) => {
    noteRecipe(serviceId, false);
    ctx.state.setRuntime(serviceId, { unread: { direct, indirect }, stale: false });
    // setRuntime no-ops on an unchanged count, so the peek signal lives here
    ctx.noteUnreadReport(serviceId);
  });
  on('unread:stale', ({ serviceId, reason }) => {
    noteRecipe(serviceId, true, reason);
    ctx.state.setRuntime(serviceId, { stale: true });
    ctx.noteUnreadReport(serviceId);
  });
```

with

```ts
  on('unread:update', ({ serviceId, direct, indirect }) => {
    noteRecipe(serviceId, false);
    ctx.state.setRuntime(serviceId, { unread: { direct, indirect }, stale: false });
    // before the peek signal: ending a peek destroys the view, and that must
    // be the last word on a zero this report just armed
    ctx.banners.noteZero(serviceId, { kind: 'count', direct, indirect });
    // setRuntime no-ops on an unchanged count, so the peek signal lives here
    ctx.noteUnreadReport(serviceId);
  });
  on('unread:stale', ({ serviceId, reason }) => {
    noteRecipe(serviceId, true, reason);
    ctx.state.setRuntime(serviceId, { stale: true });
    ctx.banners.noteZero(serviceId, { kind: 'stale' });
    ctx.noteUnreadReport(serviceId);
  });
```

In the `conversation:active` handler, the last statement is `ctx.recents.upsert(sighting);`. Add after it, still inside the handler:

```ts
    // the chat is on screen in front of the user: its banners are answered
    ctx.banners.closeEntries(
      ctx.activity.ids(serviceId, (e) =>
        matchesSighting(e, { label: named.label, url: report.url }, meta.url),
      ),
    );
```

(`named`, `report` and `meta` are the handler's existing locals; the code runs only past the existing `acceptReport` and `recentLabel` early returns, which is the gate the spec requires.)

- [ ] **Step 7: Construct, sweep, and dispose in `index.ts`**

Add the import beside the other `./…` imports:

```ts
import { BannerRegistry } from './banners';
```

Replace

```ts
    const activity = new ActivityLog();
```

with

```ts
    // banners a previous run left behind have no handler in this process, so
    // a click on one could only bring the window forward
    if (process.platform === 'darwin') Notification.removeAll();
    const banners = new BannerRegistry();
    // a banner lives only as long as its entry: no entry, nothing to open
    const activity = new ActivityLog((ids) => banners.closeEntries(ids));
```

(`Notification` is already imported from `electron` in this file for the download banner; if `corepack pnpm typecheck` says otherwise, add it to that import.)

In the `ServiceViewManager` hooks, change `onNavigate` from

```ts
        onNavigate: (id, kind) => {
          // the page's JS context is being replaced, taking the notification
          // shim's registry with it — its ids restart at 1 in the new document
          activity.forgetReplay(id);
          if (kind) waking.begin(id, kind);
        },
```

to

```ts
        onNavigate: (id, kind) => {
          // the page's JS context is being replaced, taking the notification
          // shim's registry with it — its ids restart at 1 in the new document
          activity.forgetReplay(id);
          // and the new document's first count is a zero that means nothing
          banners.noteZero(id, { kind: 'navigated' });
          if (kind) waking.begin(id, kind);
        },
```

and `onDestroyed` from

```ts
        onDestroyed: (id) => callsSetting.stop(id),
```

to

```ts
        onDestroyed: (id) => {
          callsSetting.stop(id);
          banners.noteZero(id, { kind: 'destroyed' });
        },
```

In the `const ctx: AppContext = {` literal, add `banners,` on the line after `activity,`.

In the `app.on('before-quit', () => {` handler, add directly before `recents.flush();`:

```ts
      // nothing left in Notification Center can open a chat once we are gone
      banners.closeAll();
      banners.dispose();
```

- [ ] **Step 8: Typecheck and run the unit suite**

Run: `corepack pnpm typecheck`

Expected: no errors. A complaint that a test's fake context lacks `banners` cannot arise (the fakes are cast through `unknown`); a complaint about `Notification` in `index.ts` means the import note in Step 7 applies.

Then run: `corepack pnpm test`

Expected: PASS, whole suite.

---

### Task 5: Guardrail, full verification, live checklist

**Files:**

- Modify: `CLAUDE.md` (section `## Notifications & mute`)
- Modify: `docs/superpowers/specs/2026-11-12-banner-auto-clear-design.md` (status line)

**Interfaces:**

- Consumes: everything above.
- Produces: nothing code-facing.

- [ ] **Step 1: Add the guardrail to `CLAUDE.md`**

In `CLAUDE.md`, under `## Notifications & mute`, insert this bullet directly before the bullet that begins `- **A banner title is parsed into conversation and sender once, on the way in.**` (one line, not wrapped):

```markdown
- **A message banner lives only while its `ActivityLog` entry does, and leaves when its chat is read** (2026-11-12, user decision; spec `docs/superpowers/specs/2026-11-12-banner-auto-clear-design.md`). `NotificationRouter` hands every banner to `BannerRegistry` (`src/main/banners.ts`) before `show()` — never drop a message `Notification` unreferenced: Electron's object is V8-owned with no keep-alive, and a collected banner stays in Notification Center with a click that fires nothing (read from the v43.3.0 source; the registry is why it cannot happen). `ActivityLog.onDrop` closes whatever the log lets go (cap, purge), so the pile is bounded at `ACTIVITY_CAP` and every banner on screen has an entry to open. Banners also close per conversation — a clicked or parked entry (`openActivityEntry`) and an **accepted** `conversation:active` whose label or URL matches (`matchesSighting`, exact `nameKey`, never a prefix, never the service's own URL) — per service on banish and on a **trusted zero**, at quit, and at launch through `Notification.removeAll()` (macOS; a previous run's banners have no handler). **A bare zero is never acted on**: the runner reports its first count before the chat list renders, so every load, reload and wake opens with 0/0 — `zeroStep` (`lib/banner-clear-rules.ts`) believes a zero only from a document that sent `service:ready`, reported by that document, standing `ZERO_DWELL_MS` with no count, stale, navigation or destruction in between. Zero is `direct === 0 && indirect === 0`, so a Discord or Slack with permanently unread channels clears per conversation only (named trade-off), and a chat already on screen when its banner fired is not cleared by returning to it — re-reporting on focus would race the chord walk's cancel rule. The `close` event is not a trigger (Windows fires it when a toast times out into Action Center, where the handle is still needed), and a close asked before `show` is applied at `show` (macOS schedules a banner with an icon asynchronously). Mute, quiet hours and `aggregateBadges` stay ignorant of all of it, a cleared banner notes nothing in Diagnostics, and the download banner is its own path, still unheld (open follow-up).
```

Run: `npx markdownlint-cli2 CLAUDE.md docs/superpowers/specs/2026-11-12-banner-auto-clear-design.md docs/superpowers/plans/2026-11-12-banner-auto-clear.md`

Expected: `Summary: 0 issues`.

- [ ] **Step 2: Lint**

Run: `corepack pnpm lint`

Expected: clean. If it reports only formatting or import order in files this plan touched, run `corepack pnpm exec biome check --write` on those files and re-run.

- [ ] **Step 3: Typecheck**

Run: `corepack pnpm typecheck`

Expected: no errors.

- [ ] **Step 4: Unit tests**

Run: `corepack pnpm test`

Expected: PASS.

- [ ] **Step 5: E2E**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`

Expected: PASS. This is also the proof that `Notification.removeAll()` at boot is harmless on the built app — every spec launches it. A drag or restart spec that fails in the loaded full run is a known flake: rerun that one spec alone with `env -u ELECTRON_RUN_AS_NODE npx playwright test <spec>` before treating it as a regression. If the app fails to launch at all, read the first error: a crash inside `Notification.removeAll` means the sweep must move behind a guard — stop and report it instead of working around it.

- [ ] **Step 6: Mark the spec implemented**

In `docs/superpowers/specs/2026-11-12-banner-auto-clear-design.md`, change `not implemented.` in the status line to `implemented 2026-11-12; live checklist pending.` Re-run `npx markdownlint-cli2` on the file.

- [ ] **Step 7: Hand the live checklist to the user and stop**

Native banners cannot be driven from Playwright, so these are checked by the user in a signed-in app. `corepack pnpm dev` is enough (the dev binary is ad-hoc signed for Notification Center) — quit the packaged app first, the two share a profile. Report this list verbatim and stop; do not commit:

1. With unread banners from one service in Notification Center, read everything on a phone. Within about ten seconds of the badge clearing, that service's banners are gone and other services' banners remain.
2. With banners from two chats of one service, open one chat in Goetia. Only that chat's banners go. Note per service whether this worked — Discord, Slack and Telegram are best-effort.
3. With unread banners present, press ⌘R on that service. The banners stay through the reload.
4. Click one of several banners from the same chat. The chat opens and its other banners go.
5. Banish a service with banners. They go.
6. Quit and relaunch. No Goetia banner is left from before.
7. Leave a banner an hour, then click it. It still opens its chat.
8. If a banner that should have cleared did not, check whether it ever clears after its next message — a banner that never clears on a platform would mean `show` is not being reported there.

Then ask the user to run `/grimoire-core:commit`.

---

## Amendment (2026-11-12, after execution)

One rule was added after the plan ran, by user decision: a banner that can no longer open its chat is dropped once it is an hour old (`DEAD_BANNER_MS`, `DEAD_SWEEP_MS`, `canOpenChat`, `isDeadBanner` in `src/main/lib/banner-clear-rules.ts`; the sweep interval in `src/main/index.ts`). The spec's Decisions and trigger table carry it.

A second addition, same day and same authority: the download banner is held by `BannerShelf` (`src/main/banners.ts`, wired in the `notify:` hook in `src/main/index.ts`) so its reveal click cannot die to garbage collection. The spec's "The download banner" section carries it.
