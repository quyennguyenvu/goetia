# Messenger Calls-Off Notice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When facebook's "Incoming call sounds" switch (`viewer.call_blocked_until`) has turned incoming calls off, Goetia shows a crossed-out phone on the Messenger tile and offers **Turn On Incoming Calls** in the tile's right-click menu.

**Architecture:** The Messenger recipe gains two hooks, `callsBlocked` and `allowCalls`, that reach facebook's own query and mutation through the page's global `require`; the service preload exposes them on the frozen `window.__goetia`. A main-side `CallsSettingWatcher` asks the page through `executeJavaScript` (no channel from the page) at `service:ready`, every 10 minutes and just after a timed block ends, and publishes `ServiceRuntime.callsOffUntil`, which the tile and the tile menu read. The write runs only from the tile menu click.

**Tech Stack:** Electron 43 (main + unisolated service preload), TypeScript, React (renderer), Vitest (`happy-dom` where a DOM is needed), Playwright for e2e, Biome for lint/format.

**Spec:** `docs/superpowers/specs/2026-10-03-messenger-calls-off-notice-design.md` — read it first.

## Global Constraints

- **Commits:** the implementer never runs `git commit` and never writes `GRIMOIRE_COMMIT_MSG.txt`. Each task ends at a checkpoint where the owner runs `/grimoire-core:commit`. When the owner said "auto run", skip the checkpoints and ask for one `/commit` at the end. No `Co-Authored-By` trailer.
- **No new IPC channel.** Page state reaches main only through `window.__goetia` + `executeJavaScript`.
- **The write is the user's.** `allowCalls` is called only from `CallsSettingWatcher.turnOn`, which only the tile menu's click calls. Nothing turns calls on automatically; there is no Turn Off.
- **Fail closed.** Anything unknown, unreadable, malformed or timed out means "not off": `callsOffUntil = 0`, no mark.
- **facebook stores seconds.** `call_blocked_until` is seconds (`-1` = until turned back on, `0` = on); `ServiceRuntime.callsOffUntil` is epoch **ms** (`0` = not known off, `-1` = off indefinitely).
- **Copy, verbatim:**
  - tooltip: `Incoming calls are off on Facebook — right-click to turn on`; for a timed block a space plus `until 14:30` / `until tomorrow 08:00` / `until 10 Oct 09:05` goes after `Facebook`
  - menu item: `Turn On Incoming Calls`
  - Diagnostics (tag `recipe`): `messenger: incoming calls are off in Facebook's chat settings`, `messenger: can't read Facebook's call setting`, `messenger: turning incoming calls on failed`
- **Timings:** `CALLS_CHECK_INTERVAL_MS = 600_000`, `CALLS_CHECK_TIMEOUT_MS = 5_000` (main), `CALLS_HOOK_TIMEOUT_MS = 4_000` (page), `CALLS_READY_RECHECK_FLOOR_MS = 60_000`, `CALLS_EXPIRY_SLACK_MS = 2_000`.
- **Comments:** concise, explain why, match the file's density (user rule).
- **Definition of done:** `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` green; the new e2e spec green. E2E needs `ELECTRON_RUN_AS_NODE` unset (VS Code exports it): build once with `corepack pnpm build`, then `env -u ELECTRON_RUN_AS_NODE npx playwright test tests/e2e/<spec> --reporter=line` (`pnpm e2e -- <spec>` runs the whole suite).
- **Markdown** (CLAUDE.md): one line per paragraph or bullet, never hard-wrapped; `npx --no-install markdownlint-cli2 CLAUDE.md` clean.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/shared/calls-off.ts` (new) | Renderer-safe: `isCallsOff`, `callsOffLabel`, `callsOffTooltip`. |
| `src/main/lib/calls-setting-rules.ts` (new) | Pure rules: constants, `parseCallsBlocked`, `callsStateOf`, `callsTransition`, `nextCheckDelay`. |
| `src/shared/types.ts` | `ServiceRuntime.callsOffUntil`; `ServiceMeta.callsSetting`. |
| `src/main/state.ts` | `defaultRuntime` gains `callsOffUntil: 0`. |
| `src/preload/recipes/facebook-calls.ts` (new) | facebook internals: `readCallBlockedUntil`, `allowFacebookCalls`. |
| `src/preload/recipes/types.ts` | `Recipe.callsBlocked` / `Recipe.allowCalls`. |
| `src/preload/recipes/messenger.ts` | Implements the two hooks. |
| `src/shared/services.ts` | `callsSetting: true` on messenger. |
| `src/preload/service.ts` | Two functions on the frozen `window.__goetia`. |
| `src/main/calls-setting.ts` (new) | `CallsSettingWatcher`: timer, one page call at a time, Diagnostics on transitions. |
| `src/main/views.ts` | `runPageHook`; `ViewHooks.onDestroyed` called from `destroy()`. |
| `src/main/lib/tile-menu.ts` | `allow-calls` action. |
| `src/main/ipc-handlers.ts` | `AppContext.callsSetting`; `service:ready` starts the watch; tile menu item. |
| `src/main/index.ts` | Builds the watcher, wires `onDestroyed`, disposes on quit, `--goetia-e2e-calls-off` seed. |
| `src/renderer/src/components/ServiceTile.tsx` | The top-left mark. |
| `tests/e2e/calls-off.spec.ts` (new) | The mark renders with its tooltip. |
| `CLAUDE.md` | The guardrail bullet. |

---

### Task 1: Calls-off state and pure rules

**Files:**

- Create: `src/shared/calls-off.ts`
- Create: `src/main/lib/calls-setting-rules.ts`
- Modify: `src/shared/types.ts` (`interface ServiceRuntime`, ~line 377)
- Modify: `src/main/state.ts` (`defaultRuntime`, line 13)
- Test: `tests/unit/calls-off.test.ts`, `tests/unit/calls-setting-rules.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `isCallsOff(until: number, now: number): boolean`
  - `callsOffLabel(until: number, now: Date): string`
  - `callsOffTooltip(until: number, now: Date): string`
  - `CALLS_CHECK_INTERVAL_MS`, `CALLS_CHECK_TIMEOUT_MS`, `CALLS_READY_RECHECK_FLOOR_MS`, `CALLS_EXPIRY_SLACK_MS`, `CALLS_TURN_ON_FAILED`
  - `type CallsState = 'unset' | 'on' | 'off' | 'unreadable'`
  - `parseCallsBlocked(raw: unknown, now: number): number | null`
  - `callsStateOf(until: number | null): CallsState`
  - `callsTransition(prev: CallsState, next: CallsState): string | null`
  - `nextCheckDelay(until: number, now: number): number`
  - `ServiceRuntime.callsOffUntil: number`

- [ ] **Step 1: Write the failing tests**

`tests/unit/calls-off.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { callsOffLabel, callsOffTooltip, isCallsOff } from '../../src/shared/calls-off';

const now = new Date(2026, 9, 3, 13, 0);

describe('isCallsOff', () => {
  it('is off indefinitely at -1 and until a future time, on otherwise', () => {
    expect(isCallsOff(-1, now.getTime())).toBe(true);
    expect(isCallsOff(now.getTime() + 60_000, now.getTime())).toBe(true);
    expect(isCallsOff(0, now.getTime())).toBe(false);
    expect(isCallsOff(now.getTime() - 1, now.getTime())).toBe(false);
  });
});

describe('callsOffLabel', () => {
  it('names today, tomorrow and a later date', () => {
    expect(callsOffLabel(new Date(2026, 9, 3, 14, 30).getTime(), now)).toBe('until 14:30');
    expect(callsOffLabel(new Date(2026, 9, 4, 8, 0).getTime(), now)).toBe('until tomorrow 08:00');
    expect(callsOffLabel(new Date(2026, 9, 10, 9, 5).getTime(), now)).toBe('until 10 Oct 09:05');
  });

  it('is empty with no end, or an end already past', () => {
    expect(callsOffLabel(-1, now)).toBe('');
    expect(callsOffLabel(now.getTime() - 1, now)).toBe('');
  });
});

describe('callsOffTooltip', () => {
  it('says what is off and how to turn it on', () => {
    expect(callsOffTooltip(-1, now)).toBe(
      'Incoming calls are off on Facebook — right-click to turn on',
    );
    expect(callsOffTooltip(new Date(2026, 9, 3, 14, 30).getTime(), now)).toBe(
      'Incoming calls are off on Facebook until 14:30 — right-click to turn on',
    );
  });
});
```

`tests/unit/calls-setting-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  CALLS_CHECK_INTERVAL_MS,
  CALLS_EXPIRY_SLACK_MS,
  callsStateOf,
  callsTransition,
  nextCheckDelay,
  parseCallsBlocked,
} from '../../src/main/lib/calls-setting-rules';

const NOW = 1_790_000_000_000;

describe('parseCallsBlocked', () => {
  it('passes facebook’s two fixed values through', () => {
    expect(parseCallsBlocked(0, NOW)).toBe(0);
    expect(parseCallsBlocked(-1, NOW)).toBe(-1);
  });

  it('turns facebook’s seconds into epoch ms while the block lasts', () => {
    expect(parseCallsBlocked(NOW / 1000 + 3600, NOW)).toBe(NOW + 3_600_000);
  });

  it('reads an expired block as calls on', () => {
    expect(parseCallsBlocked(NOW / 1000 - 1, NOW)).toBe(0);
  });

  it('reads anything facebook does not store as unknown', () => {
    for (const raw of [null, undefined, '-1', 1.5, Number.NaN, Number.POSITIVE_INFINITY, -2, {}, true]) {
      expect(parseCallsBlocked(raw, NOW)).toBeNull();
    }
  });
});

describe('callsStateOf', () => {
  it('maps a parsed value to the state the Diagnostics lines track', () => {
    expect(callsStateOf(null)).toBe('unreadable');
    expect(callsStateOf(0)).toBe('on');
    expect(callsStateOf(-1)).toBe('off');
    expect(callsStateOf(NOW + 1)).toBe('off');
  });
});

describe('callsTransition', () => {
  it('notes the way into off and into unreadable, once', () => {
    expect(callsTransition('unset', 'off')).toBe("incoming calls are off in Facebook's chat settings");
    expect(callsTransition('on', 'off')).toBe("incoming calls are off in Facebook's chat settings");
    expect(callsTransition('unset', 'unreadable')).toBe("can't read Facebook's call setting");
    expect(callsTransition('off', 'unreadable')).toBe("can't read Facebook's call setting");
  });

  it('never notes a repeat or a recovery — a success is not evidence', () => {
    expect(callsTransition('off', 'off')).toBeNull();
    expect(callsTransition('unreadable', 'unreadable')).toBeNull();
    expect(callsTransition('off', 'on')).toBeNull();
    expect(callsTransition('unreadable', 'on')).toBeNull();
    expect(callsTransition('unset', 'on')).toBeNull();
  });
});

describe('nextCheckDelay', () => {
  it('waits the interval with no timed block', () => {
    expect(nextCheckDelay(0, NOW)).toBe(CALLS_CHECK_INTERVAL_MS);
    expect(nextCheckDelay(-1, NOW)).toBe(CALLS_CHECK_INTERVAL_MS);
  });

  it('lands just after a timed block that ends before the interval', () => {
    expect(nextCheckDelay(NOW + 60_000, NOW)).toBe(60_000 + CALLS_EXPIRY_SLACK_MS);
    expect(nextCheckDelay(NOW + 2 * CALLS_CHECK_INTERVAL_MS, NOW)).toBe(CALLS_CHECK_INTERVAL_MS);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `corepack pnpm vitest run tests/unit/calls-off.test.ts tests/unit/calls-setting-rules.test.ts`
Expected: FAIL — cannot resolve `../../src/shared/calls-off` and `../../src/main/lib/calls-setting-rules`.

- [ ] **Step 3: Write `src/shared/calls-off.ts`**

```ts
/** facebook's calls-off switch as the rail shows it. Process-agnostic, so the
 *  renderer can label the tile without main code. `until` is
 *  ServiceRuntime.callsOffUntil: 0 = not known to be off, -1 = off until
 *  turned back on, epoch ms = off until then. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const hhmm = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function isCallsOff(until: number, now: number): boolean {
  return until === -1 || until > now;
}

/** `until 14:30`, `until tomorrow 08:00`, `until 10 Oct 09:05`; '' with no end.
 *  Not muteLabel: facebook's blocks can outlast tomorrow. */
export function callsOffLabel(until: number, now: Date): string {
  if (until <= now.getTime()) return '';
  const end = new Date(until);
  // rounded: a DST day is 23 or 25 hours long
  const days = Math.round((dayStart(end) - dayStart(now)) / 86_400_000);
  if (days === 0) return `until ${hhmm(end)}`;
  if (days === 1) return `until tomorrow ${hhmm(end)}`;
  return `until ${end.getDate()} ${MONTHS[end.getMonth()]} ${hhmm(end)}`;
}

export function callsOffTooltip(until: number, now: Date): string {
  const when = callsOffLabel(until, now);
  return `Incoming calls are off on Facebook${when ? ` ${when}` : ''} — right-click to turn on`;
}
```

- [ ] **Step 4: Write `src/main/lib/calls-setting-rules.ts`**

```ts
/** facebook's own refresh is a subscription; ours polls the page's store. */
export const CALLS_CHECK_INTERVAL_MS = 600_000;
/** main's ceiling on one executeJavaScript round trip; the page hook's is 4 s */
export const CALLS_CHECK_TIMEOUT_MS = 5_000;
/** a repeated service:ready asks for a fresh check no more often than this */
export const CALLS_READY_RECHECK_FLOOR_MS = 60_000;
/** a timed block's re-check lands this long after it ends */
export const CALLS_EXPIRY_SLACK_MS = 2_000;

export const CALLS_TURN_ON_FAILED = 'turning incoming calls on failed';

/** `unset`: not read yet for this watch — the first read of either kind notes */
export type CallsState = 'unset' | 'on' | 'off' | 'unreadable';

/** The page's answer as ServiceRuntime.callsOffUntil (0 = on, -1 = off
 *  indefinitely, epoch ms = off until then), or null when it is not a value
 *  facebook stores. The answer is page data: facebook keeps seconds, and an
 *  expired block is calls on. */
export function parseCallsBlocked(raw: unknown, now: number): number | null {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return null;
  if (raw === 0 || raw === -1) return raw;
  if (raw < 0) return null;
  const ms = raw * 1000;
  return ms > now ? ms : 0;
}

export function callsStateOf(until: number | null): CallsState {
  if (until === null) return 'unreadable';
  return until === 0 ? 'on' : 'off';
}

/** The Diagnostics line a change earns: the way into off or into unreadable
 *  only — a recovery is a success, and a success is not evidence. */
export function callsTransition(prev: CallsState, next: CallsState): string | null {
  if (next === prev) return null;
  if (next === 'off') return "incoming calls are off in Facebook's chat settings";
  if (next === 'unreadable') return "can't read Facebook's call setting";
  return null;
}

/** The interval, or just after a timed block that ends sooner, so the mark
 *  clears on time. */
export function nextCheckDelay(until: number, now: number): number {
  if (until > now) return Math.min(CALLS_CHECK_INTERVAL_MS, until - now + CALLS_EXPIRY_SLACK_MS);
  return CALLS_CHECK_INTERVAL_MS;
}
```

- [ ] **Step 5: Add `callsOffUntil` to the runtime**

In `src/shared/types.ts`, `interface ServiceRuntime`, after `wakeKind`:

```ts
  wakeKind: LoadKind | null; // which load the cover names; read only while waking
  /** facebook's calls-off switch (shared/calls-off.ts): 0 = not known off,
   *  -1 = off until turned back on, else epoch ms it is off until */
  callsOffUntil: number;
```

In `src/main/state.ts`, `defaultRuntime`:

```ts
const defaultRuntime = (): ServiceRuntime => ({
  unread: { direct: 0, indirect: 0 },
  hibernated: false,
  crashed: false,
  stale: false,
  waking: false,
  wakeKind: null,
  callsOffUntil: 0,
});
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `corepack pnpm vitest run tests/unit/calls-off.test.ts tests/unit/calls-setting-rules.test.ts && corepack pnpm typecheck`
Expected: both files PASS; typecheck clean.

- [ ] **Step 7: Lint**

Run: `corepack pnpm exec biome check --write src/shared/calls-off.ts src/main/lib/calls-setting-rules.ts src/shared/types.ts src/main/state.ts tests/unit/calls-off.test.ts tests/unit/calls-setting-rules.test.ts`
Expected: no remaining diagnostics.

- [ ] **Step 8: Checkpoint** — ask the owner to run `/grimoire-core:commit` (suggested: `feat(calls): rules for facebook's calls-off switch`). Skip under auto run.

---

### Task 2: Recipe hooks for facebook's switch

**Files:**

- Create: `src/preload/recipes/facebook-calls.ts`
- Modify: `src/preload/recipes/types.ts` (`interface Recipe`)
- Modify: `src/preload/recipes/messenger.ts`
- Modify: `src/shared/types.ts` (`interface ServiceMeta`, after `opensLinksBlank`)
- Modify: `src/shared/services.ts` (messenger entry)
- Modify: `src/preload/service.ts` (the `window.__goetia` block)
- Test: `tests/unit/facebook-calls.test.ts`, `tests/unit/recipes.test.ts`

**Interfaces:**

- Consumes: nothing from Task 1.
- Produces:
  - `CALLS_HOOK_TIMEOUT_MS = 4_000`
  - `readCallBlockedUntil(win: Window, opts?: { policy?: 'store-or-network' | 'network-only'; timeoutMs?: number }): Promise<number | null>`
  - `allowFacebookCalls(win: Window, timeoutMs?: number): Promise<number | null>`
  - `Recipe.callsBlocked?(doc: Document): Promise<number | null>`
  - `Recipe.allowCalls?(doc: Document): Promise<number | null>`
  - `ServiceMeta.callsSetting?: boolean`
  - `window.__goetia.callsBlocked(): Promise<number | null>`
  - `window.__goetia.allowCalls(): Promise<number | null>`

- [ ] **Step 1: Write the failing tests**

`tests/unit/facebook-calls.test.ts` (node environment — a fake window stands in for the page):

```ts
import { describe, expect, it } from 'vitest';
import { allowFacebookCalls, readCallBlockedUntil } from '../../src/preload/recipes/facebook-calls';

/** facebook's registry: a global require that throws on a name it does not know */
function fakeWin(modules: Record<string, unknown>): Window {
  return {
    require: (name: string) => {
      if (!(name in modules)) throw new Error(`Requiring unknown module "${name}"`);
      return modules[name];
    },
  } as unknown as Window;
}

const ENV = { env: true };
const QUERY = { query: true };

function relayAnswering(value: unknown, calls: unknown[][] = []) {
  return {
    fetchQuery: (...args: unknown[]) => {
      calls.push(args);
      return { toPromise: () => Promise.resolve({ viewer: { call_blocked_until: value } }) };
    },
  };
}

function modulesWith(relay: unknown, extra: Record<string, unknown> = {}) {
  return {
    CometRelay: relay,
    // facebook's interop: a default export is unwrapped
    CometRelayEnvironment: { default: ENV },
    'RTWebCallBlockSettingHooksQuery.graphql': QUERY,
    ...extra,
  };
}

describe('readCallBlockedUntil', () => {
  it('reads call_blocked_until through facebook’s own query, from the store first', async () => {
    const calls: unknown[][] = [];
    expect(await readCallBlockedUntil(fakeWin(modulesWith(relayAnswering(-1, calls))))).toBe(-1);
    expect(calls[0]).toEqual([ENV, QUERY, {}, { fetchPolicy: 'store-or-network' }]);
  });

  it('takes a numeric string as the number it spells', async () => {
    expect(await readCallBlockedUntil(fakeWin(modulesWith(relayAnswering('1790000000'))))).toBe(
      1_790_000_000,
    );
  });

  it('is null when facebook renamed a module', async () => {
    const win = fakeWin({ CometRelay: relayAnswering(-1), CometRelayEnvironment: ENV });
    expect(await readCallBlockedUntil(win)).toBeNull();
  });

  it('is null with no registry at all', async () => {
    expect(await readCallBlockedUntil({} as Window)).toBeNull();
  });

  it('is null when the query throws or rejects', async () => {
    const throwing = {
      fetchQuery: () => {
        throw new Error('boom');
      },
    };
    expect(await readCallBlockedUntil(fakeWin(modulesWith(throwing)))).toBeNull();
    const rejecting = { fetchQuery: () => ({ toPromise: () => Promise.reject(new Error('net')) }) };
    expect(await readCallBlockedUntil(fakeWin(modulesWith(rejecting)))).toBeNull();
  });

  it('is null when the query never settles', async () => {
    const hanging = { fetchQuery: () => ({ toPromise: () => new Promise(() => {}) }) };
    expect(await readCallBlockedUntil(fakeWin(modulesWith(hanging)), { timeoutMs: 20 })).toBeNull();
  });

  it('is null for a value that is not a number', async () => {
    expect(await readCallBlockedUntil(fakeWin(modulesWith(relayAnswering({}))))).toBeNull();
  });
});

describe('allowFacebookCalls', () => {
  it('writes 0 through facebook’s own mutation, then asks the server again', async () => {
    const commits: unknown[][] = [];
    const calls: unknown[][] = [];
    const mutation = {
      commit: (...args: unknown[]) => {
        commits.push(args);
        return Promise.resolve({});
      },
    };
    const win = fakeWin(
      modulesWith(relayAnswering(0, calls), { MWCallBlockedUntilSettingMutation: mutation }),
    );
    expect(await allowFacebookCalls(win)).toBe(0);
    expect(commits).toEqual([[ENV, { call_blocked_until: 0 }]]);
    expect(calls[0]?.[3]).toEqual({ fetchPolicy: 'network-only' });
  });

  it('is null, and reads nothing, when the mutation is missing or rejected', async () => {
    const calls: unknown[][] = [];
    expect(await allowFacebookCalls(fakeWin(modulesWith(relayAnswering(0, calls))))).toBeNull();
    const rejecting = { commit: () => Promise.reject(new Error('denied')) };
    const win = fakeWin(
      modulesWith(relayAnswering(0, calls), { MWCallBlockedUntilSettingMutation: rejecting }),
    );
    expect(await allowFacebookCalls(win)).toBeNull();
    expect(calls).toEqual([]);
  });
});
```

Append to `tests/unit/recipes.test.ts` (it already has `load`, `recipes` and `SERVICES` in scope):

```ts
describe('callsBlocked / allowCalls hook pair', () => {
  it('a recipe declaring one declares the other, and ServiceMeta.callsSetting mirrors them', () => {
    for (const s of SERVICES) {
      const r = recipes[s.id];
      expect(r.callsBlocked !== undefined, s.id).toBe(r.allowCalls !== undefined);
      expect(Boolean(s.callsSetting), s.id).toBe(r.callsBlocked !== undefined);
    }
    expect(SERVICES.filter((s) => s.callsSetting).map((s) => s.id)).toEqual(['messenger']);
  });

  it('messenger reads unknown on a page without facebook’s registry', async () => {
    expect(await recipes.messenger.callsBlocked?.(load('blank'))).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `corepack pnpm vitest run tests/unit/facebook-calls.test.ts tests/unit/recipes.test.ts`
Expected: FAIL — `facebook-calls` cannot be resolved; the recipes pair test fails because messenger has no `callsBlocked` and no `callsSetting`.

- [ ] **Step 3: Write `src/preload/recipes/facebook-calls.ts`**

```ts
/** facebook.com's "Incoming call sounds" switch, read and written through the
 *  page's own module registry — a global `require` that throws on a name it
 *  does not know. Not a sound toggle: while `call_blocked_until` is non-zero
 *  the page never subscribes to rings (RTWebCallBlockSettingHooks). facebook
 *  renames internals at will, so every path settles, none throws, and a
 *  missing module reads as unknown. */

export const CALLS_HOOK_TIMEOUT_MS = 4_000;

type FetchPolicy = 'store-or-network' | 'network-only';

interface Relay {
  fetchQuery(
    env: unknown,
    query: unknown,
    vars: object,
    opts: { fetchPolicy: FetchPolicy },
  ): { toPromise(): Promise<unknown> };
}

interface CallBlockMutation {
  commit(env: unknown, vars: { call_blocked_until: number }): Promise<unknown>;
}

function fbModule(win: Window, name: string): unknown {
  const req = (win as unknown as { require?: unknown }).require;
  if (typeof req !== 'function') return null;
  try {
    const m = (req as (n: string) => unknown)(name) as { default?: unknown } | null | undefined;
    return m?.default ?? m ?? null;
  } catch {
    return null;
  }
}

/** The promise's value, or null when it rejects or outlasts `ms`. */
function settle<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(null);
      },
    );
  });
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && /^-?\d+$/.test(v)) return Number(v);
  return null;
}

/** The `call_blocked_until` facebook stores (seconds; -1 = until turned back
 *  on, 0 = calls on), or null when it cannot be read. The store is normally
 *  fresh — facebook's own subscription writes it — so it is asked first. */
export async function readCallBlockedUntil(
  win: Window,
  opts: { policy?: FetchPolicy; timeoutMs?: number } = {},
): Promise<number | null> {
  const relay = fbModule(win, 'CometRelay') as Partial<Relay> | null;
  const env = fbModule(win, 'CometRelayEnvironment');
  const query = fbModule(win, 'RTWebCallBlockSettingHooksQuery.graphql');
  if (typeof relay?.fetchQuery !== 'function' || !env || !query) return null;
  try {
    const observable = relay.fetchQuery(env, query, {}, {
      fetchPolicy: opts.policy ?? 'store-or-network',
    });
    const result = await settle(
      Promise.resolve(observable.toPromise()),
      opts.timeoutMs ?? CALLS_HOOK_TIMEOUT_MS,
    );
    const viewer = (result as { viewer?: { call_blocked_until?: unknown } } | null)?.viewer;
    return toNumber(viewer?.call_blocked_until);
  } catch {
    return null;
  }
}

/** Turns incoming calls on — what flipping the switch back does — and
 *  returns the server's answer afterwards, or null when the write failed. */
export async function allowFacebookCalls(
  win: Window,
  timeoutMs = CALLS_HOOK_TIMEOUT_MS,
): Promise<number | null> {
  const mutation = fbModule(win, 'MWCallBlockedUntilSettingMutation') as Partial<CallBlockMutation> | null;
  const env = fbModule(win, 'CometRelayEnvironment');
  if (typeof mutation?.commit !== 'function' || !env) return null;
  let committed: true | null;
  try {
    committed = await settle(
      Promise.resolve(mutation.commit(env, { call_blocked_until: 0 })).then(() => true as const),
      timeoutMs,
    );
  } catch {
    return null;
  }
  if (committed !== true) return null;
  // the store may still hold the old value until the subscription lands
  return readCallBlockedUntil(win, { policy: 'network-only', timeoutMs });
}
```

- [ ] **Step 4: Declare the hooks on `Recipe`**

In `src/preload/recipes/types.ts`, after `loginUrl?`:

```ts
  /** facebook's account-level "Incoming call sounds" switch,
   *  `call_blocked_until` (seconds; -1 = off until turned back on, 0 = on),
   *  read through the page's own modules — while it is non-zero the page
   *  drops every ring. null when it cannot be read; must settle. Declared
   *  together with allowCalls and mirrored by ServiceMeta.callsSetting
   *  (recipes.test.ts). */
  callsBlocked?(doc: Document): Promise<number | null>;
  /** Turn incoming calls back on and return a fresh read. Main calls it only
   *  from the tile menu's Turn On Incoming Calls. */
  allowCalls?(doc: Document): Promise<number | null>;
```

- [ ] **Step 5: Implement them in `src/preload/recipes/messenger.ts`**

Add the import beside the others:

```ts
import { allowFacebookCalls, readCallBlockedUntil } from './facebook-calls';
```

Add after `synthNotification` inside the `messenger` object:

```ts
  // facebook's "Incoming call sounds" switch: while it is off the page drops
  // every ring, and both places facebook offers it are hidden in Goetia
  callsBlocked(doc) {
    const win = doc.defaultView;
    return win ? readCallBlockedUntil(win) : Promise.resolve(null);
  },
  allowCalls(doc) {
    const win = doc.defaultView;
    return win ? allowFacebookCalls(win) : Promise.resolve(null);
  },
```

- [ ] **Step 6: Mirror on `ServiceMeta`**

In `src/shared/types.ts`, `interface ServiceMeta`, after `opensLinksBlank`:

```ts
  /** The recipe reads facebook's account-level calls-off switch
   *  (callsBlocked/allowCalls), so main watches it and the tile shows it
   *  (calls-setting.ts). Set solely where both hooks exist
   *  (recipes.test.ts enforces it). */
  callsSetting?: boolean;
```

In `src/shared/services.ts`, the messenger entry:

```ts
    id: 'messenger',
    name: 'Messenger',
    url: 'https://www.facebook.com/messages/',
    color: '#0084FF',
    waitForReady: true,
    chatPaths: ['/messages', '/messenger_media'],
    callsSetting: true,
  },
```

- [ ] **Step 7: Expose the hooks on `window.__goetia`**

In `src/preload/service.ts`, replace the `Object.defineProperty(window, '__goetia', …)` value so it reads:

```ts
  Object.defineProperty(window, '__goetia', {
    value: Object.freeze({
      conversation: (): string | null => recipe?.conversation?.(document) ?? null,
      conversationUrl: (): string | null => recipe?.conversationUrl?.(document) ?? null,
      // facebook's calls-off switch: main asks on a timer and calls
      // allowCalls only from the tile menu's Turn On
      callsBlocked: (): Promise<number | null> =>
        recipe?.callsBlocked?.(document) ?? Promise.resolve(null),
      allowCalls: (): Promise<number | null> =>
        recipe?.allowCalls?.(document) ?? Promise.resolve(null),
    }),
    enumerable: false,
    writable: false,
    configurable: false,
  });
```

and widen the comment above it to name both readers:

```ts
  // Main reads the open conversation (pin time) and facebook's calls-off
  // switch through executeJavaScript. Frozen and non-enumerable: the page
  // cannot swap it, and every entry only runs the recipe's own hooks.
```

- [ ] **Step 8: Run the tests and typecheck**

Run: `corepack pnpm vitest run tests/unit/facebook-calls.test.ts tests/unit/recipes.test.ts && corepack pnpm typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 9: Lint**

Run: `corepack pnpm exec biome check --write src/preload/recipes/facebook-calls.ts src/preload/recipes/types.ts src/preload/recipes/messenger.ts src/shared/types.ts src/shared/services.ts src/preload/service.ts tests/unit/facebook-calls.test.ts tests/unit/recipes.test.ts`
Expected: no remaining diagnostics.

- [ ] **Step 10: Checkpoint** — ask the owner to run `/grimoire-core:commit` (suggested: `feat(messenger): read and write facebook's calls-off switch from the recipe`). Skip under auto run.

---

### Task 3: `CallsSettingWatcher`

**Files:**

- Create: `src/main/calls-setting.ts`
- Test: `tests/unit/calls-setting.test.ts`

**Interfaces:**

- Consumes (Task 1): `CALLS_CHECK_TIMEOUT_MS`, `CALLS_READY_RECHECK_FLOOR_MS`, `CALLS_TURN_ON_FAILED`, `CallsState`, `callsStateOf`, `callsTransition`, `nextCheckDelay`, `parseCallsBlocked`.
- Produces:
  - `type CallsHook = 'callsBlocked' | 'allowCalls'`
  - `interface CallsSettingDeps { exec(id: ServiceId, hook: CallsHook): Promise<unknown> | null; publish(id: ServiceId, callsOffUntil: number): void; note(id: ServiceId, line: string): void; now(): number }`
  - `class CallsSettingWatcher { constructor(deps: CallsSettingDeps); noteReady(id: ServiceId): void; stop(id: ServiceId): void; turnOn(id: ServiceId): Promise<void>; dispose(): void }`

- [ ] **Step 1: Write the failing test**

`tests/unit/calls-setting.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type CallsHook, CallsSettingWatcher } from '../../src/main/calls-setting';
import {
  CALLS_CHECK_INTERVAL_MS,
  CALLS_CHECK_TIMEOUT_MS,
  CALLS_READY_RECHECK_FLOOR_MS,
} from '../../src/main/lib/calls-setting-rules';

const NOW = 1_790_000_000_000;
const OFF = "messenger: incoming calls are off in Facebook's chat settings";
const UNREADABLE = "messenger: can't read Facebook's call setting";
const FAILED = 'messenger: turning incoming calls on failed';

/** The page answers each hook call with the next scripted reply; with none
 *  left, calls are on. A reply of null means "no live view". */
function harness() {
  const replies: Array<() => Promise<unknown> | null> = [];
  const calls: CallsHook[] = [];
  const published: number[] = [];
  const notes: string[] = [];
  const watcher = new CallsSettingWatcher({
    exec: (_id, hook) => {
      calls.push(hook);
      const next = replies.shift();
      return next ? next() : Promise.resolve(0);
    },
    publish: (_id, until) => published.push(until),
    note: (_id, line) => notes.push(line),
    now: () => Date.now(),
  });
  const reply = (fn: () => Promise<unknown> | null) => replies.push(fn);
  return { watcher, reply, calls, published, notes };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('CallsSettingWatcher', () => {
  it('checks at ready and shows an indefinite block, noting it once', async () => {
    const h = harness();
    h.reply(() => Promise.resolve(-1));
    h.reply(() => Promise.resolve(-1));
    h.watcher.noteReady('messenger');
    await flush();
    expect(h.calls).toEqual(['callsBlocked']);
    expect(h.published).toEqual([-1]);
    expect(h.notes).toEqual([OFF]);
    await vi.advanceTimersByTimeAsync(CALLS_CHECK_INTERVAL_MS);
    expect(h.calls).toEqual(['callsBlocked', 'callsBlocked']);
    expect(h.notes).toEqual([OFF]);
  });

  it('re-checks just after a timed block ends', async () => {
    const h = harness();
    h.reply(() => Promise.resolve(NOW / 1000 + 60));
    h.watcher.noteReady('messenger');
    await flush();
    expect(h.published).toEqual([NOW + 60_000]);
    await vi.advanceTimersByTimeAsync(59_000);
    expect(h.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(h.calls).toHaveLength(2);
    expect(h.published.at(-1)).toBe(0);
  });

  it('fails closed and says so once when the setting cannot be read', async () => {
    const h = harness();
    h.reply(() => Promise.resolve(null));
    h.reply(() => Promise.resolve('garbage'));
    h.watcher.noteReady('messenger');
    await flush();
    await vi.advanceTimersByTimeAsync(CALLS_CHECK_INTERVAL_MS);
    expect(h.published).toEqual([0, 0]);
    expect(h.notes).toEqual([UNREADABLE]);
  });

  it('treats a page that never answers as unreadable', async () => {
    const h = harness();
    h.reply(() => new Promise(() => {}));
    h.watcher.noteReady('messenger');
    await vi.advanceTimersByTimeAsync(CALLS_CHECK_TIMEOUT_MS);
    expect(h.published).toEqual([0]);
    expect(h.notes).toEqual([UNREADABLE]);
  });

  it('skips a round while the page is mid-navigation', async () => {
    const h = harness();
    h.reply(() => Promise.reject(new Error('navigated')));
    h.watcher.noteReady('messenger');
    await flush();
    expect(h.published).toEqual([]);
    expect(h.notes).toEqual([]);
    await vi.advanceTimersByTimeAsync(CALLS_CHECK_INTERVAL_MS);
    expect(h.calls).toHaveLength(2);
  });

  it('stops with the view: the mark clears and nothing runs after', async () => {
    const h = harness();
    h.reply(() => Promise.resolve(-1));
    h.watcher.noteReady('messenger');
    await flush();
    h.watcher.stop('messenger');
    expect(h.published).toEqual([-1, 0]);
    await vi.advanceTimersByTimeAsync(CALLS_CHECK_INTERVAL_MS * 3);
    expect(h.calls).toHaveLength(1);
  });

  it('stops itself when the view is already gone', async () => {
    const h = harness();
    h.reply(() => null);
    h.watcher.noteReady('messenger');
    await flush();
    await vi.advanceTimersByTimeAsync(CALLS_CHECK_INTERVAL_MS);
    expect(h.calls).toHaveLength(1);
  });

  it('turns calls on and clears the mark, writing nothing on success', async () => {
    const h = harness();
    h.reply(() => Promise.resolve(-1));
    h.reply(() => Promise.resolve(0));
    h.watcher.noteReady('messenger');
    await flush();
    await h.watcher.turnOn('messenger');
    expect(h.calls).toEqual(['callsBlocked', 'allowCalls']);
    expect(h.published).toEqual([-1, 0]);
    expect(h.notes).toEqual([OFF]);
  });

  it('keeps the mark and says so when turning calls on fails', async () => {
    const h = harness();
    h.reply(() => Promise.resolve(-1));
    h.reply(() => Promise.resolve(-1));
    h.watcher.noteReady('messenger');
    await flush();
    await h.watcher.turnOn('messenger');
    expect(h.published).toEqual([-1, -1]);
    expect(h.notes).toEqual([OFF, FAILED]);
  });

  it('does not let an unreadable Turn On answer flip the tile', async () => {
    const h = harness();
    h.reply(() => Promise.resolve(-1));
    h.reply(() => Promise.resolve(null));
    h.watcher.noteReady('messenger');
    await flush();
    await h.watcher.turnOn('messenger');
    expect(h.published).toEqual([-1]);
    expect(h.notes).toEqual([OFF, FAILED]);
  });

  it('runs one page call at a time: Turn On waits for the check in flight', async () => {
    const h = harness();
    let answer: (v: unknown) => void = () => {};
    h.reply(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    h.reply(() => Promise.resolve(0));
    h.watcher.noteReady('messenger');
    const turning = h.watcher.turnOn('messenger');
    await flush();
    expect(h.calls).toEqual(['callsBlocked']);
    answer(-1);
    await turning;
    expect(h.calls).toEqual(['callsBlocked', 'allowCalls']);
  });

  it('refreshes on a repeated ready only past the floor', async () => {
    const h = harness();
    h.watcher.noteReady('messenger');
    await flush();
    h.watcher.noteReady('messenger');
    await flush();
    expect(h.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(CALLS_READY_RECHECK_FLOOR_MS);
    h.watcher.noteReady('messenger');
    await flush();
    expect(h.calls).toHaveLength(2);
  });

  it('does nothing for Turn On before the chat is ready', async () => {
    const h = harness();
    await h.watcher.turnOn('messenger');
    expect(h.calls).toEqual([]);
  });

  it('dispose clears every timer', async () => {
    const h = harness();
    h.watcher.noteReady('messenger');
    await flush();
    h.watcher.dispose();
    await vi.advanceTimersByTimeAsync(CALLS_CHECK_INTERVAL_MS * 2);
    expect(h.calls).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/calls-setting.test.ts`
Expected: FAIL — cannot resolve `../../src/main/calls-setting`.

- [ ] **Step 3: Write `src/main/calls-setting.ts`**

```ts
import type { ServiceId } from '../shared/types';
import {
  CALLS_CHECK_TIMEOUT_MS,
  CALLS_READY_RECHECK_FLOOR_MS,
  CALLS_TURN_ON_FAILED,
  type CallsState,
  callsStateOf,
  callsTransition,
  nextCheckDelay,
  parseCallsBlocked,
} from './lib/calls-setting-rules';

/** The two window.__goetia hooks this watcher may call. */
export type CallsHook = 'callsBlocked' | 'allowCalls';

export interface CallsSettingDeps {
  /** The hook's answer from the live page: null with no live view, a
   *  rejection while the page is mid-navigation. */
  exec(id: ServiceId, hook: CallsHook): Promise<unknown> | null;
  /** What the tile draws: ServiceRuntime.callsOffUntil. */
  publish(id: ServiceId, callsOffUntil: number): void;
  note(id: ServiceId, line: string): void;
  now(): number;
}

interface Watch {
  state: CallsState;
  until: number;
  timer: ReturnType<typeof setTimeout> | null;
  /** page calls run one at a time, in order */
  queue: Promise<void>;
  pending: number;
  lastCheckAt: number;
}

const NO_VIEW = Symbol('no view');
const SKIPPED = Symbol('skipped');
const TIMED_OUT = Symbol('timed out');

/** facebook's account-level calls-off switch, kept on the Messenger tile.
 *  Main asks the page through window.__goetia — the page has no channel to
 *  push it — at ready, on CALLS_CHECK_INTERVAL_MS, just after a timed block
 *  ends, and for the user's Turn On, the only caller of allowCalls. Unknown
 *  reads as "not off": a renamed facebook module must never draw a mark. */
export class CallsSettingWatcher {
  private watches = new Map<ServiceId, Watch>();

  constructor(private deps: CallsSettingDeps) {}

  /** service:ready — start watching, or refresh a watch whose last check is
   *  older than the floor; a page may send ready as often as it likes */
  noteReady(id: ServiceId): void {
    const w = this.watches.get(id);
    if (!w) {
      const fresh: Watch = {
        state: 'unset',
        until: 0,
        timer: null,
        queue: Promise.resolve(),
        pending: 0,
        lastCheckAt: Number.NEGATIVE_INFINITY,
      };
      this.watches.set(id, fresh);
      void this.check(id, fresh);
      return;
    }
    if (w.pending === 0 && this.deps.now() - w.lastCheckAt >= CALLS_READY_RECHECK_FLOOR_MS) {
      void this.check(id, w);
    }
  }

  /** the view is gone (hibernation, banish, purge, quit): a sleeping page
   *  cannot ring, so the mark goes with it until the next ready */
  stop(id: ServiceId): void {
    const w = this.watches.get(id);
    if (!w) return;
    if (w.timer) clearTimeout(w.timer);
    this.watches.delete(id);
    this.deps.publish(id, 0);
  }

  dispose(): void {
    for (const w of this.watches.values()) if (w.timer) clearTimeout(w.timer);
    this.watches.clear();
  }

  /** the tile menu's Turn On Incoming Calls */
  turnOn(id: ServiceId): Promise<void> {
    const w = this.watches.get(id);
    if (!w) return Promise.resolve();
    return this.enqueue(w, async () => {
      if (this.watches.get(id) !== w) return;
      const raw = await this.ask(id, 'allowCalls');
      if (this.watches.get(id) !== w) return;
      if (raw === NO_VIEW) {
        this.stop(id);
        return;
      }
      const until =
        raw === SKIPPED || raw === TIMED_OUT ? null : parseCallsBlocked(raw, this.deps.now());
      if (until !== 0) this.deps.note(id, `${id}: ${CALLS_TURN_ON_FAILED}`);
      // an unreadable answer is the action failing, not the setting moving:
      // the next check decides what the tile says
      if (until !== null) this.apply(id, w, until);
      this.schedule(id, w);
    });
  }

  private check(id: ServiceId, w: Watch): Promise<void> {
    if (w.timer) {
      clearTimeout(w.timer);
      w.timer = null;
    }
    return this.enqueue(w, async () => {
      if (this.watches.get(id) !== w) return;
      w.lastCheckAt = this.deps.now();
      const raw = await this.ask(id, 'callsBlocked');
      if (this.watches.get(id) !== w) return;
      if (raw === NO_VIEW) {
        this.stop(id);
        return;
      }
      if (raw !== SKIPPED) {
        this.apply(id, w, raw === TIMED_OUT ? null : parseCallsBlocked(raw, this.deps.now()));
      }
      this.schedule(id, w);
    });
  }

  private enqueue(w: Watch, job: () => Promise<void>): Promise<void> {
    w.pending++;
    w.queue = w.queue
      .then(job)
      .catch(() => {})
      .finally(() => {
        w.pending--;
      });
    return w.queue;
  }

  private async ask(id: ServiceId, hook: CallsHook): Promise<unknown> {
    const answer = this.deps.exec(id, hook);
    if (answer === null) return NO_VIEW;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), CALLS_CHECK_TIMEOUT_MS);
    });
    try {
      return await Promise.race([answer, timeout]);
    } catch {
      return SKIPPED; // executeJavaScript rejects while the page navigates
    } finally {
      clearTimeout(timer);
    }
  }

  private apply(id: ServiceId, w: Watch, until: number | null): void {
    const next = callsStateOf(until);
    const line = callsTransition(w.state, next);
    if (line) this.deps.note(id, `${id}: ${line}`);
    w.state = next;
    w.until = until ?? 0;
    this.deps.publish(id, w.until);
  }

  private schedule(id: ServiceId, w: Watch): void {
    if (w.timer) clearTimeout(w.timer);
    w.timer = setTimeout(() => {
      w.timer = null;
      void this.check(id, w);
    }, nextCheckDelay(w.until, this.deps.now()));
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/calls-setting.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Lint and typecheck**

Run: `corepack pnpm exec biome check --write src/main/calls-setting.ts tests/unit/calls-setting.test.ts && corepack pnpm typecheck`
Expected: clean.

- [ ] **Step 6: Checkpoint** — ask the owner to run `/grimoire-core:commit` (suggested: `feat(calls): watch facebook's calls-off switch from main`). Skip under auto run.

---

### Task 4: Wire the watcher into main and the tile menu

**Files:**

- Modify: `src/main/views.ts` (`interface ViewHooks` ~line 78; `destroy()` ~line 819; new `runPageHook` beside `pinSelection` ~line 662)
- Modify: `src/main/lib/tile-menu.ts`
- Modify: `src/main/ipc-handlers.ts` (`interface AppContext` ~line 77; `service:ready` line 416; `service:tileMenu` ~line 420)
- Modify: `src/main/index.ts` (view hooks ~line 253; `ctx` ~line 458; `before-quit` ~line 541)
- Test: `tests/unit/tile-menu.test.ts`

**Interfaces:**

- Consumes (Task 1): `isCallsOff`. (Task 3): `CallsSettingWatcher`, `CallsHook`.
- Produces:
  - `ServiceViewManager.runPageHook(id: ServiceId, hook: CallsHook): Promise<unknown> | null`
  - `ViewHooks.onDestroyed(id: ServiceId): void`
  - `TileMenuAction` gains `'allow-calls'`
  - `tileMenuItems` option `callsOff?: boolean`
  - `AppContext.callsSetting: CallsSettingWatcher`

- [ ] **Step 1: Write the failing tile menu test**

Append inside `describe('tileMenuItems', …)` in `tests/unit/tile-menu.test.ts`:

```ts
  it('offers Turn On Incoming Calls only while calls are off and the page is live', () => {
    const items = tileMenuItems({ muted: false, live: true, callsOff: true });
    expect(actions(items)).toEqual(['reload', 'mute', 'allow-calls', '—', 'banish']);
    const item = items.find((i) => i.type === 'item' && i.action === 'allow-calls');
    expect(item?.type === 'item' && item.label).toBe('Turn On Incoming Calls');
    // hibernated: no page to run the write in — the tile click wakes it first
    expect(actions(tileMenuItems({ muted: false, live: false, callsOff: true }))).not.toContain(
      'allow-calls',
    );
    expect(actions(tileMenuItems({ muted: false, live: true, callsOff: false }))).not.toContain(
      'allow-calls',
    );
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `corepack pnpm vitest run tests/unit/tile-menu.test.ts`
Expected: FAIL — `allow-calls` missing from the actions.

- [ ] **Step 3: Add the menu item in `src/main/lib/tile-menu.ts`**

```ts
export type TileMenuAction = 'reload' | 'mute' | 'allow-calls' | 'banish';
```

Replace the doc comment and function:

```ts
/** The rail tile's right-click menu. Labels are bare verbs — the tile the menu
 *  hangs off already names the service. Reload is disabled for a service with
 *  no live view: hibernated means nothing to reload, and the tile click wakes it.
 *  Mute is a submenu of durations on an unmuted service and a single Unmute,
 *  naming the expiry when there is one, on a muted one. Turn On Incoming Calls
 *  appears only while facebook's calls-off switch is on and a live page can
 *  run the write — Goetia hides both places facebook offers the switch. */
export function tileMenuItems(o: {
  muted: boolean;
  live: boolean;
  mutedUntil?: number;
  now?: Date;
  callsOff?: boolean;
}): TileMenuItem[] {
  const mute: TileMenuItem = o.muted
    ? {
        type: 'item',
        action: 'mute',
        label: labelUnmute('Unmute', o.mutedUntil ?? 0, o.now ?? new Date()),
        enabled: true,
      }
    : { type: 'submenu', action: 'mute', label: 'Mute', items: MUTE_CHOICES };
  const calls: TileMenuItem[] =
    o.callsOff && o.live
      ? [{ type: 'item', action: 'allow-calls', label: 'Turn On Incoming Calls', enabled: true }]
      : [];
  return [
    { type: 'item', action: 'reload', label: 'Reload', enabled: o.live },
    mute,
    ...calls,
    { type: 'separator' },
    { type: 'item', action: 'banish', label: 'Banish', enabled: true },
  ];
}
```

- [ ] **Step 4: Run the tile menu tests**

Run: `corepack pnpm vitest run tests/unit/tile-menu.test.ts`
Expected: PASS (all, including the existing bare-verb and ordering tests).

- [ ] **Step 5: Add `runPageHook` and `onDestroyed` in `src/main/views.ts`**

Import the hook type with the other local imports:

```ts
import type { CallsHook } from './calls-setting';
```

In `interface ViewHooks`, after `onLoadFailed`:

```ts
  /** destroy() ran — hibernation, banish, purge or quit took the view */
  onDestroyed(id: ServiceId): void;
```

At the end of `destroy(id)`, after `if (this.activeId === id) this.activeId = null;`:

```ts
    this.hooks.onDestroyed(id);
```

Before `async pinSelection(`:

```ts
  /** A window.__goetia hook's answer from the live page — main asks, the
   *  page never pushes. Null with no live view; rejects while the page is
   *  mid-navigation. `hook` is a fixed name, never page data. */
  runPageHook(id: ServiceId, hook: CallsHook): Promise<unknown> | null {
    const wc = this.views.get(id)?.webContents;
    if (!wc || wc.isDestroyed()) return null;
    return wc.executeJavaScript(`globalThis.__goetia?.${hook}?.() ?? null`, true);
  }
```

- [ ] **Step 6: Wire `AppContext` and the handlers in `src/main/ipc-handlers.ts`**

Imports:

```ts
import { isCallsOff } from '../shared/calls-off';
import type { CallsSettingWatcher } from './calls-setting';
```

In `interface AppContext`, after `muteTimer`:

```ts
  /** facebook's calls-off switch on the Messenger tile; see calls-setting.ts */
  callsSetting: CallsSettingWatcher;
```

Replace the `service:ready` line:

```ts
  on('service:ready', ({ serviceId }) => {
    ctx.waking.end(serviceId, 'recipe-ready');
    // only a ready chat is asked: a login or checkpoint page is never touched
    if (serviceById(serviceId).callsSetting) ctx.callsSetting.noteReady(serviceId);
  });
```

In the `service:tileMenu` handler, extend `run` and the `tileMenuItems` call:

```ts
    const run: Record<TileMenuAction, () => void> = {
      reload: () => ctx.views.refresh(serviceId),
      mute: () => setServiceMuted(ctx, serviceId, false),
      // the only caller of the write: the user's own click
      'allow-calls': () => void ctx.callsSetting.turnOn(serviceId),
      banish: () => ctx.banishServices([serviceId]),
    };
    const items = tileMenuItems({
      muted,
      live: ctx.views.has(serviceId),
      mutedUntil: s.mutedUntil[serviceId],
      now: new Date(),
      callsOff: isCallsOff(ctx.state.runtime(serviceId).callsOffUntil, Date.now()),
    });
```

- [ ] **Step 7: Build and wire the watcher in `src/main/index.ts`**

Import:

```ts
import { CallsSettingWatcher } from './calls-setting';
```

Immediately before `const views = new ServiceViewManager(`:

```ts
    // asks the Messenger page for facebook's calls-off switch; views is
    // assigned below, and nothing asks before a page reports ready
    const callsSetting = new CallsSettingWatcher({
      exec: (id, hook) => views.runPageHook(id, hook),
      publish: (id, callsOffUntil) => state.setRuntime(id, { callsOffUntil }),
      note: (id, line) => diag.note('recipe', line, id),
      now: Date.now,
    });
```

In the `ViewHooks` object passed to `new ServiceViewManager(`, after `onLoadFailed`:

```ts
        onDestroyed: (id) => callsSetting.stop(id),
```

In `const ctx: AppContext = {`, after `muteTimer,`:

```ts
      callsSetting,
```

In `app.on('before-quit', …)`, after `muteTimer.dispose();`:

```ts
      callsSetting.dispose();
```

- [ ] **Step 8: Typecheck and run every unit test**

Run: `corepack pnpm typecheck && corepack pnpm test`
Expected: typecheck clean; all unit tests PASS.

- [ ] **Step 9: Lint**

Run: `corepack pnpm exec biome check --write src/main/views.ts src/main/lib/tile-menu.ts src/main/ipc-handlers.ts src/main/index.ts tests/unit/tile-menu.test.ts`
Expected: no remaining diagnostics.

- [ ] **Step 10: Checkpoint** — ask the owner to run `/grimoire-core:commit` (suggested: `feat(calls): offer Turn On Incoming Calls on the Messenger tile`). Skip under auto run.

---

### Task 5: The tile mark

**Precondition:** the owner has picked the mark's look from the review page (`https://claude.ai/artifact/ARgtWizrdnTaKyaDafvvBo`). Step 2 draws the recommended variant D — the mute mark's neutral disc, 12px, just **inside** the tile's top-left corner, because a mark hanging off the corner lands about 2px from the previous tile's unread badge in the top rail. If the owner picked another variant, change only the outer `span`'s `className` and the `svg` size in Step 2 to that variant's.

**Files:**

- Modify: `src/renderer/src/components/ServiceTile.tsx`
- Modify: `src/main/index.ts` (e2e flag beside `e2eUpdate`, line 67; seed beside the `e2eUpdate` block ~line 604)
- Create: `tests/e2e/calls-off.spec.ts`

**Interfaces:**

- Consumes (Task 1): `isCallsOff`, `callsOffTooltip`, `ServiceRuntime.callsOffUntil`.
- Produces: `data-testid="calls-off-mark"`; the `--goetia-e2e-calls-off` launch flag.

- [ ] **Step 1: Write the failing e2e spec**

`tests/e2e/calls-off.spec.ts`:

```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, type Page, test } from '@playwright/test';

const isShell = (p: Page) => p.url().startsWith('file://') && !p.url().includes('loading.html');

function makeProfile(): string {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-calls-off-'));
  writeFileSync(
    join(profile, 'settings.json'),
    JSON.stringify({
      lastActiveId: 'messenger',
      disabled: {
        whatsapp: true,
        messenger: false,
        telegram: true,
        discord: true,
        zalo: true,
        tiktok: true,
        shopee: true,
        instagram: true,
        slack: true,
        teams: true,
      },
    }),
  );
  return profile;
}

// the e2e messenger page is logged out, so ready never fires and the watcher
// never runs: the seeded state is all the tile has
test('calls off: the Messenger tile carries the mark and says how to turn calls on', async () => {
  const app = await electron.launch({
    args: ['out/main/index.js', '--goetia-e2e-calls-off', `--goetia-user-data=${makeProfile()}`],
  });
  try {
    const win =
      app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
    await win.waitForLoadState('domcontentloaded');
    const tile = win.locator('[data-testid="service-tile"][aria-label="Messenger"]');
    const mark = tile.getByTestId('calls-off-mark');
    await expect(mark).toBeVisible();
    await expect(mark).toHaveAttribute(
      'title',
      'Incoming calls are off on Facebook — right-click to turn on',
    );
  } finally {
    await app.close();
  }
});
```

- [ ] **Step 2: Draw the mark in `src/renderer/src/components/ServiceTile.tsx`**

Import:

```ts
import { callsOffTooltip, isCallsOff } from '../../../shared/calls-off';
```

After `const waking = runtime.waking && !runtime.crashed;`:

```ts
  // read at render: the watcher's re-check just after a timed block ends
  // broadcasts the cleared state, so no interval is needed
  const callsOff = isCallsOff(runtime.callsOffUntil, Date.now());
```

After the `{muted && (…)}` block, before `</button>`:

```tsx
      {/* inside the corner, not hanging off it: off the corner it would
          crowd the previous tile's unread badge in the top rail */}
      {callsOff && (
        <span
          data-testid="calls-off-mark"
          className="absolute left-px top-px flex h-3 w-3 items-center justify-center rounded-full border border-border bg-bg-2 text-text-2"
          title={callsOffTooltip(runtime.callsOffUntil, new Date())}
        >
          {/* filled handset, slash cut out in the disc colour: a stroked
              phone at this size reads as "%" */}
          <svg width="8" height="8" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"
            />
            <line x1="3" y1="3" x2="21" y2="21" className="stroke-bg-2" strokeWidth="5" strokeLinecap="round" />
            <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </span>
      )}
```

- [ ] **Step 3: Add the e2e seed in `src/main/index.ts`**

Beside `const e2eUpdate = …` (line 67):

```ts
const e2eCallsOff = process.argv.includes('--goetia-e2e-calls-off');
```

After the `if (e2eUpdate) { … }` block:

```ts
    // separate flag, like the update toast: a calls-off mark must not
    // perturb the other e2e specs
    if (e2eCallsOff) {
      setTimeout(() => state.setRuntime('messenger', { callsOffUntil: -1 }), 800);
    }
```

- [ ] **Step 4: Build and run the e2e spec**

Run: `corepack pnpm build && env -u ELECTRON_RUN_AS_NODE npx playwright test tests/e2e/calls-off.spec.ts --reporter=line`
Expected: 1 passed.

- [ ] **Step 5: Run the neighbouring e2e specs that summon Messenger**

Run: `env -u ELECTRON_RUN_AS_NODE npx playwright test tests/e2e/pins.spec.ts tests/e2e/smoke.spec.ts --reporter=line`
Expected: all passed (no seed without the flag, so no mark).

- [ ] **Step 6: Lint, typecheck, unit tests**

Run: `corepack pnpm exec biome check --write src/renderer/src/components/ServiceTile.tsx src/main/index.ts tests/e2e/calls-off.spec.ts && corepack pnpm typecheck && corepack pnpm test`
Expected: clean; all PASS.

- [ ] **Step 7: Checkpoint** — ask the owner to run `/grimoire-core:commit` (suggested: `feat(rail): mark the Messenger tile while facebook has calls off`). Skip under auto run.

---

### Task 6: Guardrail, full gate, live check

**Files:**

- Modify: `CLAUDE.md` (section `## Notifications & mute`, appended as its last bullet)

**Interfaces:**

- Consumes: everything above.
- Produces: the guardrail bullet.

- [ ] **Step 1: Append the bullet to `## Notifications & mute` in `CLAUDE.md`**

One line, not wrapped:

```markdown
- **facebook's calls-off switch is shown, never flipped behind the user's back** (2026-10-03, user decision; spec `docs/superpowers/specs/2026-10-03-messenger-calls-off-notice-design.md`). facebook's "Incoming call sounds" switch is `viewer.call_blocked_until` (seconds; `-1` = until turned back on), and while it is non-zero the web page drops every ring — no dialog, no ringtone, no `Notification` for the shim (2026-09-30: a call reached the page's ring SDK and nothing showed). Both places facebook offers the switch are hidden in Goetia (the top bar's Messenger jewel, the home feed's Contacts panel), so `CallsSettingWatcher` (`src/main/calls-setting.ts`, rules in `lib/calls-setting-rules.ts`) asks the page through `window.__goetia.callsBlocked()` — `executeJavaScript`, no channel from the page — at `service:ready` for `ServiceMeta.callsSetting` services, every `CALLS_CHECK_INTERVAL_MS` and just after a timed block ends, and publishes `ServiceRuntime.callsOffUntil` for the tile's top-left mark (`shared/calls-off.ts`). `allowCalls()` runs facebook's own mutation with `call_blocked_until: 0` and is called only from the tile menu's Turn On Incoming Calls. The hooks lean on facebook internals through the page's global `require` (`recipes/facebook-calls.ts`), so every failure fails closed: unknown is "not off", with one `can't read` Diagnostics line on the change. There is no Turn Off, and nothing turns calls on automatically.
```

- [ ] **Step 2: Lint the markdown**

Run: `npx --no-install markdownlint-cli2 CLAUDE.md docs/superpowers/specs/2026-10-03-messenger-calls-off-notice-design.md docs/superpowers/plans/2026-10-03-messenger-calls-off-notice.md`
Expected: `0 issues`.

- [ ] **Step 3: Full gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: all green.

- [ ] **Step 4: Live check (owner, packaged or dev build, signed in to Messenger)**

1. Messenger on screen → `View ▸ Toggle Developer Tools`, run:

   ```js
   (() => { const m = (n) => { const x = require(n); return x?.default ?? x; };
     return m('MWCallBlockedUntilSettingMutation').commit(m('CometRelayEnvironment'), { call_blocked_until: -1 }); })()
   ```

2. Reload Messenger (⌘R). Once the chat is up, the crossed-out phone appears on the Messenger tile; its tooltip reads `Incoming calls are off on Facebook — right-click to turn on`; Settings → Diagnostics shows `[recipe] messenger: incoming calls are off in Facebook's chat settings`.
3. Right-click the tile → **Turn On Incoming Calls**. The mark disappears; Diagnostics gains nothing.
4. Re-run the probe snippet from the investigation: `callBlockedUntil` reads `0`. A test call shows facebook's Accept/Decline dialog and a Goetia "Incoming call" banner.

- [ ] **Step 5: Checkpoint** — ask the owner to run `/grimoire-core:commit` (suggested: `docs: guardrail for facebook's calls-off switch`), or, under auto run, the single commit for the whole feature (suggested: `feat(messenger): show and turn on facebook's calls-off switch from the tile`).
