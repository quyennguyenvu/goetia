# Tile reorder: live gap reflow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace HTML5 drag-and-drop on the rail and Home with pointer-driven `motion` reordering, so the dragged tile follows the cursor and its neighbours reflow to fill the gap — and stop a drop on Home discarding the user's staged selection.

**Architecture:** `Reorder.Group` wraps the tiles on each surface; each tile is wrapped in a `Reorder.Item` **div** rather than the tile itself becoming the item, so Motion owns the wrapper's `transform` and Tailwind keeps owning the button's. A `useTileReorder` hook holds the drag-local draft order and commits once on `onDragEnd` through the existing `service:reorder` channel; a pure `applySubsetOrder` merges the reordered visible subset back into the full `settings.order`.

**Tech Stack:** React 19.2, `motion` 13.1.0 (`motion/react`), Tailwind 4, Zustand, Vitest, Playwright + `_electron`.

**Spec:** `docs/superpowers/specs/2026-08-12-tile-reorder-live-gap-design.md`

## Global Constraints

- **Never run `git commit`.** Each task ends at a checkpoint; stop there and ask the user to run `/grimoire-core:commit`. Do not write `GRIMOIRE_COMMIT_MSG.txt`.
- `motion` goes in **`devDependencies`**, beside `react` — electron-vite bundles the renderer, so it must never appear in the packaged `node_modules`. Install with `corepack pnpm add -D motion@^13.1.0`.
- Every command is run with `corepack pnpm <script>`, never bare `pnpm`.
- `corepack pnpm e2e` must be run as `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e` — VS Code shells export `ELECTRON_RUN_AS_NODE` and Playwright's Electron launch fails with it set.
- Definition of done for every task: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` green. Tasks 3, 4 and 5 additionally require `e2e`.
- No new IPC channel. Reordering keeps using `service:reorder`, already registered through the `register()` wrapper and already in `SHELL_ONLY_CHANNELS`.
- `src/shared/**` stays process-agnostic: no `electron` import, no DOM import. `enabledKey` in Task 2 is pure and belongs there; the `useTileReorder` hook is renderer-only and does not.
- No `innerHTML` / `dangerouslySetInnerHTML` anywhere in the shell renderer. Motion writes transforms through CSSOM, which the `default-src 'self'` CSP permits.

## Deviation from the spec, and why

The spec's Decision 5 says to move the rail's active-tile `scale-105` into `animate={{ scale: active ? 1.05 : 1 }}` because Motion and Tailwind would fight over `transform` on the same element. This plan wraps each tile in a `Reorder.Item` **div** instead, which removes the conflict at the source: Motion transforms the wrapper, Tailwind transforms the button inside it. `ServiceTile`'s `stateClasses` keeps `scale-105` unchanged, and `PickTile` needs no change either. Every other decision in the spec is implemented as written.

---

## Task 1: `applySubsetOrder`

The pure merge that puts a reordered visible subset back into the full catalog order. Added alongside `moveTo`, which stays until its last caller is gone in Task 4.

**Files:**

- Modify: `src/renderer/src/components/reorder.ts` — add the new export, leave `moveTo` in place
- Test: `tests/unit/reorder.test.ts` — add a `describe` block, leave the `moveTo` block in place

**Interfaces:**

- Consumes: `ServiceId` from `src/shared/types`
- Produces: `applySubsetOrder(full: ServiceId[], subset: ServiceId[]): ServiceId[]`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/reorder.test.ts`, and add `applySubsetOrder` to the existing import from `../../src/renderer/src/components/reorder`:

```ts
describe('applySubsetOrder', () => {
  const full = [
    'discord',
    'instagram',
    'messenger',
    'shopee',
    'slack',
  ] as ServiceId[];

  it('reorders members and pins every non-member to its index', () => {
    // instagram and slack are disabled: they hold indices 1 and 4 no matter
    // what the visible tiles do
    const subset = ['shopee', 'messenger', 'discord'] as ServiceId[];
    expect(applySubsetOrder(full, subset)).toEqual([
      'shopee',
      'instagram',
      'messenger',
      'discord',
      'slack',
    ]);
  });

  it('applies a full-length subset as the whole order', () => {
    const subset = [...full].reverse() as ServiceId[];
    expect(applySubsetOrder(full, subset)).toEqual(subset);
  });

  it('is a no-op for a single-element subset', () => {
    expect(applySubsetOrder(full, ['messenger'] as ServiceId[])).toEqual(full);
  });

  it('is a no-op for an empty subset', () => {
    expect(applySubsetOrder(full, [])).toEqual(full);
  });

  it('ignores an id the full order does not contain', () => {
    // the naive version writes 'zalo' into discord's slot and drops discord
    const subset = ['zalo', 'messenger', 'discord'] as ServiceId[];
    expect(applySubsetOrder(full, subset)).toEqual([
      'messenger',
      'instagram',
      'discord',
      'shopee',
      'slack',
    ]);
  });

  it('never mutates its inputs', () => {
    const a = [...full];
    const b = ['shopee', 'discord'] as ServiceId[];
    const bCopy = [...b];
    applySubsetOrder(a, b);
    expect(a).toEqual(full);
    expect(b).toEqual(bCopy);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `corepack pnpm vitest run tests/unit/reorder.test.ts`

Expected: FAIL — `applySubsetOrder is not a function` (or a TypeScript/import error naming `applySubsetOrder`).

- [ ] **Step 3: Write the implementation**

Append to `src/renderer/src/components/reorder.ts`:

```ts
/** Rewrite `full` so that members of `subset` appear in `subset`'s order,
 *  leaving every non-member at the index it already holds. `Reorder.Group`
 *  only knows the tiles a surface renders, so the reordered visible ids have
 *  to be merged back into the catalog order that also carries disabled ones.
 *
 *  The `known` filter is load-bearing, not decoration: an id absent from
 *  `full` would still enter `slots` and advance the cursor, writing itself
 *  into a real service's position. */
export function applySubsetOrder(full: ServiceId[], subset: ServiceId[]): ServiceId[] {
  const known = new Set(full);
  const moved = subset.filter((id) => known.has(id));
  const slots = new Set(moved);
  let i = 0;
  return full.map((id) => (slots.has(id) ? moved[i++] : id));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `corepack pnpm vitest run tests/unit/reorder.test.ts`

Expected: PASS — the existing `moveTo` block and the six new `applySubsetOrder` cases.

- [ ] **Step 5: Verify the whole suite still passes**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`

Expected: all three green.

- [ ] **Step 6: Checkpoint**

Stop. Report that Task 1 is done and ask the user to run `/grimoire-core:commit`. Do not commit.

---

## Task 2: reordering must stop discarding a staged selection

`Welcome.tsx` derives `enabledKey` by joining the enabled ids **in `settings.order`** and reseeds `selected` and `query` whenever it changes. A reorder changes that key without changing the enabled set, so dropping a tile on Home throws away staged Summon picks and clears the search box. The reseed is about membership — its own comment says so — so the key is sorted.

**Files:**

- Modify: `src/shared/welcome.ts` — add `enabledKey`
- Modify: `src/renderer/src/components/Welcome.tsx:20-26` — use it
- Test: `tests/unit/welcome.test.ts` — add a `describe` block

**Interfaces:**

- Consumes: `ServiceId`, `ServiceMeta` from `src/shared/types`
- Produces: `enabledKey(services: readonly ServiceMeta[], disabled: Record<ServiceId, boolean>): string`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/welcome.test.ts`, adding `enabledKey` to the existing import from `../../src/shared/welcome`. The file already defines a `meta(id, name)` helper — reuse it.

```ts
describe('enabledKey', () => {
  const none = DEFAULT_SETTINGS.disabled;
  const svcs = [
    meta('messenger', 'Messenger'),
    meta('discord', 'Discord'),
    meta('slack', 'Slack'),
  ];

  it('is stable across a reorder of the same enabled set', () => {
    // the two arrays differ only in order — a drag must not reseed the screen
    const reordered = [svcs[2], svcs[0], svcs[1]];
    expect(enabledKey(svcs, none)).toBe(enabledKey(reordered, none));
  });

  it('changes when a service is dispelled', () => {
    const after = { ...none, discord: true };
    expect(enabledKey(svcs, after)).not.toBe(enabledKey(svcs, none));
  });

  it('changes when a service is summoned', () => {
    const before = { ...none, slack: true };
    expect(enabledKey(svcs, before)).not.toBe(enabledKey(svcs, none));
  });

  it('is empty for an all-disabled catalog', () => {
    const all = { ...none, messenger: true, discord: true, slack: true };
    expect(enabledKey(svcs, all)).toBe('');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `corepack pnpm vitest run tests/unit/welcome.test.ts`

Expected: FAIL — `enabledKey is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/shared/welcome.ts`:

```ts
/** A key over the enabled *membership*, deliberately order-insensitive.
 *  Home reseeds its staged selection whenever this changes, so joining ids in
 *  `settings.order` would make a drag-reorder discard the user's picks and
 *  clear the filter. Sorted, a reorder is invisible here and a summon or
 *  dispel still trips it. */
export function enabledKey(
  services: readonly ServiceMeta[],
  disabled: Record<ServiceId, boolean>,
): string {
  return services
    .filter((svc) => !disabled[svc.id])
    .map((svc) => svc.id)
    .sort()
    .join(',');
}
```

`ServiceMeta` is already imported in this file; confirm the import line covers it and add it if not.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `corepack pnpm vitest run tests/unit/welcome.test.ts`

Expected: PASS.

- [ ] **Step 5: Use it in `Welcome.tsx`**

Add `enabledKey` to the existing import from `'../../../shared/welcome'`, then replace lines 20-26:

```tsx
  const state = useShell((s) => s.state);
  const enabledKey = state
    ? state.services
        .filter((svc) => !state.settings.disabled[svc.id])
        .map((svc) => svc.id)
        .join(',')
    : '';
```

with:

```tsx
  const state = useShell((s) => s.state);
  const key = state ? enabledKey(state.services, state.settings.disabled) : '';
```

Then update the two references to the old local. The reseed effect at lines 58-61 becomes:

```tsx
  useEffect(() => {
    setSelected(new Set(key ? (key.split(',') as ServiceId[]) : []));
    setQuery('');
  }, [key]);
```

The local is renamed to `key` because `enabledKey` is now the imported function; shadowing it would work but reads as a mistake. `key.split(',')` feeds a `Set`, so the sorted order is immaterial.

- [ ] **Step 6: Verify**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`

Expected: all three green.

- [ ] **Step 7: Confirm the bug is actually gone**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`

Expected: the existing suites pass — `home.spec.ts` in particular, which asserts the seeded `aria-pressed` state this effect produces.

- [ ] **Step 8: Checkpoint**

Stop. Report Task 2 and ask the user to run `/grimoire-core:commit`.

---

## Task 3: `useTileReorder` + the rail

Adds the dependency, the shared hook, and converts the rail. The rail is done first because it is the simpler geometry — a single row or column, no wrapping, no scroll container.

**Files:**

- Modify: `package.json` — add `motion` to `devDependencies`
- Create: `src/renderer/src/components/useTileReorder.ts`
- Modify: `src/renderer/src/components/ServiceTile.tsx` — drop the HTML5 handlers, add the grab cursor
- Modify: `src/renderer/src/components/Rail.tsx` — wrap the tiles in a `Reorder.Group`

**Interfaces:**

- Consumes: `applySubsetOrder` from Task 1
- Produces: `useTileReorder(liveIds: ServiceId[], order: ServiceId[])` returning
  `{ shown: ServiceId[]; groupProps: { values: ServiceId[]; onReorder(next: ServiceId[]): void }; itemProps: { onPointerDown(): void; onDragStart(): void; onDragEnd(): void }; consumeDrag(): boolean }`
- Produces: `ServiceTile` without its `onReorder` prop — Task 4 does not touch it, but `Rail.tsx` is its only caller

- [ ] **Step 1: Install the dependency**

Run: `corepack pnpm add -D motion@^13.1.0`

Expected: `package.json` gains `"motion": "^13.1.0"` under `devDependencies`, and `pnpm-lock.yaml` updates. Verify it landed in `devDependencies` and not `dependencies` — anything in `dependencies` ships inside the asar.

- [ ] **Step 2: Write the hook**

Create `src/renderer/src/components/useTileReorder.ts`:

```tsx
import { useEffect, useRef, useState } from 'react';
import type { ServiceId } from '../../../shared/types';
import { applySubsetOrder } from './reorder';

/** Drag-local ordering for a `Reorder.Group` of service tiles.
 *
 *  `Reorder.Group` is controlled and fires `onReorder` on every crossing, not
 *  on release — wired straight to `service:reorder` a single drag would send
 *  one settings write, one full broadcast and one app-menu rebuild per
 *  crossing. The drag therefore runs on a local draft and reaches main once.
 *
 *  @param liveIds the ids this surface renders, from broadcast state
 *  @param order   the full `settings.order`, including disabled ids */
export function useTileReorder(liveIds: ServiceId[], order: ServiceId[]) {
  const [draft, setDraft] = useState<ServiceId[] | null>(null);
  const keyAtDragStart = useRef('');
  const didDrag = useRef(false);
  const liveKey = liveIds.join(',');
  const shown = draft ?? liveIds;

  // The draft is NOT cleared on commit: that would render one frame of the
  // pre-drag order while the IPC round-trip is in flight, a visible snap-back
  // at the moment the drop is meant to take. It clears when the broadcast
  // lands — and because the arriving order equals the draft, clearing shows
  // nothing. Any *other* change to the order mid-drag trips the same
  // condition, so a stale draft can never fight the broadcast state.
  useEffect(() => {
    if (draft && liveKey !== keyAtDragStart.current) setDraft(null);
  }, [liveKey, draft]);

  return {
    shown,
    groupProps: { values: shown, onReorder: setDraft },
    itemProps: {
      // a fresh press is not yet a drag; without this a drag that ends off the
      // tile would leave the flag set and swallow the next genuine click
      onPointerDown: () => {
        didDrag.current = false;
      },
      onDragStart: () => {
        didDrag.current = true;
        keyAtDragStart.current = liveKey;
      },
      onDragEnd: () => {
        if (shown.join(',') === keyAtDragStart.current) {
          setDraft(null);
          return;
        }
        window.goetia.send('service:reorder', {
          orderedIds: applySubsetOrder(order, shown),
        });
      },
    },
    /** true ⇒ this click is the tail of a drag and must be swallowed. Pointer
     *  drag does not suppress the trailing click the way HTML5 DnD did, and an
     *  unswallowed one activates the tile it was just dragged. */
    consumeDrag: () => {
      if (!didDrag.current) return false;
      didDrag.current = false;
      return true;
    },
  };
}
```

- [ ] **Step 3: Strip drag-and-drop from `ServiceTile`**

In `src/renderer/src/components/ServiceTile.tsx`, delete `onReorder` from the `Props` interface and from the destructured parameter list, then replace the drag attributes on the `<button>`:

```tsx
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/goetia-service', service.id)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const from = e.dataTransfer.getData('text/goetia-service');
        if (from && from !== service.id) onReorder(from, service.id);
      }}
      onClick={onActivate}
```

with just:

```tsx
      onClick={onActivate}
```

Then add the grab cursor to the `className` template, immediately after `focus-visible:ring-accent`:

```tsx
        focus-visible:ring-accent cursor-grab active:cursor-grabbing
```

Leave `stateClasses` alone. `scale-105` stays on the button: Motion owns the wrapper div's transform, not this one.

- [ ] **Step 4: Convert the rail**

In `src/renderer/src/components/Rail.tsx`:

Add the import (after the `zustand` store import, before the component imports so Biome's ordering holds):

```tsx
import { Reorder } from 'motion/react';
```

and:

```tsx
import { useTileReorder } from './useTileReorder';
```

Delete the `import { moveTo } from './reorder';` line and the `reorder` helper (lines 56-64) — `useTileReorder` sends the message now. `Rail` does not import `applySubsetOrder`; the hook does.

`useTileReorder` is a hook and `Rail` returns early on `if (!state) return null`, so the hook must be called above that return or React's rules-of-hooks lint fires. Restructure the top of the component to:

```tsx
export default function Rail() {
  const state = useShell((s) => s.state);
  const visible = state
    ? state.services.filter((svc) => !state.settings.disabled[svc.id])
    : [];
  const reorder = useTileReorder(
    visible.map((svc) => svc.id),
    state ? state.services.map((svc) => svc.id) : [],
  );
  if (!state) return null;
  const pos = state.settings.railPosition;
  const horizontal = pos === 'top';
  const byId = new Map(state.services.map((svc) => [svc.id, svc]));
  const updateReady = updatePending(state.update);
```

Then replace the tile map:

```tsx
      {visible.map((svc) => (
        <ServiceTile … onReorder={reorder} />
      ))}
```

with:

```tsx
      <Reorder.Group
        as="div"
        axis={horizontal ? 'x' : 'y'}
        {...reorder.groupProps}
        // same gap and alignment the tiles have inside the nav today, so the
        // rendered result is unchanged — the box exists only so Motion has a
        // container whose children are all items
        className={
          horizontal
            ? 'flex flex-row items-center gap-1.5'
            : 'flex flex-col items-center gap-1.5'
        }
      >
        {reorder.shown.map((id) => {
          const svc = byId.get(id);
          if (!svc) return null;
          return (
            <Reorder.Item
              key={id}
              value={id}
              as="div"
              className="relative flex-none"
              // drop-shadow, not boxShadow: this wrapper is a rectangle and the
              // tile inside it is a squircle, so a box-shadow would halo the
              // wrapper's corners. drop-shadow follows the rendered alpha.
              whileDrag={{
                scale: 1.1,
                zIndex: 10,
                filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.45))',
              }}
              {...reorder.itemProps}
            >
              <ServiceTile
                service={svc}
                runtime={state.runtime[svc.id]}
                muted={state.muted[svc.id]}
                active={!state.homeOpen && state.activeId === svc.id}
                onActivate={() => {
                  if (reorder.consumeDrag()) return;
                  window.goetia.send('service:activate', { serviceId: svc.id });
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  window.goetia.send('service:setMuted', {
                    serviceId: svc.id,
                    muted: !state.muted[svc.id],
                  });
                }}
              />
            </Reorder.Item>
          );
        })}
      </Reorder.Group>
```

`axis` is explicit rather than left to Motion's detection: a rail holding one service has no second item to infer an axis from.

- [ ] **Step 5: Verify it compiles and the suite is green**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`

Expected: all three green. If `typecheck` complains that `moveTo` is imported but unused in `Rail.tsx`, the import was not removed in Step 4.

- [ ] **Step 6: Verify the existing e2e still passes**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`

Expected: green. `restart.spec.ts` and `home.spec.ts` both click `[data-testid="service-tile"]`, which now sits inside a wrapper div — the testid is on the button and is unaffected, so a failure here means the wrapper broke hit-testing.

- [ ] **Step 7: Look at it**

Run: `corepack pnpm dev`

Confirm by hand: dragging a rail tile lifts it and its neighbours slide to fill the gap; no green ⊕ badge appears at any point; releasing does **not** activate the dragged service; a plain click still does; the active tile keeps its gradient and its `scale-105`.

- [ ] **Step 8: Checkpoint**

Stop. Report Task 3 and ask the user to run `/grimoire-core:commit`.

---

## Task 4: Home

Converts the Summoned band, adds `layoutScroll` to the scroll container, and removes `moveTo` — Task 4 orphans its last caller.

**Files:**

- Modify: `src/renderer/src/components/welcome/PickTile.tsx` — drop the HTML5 handlers, swap `onReorder` for a `grab` flag
- Modify: `src/renderer/src/components/welcome/ServiceBand.tsx` — `layoutScroll` on the scroll container
- Modify: `src/renderer/src/components/Welcome.tsx` — the Summoned band becomes a `Reorder.Group`
- Modify: `src/renderer/src/components/reorder.ts` — delete `moveTo`
- Test: `tests/unit/reorder.test.ts` — delete the `moveTo` describe block

**Interfaces:**

- Consumes: `useTileReorder` from Task 3, `enabledKey` from Task 2
- Produces: `PickTile` with `grab?: boolean` replacing `onReorder?`

- [ ] **Step 1: Strip drag-and-drop from `PickTile`**

In `src/renderer/src/components/welcome/PickTile.tsx`, replace the `onReorder` prop:

```tsx
  /** present ⇒ this tile is a drag source and drop target (Summoned only —
   *  Unbound has no order to edit) */
  onReorder?(fromId: string, toId: string): void;
```

with:

```tsx
  /** Summoned tiles reorder; Unbound has no order to edit. Cosmetic only —
   *  the drag itself belongs to the Reorder.Item wrapping this tile. */
  grab?: boolean;
```

Update the destructured parameters to `{ service, on, onToggle, grab = false }`, then delete the four drag attributes from the `<button>`:

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

and make the `className` carry the cursor:

```tsx
      className={`group flex w-full min-w-0 flex-col items-center gap-1.5 rounded-tile p-1 outline-none
        focus-visible:ring-2 focus-visible:ring-accent
        ${grab ? 'cursor-grab active:cursor-grabbing' : ''}`}
```

- [ ] **Step 2: Add `layoutScroll` to the band**

In `src/renderer/src/components/welcome/ServiceBand.tsx`, add the import:

```tsx
import { motion } from 'motion/react';
```

and replace the scroll container:

```tsx
      {/* the scroll container: growth stops here and never reaches the page */}
      <div className="min-h-0 overflow-y-auto">{children}</div>
```

with:

```tsx
      {/* the scroll container: growth stops here and never reaches the page.
          layoutScroll is what lets Motion correct a drag inside it for scroll
          offset — without it a drag in a scrolled Summoned band computes
          crossings against stale rects. */}
      <motion.div layoutScroll className="min-h-0 overflow-y-auto">
        {children}
      </motion.div>
```

- [ ] **Step 3: Convert the Summoned band**

In `src/renderer/src/components/Welcome.tsx`:

Add `import { Reorder } from 'motion/react';` and `import { useTileReorder } from './useTileReorder';`, and delete the `moveTo` import.

Delete the `reorder` helper (lines 121-124):

```tsx
  const reorder = (fromId: string, toId: string) =>
    window.goetia.send('service:reorder', {
      orderedIds: moveTo(order, fromId as ServiceId, toId as ServiceId),
    });
```

`sections` is computed after the early `if (!state) return null`, so the hook cannot read it. Call the hook near the other hooks at the top of the component, deriving its inputs directly from `state`:

```tsx
  const summonedIds = state
    ? state.services
        .filter((svc) => !state.settings.disabled[svc.id])
        .map((svc) => svc.id)
    : [];
  const reorder = useTileReorder(
    summonedIds,
    state ? state.services.map((svc) => svc.id) : [],
  );
```

Place this above `if (!state) return null;`. It is the same list `welcomeSections` produces for `summoned` — `order.filter((id) => enabled.has(id))` — derived from the same broadcast state, so the two cannot disagree.

Drop the `draggable` parameter from `tiles`, since Unbound is now its only caller:

```tsx
  const tiles = (ids: ServiceId[], nineUp = false) => (
    <div className={`grid gap-2 ${nineUp ? 'grid-cols-9' : 'grid-cols-[repeat(auto-fill,76px)]'}`}>
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
```

Add the Summoned renderer beside it:

```tsx
  // the same 76px auto-fill track as `tiles`; axis="xy" because the grid wraps
  // and a tile dragged to another row moves on both axes
  const summonedTiles = (
    <Reorder.Group
      as="div"
      axis="xy"
      {...reorder.groupProps}
      className="grid grid-cols-[repeat(auto-fill,76px)] gap-2"
    >
      {pick(reorder.shown).map((svc) => (
        <Reorder.Item
          key={svc.id}
          value={svc.id}
          as="div"
          className="relative min-w-0"
          // drop-shadow, not boxShadow: this wrapper is a rectangle and the
          // tile inside it is a squircle, so a box-shadow would halo the
          // wrapper's corners. drop-shadow follows the rendered alpha.
          whileDrag={{
            scale: 1.1,
            zIndex: 10,
            filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.45))',
          }}
          {...reorder.itemProps}
        >
          <PickTile
            service={svc}
            on={selected.has(svc.id)}
            grab
            onToggle={() => {
              if (reorder.consumeDrag()) return;
              toggle(svc.id);
            }}
          />
        </Reorder.Item>
      ))}
    </Reorder.Group>
  );
```

Then swap the two call sites: line 220 `{tiles(sections.summoned, true)}` becomes `{summonedTiles}`, and line 236 `tiles(visibleUnbound, false, fresh)` becomes `tiles(visibleUnbound, fresh)`.

- [ ] **Step 4: Delete `moveTo`**

`Rail.tsx` and `Welcome.tsx` were its only callers and both are converted. Delete the whole `moveTo` function and its doc comment from `src/renderer/src/components/reorder.ts`, and delete the `describe('moveTo', …)` block and the now-unused `base` const and `moveTo` import from `tests/unit/reorder.test.ts`.

- [ ] **Step 5: Verify**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`

Expected: all three green. `typecheck` catching an unresolved `moveTo` means a caller was missed.

Run: `grep -rn "moveTo\|text/goetia-service\|draggable" src/renderer/src tests/`

Expected: no output. Any hit is a leftover from the HTML5 implementation.

- [ ] **Step 6: Verify the existing e2e still passes**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`

Expected: green — `welcome.spec.ts` and `home.spec.ts` both drive `[data-testid="pick-tile"]` and its `aria-pressed` state, which the `consumeDrag` guard now sits in front of. A failure here means `consumeDrag()` is swallowing ordinary clicks, i.e. `onPointerDown` is not resetting the flag.

- [ ] **Step 7: Look at it**

Run: `corepack pnpm dev`, open Home with ⌘0.

Confirm by hand: dragging a Summoned tile lifts it and the others reflow around it, including across a row boundary; no ⊕ badge; releasing does not toggle the service off; clicking still toggles; **stage two Unbound picks, then drag a Summoned tile — the two picks must survive and the search box must keep its text** (Task 2's fix, now reachable); with enough services to make Summoned scroll, a drag while scrolled lands where it looks like it will.

- [ ] **Step 8: Checkpoint**

Stop. Report Task 4 and ask the user to run `/grimoire-core:commit`.

---

## Task 5: end-to-end coverage for the persisted reorder

**Correction made during execution:** this plan claimed the path had no e2e coverage. It does — `tests/e2e/home.spec.ts:183` ("dragging a summoned tile reorders the rail immediately") drags with Playwright's `dragTo()`. That test keeps passing after the conversion, because `dragTo` drives real mouse events rather than synthesising HTML5 drag events, and Motion's pointer drag picks them up. What is genuinely uncovered is **persistence** — that the single commit on `onDragEnd` reaches settings and survives a restart — plus the rail surface, which had no drag test at all.

**Second correction:** the first draft of these tests enabled three services (discord, messenger, slack). Every enabled service is another real site loading in a real view, and with three of them `app.close()` raced the reorder's write often enough to hang worker teardown — roughly 1 run in 6. A trace confirmed every drag assertion passed and only the close hung, and a drag-free probe with the same three services was stable 6/6, isolating it to drag-plus-close under that load. The tests use the two services `home.spec` already drags. The permutation arithmetic is `applySubsetOrder`'s job and is unit-tested; these two cover wiring.

**Files:**

- Create: `tests/e2e/reorder.spec.ts`

**Interfaces:**

- Consumes: the running app; no source imports

- [ ] **Step 1: Write the test**

Create `tests/e2e/reorder.spec.ts`. The profile persists between launches, which is how `restart.spec.ts` proves persistence — there is no settings readback helper in the suite and this plan does not add one.

```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Page, _electron as electron, expect, test } from '@playwright/test';

const isShell = (p: { url(): string }) =>
  p.url().startsWith('file://') && !p.url().includes('loading.html');

// discord, messenger, slack enabled — three tiles is the smallest set in which
// a middle position is distinguishable from an end one
const THREE_ENABLED = {
  discord: false,
  instagram: true,
  messenger: false,
  shopee: true,
  slack: false,
  telegram: true,
  tiktok: true,
  whatsapp: true,
  zalo: true,
};

function makeProfile(): string {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-'));
  writeFileSync(join(profile, 'settings.json'), JSON.stringify({ disabled: THREE_ENABLED }));
  return profile;
}

async function launch(profile: string) {
  const app = await electron.launch({
    args: ['out/main/index.js', `--goetia-user-data=${profile}`],
  });
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
  return { app, win };
}

const railOrder = (win: Page) =>
  win
    .locator('[data-testid="service-tile"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));

/** Motion needs real intermediate moves to cross its drag threshold and to
 *  register the crossing — a single jump from source to target does neither. */
async function dragTile(win: Page, from: string, to: string) {
  const source = win.locator(`[data-testid="pick-tile"][title="${from}"]`);
  const target = win.locator(`[data-testid="pick-tile"][title="${to}"]`);
  const a = await source.boundingBox();
  const b = await target.boundingBox();
  if (!a || !b) throw new Error(`missing tile: ${from} → ${to}`);
  await win.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await win.mouse.down();
  await win.mouse.move(a.x + a.width / 2 + 8, a.y + a.height / 2, { steps: 4 });
  await win.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await win.mouse.up();
}

test('reorder: a Home drag persists across a restart', async () => {
  const profile = makeProfile();
  const first = await launch(profile);

  // catalog order is alphabetical, so the three enabled services start here
  expect(await railOrder(first.win)).toEqual(['Discord', 'Messenger', 'Slack']);

  await first.win.locator('[data-testid="home-btn"]').click();
  await expect(first.win.locator('[data-testid="welcome"]')).toBeVisible();

  await dragTile(first.win, 'Discord', 'Slack');

  // the rail reordering behind Home is the in-app confirmation of the drop
  await expect
    .poll(() => railOrder(first.win))
    .toEqual(['Messenger', 'Slack', 'Discord']);

  // and the drag must not have toggled the service it dragged
  await expect(
    first.win.locator('[data-testid="pick-tile"][title="Discord"]'),
  ).toHaveAttribute('aria-pressed', 'true');

  await first.app.close();

  const second = await launch(profile);
  expect(await railOrder(second.win)).toEqual(['Messenger', 'Slack', 'Discord']);
  await second.app.close();
});
```

- [ ] **Step 2: Run it**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e tests/e2e/reorder.spec.ts`

Expected: PASS.

If the post-drag order assertion fails with the tiles unmoved, the drag threshold was not crossed — raise the `steps` counts in `dragTile`, and add a short `await win.waitForTimeout(50)` between `mouse.down()` and the first `mouse.move`. Do not widen the assertion to "some order changed"; a reorder test that does not name the expected order tests nothing.

- [ ] **Step 3: Run the full suite**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`

Expected: all green.

- [ ] **Step 4: Run it again to check for flake**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e tests/e2e/reorder.spec.ts` three times.

Expected: PASS every time. If it is intermittent, report that rather than adding retries — a flaky reorder test is worse than none, and the honest outcome is to say so and let the user decide whether to keep it.

- [ ] **Step 5: Checkpoint**

Stop. Report Task 5 and ask the user to run `/grimoire-core:commit`.

---

## Task 6: documentation

`CLAUDE.md` currently says nothing about drag or reorder — verified with `grep -n "drag\|reorder\|Drag\|Reorder" CLAUDE.md`, which returns nothing. So this task is purely additive: it records the one invariant a future change could plausibly break, which is that `onReorder` must not reach IPC.

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the invariant to the reliability section**

Add to the "Reliability & performance" list, after the "Report on change only" bullet:

```markdown
- Tile reorder is drag-local: `Reorder.Group` fires `onReorder` on every crossing, so `useTileReorder` holds a draft order in the renderer and sends `service:reorder` once, on `onDragEnd`. Never wire `onReorder` straight to IPC — one drag would be one settings write, one broadcast and one app-menu rebuild per crossing.
```

- [ ] **Step 2: Verify markdown lint**

Run: `npx markdownlint-cli2 CLAUDE.md docs/superpowers/plans/2026-08-12-tile-reorder-live-gap.md docs/superpowers/specs/2026-08-12-tile-reorder-live-gap-design.md`

Expected: `0 issues`.

- [ ] **Step 3: Final verification**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`

Expected: all green.

- [ ] **Step 4: Checkpoint**

Stop. Report Task 6 and ask the user to run `/grimoire-core:commit`.
