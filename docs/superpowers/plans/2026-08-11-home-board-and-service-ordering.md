# Home Board and Service Ordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sort the service catalog by name, keep Home's Unbound list in name order and searchable, append newly summoned services to the end of the rail, allow drag-to-reorder on Home as well as the rail, and restructure Home into a fixed header / scrolling bands / pinned footer board that never scrolls the page.

**Architecture:** Pure decision logic lands in `src/shared/welcome.ts` (process-agnostic, unit-tested) and one new renderer helper `src/renderer/src/components/reorder.ts`. `Welcome.tsx` splits into a thin composition plus three presentational components. No new IPC channel: `settings:update` carries a wider payload and `service:reorder` gains a second caller, and both are already in `SHELL_ONLY_CHANNELS`.

**Tech Stack:** Electron 3x + electron-vite, React 19, Tailwind CSS v4 (tokens in `src/renderer/src/tokens.css`), Zustand (`store.ts`), vitest for unit tests, Playwright (`_electron`) for e2e, Biome for lint/format.

**Source spec:** `docs/superpowers/specs/2026-08-11-home-board-and-service-ordering-design.md`

## Global Constraints

- **Never run `git commit`.** The repo owner commits only through `/grimoire-core:commit` after confirming a drafted message. Every task ends by running the gate and **stopping to ask the owner to run `/commit`**. Do not create `GRIMOIRE_COMMIT_MSG.txt`. Do not use `git commit --amend`.
- **Definition of done for every task:** `corepack pnpm lint`, `corepack pnpm typecheck`, and `corepack pnpm test` all green. Tasks that touch main/preload/renderer wiring also run `corepack pnpm e2e`.
- **E2E needs `ELECTRON_RUN_AS_NODE` unset.** VS Code shells export it and it breaks Playwright's Electron launch. Always run e2e as `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`.
- **`src/shared/**` stays process-agnostic** — no `electron` imports, no DOM imports. It is bundled into both main and the sandboxed preload.
- **No new IPC channel.** If a step seems to need one, stop and raise it.
- **Comments explain why, not what.** Match the surrounding file's density. No changelog or "added X" comments.
- **Baseline before you start:** `corepack pnpm test` is 49 files / 301 tests green at commit `50a449d`.

---

## File Structure

**Created:**

| File | Responsibility |
| --- | --- |
| `src/renderer/src/components/reorder.ts` | `moveTo` — the rail's drag-drop index arithmetic, extracted so Home can share it |
| `src/renderer/src/components/welcome/PickTile.tsx` | One picker tile; drag source/target when given `onReorder` |
| `src/renderer/src/components/welcome/ServiceBand.tsx` | Band chrome: label row, aside slot, scroll container |
| `src/renderer/src/components/welcome/WelcomeIntro.tsx` | Portal, title, tagline, three tip cards — first run only |
| `tests/unit/reorder.test.ts` | `moveTo` semantics |

**Modified:**

| File | Change |
| --- | --- |
| `src/shared/services.ts` | `SERVICES` re-sorted by name |
| `src/shared/types.ts:68` | `DEFAULT_SETTINGS.order` re-sorted to match |
| `src/shared/welcome.ts` | `+byName`, `+matchesQuery`, `+summonOrder`; `welcomeSections` gains a `named` parameter |
| `src/renderer/src/components/Welcome.tsx` | Restructured into the board; owns `selected` + `query` state |
| `src/renderer/src/components/Rail.tsx:54-60` | Uses `moveTo` |
| `tests/unit/services.test.ts` | New id order + a sorted-by-name invariant |
| `tests/unit/settings.test.ts` | Four order expectations |
| `tests/unit/activation-rules.test.ts:45-55` | One expectation |
| `tests/unit/startup-surface.test.ts` | Two expectations |
| `tests/unit/welcome.test.ts` | Rewritten for the new signature + new helpers |
| `tests/e2e/welcome.spec.ts` | Two assertions + a new append-order test |
| `tests/e2e/home.spec.ts` | New search and drag tests |

---

## Task 1: Catalog ships in name order

Re-sorting `SERVICES` breaks exactly **10 tests in 5 files** — all of them fixtures asserting the old order, none of them behaviour. Every replacement value below was computed by running the suite against the reordered catalog, so use them verbatim rather than deriving your own.

**Files:**

- Modify: `src/shared/services.ts`
- Modify: `src/shared/types.ts:68`
- Test: `tests/unit/services.test.ts`, `tests/unit/settings.test.ts`, `tests/unit/activation-rules.test.ts`, `tests/unit/startup-surface.test.ts`, `tests/unit/welcome.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: the catalog order `['discord', 'instagram', 'messenger', 'shopee', 'telegram', 'tiktok', 'whatsapp', 'zalo']`, relied on by every later task.

- [ ] **Step 1: Write the failing invariant test**

In `tests/unit/services.test.ts`, replace the id array in the first test and add the invariant:

```ts
  it('has exactly the eight spec services, unique, https', () => {
    expect(SERVICES.map((s) => s.id)).toEqual([
      'discord',
      'instagram',
      'messenger',
      'shopee',
      'telegram',
      'tiktok',
      'whatsapp',
      'zalo',
    ]);
    expect(new Set(SERVICES.map((s) => s.id)).size).toBe(8);
    for (const s of SERVICES) expect(s.url).toMatch(/^https:\/\//);
  });

  it('ships in display-name order, so the shipped default is predictable', () => {
    const names = SERVICES.map((s) => s.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `corepack pnpm test tests/unit/services.test.ts`
Expected: FAIL — both tests, because the catalog is still in the old order.

- [ ] **Step 3: Re-sort the catalog**

Rewrite `src/shared/services.ts`. Each entry moves **with its comment**; nothing inside an entry changes:

```ts
import type { ServiceId, ServiceMeta } from './types';

/** Sorted by display name — the shipped default order, and the order Home's
 *  Unbound list always uses. Keep new entries in name order. */
export const SERVICES: ServiceMeta[] = [
  {
    id: 'discord',
    name: 'Discord',
    url: 'https://discord.com/channels/@me',
    color: '#5865F2',
    waitForReady: true,
  },
  // DMs only — land on /direct/inbox, never the feed. Selectors follow
  // Meta's messenger DOM language but are uncalibrated until a live login
  // pass.
  {
    id: 'instagram',
    name: 'Instagram',
    url: 'https://www.instagram.com/direct/inbox/',
    color: '#E4405F',
    waitForReady: true,
  },
  // messenger.com redirects logged-in users into facebook.com — target Messages directly
  {
    id: 'messenger',
    name: 'Messenger',
    url: 'https://www.facebook.com/messages/',
    color: '#0084FF',
    waitForReady: true,
  },
  // buyer chat lives in the mini-chat widget on the shopping site; the
  // recipe css reshapes it to fill the view. Never target /webchat —
  // it hits Shopee's anti-bot wall (verify/captcha, scene=crawler_item)
  { id: 'shopee', name: 'Shopee', url: 'https://shopee.vn/', color: '#EE4D2D', waitForReady: true },
  {
    id: 'telegram',
    name: 'Telegram',
    url: 'https://web.telegram.org/k/',
    color: '#26A5E4',
    waitForReady: true,
  },
  // DMs only — land on /messages, not the feed (messenger-style). The
  // recipe's data-e2e hooks are uncalibrated until a live login pass.
  {
    id: 'tiktok',
    name: 'TikTok',
    url: 'https://www.tiktok.com/messages',
    color: '#FE2C55',
    waitForReady: true,
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    url: 'https://web.whatsapp.com/',
    color: '#25D366',
    waitForReady: true,
  },
  // keepRendered: Zalo idles into a "Kích hoạt" modal and unmounts its UI when
  // it believes the tab is hidden — badges freeze and trusted clicks can't
  // reach a hidden view to reactivate it. Never let it think it's hidden.
  {
    id: 'zalo',
    name: 'Zalo',
    url: 'https://chat.zalo.me/',
    color: '#0068FF',
    keepRendered: true,
    waitForReady: true,
  },
];

export function serviceById(id: ServiceId): ServiceMeta {
  const svc = SERVICES.find((s) => s.id === id);
  if (!svc) throw new Error(`unknown service: ${id}`);
  return svc;
}
```

- [ ] **Step 4: Re-sort the default order**

In `src/shared/types.ts`, replace line 68:

```ts
  order: ['discord', 'instagram', 'messenger', 'shopee', 'telegram', 'tiktok', 'whatsapp', 'zalo'],
```

Leave `muted`, `disabled`, and `neverHibernate` exactly as they are — they are keyed records, not arrays, so their key order is irrelevant.

- [ ] **Step 5: Run the catalog test to verify it passes**

Run: `corepack pnpm test tests/unit/services.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Run the full suite to see the fixture fallout**

Run: `corepack pnpm test`
Expected: FAIL — 9 tests across `settings.test.ts` (4), `activation-rules.test.ts` (1), `startup-surface.test.ts` (2), `welcome.test.ts` (2).

- [ ] **Step 7: Fix `tests/unit/settings.test.ts` — four expectations**

7a. Line 16, `returns defaults on first run`:

```ts
    expect(store.get().order[0]).toBe('discord');
```

7b. `surfaces services added after settings.json was written` — the expected order and the comment above it both change. `normalize()` slots an unseen id after its nearest catalog predecessor, and with an alphabetical catalog those predecessors differ, so the new ids scatter through the legacy order instead of clustering:

```ts
    const s = new SettingsStore(dir).get();
    // an unseen id lands after its nearest catalog predecessor, so against a
    // legacy order the new ids scatter. Harmless: they all arrive disabled, and
    // summoning moves a service to the end of the rail regardless (summonOrder).
    expect(s.order).toEqual([
      'messenger',
      'shopee',
      'telegram',
      'tiktok',
      'zalo',
      'whatsapp',
      'discord',
      'instagram',
    ]);
```

Leave every `muted` / `disabled` / `neverHibernate` assertion in that test untouched — they still hold.

7c. `drops unknown service ids from a persisted order`:

```ts
    expect(s.order).toEqual([
      'discord',
      'instagram',
      'messenger',
      'shopee',
      'telegram',
      'tiktok',
      'whatsapp',
      'zalo',
    ]);
```

7d. `keeps a user reordering while slotting new services after their predecessor` — rename it and assert the property that actually matters, which no longer depends on where in the catalog the newcomer sits:

```ts
  it('keeps a user reordering when a new service arrives', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    // user moved messenger to the end; that must survive, wherever instagram lands
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({
        order: ['telegram', 'zalo', 'whatsapp', 'discord', 'tiktok', 'shopee', 'messenger'],
      }),
    );
    const s = new SettingsStore(dir).get();
    expect(s.order).toEqual([
      'telegram',
      'zalo',
      'whatsapp',
      'discord',
      'instagram',
      'tiktok',
      'shopee',
      'messenger',
    ]);
    // the property the user can actually see: their arrangement is intact
    expect(s.order.filter((id) => id !== 'instagram')).toEqual([
      'telegram',
      'zalo',
      'whatsapp',
      'discord',
      'tiktok',
      'shopee',
      'messenger',
    ]);
  });
```

- [ ] **Step 8: Fix `tests/unit/activation-rules.test.ts` — one expectation**

In `falls to the first enabled service in rail order`, flip the comment and the expectation:

```ts
  it('falls to the first enabled service in rail order', () => {
    // whatsapp precedes zalo in the default order
    expect(
      resolveActivation({
        order,
        disabled: rec(['whatsapp', 'zalo']),
        activeId: 'messenger',
        hasActiveView: false,
      }),
    ).toBe('whatsapp');
  });
```

- [ ] **Step 9: Fix `tests/unit/startup-surface.test.ts` — two expectations**

9a. `falls to rail order when nothing was ever recorded`:

```ts
    ).toEqual({ activeId: 'whatsapp', homeOpen: false });
```

9b. `falls back in rail order, not catalog order` — flip the comment and the expectation:

```ts
  it('falls back in rail order, not catalog order', () => {
    // whatsapp precedes zalo in the default order
    expect(
      resolveStartupSurface({
        order,
        disabled: rec(['whatsapp', 'zalo']),
        lastActiveId: 'discord',
        lastHomeOpen: false,
      }).activeId,
    ).toBe('whatsapp');
  });
```

- [ ] **Step 10: Fix `tests/unit/welcome.test.ts` — two expectations**

10a. `splits a mixed set`:

```ts
  it('splits a mixed set', () => {
    expect(welcomeSections(order, set('messenger', 'zalo'))).toEqual({
      summoned: ['messenger', 'zalo'],
      unbound: ['discord', 'instagram', 'shopee', 'telegram', 'tiktok', 'whatsapp'],
    });
  });
```

10b. `lists each section in rail order, not enabled-set order` — the old fixture used shopee/telegram, which now sort the same way in both, defeating the test. Swap to a pair that still disagrees:

```ts
  it('lists each section in rail order, not enabled-set order', () => {
    // 'zalo' is last in order but first into the Set
    expect(welcomeSections(order, set('zalo', 'discord')).summoned).toEqual(['discord', 'zalo']);
  });
```

- [ ] **Step 11: Run the full gate**

```bash
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test
```

Expected: all green, 49 files / 302 tests (301 baseline + the new invariant).

- [ ] **Step 12: Stop and request a commit**

Do not run `git commit`. Report what changed and ask the owner to run `/grimoire-core:commit`. Suggested subject: `refactor(services): sort the catalog by name`.

---

## Task 2: Extract the rail's reorder arithmetic

`Rail.tsx` computes drag-drop indices inline. Home needs the same arithmetic, so it moves to a tested helper **before** anything else consumes it. This task changes no behaviour.

**Files:**

- Create: `src/renderer/src/components/reorder.ts`
- Create: `tests/unit/reorder.test.ts`
- Modify: `src/renderer/src/components/Rail.tsx:54-60`

**Interfaces:**

- Consumes: `ServiceId` from `src/shared/types.ts`.
- Produces: `moveTo(ids: ServiceId[], fromId: ServiceId, toId: ServiceId): ServiceId[]` — returns a new array, never mutates its input. Task 7 calls it from Home.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/reorder.test.ts`. Every expectation below was verified against the rail's existing splice sequence — do not "correct" them:

```ts
import { describe, expect, it } from 'vitest';
import { moveTo } from '../../src/renderer/src/components/reorder';
import type { ServiceId } from '../../src/shared/types';

const base = ['discord', 'instagram', 'messenger', 'shopee'] as ServiceId[];

describe('moveTo', () => {
  // `to` is resolved before the removal, so a forward move lands one slot short
  // of the target's old index. This is the rail's shipped behavior, pinned here
  // so the extraction cannot quietly change it.
  it('drops a forward move one slot short of the target', () => {
    expect(moveTo(base, 'discord', 'messenger')).toEqual([
      'instagram',
      'messenger',
      'discord',
      'shopee',
    ]);
  });

  it('drops a backward move onto the target slot', () => {
    expect(moveTo(base, 'shopee', 'instagram')).toEqual([
      'discord',
      'shopee',
      'instagram',
      'messenger',
    ]);
  });

  it('swaps adjacent ids', () => {
    expect(moveTo(base, 'discord', 'instagram')).toEqual([
      'instagram',
      'discord',
      'messenger',
      'shopee',
    ]);
  });

  it('is a no-op onto itself', () => {
    expect(moveTo(base, 'instagram', 'instagram')).toEqual(base);
  });

  it('is a no-op for an id that is not in the list', () => {
    expect(moveTo(base, 'discord', 'zalo')).toEqual(base);
  });

  it('never mutates its input', () => {
    const input = [...base];
    moveTo(input, 'discord', 'shopee');
    expect(input).toEqual(base);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `corepack pnpm test tests/unit/reorder.test.ts`
Expected: FAIL — cannot resolve `../../src/renderer/src/components/reorder`.

- [ ] **Step 3: Write the helper**

Create `src/renderer/src/components/reorder.ts`:

```ts
import type { ServiceId } from '../../../shared/types';

/** Move `fromId` into `toId`'s slot. Splice semantics are the rail's original:
 *  `to` is resolved before the removal, so a forward move lands one slot short
 *  of the target's old index. The unknown-id guard is the one addition — the
 *  helper now has two callers and a -1 index would splice from the end. */
export function moveTo(ids: ServiceId[], fromId: ServiceId, toId: ServiceId): ServiceId[] {
  const next = [...ids];
  const from = next.indexOf(fromId);
  const to = next.indexOf(toId);
  if (from === -1 || to === -1) return next;
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `corepack pnpm test tests/unit/reorder.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Point the rail at the helper**

In `src/renderer/src/components/Rail.tsx`, add the import beside the existing ones:

```ts
import { moveTo } from './reorder';
```

Replace the `reorder` closure (lines 54-60) with:

```ts
  const reorder = (fromId: string, toId: string) => {
    const ids = moveTo(
      state.services.map((s) => s.id),
      fromId as ServiceId,
      toId as ServiceId,
    );
    window.goetia.send('service:reorder', { orderedIds: ids });
  };
```

- [ ] **Step 6: Run the gate, including e2e**

```bash
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test
env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e
```

Expected: all green. E2E matters here because rail drag-drop has no unit coverage — the e2e suite passing is the proof the extraction was faithful.

- [ ] **Step 7: Stop and request a commit**

Suggested subject: `refactor(rail): extract moveTo so Home can reorder too`.

---

## Task 3: Pure helpers for name order, filtering, and append-on-summon

All three rules land as pure functions first, with no UI wired to them. `welcomeSections` changes signature, so `Welcome.tsx` gets a one-line update to keep `typecheck` green — nothing else in the UI moves yet.

**Files:**

- Modify: `src/shared/welcome.ts`
- Modify: `src/renderer/src/components/Welcome.tsx` (one call site only)
- Test: `tests/unit/welcome.test.ts`

**Interfaces:**

- Consumes: `ServiceMeta` / `ServiceId` from `src/shared/types.ts`.
- Produces, all from `src/shared/welcome.ts`:
  - `byName(services: readonly ServiceMeta[]): ServiceId[]`
  - `matchesQuery(name: string, query: string): boolean`
  - `summonOrder(order: ServiceId[], enabled: ReadonlySet<ServiceId>, selected: ReadonlySet<ServiceId>, named: ServiceId[]): ServiceId[]`
  - `welcomeSections(order: ServiceId[], enabled: ReadonlySet<ServiceId>, named: ServiceId[]): WelcomeSections` — **third parameter is new**

- [ ] **Step 1: Write the failing tests**

In `tests/unit/welcome.test.ts`, extend the imports and add these blocks. Keep every existing `summonDelta` and `summonLabel` block untouched:

```ts
import { DEFAULT_SETTINGS, type ServiceId, type ServiceMeta } from '../../src/shared/types';
import {
  byName,
  matchesQuery,
  summonDelta,
  summonLabel,
  summonOrder,
  welcomeSections,
} from '../../src/shared/welcome';

const meta = (id: ServiceId, name: string): ServiceMeta => ({
  id,
  name,
  url: 'https://example.test/',
  color: '#000000',
});
const named = DEFAULT_SETTINGS.order;

describe('byName', () => {
  it('sorts ids by display name, not by the order given', () => {
    expect(
      byName([meta('zalo', 'Zalo'), meta('discord', 'Discord'), meta('tiktok', 'TikTok')]),
    ).toEqual(['discord', 'tiktok', 'zalo']);
  });

  it('is empty for an empty catalog', () => {
    expect(byName([])).toEqual([]);
  });
});

describe('matchesQuery', () => {
  it('matches everything on an empty or whitespace query', () => {
    expect(matchesQuery('Telegram', '')).toBe(true);
    expect(matchesQuery('Telegram', '   ')).toBe(true);
  });

  it('matches a substring regardless of case', () => {
    expect(matchesQuery('Telegram', 'gram')).toBe(true);
    expect(matchesQuery('WhatsApp', 'APP')).toBe(true);
  });

  it('does not match a non-substring', () => {
    expect(matchesQuery('Telegram', 'zalo')).toBe(false);
  });

  // the whole reason this is not fuzzyScore: fuzzy matches both, which reads as
  // a bug in a grid you are looking at
  it('rejects a subsequence that is not a substring', () => {
    expect(matchesQuery('Telegram', 'tg')).toBe(false);
    expect(matchesQuery('Instagram', 'tg')).toBe(false);
  });
});

describe('summonOrder', () => {
  const order = DEFAULT_SETTINGS.order;

  it('appends a newly summoned service to the end', () => {
    expect(summonOrder(order, set('zalo'), set('zalo', 'discord'), named)).toEqual([
      'instagram',
      'messenger',
      'shopee',
      'telegram',
      'tiktok',
      'whatsapp',
      'zalo',
      'discord',
    ]);
  });

  it('appends several in name order, whatever the catalog order was', () => {
    expect(summonOrder(order, set(), set('whatsapp', 'discord', 'messenger'), named).slice(-3)).toEqual(
      ['discord', 'messenger', 'whatsapp'],
    );
  });

  it('leaves a banished service in its slot', () => {
    expect(summonOrder(order, set('discord', 'messenger'), set('discord'), named)).toEqual(order);
  });

  it('appends a previously banished service when it returns', () => {
    const after = summonOrder(order, set(), set('discord'), named);
    expect(after.at(-1)).toBe('discord');
  });

  it('returns an unchanged order when nothing is added', () => {
    expect(summonOrder(order, set('zalo'), set('zalo'), named)).toEqual(order);
  });

  it('never mutates its input', () => {
    const input = [...order];
    summonOrder(input, set(), set('discord'), named);
    expect(input).toEqual(order);
  });
});
```

Then replace the whole `welcomeSections` describe block:

```ts
describe('welcomeSections', () => {
  it('puts everything in unbound on a fresh install', () => {
    expect(welcomeSections(order, set(), named)).toEqual({ summoned: [], unbound: order });
  });

  it('puts everything in summoned when all are enabled', () => {
    expect(welcomeSections(order, set(...order), named)).toEqual({
      summoned: order,
      unbound: [],
    });
  });

  it('splits a mixed set', () => {
    expect(welcomeSections(order, set('messenger', 'zalo'), named)).toEqual({
      summoned: ['messenger', 'zalo'],
      unbound: ['discord', 'instagram', 'shopee', 'telegram', 'tiktok', 'whatsapp'],
    });
  });

  it('lists summoned in rail order, not enabled-set order', () => {
    // 'zalo' is last in order but first into the Set
    expect(welcomeSections(order, set('zalo', 'discord'), named).summoned).toEqual([
      'discord',
      'zalo',
    ]);
  });

  // the change this signature exists for: a reordered rail must not reshuffle
  // the pool of services the user has not chosen
  it('lists unbound in name order even when the rail disagrees', () => {
    const railOrder = ['zalo', 'whatsapp', 'tiktok', 'telegram'] as ServiceId[];
    const catalog = ['telegram', 'tiktok', 'whatsapp', 'zalo'] as ServiceId[];
    expect(welcomeSections(railOrder, set('zalo'), catalog).unbound).toEqual([
      'telegram',
      'tiktok',
      'whatsapp',
    ]);
  });

  it('ignores ids that are enabled but not in order', () => {
    expect(
      welcomeSections(['messenger', 'zalo'], set('messenger', 'discord'), ['messenger', 'zalo']),
    ).toEqual({ summoned: ['messenger'], unbound: ['zalo'] });
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `corepack pnpm test tests/unit/welcome.test.ts`
Expected: FAIL — `byName`, `matchesQuery`, and `summonOrder` are not exported.

- [ ] **Step 3: Write the helpers**

In `src/shared/welcome.ts`, widen the type import and append the three functions:

```ts
import type { ServiceId, ServiceMeta, Settings } from './types';

/** Catalog ids in display-name order — the Unbound order, and the order new
 *  arrivals append in. */
export function byName(services: readonly ServiceMeta[]): ServiceId[] {
  return [...services].sort((a, b) => a.name.localeCompare(b.name)).map((s) => s.id);
}

/** Unbound filter. Deliberately not the quick switcher's fuzzyScore: that ranks
 *  candidates for a jump-to, where a stray match costs one glance. This filters
 *  a grid the user is looking at, where "tg" surfacing Instagram alongside
 *  Telegram reads as a bug. */
export function matchesQuery(name: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  return q.length === 0 || name.toLowerCase().includes(q);
}

/** Order after a welcome-screen confirm. Newly summoned ids move to the end so
 *  an arrival lands where the user last looked; a banished id keeps its slot,
 *  and appends like any other arrival if it returns. `named` supplies the
 *  arrival order when several are summoned at once — the order they were
 *  sitting in under Unbound, since a Set carries no click order. */
export function summonOrder(
  order: ServiceId[],
  enabled: ReadonlySet<ServiceId>,
  selected: ReadonlySet<ServiceId>,
  named: ServiceId[],
): ServiceId[] {
  const added = named.filter((id) => selected.has(id) && !enabled.has(id));
  if (added.length === 0) return [...order];
  const moved = new Set(added);
  return [...order.filter((id) => !moved.has(id)), ...added];
}
```

- [ ] **Step 4: Widen `welcomeSections`**

Replace the existing function and its doc comment:

```ts
/** Partition for the Home picker. Summoned follows `order` — that list is the
 *  rail. Unbound follows `named`, because an unchosen pool has no meaningful
 *  order and a stable one is worth more than a mirrored one. Keyed on the LIVE
 *  enabled set, never the staged selection, so a tile never moves out from
 *  under the cursor mid-edit. */
export function welcomeSections(
  order: ServiceId[],
  enabled: ReadonlySet<ServiceId>,
  named: ServiceId[],
): WelcomeSections {
  return {
    summoned: order.filter((id) => enabled.has(id)),
    unbound: named.filter((id) => !enabled.has(id)),
  };
}
```

- [ ] **Step 5: Keep the caller compiling**

In `src/renderer/src/components/Welcome.tsx`, add `byName` to the existing import from `'../../../shared/welcome'`, then immediately below `const order = state.services.map((svc) => svc.id);` add:

```ts
  const named = byName(state.services);
```

and change the `welcomeSections` call to `welcomeSections(order, enabled, named)`. Nothing else in this file changes yet.

- [ ] **Step 6: Run the gate**

```bash
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test
```

Expected: all green. `tests/unit/welcome.test.ts` now covers `byName` (2), `matchesQuery` (4), `summonOrder` (6), `welcomeSections` (6).

- [ ] **Step 7: Stop and request a commit**

Suggested subject: `feat(welcome): add byName, matchesQuery, and summonOrder helpers`.

---

## Task 4: Summoning appends to the end of the rail

**Files:**

- Modify: `src/renderer/src/components/Welcome.tsx` (the `summon` closure only)
- Test: `tests/e2e/welcome.spec.ts`

**Interfaces:**

- Consumes: `summonOrder` and `named` from Task 3; `buildDisabledPatch` (existing).
- Produces: the `settings:update` payload now carries `order` alongside `disabled`.

- [ ] **Step 1: Write the failing e2e test**

Append to `tests/e2e/welcome.spec.ts`. The assertion order is the whole point — Instagram sorts first alphabetically and must still land **last**:

```ts
test('summoning appends to the end of the rail, not to catalog position', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-'));
  const { app, win } = await launch(profile);

  const welcome = win.locator('[data-testid="welcome"]');
  const unbound = welcome.locator('[data-testid="welcome-section-unbound"]');
  const railTiles = win.locator('[data-testid="service-tile"]');

  // two at once arrive in name order
  await unbound.getByRole('button', { name: 'Telegram' }).click();
  await unbound.getByRole('button', { name: 'Discord' }).click();
  await win.getByRole('button', { name: 'Summon 2 services' }).click();
  await expect(railTiles).toHaveCount(2);
  expect(await railTiles.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual(
    ['Discord', 'Telegram'],
  );

  // a later arrival goes last even though it sorts first
  await win.locator('[data-testid="home-btn"]').click();
  await welcome
    .locator('[data-testid="welcome-section-unbound"]')
    .getByRole('button', { name: 'Instagram' })
    .click();
  await win.getByRole('button', { name: 'Summon 1 service' }).click();
  await expect(railTiles).toHaveCount(3);
  expect(await railTiles.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual(
    ['Discord', 'Telegram', 'Instagram'],
  );

  await app.close();
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e tests/e2e/welcome.spec.ts`
Expected: FAIL on the last assertion — Instagram lands at index 1, giving `['Discord', 'Instagram', 'Telegram']`, because order still comes from the catalog.

- [ ] **Step 3: Send the new order with the patch**

In `src/renderer/src/components/Welcome.tsx`, add `summonOrder` to the import from `'../../../shared/welcome'` and replace the `summon` closure:

```ts
  // one patch, not a reorder followed by an update: settings:update already
  // resolves activation and rebuilds the app menu against `after.order`, so
  // splitting it would broadcast a frame where order and enablement disagree
  const summon = () =>
    window.goetia.send('settings:update', {
      disabled: buildDisabledPatch(order, selected),
      order: summonOrder(order, enabled, selected, named),
    });
```

- [ ] **Step 4: Run the e2e test to verify it passes**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e tests/e2e/welcome.spec.ts`
Expected: PASS.

- [ ] **Step 5: Run the full gate**

```bash
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test
env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e
```

Expected: all green.

- [ ] **Step 6: Stop and request a commit**

Suggested subject: `feat(home): summon appends new services to the end of the rail`.

---

## Task 5: The board layout

The structural task. Home becomes a fixed header, a flexible board of bands that scroll inside themselves, and a pinned action bar — so the tile areas are the only thing that can grow, and they grow into their own scroll containers rather than into the page.

**Files:**

- Create: `src/renderer/src/components/welcome/PickTile.tsx`
- Create: `src/renderer/src/components/welcome/ServiceBand.tsx`
- Create: `src/renderer/src/components/welcome/WelcomeIntro.tsx`
- Modify: `src/renderer/src/components/Welcome.tsx` (restructured)
- Test: `tests/e2e/welcome.spec.ts:29-32`, `tests/e2e/home.spec.ts` (regression only)

**Interfaces:**

- Consumes: `welcomeSections`, `byName`, `summonOrder`, `buildDisabledPatch`, `summonDelta`, `summonLabel`.
- Produces: `PickTile` with props `{ service: ServiceMeta; on: boolean; onToggle(): void }` — Task 7 adds an optional `onReorder`. `ServiceBand` with props `{ testid: string; label: string; count: number; aside?: React.ReactNode; className?: string; children: React.ReactNode }`. Both bands keep `data-testid="welcome-section-summoned"` / `-unbound`; the fresh-install band is the unbound one, relabelled. `PickTile` carries `data-testid="pick-tile"`, `WelcomeIntro` carries `data-testid="welcome-intro"`.

- [ ] **Step 1: Update the two e2e assertions that the first-run state invalidates**

In `tests/e2e/welcome.spec.ts`, replace lines 28-32. The fresh-install state has no Summoned band at all, and the Unbound band can now hold a non-tile button, so a role-based count is fragile:

```ts
  // nothing is summoned yet: the intro carries the screen and all eight wait below
  const unbound = welcome.locator('[data-testid="welcome-section-unbound"]');
  await expect(welcome.locator('[data-testid="welcome-intro"]')).toBeVisible();
  await expect(unbound.locator('[data-testid="pick-tile"]')).toHaveCount(8);
```

Delete the now-unused `const summoned = …` on line 29 **only if** nothing later in that test uses it — line 45 does (`summoned.getByRole('button', { name: 'Zalo' })`). Keep the declaration and leave line 45 alone: it asserts a count of 0, which a non-existent band satisfies.

- [ ] **Step 2: Run it to make sure it fails**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e tests/e2e/welcome.spec.ts`
Expected: FAIL — no element matches `[data-testid="welcome-intro"]`.

- [ ] **Step 3: Create `PickTile`**

Create `src/renderer/src/components/welcome/PickTile.tsx`, moving the component out of `Welcome.tsx` unchanged apart from the testid and the truncating label:

```tsx
import type React from 'react';
import type { ServiceMeta } from '../../../../shared/types';

const logos = import.meta.glob<string>('../../assets/logos/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

interface Props {
  service: ServiceMeta;
  on: boolean;
  onToggle(): void;
}

export default function PickTile({ service, on, onToggle }: Props) {
  const logo = logos[`../../assets/logos/${service.id}.svg`];
  // same molten-squircle language as the rail's active tile
  const face = on
    ? `scale-105 bg-linear-to-br from-[#FFB43D] via-[#FF8A2A] to-[#F04E3E] text-[#15181F]
       shadow-[0_0_10px_rgba(255,158,44,0.45),0_2px_14px_rgba(240,78,62,0.5)]`
    : `bg-bg-2 text-accent opacity-70 group-hover:opacity-100
       group-hover:shadow-[0_0_0_1px_rgba(255,158,44,0.35)]`;
  return (
    <button
      type="button"
      data-testid="pick-tile"
      aria-pressed={on}
      onClick={onToggle}
      title={service.name}
      className="group flex w-[76px] flex-col items-center gap-1.5 rounded-tile p-1 outline-none
        focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-[15px] transition-all
          duration-150 ease-out ${face}`}
      >
        <span
          className="glyph h-6 w-6"
          style={{ '--glyph': `url("${logo}")` } as React.CSSProperties}
        />
      </span>
      {/* a two-line name would push its whole row taller than its neighbours */}
      <span className={`max-w-full truncate ${on ? 'text-text-1' : 'text-text-2'}`}>
        {service.name}
      </span>
    </button>
  );
}
```

- [ ] **Step 4: Create `ServiceBand`**

Create `src/renderer/src/components/welcome/ServiceBand.tsx`. The band owns chrome and scrolling only; the caller decides whether to render tiles or an empty line:

```tsx
import type React from 'react';

interface Props {
  testid: string;
  label: string;
  count: number;
  /** right-aligned slot on the label row — costs no vertical height */
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export default function ServiceBand({
  testid,
  label,
  count,
  aside,
  className = '',
  children,
}: Props) {
  return (
    <section
      data-testid={testid}
      className={`flex min-h-0 flex-col gap-2.5 rounded-modal border border-border bg-bg-1
        px-4 pb-4 pt-3.5 ${className}`}
    >
      <div className="flex flex-none items-center gap-2 text-xs uppercase tracking-wide text-text-2">
        <span>{label}</span>
        <span className="tabular">· {count}</span>
        <span className="flex-1" />
        {aside}
      </div>
      {/* the scroll container: growth stops here and never reaches the page */}
      <div className="min-h-0 overflow-y-auto">{children}</div>
    </section>
  );
}
```

- [ ] **Step 5: Create `WelcomeIntro`**

Create `src/renderer/src/components/welcome/WelcomeIntro.tsx`, moving `ChatIcon`, `LockIcon`, `MoonIcon`, and `Tip` out of `Welcome.tsx` verbatim:

```tsx
import type React from 'react';
import Portal from '../Portal';

function ChatIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a8 8 0 0 1-8 8H4l2.5-3A8 8 0 1 1 21 12Z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5Z" />
    </svg>
  );
}

function Tip({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="w-60 rounded-modal border border-border bg-bg-1 px-4 py-3">
      <p className="flex items-center gap-2 font-semibold text-text-1">
        <span className="text-accent">{icon}</span>
        {title}
      </p>
      <p className="mt-1 text-text-2">{body}</p>
    </div>
  );
}

/** First run only. The tips are onboarding: they earn their space once, and
 *  reclaiming it is what gives the steady-state board room to spare. */
export default function WelcomeIntro() {
  return (
    <div
      data-testid="welcome-intro"
      className="flex flex-none flex-col items-center gap-3.5 px-10 pb-1 pt-6"
    >
      <Portal className="h-24 w-24" />
      <div className="text-center">
        <h1 className="text-xl font-semibold text-text-1">Welcome to Goetia</h1>
        <p className="mt-1 text-text-2">All your chats. Nothing else.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Tip
          icon={<ChatIcon />}
          title="Chat only"
          body="No feeds, no shops. Reload (⌘/Ctrl R) returns to the chat."
        />
        <Tip
          icon={<LockIcon />}
          title="Stays signed in"
          body="Each service keeps its own session. Sign in once."
        />
        <Tip
          icon={<MoonIcon />}
          title="Quiet & light"
          body="Only messages for you get a count. Idle chats sleep."
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Restructure `Welcome.tsx`**

Replace the whole file. The `selected` seeding effect and the Escape handler keep their existing behaviour; only the markup below `if (!state) return null;` is new:

```tsx
import { useEffect, useState } from 'react';
import type { ServiceId } from '../../../shared/types';
import {
  buildDisabledPatch,
  byName,
  summonDelta,
  summonLabel,
  summonOrder,
  welcomeSections,
} from '../../../shared/welcome';
import { useShell } from '../store';
import Portal from './Portal';
import PickTile from './welcome/PickTile';
import ServiceBand from './welcome/ServiceBand';
import WelcomeIntro from './welcome/WelcomeIntro';

export default function Welcome() {
  const state = useShell((s) => s.state);
  const enabledKey = state
    ? state.services
        .filter((svc) => !state.settings.disabled[svc.id])
        .map((svc) => svc.id)
        .join(',')
    : '';
  const [selected, setSelected] = useState<ReadonlySet<ServiceId>>(new Set());

  // Re-seed every time the screen becomes visible or the live set changes, so
  // a discarded edit never survives to the next visit. A fresh install has an
  // empty enabled set, which reproduces the original empty selection.
  useEffect(() => {
    setSelected(new Set(enabledKey ? (enabledKey.split(',') as ServiceId[]) : []));
  }, [enabledKey]);

  // Home is a place, not a modal — but Escape is the reflex. Guarded the way
  // SettingsView guards its own handler: only when nothing is layered on top,
  // and never when there is no service to go back to.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const s = useShell.getState().state;
      if (!s?.homeOpen || s.settingsOpen || s.switcherOpen) return;
      if (s.services.every((svc) => s.settings.disabled[svc.id])) return;
      window.goetia.send('home:setOpen', { open: false });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!state) return null;

  const toggle = (id: ServiceId) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const enabled = new Set<ServiceId>(
    state.services.filter((svc) => !state.settings.disabled[svc.id]).map((svc) => svc.id),
  );
  const order = state.services.map((svc) => svc.id);
  const named = byName(state.services);
  const { label, disabled } = summonLabel(summonDelta(order, enabled, selected), enabled.size > 0);

  // sections follow the LIVE enabled set; the tile glow follows `selected`.
  // Keeping the two axes independent is what stops a tile jumping out from
  // under the cursor when it is deselected.
  const byId = new Map(state.services.map((svc) => [svc.id, svc]));
  const sections = welcomeSections(order, enabled, named);
  const pick = (ids: ServiceId[]) =>
    ids.map((id) => byId.get(id)).filter((svc) => svc !== undefined);
  const fresh = sections.summoned.length === 0;

  const summon = () =>
    window.goetia.send('settings:update', {
      disabled: buildDisabledPatch(order, selected),
      order: summonOrder(order, enabled, selected, named),
    });
  // the same reseed the screen does on every visit, under the user's thumb
  const dispel = () => setSelected(enabled);

  const tiles = (ids: ServiceId[]) => (
    <div className="flex flex-wrap gap-2">
      {pick(ids).map((svc) => (
        <PickTile
          key={svc.id}
          service={svc}
          on={selected.has(svc.id)}
          onToggle={() => toggle(svc.id)}
        />
      ))}
    </div>
  );
  const emptyLine = (text: string) => <p className="text-xs text-text-2 opacity-70">{text}</p>;

  return (
    <div data-testid="welcome" className="flex min-h-0 flex-1 flex-col bg-bg-0">
      {fresh ? (
        <WelcomeIntro />
      ) : (
        <header className="flex h-14 flex-none items-center gap-3 border-b border-border bg-bg-1 px-6">
          <Portal className="h-[26px] w-[26px]" />
          <span className="font-semibold text-text-1">Goetia</span>
          <span className="text-text-2">All your chats. Nothing else.</span>
          <span className="tabular ml-auto text-xs text-text-2">
            {sections.summoned.length} of {state.services.length} summoned
          </span>
        </header>
      )}

      {/* the board: min-h-0 is what lets the bands shrink instead of the page grow */}
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 px-6 py-4">
        {!fresh && (
          // capped so a long summoned list can never crowd Unbound out
          <ServiceBand
            testid="welcome-section-summoned"
            label="Summoned"
            count={sections.summoned.length}
            className="max-h-[46%]"
            aside={
              sections.summoned.length > 1 ? (
                <span className="text-[11px] normal-case tracking-normal opacity-75">
                  drag to reorder
                </span>
              ) : undefined
            }
          >
            {tiles(sections.summoned)}
          </ServiceBand>
        )}
        <ServiceBand
          testid="welcome-section-unbound"
          label={fresh ? 'Choose your services' : 'Unbound'}
          count={sections.unbound.length}
        >
          {sections.unbound.length === 0
            ? emptyLine('Every one is bound.')
            : tiles(sections.unbound)}
        </ServiceBand>
      </div>

      <footer className="flex h-15 flex-none items-center gap-3 border-t border-border bg-bg-1 px-6">
        <span className="text-xs text-text-2">
          Pick at least one — come back here anytime with ⌘/Ctrl 0.
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={dispel}
            className="rounded-ctl border border-border bg-bg-2 px-4 py-2 text-text-1
              transition-colors duration-120 enabled:hover:border-accent disabled:opacity-40"
          >
            Dispel
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={summon}
            className="tabular rounded-ctl bg-linear-to-br from-[#FFB43D] via-[#FF8A2A] to-[#F04E3E]
              px-6 py-2 font-semibold text-[#15181F] shadow-[0_0_12px_rgba(255,158,44,0.35)]
              transition-opacity duration-150 enabled:hover:opacity-90 disabled:opacity-40
              disabled:shadow-none"
          >
            {label}
          </button>
        </div>
      </footer>
    </div>
  );
}
```

- [ ] **Step 7: Run the e2e suite to verify the restructure**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`
Expected: PASS. The four `home.spec.ts` tests operate in the steady state and must pass **unchanged** — that is the regression bar for this task. If any of them fail, the band testids or the button markup drifted; fix the markup, not the test.

- [ ] **Step 8: Verify the height budget by hand**

Run: `corepack pnpm dev`. With the window at its default 1280×820, confirm on a fresh profile and with services summoned that Home shows **no scrollbar**, the header and the Dispel/Summon row are both visible without scrolling, and the tip cards sit on one row on first run. Then drag the window down to its 600px minimum and confirm the bands scroll internally while the footer stays pinned.

- [ ] **Step 9: Run the full gate**

```bash
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test
env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e
```

- [ ] **Step 10: Stop and request a commit**

Suggested subject: `feat(home): restructure into a header, scrolling bands, and a pinned action bar`.

---

## Task 6: Search the unbound list

**Files:**

- Modify: `src/renderer/src/components/Welcome.tsx`
- Test: `tests/e2e/home.spec.ts`

**Interfaces:**

- Consumes: `matchesQuery` from Task 3; `ServiceBand`'s `aside` slot from Task 5.
- Produces: no new exports.

- [ ] **Step 1: Write the failing e2e test**

Append to `tests/e2e/home.spec.ts`. `launch()` in that file writes a profile with **Messenger and Zalo** enabled, leaving six unbound: Discord, Instagram, Shopee, Telegram, TikTok, WhatsApp.

```ts
test('home: search filters unbound, and Escape clears it before leaving', async () => {
  const { app, win } = await launch();
  const welcome = win.locator('[data-testid="welcome"]');

  await win.locator('[data-testid="home-btn"]').click();
  const unbound = welcome.locator('[data-testid="welcome-section-unbound"]');
  const tiles = unbound.locator('[data-testid="pick-tile"]');
  await expect(tiles).toHaveCount(6);

  const search = unbound.getByRole('textbox', { name: 'Search unbound services' });
  await search.fill('sho');
  await expect(tiles).toHaveCount(1);
  await expect(unbound.getByRole('button', { name: 'Shopee' })).toBeVisible();

  // substring, not fuzzy: "tg" is a subsequence of Instagram but not a substring
  await search.fill('tg');
  await expect(tiles).toHaveCount(0);
  await expect(unbound).toContainText('No service matches');

  // first Escape clears the query and stays on Home
  await search.press('Escape');
  await expect(tiles).toHaveCount(6);
  await expect(welcome).toBeVisible();

  // second Escape leaves
  await win.keyboard.press('Escape');
  await expect(welcome).toHaveCount(0);

  await app.close();
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e tests/e2e/home.spec.ts`
Expected: FAIL — no textbox named "Search unbound services".

- [ ] **Step 3: Add the query state and the Escape rung**

In `Welcome.tsx`, add `useRef` to the React import and `matchesQuery` to the welcome import. Add the state below `selected`:

```ts
  const [query, setQuery] = useState('');
  // read through a ref so the window listener is registered once instead of on
  // every keystroke, and never closes over a stale query
  const queryRef = useRef('');
  useEffect(() => {
    queryRef.current = query;
  }, [query]);
```

Clear it alongside the selection reseed, so a filter never survives a visit:

```ts
  useEffect(() => {
    setSelected(new Set(enabledKey ? (enabledKey.split(',') as ServiceId[]) : []));
    setQuery('');
  }, [enabledKey]);
```

Add the first rung inside the existing Escape handler, immediately after the `if (e.key !== 'Escape') return;` line:

```ts
      if (queryRef.current) {
        setQuery('');
        return;
      }
```

- [ ] **Step 4: Render the search and filter the tiles**

Add above the `return`:

```ts
  const visibleUnbound = sections.unbound.filter((id) => {
    const svc = byId.get(id);
    return svc !== undefined && matchesQuery(svc.name, query);
  });

  const search = (
    <span className="flex h-6 w-[168px] items-center gap-1.5 rounded-ctl border border-border bg-bg-2 px-2">
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        aria-hidden="true"
        className="flex-none opacity-80"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-4-4" />
      </svg>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find a service"
        aria-label="Search unbound services"
        className="w-full min-w-0 bg-transparent normal-case tracking-normal text-text-1
          outline-none placeholder:text-text-2 placeholder:opacity-75"
      />
      {query && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => setQuery('')}
          className="flex-none text-text-2 hover:text-text-1"
        >
          ×
        </button>
      )}
    </span>
  );
```

No `autoFocus`. Home is a place, not a modal — stealing the keyboard on arrival would break `⌘/Ctrl 0` muscle memory and take arrow keys away from the tiles.

Then give the Unbound band its aside and the filtered list:

```tsx
        <ServiceBand
          testid="welcome-section-unbound"
          label={fresh ? 'Choose your services' : 'Unbound'}
          count={sections.unbound.length}
          aside={sections.unbound.length > 0 ? search : undefined}
        >
          {sections.unbound.length === 0
            ? emptyLine('Every one is bound.')
            : visibleUnbound.length === 0
              ? emptyLine(`No service matches “${query}”.`)
              : tiles(visibleUnbound)}
        </ServiceBand>
```

The count on the label stays `sections.unbound.length` — the unfiltered total. A count that shrank with the query would just restate the tiles under it.

- [ ] **Step 5: Run the e2e test to verify it passes**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e tests/e2e/home.spec.ts`
Expected: PASS.

- [ ] **Step 6: Run the full gate**

```bash
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test
env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e
```

- [ ] **Step 7: Stop and request a commit**

Suggested subject: `feat(home): filter the unbound list by name`.

---

## Task 7: Drag to reorder on Home

**Files:**

- Modify: `src/renderer/src/components/welcome/PickTile.tsx`
- Modify: `src/renderer/src/components/Welcome.tsx`
- Test: `tests/e2e/home.spec.ts`

**Interfaces:**

- Consumes: `moveTo` from Task 2; `PickTile` from Task 5.
- Produces: `PickTile` gains an optional `onReorder?(fromId: string, toId: string): void`. Present ⇒ the tile is a drag source and drop target. Only the Summoned band supplies it.

- [ ] **Step 1: Write the failing e2e test**

Append to `tests/e2e/home.spec.ts`. The fixture enables Messenger and Zalo, which in name order puts Messenger first, so dragging Zalo onto Messenger swaps them:

```ts
test('home: dragging a summoned tile reorders the rail immediately', async () => {
  const { app, win } = await launch();
  const railTiles = win.locator('[data-testid="service-tile"]');
  const railOrder = () =>
    railTiles.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));

  expect(await railOrder()).toEqual(['Messenger', 'Zalo']);

  await win.locator('[data-testid="home-btn"]').click();
  const summoned = win.locator('[data-testid="welcome-section-summoned"]');
  await summoned
    .getByRole('button', { name: 'Zalo' })
    .dragTo(summoned.getByRole('button', { name: 'Messenger' }));

  // no confirm: a drop persists on its own, and the rail behind Home follows
  await expect(async () => {
    expect(await railOrder()).toEqual(['Zalo', 'Messenger']);
  }).toPass();
  await expect(win.getByRole('button', { name: 'No changes' })).toBeDisabled();

  await app.close();
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e tests/e2e/home.spec.ts`
Expected: FAIL — the rail order does not change, because tiles are not drag sources.

- [ ] **Step 3: Make `PickTile` draggable on request**

In `src/renderer/src/components/welcome/PickTile.tsx`, add to the props interface:

```ts
  /** present ⇒ this tile is a drag source and drop target (Summoned only —
   *  Unbound has no order to edit) */
  onReorder?(fromId: string, toId: string): void;
```

Destructure `onReorder`, and add these attributes to the `<button>`, mirroring `ServiceTile` exactly:

```tsx
      draggable={onReorder !== undefined}
      onDragStart={(e) => e.dataTransfer.setData('text/goetia-service', service.id)}
      onDragOver={(e) => {
        if (onReorder) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!onReorder) return;
        e.preventDefault();
        const from = e.dataTransfer.getData('text/goetia-service');
        if (from && from !== service.id) onReorder(from, service.id);
      }}
```

- [ ] **Step 4: Wire it from `Welcome.tsx`**

Add `import { moveTo } from './reorder';` and a handler beside `toggle`:

```ts
  // a drop persists on its own: reordering is non-destructive, so Summon and
  // Dispel keep meaning enable/disable and nothing else
  const reorder = (fromId: string, toId: string) =>
    window.goetia.send('service:reorder', {
      orderedIds: moveTo(order, fromId as ServiceId, toId as ServiceId),
    });
```

Give `tiles` an opt-in flag so only the Summoned band drags:

```tsx
  const tiles = (ids: ServiceId[], draggable = false) => (
    <div className="flex flex-wrap gap-2">
      {pick(ids).map((svc) => (
        <PickTile
          key={svc.id}
          service={svc}
          on={selected.has(svc.id)}
          onToggle={() => toggle(svc.id)}
          onReorder={draggable ? reorder : undefined}
        />
      ))}
    </div>
  );
```

Then change the Summoned band's child to `{tiles(sections.summoned, true)}`. Leave both Unbound call sites as they are.

- [ ] **Step 5: Run the e2e test to verify it passes**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e tests/e2e/home.spec.ts`
Expected: PASS.

- [ ] **Step 6: Run the full gate**

```bash
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test
env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e
```

- [ ] **Step 7: Verify by hand that a drag does not toggle selection**

Run `corepack pnpm dev`, open Home with two or more services summoned, and drag one tile onto another. Confirm the rail reorders and **neither tile's glow changes** — a completed drag must not fire the click that toggles staging. If it does, that is a real bug in this task, not a test artefact.

- [ ] **Step 8: Stop and request a commit**

Suggested subject: `feat(home): drag summoned tiles to reorder`.

---

## Verification

After Task 7, the whole feature is in. Confirm against the spec:

- [ ] `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` green.
- [ ] `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e` green.
- [ ] Fresh profile: Home opens on the intro with all eight tiles in name order, no scrollbar at 1280×820.
- [ ] Summon three services at once — they arrive in the rail in name order.
- [ ] Summon a fourth that sorts first alphabetically — it lands **last** in the rail.
- [ ] Drag a summoned tile in Home — the rail reorders immediately, with no confirm.
- [ ] Reorder the rail, reopen Home — Summoned follows the rail, Unbound is still in name order.
- [ ] Type in the search — the list filters; Escape clears it; Escape again leaves Home.
- [ ] Shrink the window to its 600px minimum — the bands scroll, the footer stays pinned, the page does not scroll.

## Out of scope

Do not build these. They are named in the spec as follow-ups:

- The rail overflows at roughly 30 summoned services. Separate change.
- A compact (48px, unlabelled) tile density for very large catalogs.
- Any settings migration — existing installs keep their saved order by design.
- Swapping `matchesQuery` for `fuzzyScore`.
- Any change to `normalize()` in `src/main/settings.ts`. Its "slot after the nearest catalog predecessor" heuristic is now largely vestigial, since every new service arrives disabled and `summonOrder` moves it to the end when summoned. Worth revisiting later; not part of this plan.
