# Tile reorder: live gap reflow design

**Date:** 2026-08-12

**Goal:** Replace HTML5 drag-and-drop on both tile surfaces with pointer-driven reordering that reflows live — and stop a drop on Home discarding the user's staged selection — the dragged tile follows the cursor, its neighbours slide in to fill the gap, and the drop is where the layout already showed it would be. Removes the macOS copy-cursor badge that is today the only feedback the gesture produces, and the perceived lag that badge carries.

## Context

Drag-to-reorder ships on two surfaces, and both run the same six lines of HTML5 drag-and-drop, copy-pasted:

- `ServiceTile.tsx` — the rail, enabled services only, a row when `railPosition` is `top` and a column when it is `left`/`right`.
- `welcome/PickTile.tsx` — Home's Summoned band, a wrapping `grid-cols-[repeat(auto-fill,76px)]` grid. Unbound tiles are deliberately not draggable: that section has no order to edit (`2026-08-11-home-board-and-service-ordering-design.md`, Decision 4).

Both call `moveTo(order, fromId, toId)` from `components/reorder.ts` and persist through `service:reorder`.

Two defects, one visible and one structural:

1. **Neither surface sets a drop effect.** `dragstart` never sets `dataTransfer.effectAllowed` and `dragover` never sets `dataTransfer.dropEffect`, so Chromium falls back to `copy`. macOS draws `copy` as the green ⊕ badge and fades it in on the window server's schedule, a beat behind the pointer. The badge is both semantically wrong — a reorder is a move, nothing is copied — and the slowest-updating thing on screen.
2. **The app renders nothing for the whole gesture.** There is no `dragenter`, `dragleave` or `dragend` handler on either tile. Order changes only at drop, when the grid snaps. The OS badge is therefore the sole moving element in the interaction, which is exactly why it is what the eye latches onto and why the gesture reads as laggy.

Fixing (1) alone — setting both effects to `move` — removes the badge and the lag. It does not answer (2): the gesture would become silent rather than slow. The decision below addresses both by removing the OS drag session entirely.

## Decision 1: pointer-driven reorder via `motion`, not HTML5 drag-and-drop

`Reorder.Group` / `Reorder.Item` from `motion` (v13.1.0; peers `react: ^18 || ^19`, satisfied by React 19.2) replace the HTML5 handlers on both tiles. It goes in `devDependencies` beside `react` — electron-vite bundles the renderer, so it is never present in the packaged `node_modules`. Roughly 40 kB gzipped, which for a locally loaded renderer costs nothing measurable.

Three alternatives were weighed:

| Direction | Feedback during drag | ⊕ badge | Cost |
| --- | --- | --- | --- |
| Set `dropEffect = 'move'` only | none | gone | ~4 lines |
| Insertion line + dimmed source, keep HTML5 DnD | a static 2px bar | gone | a hook + a pure edge helper |
| **Live gap reflow (`motion`)** | **the layout itself** | **cannot occur** | **a dependency + the draft-order machinery below** |

The third wins on the terms the request was made in. With no OS drag session there is no OS cursor to lag: the tile under the pointer is the real tile, transformed at frame rate, and the surrounding tiles animating into the vacated slot make the resulting order self-evident before the pointer is released. An insertion line describes the outcome; a live gap *is* the outcome.

`Reorder.Group` detects its axis from item positions — a row uses `x`, a column uses `y`, a wrapped layout uses both — and `axis` forces it. Home's wrapping grid is therefore supported, which was the one property that could have disqualified this direction.

Consequently deleted, not merely bypassed: `draggable`, `onDragStart`, `onDragOver`, `onDrop` and the `text/goetia-service` data type on both tiles.

### What survives from the drag-and-drop version

`cursor-grab`, switching to `cursor-grabbing` while held, on tiles that reorder. Under HTML5 DnD the OS owned the cursor for the duration of the drag and `grabbing` was visible only in the instant before the drag session started; under pointer drag it holds for the whole gesture. Unbound tiles keep `cursor-pointer`, so the cursor distinguishes the band that reorders from the band that only toggles.

## Decision 2: the drag runs on a local draft, and commits once

`Reorder.Group` is a controlled component: `onReorder` fires on **every crossing during the drag**, not on release. Wired directly to `service:reorder`, a single drag across three tiles would send three IPC messages, each one a `conf` write, a full `MainState` broadcast, a rail re-render and an app-menu rebuild. That is the per-tick broadcast `CLAUDE.md` forbids under "Report on change only".

The drag therefore runs entirely in the renderer and reaches the main process once:

```tsx
// liveIds: the ids this surface renders, from broadcast state — the rail's
// enabled services, or Home's `sections.summoned`. liveKey is liveIds.join(',').
const [draft, setDraft] = useState<ServiceId[] | null>(null);
const shown = draft ?? liveIds;          // what Reorder.Group renders

<Reorder.Group values={shown} onReorder={setDraft} …>
```

`onDragStart` records `keyAtDragStart.current = liveKey`. `onDragEnd` sends the single `service:reorder` with `applySubsetOrder(order, shown)` — `shown`, not `draft`, so a drag that ends where it started is a harmless no-op patch rather than a crash on `null`.

**The draft is not cleared on commit.** Clearing it there would render one frame of the pre-drag order while the IPC round-trip is in flight — a visible snap-back at the exact moment the user expects the drop to have taken. It is cleared when the broadcast carrying the new order arrives, detected against the order key captured at drag start:

```tsx
const keyAtDragStart = useRef('');
useEffect(() => {
  if (draft && liveKey !== keyAtDragStart.current) setDraft(null);
}, [liveKey, draft]);
```

Because the arriving order equals the draft, clearing is visually a no-op. The rule also self-heals: any *other* change to the order mid-drag — a service disabled from the tray, a second window — trips the same condition and drops the draft rather than letting a stale local array fight the broadcast state.

This keeps the existing channel and its classification intact. `service:reorder` is already registered through the `register()` wrapper and already shell-only; no new channel, no widened payload, no new permission.

## Decision 3: `applySubsetOrder` replaces `moveTo`

`Reorder.Group` knows only the ids it renders — the rail's enabled services, or Home's summoned ones — while `settings.order` holds the whole catalog including disabled ids. The reordered subset has to be merged back into the full order. `moveTo`'s `(from, to)` signature cannot express this: it takes two ids and infers a move, where `Reorder` hands over a finished array.

`components/reorder.ts` swaps one exported helper for another:

```ts
/** Rewrite `full` so that members of `subset` appear in `subset`'s order,
 *  leaving every non-member at the index it already holds. */
export function applySubsetOrder(full: ServiceId[], subset: ServiceId[]): ServiceId[] {
  const known = new Set(full);
  const moved = subset.filter((id) => known.has(id));
  const slots = new Set(moved);
  let i = 0;
  return full.map((id) => (slots.has(id) ? moved[i++] : id));
}
```

The `known` filter is not defensive decoration. Without it an id absent from `full` still enters the `slots` set and shifts the cursor, so an unknown id would be written into a slot belonging to a real one — `full = [A, B, C]`, `subset = [Z, C, A]` yields `[Z, B, C]`. Filtering first makes the number of matching slots equal `moved.length` exactly, so the walk consumes the array precisely and unknown ids are genuinely ignored. This carries forward the guard `moveTo` already had for the same reason.

**Deliberate behaviour change.** `moveTo` splices the full array, so disabled ids sitting between the two endpoints ride along with a move. `applySubsetOrder` pins every non-member to its absolute index instead. The old behaviour was a side effect of the implementation rather than a decision — a hidden id shifting because of a visible drag is unobservable to the user and cannot be reasoned about from the screen. `tests/unit/reorder.test.ts` asserts the old semantics and is rewritten with the helper.

Both surfaces reorder the full `settings.order`, exactly as before; only the arithmetic that gets them there changes.

## Decision 4: per-surface wiring

### Rail

The `<nav>` holds more than tiles: a Home button, a divider, and the trailing bell/gear cluster. `Reorder.Group` measures its own children to detect axis and compute crossings, so it must contain the tiles and nothing else. The tiles move into their own flex box, which becomes the group:

```tsx
<Reorder.Group
  as="div"
  axis={horizontal ? 'x' : 'y'}
  values={shown}
  onReorder={setDraft}
  className={horizontal
    ? 'flex flex-row items-center gap-1.5'
    : 'flex flex-col items-center gap-1.5'}
>
```

Same gap and alignment as the tiles have inside the nav today, so the rendered result is unchanged. `axis` is set explicitly rather than left to detection: a rail holding a single service has no second item to infer an axis from.

### Home

`Welcome.tsx`'s `tiles()` helper already renders one grid `div` per section. The Summoned call becomes a `Reorder.Group as="div" axis="xy"` carrying the existing grid classes verbatim; the Unbound call keeps its plain `div`. The `draggable` parameter `tiles()` already takes selects between them, so the call sites do not change.

`axis="xy"` is required here and not merely defensive — the grid wraps, and a tile dragged to a different row moves on both axes.

## Decision 5: three failure modes to close

**Transform ownership.** `ServiceTile` applies `scale-105` to the `<button>` for the active tile, and that button becomes the `Reorder.Item`. Motion writes `transform` on the element it drags, so Tailwind's scale and Motion's translate would overwrite each other. The active scale moves into Motion's hands as `animate={{ scale: active ? 1.05 : 1 }}`, and `scale-105` comes out of `stateClasses`. `PickTile` needs no equivalent change: its `scale-105` is on the inner face `span`, not on the button Motion will own.

**The trailing click.** HTML5 drag-and-drop suppressed the click that follows a completed drag; pointer drag does not. Left unguarded, releasing a drag on Home toggles that service off, and releasing one on the rail activates it — a drag that silently performs the tile's click action is worse than the lag being fixed. `onDragStart` sets a ref, `onClick` consumes and clears it before the tile's own handler runs. Motion fires `onDragStart` only once its drag threshold is crossed, so an ordinary click never sets the ref.

**Measurement inside a scroll container.** Home's bands scroll (`ServiceBand`'s inner `div` is `overflow-y-auto`). Motion's projection needs `layoutScroll` on a scrollable ancestor to correct for scroll offset; without it, a drag in a scrolled Summoned band computes crossings against stale rects. That inner div becomes a `motion.div` with `layoutScroll`. It only bites once Summoned overflows its `max-h-[46%]`, which is why it is easy to ship broken.

## Decision 6: what the drag looks like

The dragged tile lifts — `whileDrag={{ scale: 1.1 }}` plus a raised shadow — and its neighbours settle into the vacated slot on Motion's default spring. Nothing else changes: the badge, mute, crash and stale decorations on `ServiceTile` ride along with the tile as its children, and the `on`/`active` gradient is untouched.

No landing pulse and no "drag to reorder" band hint. The reflow is itself the confirmation, and the rail visibly reordering behind Home remains the second one.

## Decision 7: reordering must stop discarding a staged selection

`Welcome.tsx` derives `enabledKey` by joining the enabled ids **in `settings.order`**, and reseeds on it:

```tsx
const enabledKey = state.services.filter((svc) => !state.settings.disabled[svc.id])
  .map((svc) => svc.id).join(',');

useEffect(() => {
  setSelected(new Set(…));
  setQuery('');
}, [enabledKey]);
```

The key is therefore order-sensitive, and a reorder changes it without changing the enabled set. Dropping a tile on Home consequently discards whatever the user had staged for Summon and clears the search box — pick three services, drag one summoned tile, and the three picks silently go out.

This predates the spec, but it is not adjacent to it: it is the same drop, on the same surface, and this design exists to make that drop something people do often. Shipping a pleasant reorder onto a reorder that eats staged work makes the bug more reachable, not less.

The reseed is about **membership**, not order — its own comment says so ("Re-seed every time the screen becomes visible or the live set changes"). Sorting the ids before joining makes the key say that:

```tsx
const enabledKey = […enabled ids].sort().join(',');
```

Line 59 splits `enabledKey` back into a `Set`, so sorted order is immaterial there. A summon, dispel or catalog change still trips it; a pure reorder no longer does.

## Testing

- `tests/unit/reorder.test.ts` is rewritten against `applySubsetOrder`: a subset reordered inside a longer full order, non-members pinned to their indices, `subset` equal to `full`, a single-element subset, an empty subset, and a subset carrying an id `full` does not contain — the case the naive implementation gets wrong.
- A unit case for Decision 7: two orders with the same enabled membership produce the same `enabledKey`, and a summon or dispel produces a different one.
- One Playwright case is added. Pointer-driven drag is reachable from `mouse.down` / `mouse.move` / `mouse.up`, which HTML5 drag-and-drop never was — so the renderer → `service:reorder` → main → broadcast path can be covered end to end for the first time: drag a Summoned tile past its neighbour, assert the persisted order. `CLAUDE.md`'s definition of done asks for `e2e` on main/preload/renderer wiring, and this is that wiring.
- Definition of done unchanged otherwise: `corepack pnpm lint`, `typecheck`, `test`, `e2e`.

## Out of scope

- Keyboard reordering. Neither surface has it today and adding it is a separate decision about which keys a rail tile owns.
- Reordering Unbound. It is name-ordered by design and has no order to edit.
- Any change to `service:reorder`, `settings.order` normalisation, or activation. This spec is renderer-local apart from the single message it already sends.
