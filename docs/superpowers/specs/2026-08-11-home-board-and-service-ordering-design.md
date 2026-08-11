# Home board, name ordering, and unbound search design

**Date:** 2026-08-11

**Goal:** Sort the service catalog by name, keep Unbound in name order and make it searchable, append newly summoned services to the end of Summoned, allow drag-to-reorder on Home as well as the rail — and restructure Home so all of that fits a 13″ MacBook without scrolling, and keeps fitting as the catalog grows.

## Context

`Welcome.tsx` renders a centered vertical stack: portal, title, three tip cards, a Summoned block, a hairline, an Unbound block, a hint line, and the Dispel/Summon row. Both blocks come from `welcomeSections(order, enabled)`, which partitions `settings.order` — so both sections list in rail order. Selection is staged in local state and applied on confirm through one `settings:update` patch built by `buildDisabledPatch` (`2026-08-10-welcome-sections-and-selling-points-design.md`). Drag-to-reorder exists only on `ServiceTile` in the rail; the previous spec put it explicitly out of scope for Home.

Five things are wrong or missing:

1. `SERVICES` and `DEFAULT_SETTINGS.order` ship in an ad-hoc order (messenger, instagram, telegram, zalo, whatsapp, discord, tiktok, shopee) that encodes nothing a user can predict.
2. Unbound follows `settings.order`, so reordering the rail silently reshuffles the pool of services you have *not* chosen — a list whose order carries no meaning and should therefore never move.
3. A newly summoned service lands at its catalog position, which can be anywhere in the rail. It should land where the user last looked: the end.
4. Reordering is only reachable from the rail, which is the one surface that is covered while Home is open.
5. The screen has no height discipline. It fits today by arithmetic, not by construction.

Point 5 is the one that decides the layout. Three directions were built to scale and measured in a real Chromium layout pass rather than estimated. At eight services all three fit the 748px budget (an 820px window minus the 28px title bar and the 44px top rail). At a Ferdium-sized catalog of 62 services with 16 summoned, they separate:

| Direction | 8 services | 62 services, 16 summoned | Verdict |
| --- | --- | --- | --- |
| Compact column (today's stack, tightened) | 437–572px | wants 1040px | page scrolls |
| Two-column split (identity left, picker right) | flat 306px | wants 852px | page scrolls |
| **Board (header / bands / pinned footer)** | 397–527px | **home stays 748px** | **holds** |

The board wins because it is the only one where "no scrolling" is a property of the layout rather than a coincidence of content. Its home area's `scrollHeight` equals its `clientHeight` at 62 services; the two bands absorb the overflow into their own scroll containers. Width was never the constraint — six rows of tiles is six rows of tiles — which is why the two-column split gains nothing at scale.

## Decision 1: the catalog ships in name order

`SERVICES` in `src/shared/services.ts` is re-sorted by display name, and `DEFAULT_SETTINGS.order` in `src/shared/types.ts` is updated to match:

```ts
['discord', 'instagram', 'messenger', 'shopee', 'telegram', 'tiktok', 'whatsapp', 'zalo']
```

Only the array order changes. No entry's `id`, `url`, `color`, or flags move with it, and `ServiceId` is a union whose declaration order is meaningless.

**No migration.** `normalize()` in `src/main/settings.ts` already preserves any persisted `order`, so an existing install keeps the order it has and a manual reorder is never overwritten. This is the shipped default for fresh installs only, and it is a deliberate choice: rewriting a saved order would be the one thing a user cannot undo without redoing it by hand.

This composes cleanly with the rule `normalize()` uses for ids it has never seen — slot them after the nearest catalog predecessor the user already has. With an alphabetical catalog, a newly shipped service lands beside its alphabetical neighbour instead of at an arbitrary index. It also cannot conflict with Decision 2: every service ships disabled, so its position in `order` is invisible until it is summoned, and summoning moves it to the end anyway.

`tests/unit/services.test.ts` asserts the exact old id order and must be updated. It gains an invariant that the ad-hoc order cannot come back:

```ts
expect(SERVICES.map((s) => s.name)).toEqual([...SERVICES.map((s) => s.name)].sort((a, b) => a.localeCompare(b)));
```

The existing `DEFAULT_SETTINGS.order === SERVICES.map(id)` assertion then pins both.

## Decision 2: summoning appends to the end of Summoned

A confirm that adds services moves those ids to the end of `order`, so an arrival lands where the user was last looking rather than jumping into the middle of a rail they have already arranged. Banishing moves nothing: a banished service keeps its slot, and if it is summoned again later it appends like any other arrival.

Where several are summoned at once, they append **in name order** — the order they were sitting in when the user picked them out of Unbound (Decision 3). Selection is a `Set` and carries no click order, so name order is both the only stable choice and the one that matches what was on screen.

A new pure helper joins the others in `src/shared/welcome.ts`:

```ts
/** Order after a welcome-screen confirm. Newly summoned ids move to the end so
 *  an arrival lands where the user last looked; a banished id keeps its slot.
 *  `named` is the catalog in display-name order — the order the new ones were
 *  picked out of Unbound in, and so the order they arrive in. */
export function summonOrder(
  order: ServiceId[],
  enabled: ReadonlySet<ServiceId>,
  selected: ReadonlySet<ServiceId>,
  named: ServiceId[],
): ServiceId[];
```

`summonDelta` is untouched. It returns `add` in rail order and is consumed only by `summonLabel`, which reads lengths — the two functions answer different questions and conflating them would couple the button's caption to the ordering rule.

`Welcome.tsx`'s confirm sends both keys in **one** `settings:update` patch:

```ts
window.goetia.send('settings:update', {
  disabled: buildDisabledPatch(order, selected),
  order: summonOrder(order, enabled, selected, named),
});
```

One patch rather than a `service:reorder` followed by a `settings:update`, because the existing handler already does the right thing with both: `settings:update` reads `after.order` for its teardown loop and for `resolveActivation`, so the new order is the one activation resolves against, and `buildAppMenu(ctx)` already runs inside the `patch.disabled` branch, keeping `⌘/Ctrl 1…9` aligned. Two messages would mean two broadcasts and a frame where order and enablement disagree.

No new IPC channel. `settings:update` is already in `SHELL_ONLY_CHANNELS`; only the payload's shape is wider, and `order` is a key the handler and `normalize()` both already accept.

## Decision 3: Unbound is always in name order, and filterable

Unbound stops reading `settings.order` and sorts by display name, permanently. The unchosen pool has no meaningful order, so it gets a predictable one: the same service is always in the same place, no matter how the rail has been arranged. Summoned keeps following `settings.order` — that list *is* the rail.

`welcomeSections` gains the name-ordered id list and uses it for one half of the partition:

```ts
/** Catalog ids in display-name order — the Unbound order, and the order new
 *  arrivals append in. */
export function byName(services: readonly ServiceMeta[]): ServiceId[];

/** Partition for the Home picker. Summoned follows `order` (it is the rail);
 *  Unbound follows `named`, because an unchosen pool has no meaningful order
 *  and a stable one is worth more than a mirrored one. */
export function welcomeSections(
  order: ServiceId[],
  enabled: ReadonlySet<ServiceId>,
  named: ServiceId[],
): WelcomeSections;
```

`state.services` is `settings.order.map(serviceById)`, so it already carries every catalog service with its `name`; `byName(state.services)` needs no new IPC and no new main-process state.

### Matching

Filtering is **case-insensitive substring on the display name**, not the quick switcher's `fuzzyScore`:

```ts
/** Unbound filter. Deliberately not fuzzyScore: that ranks candidates for a
 *  jump-to, where a stray match costs one glance. This filters a visible grid,
 *  where "tg" surfacing Instagram alongside Telegram reads as a bug. */
export function matchesQuery(name: string, query: string): boolean;
```

The two searches do different jobs. The quick switcher jumps you to one of a handful of *enabled* services and wants to reward two keystrokes. This filters a grid you are looking at, and a false positive there undermines trust in the filter itself — verified in the mockup, where `fuzzyScore("tg", …)` returns a match for both Telegram and Instagram. If this proves too strict in use it is a one-line swap back to `fuzzyScore`, and the unit test is where the choice is pinned.

Results stay in name order. No score-based re-ranking, so tiles never reorder under the cursor as the query grows — the same rule that keeps sections from re-sorting mid-edit.

### The control

The search sits inline on the Unbound band's label row, right-aligned opposite `UNBOUND · 46`. It costs no vertical height, which is the whole reason for that placement.

- It renders only when Unbound is non-empty. With every service summoned there is nothing to filter, and the band shows "Every one is bound." as it does today.
- A clear affordance (`×`) renders only while the query is non-empty.
- No autofocus. Home is a place, not a modal; stealing the keyboard on arrival would break `⌘/Ctrl 0` muscle memory and take arrow keys away from the tiles.
- `aria-label="Search unbound services"`, since the band label is not a `<label>`.
- A query matching nothing shows "No service matches “…”." in the same muted style as the empty states.

The query resets to empty on every visit to Home and after a successful confirm — the same effect that reseeds `selected`, for the same reason: a discarded edit must not survive to the next visit.

### Escape

`Escape` becomes a two-step ladder handled entirely inside the existing window `keydown` listener:

1. If the query is non-empty, clear it and stop.
2. Otherwise, leave Home exactly as specified on 2026-08-09 (guarded on nothing being layered above and at least one service being enabled).

The query is read through a ref rather than added to the effect's dependency array, so the listener is registered once instead of re-registered on every keystroke, and never closes over a stale value. Handling this on the input's own `onKeyDown` was rejected: stopping a React synthetic event from reaching a native `window` listener is subtle enough to be a bug waiting to happen, and it would leave `Escape` closing Home while a filter is active whenever focus sits elsewhere.

## Decision 4: reorder by drag, on Home as well as the rail

Summoned tiles become drag sources and drop targets, mirroring `ServiceTile` exactly — same `text/goetia-service` data type, same `onDragStart` / `onDragOver` / `onDrop` shape, same suppression of the trailing click that Chromium already gives a completed drag. Unbound tiles are not draggable: that section has no order to edit.

A drop **persists immediately** through the existing `service:reorder` channel, the same one the rail uses. Reordering is non-destructive, so there is nothing to confirm; Summon and Dispel keep meaning enable/disable and nothing else. The rail visibly re-orders behind Home as you drop, which is the confirmation.

The index arithmetic is currently inline in `Rail.tsx` and would otherwise be copied. It moves to a helper with a unit test, per the repo rule that pure decision logic lives in a `lib/` helper:

```ts
/** Move `fromId` to `toId`'s slot. Splice semantics are preserved verbatim from
 *  the rail's original inline version — `to` is resolved before the removal, so
 *  a forward move lands one slot short of `toId`'s old index. */
export function moveTo(ids: ServiceId[], fromId: ServiceId, toId: ServiceId): ServiceId[];
```

`Rail.tsx` is refactored to call it. The behaviour is byte-for-byte the rail's existing behaviour, including the index-shift quirk — this extraction adds a test, not a fix. Changing the drop semantics is a separate decision and is out of scope here.

Both surfaces reorder the full `settings.order`, including disabled ids. Drop targets are always summoned tiles, so both endpoints are enabled and the disabled ids between them simply ride along, exactly as they do on the rail today.

## Decision 5: the board layout

Home becomes three regions, and both of its states share that skeleton:

```text
┌──────────────────────────────────────────────────────┐
│ ◉ Goetia   All your chats. Nothing else.  3 of 8 …   │  header · 56px · flex-none
├──────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────┐ │
│ │ SUMMONED · 3              drag to reorder        │ │  band · max-h 46% · scrolls
│ │  ▣  ▣  ▣                                         │ │
│ └──────────────────────────────────────────────────┘ │  board · flex-1 · min-h-0
│ ┌──────────────────────────────────────────────────┐ │
│ │ UNBOUND · 5                    [ ⌕ Find … ]      │ │  band · flex 0 1 auto · scrolls
│ │  ▢  ▢  ▢  ▢  ▢                                   │ │
│ └──────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────┤
│ Drag a summoned tile to reorder …  [Dispel] [Summon] │  footer · 60px · flex-none
└──────────────────────────────────────────────────────┘
```

Only the tile areas can grow, and they grow into their own scroll containers rather than into the page. The header and the action bar never move, so the confirm is always on screen — today it is the last thing in a stack and is the first thing to fall off the bottom.

**Two states, one skeleton.** The screen has two jobs and currently pays for both at once. On a fresh install the header is replaced by the welcome block — portal, "Welcome to Goetia", the tagline, and the three tip cards — and the single band reads "Choose your services"; the footer keeps the hint and the buttons. Once anything is summoned the welcome block is replaced by the compact header and the Summoned band appears. The tips are onboarding: they earn their space exactly once, and reclaiming it is what gives the steady state room to spare while showing more tiles.

Sizing rules, all verified in a real layout pass:

- `.board` is `flex-1 min-h-0`; `App.tsx` already wraps Welcome in `relative flex min-h-0 min-w-0 flex-1` under an `h-full` root, so the chain has a definite height and a percentage cap resolves.
- The Summoned band is capped at `max-h-[46%]` with `min-h-0`. Without the cap, a long summoned list crowds Unbound out of the board entirely.
- The Unbound band is `flex-[0_1_auto] min-h-0` — it sizes to its content and shrinks rather than pushing the footer.
- Each band's tile area is the scroll container (`overflow-y-auto min-h-0`), so its `scrollHeight` is the honest measure of what the content wants.
- Tile labels are single-line with ellipsis (`truncate`). A two-line label ("Google Keep") otherwise pushes its whole row taller than its neighbours and breaks the grid.
- The centered stack that survives on the first-run state uses `margin: auto` rather than `justify-center`, which is the standing fix for `justify-center` + `overflow-y-auto` clipping the *top* of overflowing content instead of scrolling to it. Today's screen has that bug latent.

### Component split

`Welcome.tsx` is 297 lines before any of this. It splits, keeping the surface itself as thin composition:

| File | Responsibility |
| --- | --- |
| `components/Welcome.tsx` | region composition, `selected` / `query` state, the effects, the two IPC sends |
| `components/welcome/PickTile.tsx` | one tile; drag handlers behind a `draggable` prop |
| `components/welcome/ServiceBand.tsx` | label row, optional aside slot, scroll area, empty state |
| `components/welcome/WelcomeIntro.tsx` | portal, title, tagline, tip cards — first run only |
| `shared/welcome.ts` | `byName`, `welcomeSections`, `summonOrder`, `matchesQuery` (+ existing) |

The bands keep their current `data-testid="welcome-section-summoned"` / `-unbound` hooks so the existing e2e selectors survive. On a fresh install the single "Choose your services" band carries `welcome-section-unbound` — it *is* the unbound band, relabelled — so selectors that reach for it do not need to know which state they are in. `WelcomeIntro` carries `data-testid="welcome-intro"`, and `PickTile` carries `data-testid="pick-tile"`.

## Testing

**Unit (vitest):**

- `tests/unit/services.test.ts` — updated id order, plus the new "catalog is sorted by name" invariant.
- `tests/unit/welcome.test.ts` — `byName`; `welcomeSections` with Summoned in rail order and Unbound in name order *while the two disagree* (the case that proves the change); `matchesQuery` for empty query, case-insensitivity, no-match, and the `"tg"` case that must **not** match Instagram; `summonOrder` for a single append, a multi-append landing in name order, a banish leaving slots alone, a re-summon of a previously banished id appending, and a no-op confirm returning an unchanged order.
- `tests/unit/reorder.test.ts` (new) — `moveTo` forward, backward, adjacent, to-self, and unknown-id cases, pinning the rail's existing splice semantics before `Rail.tsx` is refactored onto it.

**E2E (Playwright):**

- `welcome.spec.ts` — **one assertion must change.** Line 31 expects the Summoned band to contain "Nothing yet." on a fresh install; the first-run state has no Summoned band. It becomes `await expect(welcome.locator('[data-testid="welcome-intro"]')).toBeVisible()`. The `unbound.getByRole('button')` count on line 32 should move to a `[data-testid="pick-tile"]` count, because the band can now contain a non-tile button (the search clear affordance) and a role-based count is fragile against it.
- `welcome.spec.ts` — new: summon two services at once and assert the rail's tile order is name order, then summon a third that sorts alphabetically first and assert it lands **last** in the rail. This is the append rule's only end-to-end proof.
- `home.spec.ts` — the four existing tests operate in the steady state with services already summoned and should pass unchanged; that is the regression bar for the restructure.
- `home.spec.ts` — new: type into the Unbound search and assert the tile count drops and the expected service survives; press `Escape` once and assert the query clears and Home is still open; press it again and assert Home closes.

Definition of done is unchanged: `corepack pnpm lint`, `typecheck`, `test`, and `e2e` all green.

## Out of scope

- **The rail overflows before Home does.** At 32px per tile plus a 6px gap, roughly 30 summoned services fill a 1280px rail and the rest fall off the end. Home survives 62 services in this design; the rail does not survive summoning them. That is a separate change.
- **Compact tile density.** At 62 services the 76px labelled tile is what costs the height — 46 unbound tiles is four rows in the board. A 48px unlabelled mode with the name in the tooltip roughly halves that and is the obvious next lever if the catalog passes ~150. Not needed at 62, so not built.
- **No settings migration**, per Decision 1. Existing installs keep their saved order.
- **No fuzzy matching**, per Decision 3. The swap is one line if substring proves too strict.
- **No change to `buildDisabledPatch`, `summonDelta`, `summonLabel`**, the staging model, the overlay invariant from 2026-08-09, or the `Escape`-leaves-Home behaviour beyond the query rung added ahead of it.
- **No new IPC channel.** `settings:update` carries a wider payload and `service:reorder` gains a second caller; both are already in `SHELL_ONLY_CHANNELS`.
