# Home Board ↔ Rail Reorder Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A rail drag while Home is open syncs a clean board silently (no spurious "Apply new order"), and asks before discarding a dirty board's staged edit.

**Architecture:** Renderer-only coordination through two new zustand store fields: Welcome publishes a `homeDirty` flag and listens for a `discardHomeDraft` tick; `useTileReorder` gains an optional commit intercept plus `cancelDraft()`; Rail intercepts the drop when the board is dirty and renders a confirm prompt. No main-process or IPC-channel changes — the flows reuse the existing `service:reorder` and `home:setOpen` channels.

**Tech Stack:** React 19 + zustand + motion/react (renderer), vitest (unit), Playwright `_electron` (e2e).

**Spec:** `docs/superpowers/specs/2026-08-24-home-rail-reorder-sync-design.md`

## Global Constraints

- **NEVER run `git commit` yourself.** At every commit gate: stop, report the task done, and ask the user to run `/grimoire-core:commit`. Do not write `GRIMOIRE_COMMIT_MSG.txt`. This overrides any workflow habit of committing per task.
- Definition of done: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, and `corepack pnpm e2e` all green.
- E2E must run with `ELECTRON_RUN_AS_NODE` unset (VS Code shells export it): prefix every e2e command with `env -u ELECTRON_RUN_AS_NODE`.
- Renderer-only change: no new IPC channels, no `src/main/**` edits, no `src/shared/ipc.ts` edits.
- `src/shared/**` stays process-agnostic: no `electron`, no DOM imports.
- Exact UI copy: dialog title "Reorder the rail?", body "The Home board has unapplied changes. Reordering the rail now discards them.", primary button "Discard changes & reorder", secondary button "Keep editing".
- Reorder must reach IPC at most once per drag — the intercept defers the one send, never adds another.
- Any edited `.md` must pass `npx markdownlint-cli2 <file>` (repo config applies; prose is never hard-wrapped).

---

### Task 1: `followLiveOrder` helper in `shared/welcome.ts`

**Files:**

- Modify: `src/shared/welcome.ts` (add one function after `welcomeSections`, around line 118)
- Test: `tests/unit/welcome.test.ts`

**Interfaces:**

- Consumes: nothing new — `ServiceId` from `src/shared/types.ts`.
- Produces: `followLiveOrder(staged: ServiceId[], prevLive: string, nextLive: ServiceId[]): ServiceId[]` — Task 2's Welcome effect calls it. `prevLive` is the comma-join of the live summoned order the board last saw; a clean board (staged join equals `prevLive`) returns a copy of `nextLive`, a dirty board returns `staged` unchanged (same reference).

- [x] **Step 1: Write the failing tests**

Add to `tests/unit/welcome.test.ts`: extend the existing import from `../../src/shared/welcome` with `followLiveOrder`, then append this describe block at the end of the file:

```ts
describe('followLiveOrder', () => {
  const live = ['zalo', 'messenger'] as ServiceId[];

  it('follows the new live order when the board was clean', () => {
    const staged = ['messenger', 'zalo'] as ServiceId[];
    expect(followLiveOrder(staged, 'messenger,zalo', live)).toEqual(live);
  });

  it('keeps a dirty board untouched, same reference', () => {
    const dirty = ['zalo'] as ServiceId[];
    expect(followLiveOrder(dirty, 'messenger,zalo', live)).toBe(dirty);
  });

  it('treats an empty board over an empty live order as clean', () => {
    expect(followLiveOrder([], '', live)).toEqual(live);
  });

  it('returns a copy, never the live array itself', () => {
    const staged = ['messenger', 'zalo'] as ServiceId[];
    expect(followLiveOrder(staged, 'messenger,zalo', live)).not.toBe(live);
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `corepack pnpm vitest run tests/unit/welcome.test.ts`

Expected: FAIL — `followLiveOrder is not a function` (the export does not exist yet).

- [x] **Step 3: Write the implementation**

In `src/shared/welcome.ts`, after `welcomeSections` (before `enabledKey`):

```ts
/** The staged list after the live summoned order changes under the board:
 *  a clean board (staged equals the previous live order) follows the new
 *  one, so a rail drag lands on the board without lighting the confirm; a
 *  dirty board keeps its edit untouched. */
export function followLiveOrder(
  staged: ServiceId[],
  prevLive: string,
  nextLive: ServiceId[],
): ServiceId[] {
  return staged.join(',') === prevLive ? [...nextLive] : staged;
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `corepack pnpm vitest run tests/unit/welcome.test.ts`

Expected: PASS, all describe blocks green.

- [x] **Step 5: Lint and typecheck**

Run: `corepack pnpm lint && corepack pnpm typecheck`

Expected: both clean.

- [x] **Step 6: Commit gate**

Stop and ask the user to run `/grimoire-core:commit` (suggested subject: `feat(welcome): add followLiveOrder for board↔rail order sync`). Do not commit yourself.

---

### Task 2: Store fields + Welcome coordination effects + clean-board e2e

**Files:**

- Modify: `src/renderer/src/store.ts`
- Modify: `src/renderer/src/components/Welcome.tsx` (lines 94–105 restructure + new effects)
- Test: `tests/e2e/reorder.spec.ts` (new test + one helper)

**Interfaces:**

- Consumes: `followLiveOrder` from Task 1.
- Produces (store, used by Task 3's Rail): `homeDirty: boolean`, `setHomeDirty(dirty: boolean): void`, `homeDiscardTick: number`, `discardHomeDraft(): void`. Welcome publishes `homeDirty` whenever its staged edit differs from the live summoned order (false on unmount); `discardHomeDraft()` bumps the tick and Welcome reseeds `staged` to the live summoned order when it changes.

- [x] **Step 1: Write the failing e2e test**

In `tests/e2e/reorder.spec.ts`, add a helper after `railOrder` (top level):

```ts
const boardOrder = (win: Page) =>
  win
    .locator('[data-testid="welcome-section-summoned"] [data-testid="pick-tile"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('title') ?? ''));
```

Then append this test at the end of the file:

```ts
test('reorder: a rail drag while Home is open syncs a clean board silently', async () => {
  const profile = makeProfile();
  const { app, win } = await launch(profile);

  await expect(win.locator('[data-testid="service-tile"]')).toHaveCount(2);
  expect(await railOrder(win)).toEqual(['Messenger', 'Zalo']);

  await win.locator('[data-testid="home-btn"]').click();
  await expect(win.locator('[data-testid="welcome"]')).toBeVisible();
  await expect.poll(() => boardOrder(win)).toEqual(['Messenger', 'Zalo']);

  await drag(
    win,
    '[data-testid="service-tile"][aria-label="Zalo"]',
    '[data-testid="service-tile"][aria-label="Messenger"]',
  );
  await expect.poll(() => railOrder(win)).toEqual(['Zalo', 'Messenger']);

  // the board followed the rail silently: same order, no confirm lit up
  await expect.poll(() => boardOrder(win)).toEqual(['Zalo', 'Messenger']);
  await expect(win.getByRole('button', { name: 'Apply new order' })).toHaveCount(0);
  await expect(win.getByRole('button', { name: 'No changes' })).toBeDisabled();

  await app.close();
});
```

- [x] **Step 2: Run the new test to verify it fails**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e tests/e2e/reorder.spec.ts`

Expected: the new test FAILS on the `boardOrder` poll (board stays `['Messenger', 'Zalo']`) or on the "Apply new order" count (the stale board lights the confirm today). The two existing tests in the file stay green.

- [x] **Step 3: Add the store fields**

Replace the whole `ShellStore` interface and `useShell` creation in `src/renderer/src/store.ts` with:

```ts
interface ShellStore {
  state: ShellState | null;
  setState(s: ShellState): void;
  /** set when the user opens Settings expecting to land on Updates */
  focusSection: 'updates' | null;
  setFocusSection(s: 'updates' | null): void;
  /** Home board's staged edit differs from the live summoned order —
   *  published by Welcome, read by the rail at drag end */
  homeDirty: boolean;
  setHomeDirty(dirty: boolean): void;
  /** bumped when another surface (the rail prompt) discards the board's
   *  staged edit; Welcome reseeds when it changes */
  homeDiscardTick: number;
  discardHomeDraft(): void;
}

export const useShell = create<ShellStore>((set) => ({
  state: null,
  setState: (s) => set({ state: s }),
  focusSection: null,
  setFocusSection: (focusSection) => set({ focusSection }),
  homeDirty: false,
  setHomeDirty: (homeDirty) => set({ homeDirty }),
  homeDiscardTick: 0,
  discardHomeDraft: () => set((s) => ({ homeDiscardTick: s.homeDiscardTick + 1 })),
}));
```

- [x] **Step 4: Wire Welcome**

In `src/renderer/src/components/Welcome.tsx`:

4a. Extend the shared/welcome import (line 4–15) with `followLiveOrder`.

4b. Replace lines 94–105 (from `if (!state) return null;` through the `const orderChanged = …` line) with the block below. It hoists the live order above the early return (the new hooks need it every render), adds the three coordination effects, and drops the now-duplicate `liveSummoned`/`orderChanged` lines:

```ts
  // Hoisted above the early return: the coordination effects need these on
  // every render, and hooks may not sit behind a conditional return.
  const liveSummoned = state
    ? state.services.filter((svc) => !state.settings.disabled[svc.id]).map((svc) => svc.id)
    : [];
  const liveKey = liveSummoned.join(',');
  // covers adds and removals too (the joins differ), so it doubles as `dirty`
  const orderChanged = staged.join(',') !== liveKey;

  // The rail reads this at drag end: a drop over a dirty board must ask first.
  useEffect(() => {
    useShell.getState().setHomeDirty(orderChanged);
  }, [orderChanged]);
  useEffect(() => () => useShell.getState().setHomeDirty(false), []);

  // The rail prompt's "Discard changes & reorder": the same reseed the
  // Discard button does, triggered from outside this component.
  const discardTick = useShell((s) => s.homeDiscardTick);
  const seenDiscard = useRef(discardTick);
  useEffect(() => {
    if (discardTick === seenDiscard.current) return;
    seenDiscard.current = discardTick;
    const s = useShell.getState().state;
    if (!s) return;
    setStaged(s.services.filter((svc) => !s.settings.disabled[svc.id]).map((svc) => svc.id));
  }, [discardTick]);

  // A rail drop while the board is clean lands here: follow the new live
  // order silently so the board mirrors the drag and no confirm lights up.
  // A dirty board is never clobbered — the rail prompt cleans it first.
  const prevLive = useRef(liveKey);
  // biome-ignore lint/correctness/useExhaustiveDependencies: liveKey is the trigger; liveSummoned is the array it was joined from
  useEffect(() => {
    const prev = prevLive.current;
    if (prev === liveKey) return;
    prevLive.current = liveKey;
    setStaged((cur) => followLiveOrder(cur, prev, liveSummoned));
  }, [liveKey]);

  if (!state) return null;

  const stagedSet = new Set(staged);
  const enabled = new Set<ServiceId>(liveSummoned);
  const order = state.services.map((svc) => svc.id);
  const named = byName(state.services);
  const delta = summonDelta(order, enabled, stagedSet);
```

Everything below (line 106's `summonLabel` call onward) is untouched — `liveSummoned`, `orderChanged`, `order`, `enabled`, `named`, `delta` all keep their names and types.

- [x] **Step 5: Run the e2e test to verify it passes**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e tests/e2e/reorder.spec.ts`

Expected: PASS — all three tests in the file.

- [x] **Step 6: Run the unit suite, lint, typecheck**

Run: `corepack pnpm test && corepack pnpm lint && corepack pnpm typecheck`

Expected: all green (no unit test touches the store or Welcome directly; this catches regressions and type errors).

- [x] **Step 7: Commit gate**

Stop and ask the user to run `/grimoire-core:commit` (suggested subject: `feat(home): board follows a rail reorder while clean`). Do not commit yourself.

---

### Task 3: `useTileReorder` intercept + Rail prompt + dirty-board e2e

**Files:**

- Create: `src/renderer/src/components/RailReorderPrompt.tsx`
- Modify: `src/renderer/src/components/useTileReorder.ts`
- Modify: `src/renderer/src/components/Rail.tsx`
- Test: `tests/e2e/reorder.spec.ts` (new test)

**Interfaces:**

- Consumes: `homeDirty` and `discardHomeDraft()` from Task 2's store; `applySubsetOrder` already inside the hook.
- Produces: `useTileReorder(liveIds, order, intercept?)` — `intercept?: (orderedIds: ServiceId[]) => boolean`, called at drag end with the merged full order when the drag changed it; returning `true` defers the commit (draft stays shown, nothing sent). The hook's return object gains `cancelDraft(): void` (drops the draft, tiles snap back). `RailReorderPrompt` takes `{ onConfirm(): void; onCancel(): void }`.

- [x] **Step 1: Write the failing e2e test**

Append to `tests/e2e/reorder.spec.ts`:

```ts
test('reorder: a rail drag over a dirty board asks before discarding', async () => {
  const profile = makeProfile();
  const { app, win } = await launch(profile);
  const welcome = win.locator('[data-testid="welcome"]');
  const prompt = win.locator('[data-testid="rail-reorder-prompt"]');
  const zalo = '[data-testid="service-tile"][aria-label="Zalo"]';
  const messenger = '[data-testid="service-tile"][aria-label="Messenger"]';

  await expect(win.locator('[data-testid="service-tile"]')).toHaveCount(2);
  await win.locator('[data-testid="home-btn"]').click();
  await expect(welcome).toBeVisible();

  // dirty the board: stage a banish, commit nothing
  const summoned = welcome.locator('[data-testid="welcome-section-summoned"]');
  await summoned.getByRole('button', { name: 'Messenger' }).click();
  await expect(win.getByRole('button', { name: 'Banish 1 service' })).toBeEnabled();

  // Keep editing: rail snaps back, the staged edit survives, still on Home
  await drag(win, zalo, messenger);
  await expect(prompt).toBeVisible();
  await win.getByRole('button', { name: 'Keep editing' }).click();
  await expect(prompt).toHaveCount(0);
  await expect.poll(() => railOrder(win)).toEqual(['Messenger', 'Zalo']);
  await expect(win.getByRole('button', { name: 'Banish 1 service' })).toBeEnabled();
  await expect(welcome).toBeVisible();

  // same drag again, this time discard & reorder
  await drag(win, zalo, messenger);
  await expect(prompt).toBeVisible();
  await win.getByRole('button', { name: 'Discard changes & reorder' }).click();
  await expect(prompt).toHaveCount(0);
  await expect.poll(() => railOrder(win)).toEqual(['Zalo', 'Messenger']);

  // the edit is gone and the board mirrors the new live order
  await expect(summoned.getByRole('button', { name: 'Messenger' })).toBeVisible();
  await expect.poll(() => boardOrder(win)).toEqual(['Zalo', 'Messenger']);
  await expect(win.getByRole('button', { name: 'No changes' })).toBeDisabled();

  await app.close();
});
```

- [x] **Step 2: Run the new test to verify it fails**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e tests/e2e/reorder.spec.ts`

Expected: the new test FAILS at `await expect(prompt).toBeVisible()` — no prompt exists yet (today the drag commits straight through and the board's staged edit goes stale). Earlier tests in the file stay green.

- [x] **Step 3: Add the intercept and `cancelDraft` to the hook**

In `src/renderer/src/components/useTileReorder.ts`:

3a. Change the signature and doc comment tail:

```ts
/** Drag-local ordering for a `Reorder.Group` of service tiles.
 *
 *  `Reorder.Group` is controlled and fires `onReorder` on every crossing, not
 *  on release — wired straight to `service:reorder` a single drag would send
 *  one settings write, one full broadcast and one app-menu rebuild per
 *  crossing. The drag therefore runs on a local draft and reaches main once.
 *
 *  @param liveIds   the ids this surface renders, from broadcast state
 *  @param order     the full `settings.order`, including disabled ids
 *  @param intercept called at drag end with the merged order when the drag
 *                   changed it; returning true defers the commit — the draft
 *                   stays shown and nothing is sent until the caller either
 *                   sends `service:reorder` itself or calls `cancelDraft` */
export function useTileReorder(
  liveIds: ServiceId[],
  order: ServiceId[],
  intercept?: (orderedIds: ServiceId[]) => boolean,
) {
```

3b. Replace the `onDragEnd` body:

```ts
      onDragEnd: () => {
        document.body.classList.remove(DRAG_CURSOR);
        if (shown.join(',') === keyAtDragStart.current) {
          setDraft(null);
          return;
        }
        const orderedIds = applySubsetOrder(order, shown);
        if (intercept?.(orderedIds)) return;
        window.goetia.send('service:reorder', { orderedIds });
      },
```

3c. Add to the returned object, after `consumeDrag`:

```ts
    /** drop a deferred draft: the tiles snap back to the live order */
    cancelDraft: () => setDraft(null),
```

- [x] **Step 4: Create `RailReorderPrompt.tsx`**

Create `src/renderer/src/components/RailReorderPrompt.tsx`:

```tsx
import { useEffect } from 'react';

interface Props {
  onConfirm(): void;
  onCancel(): void;
}

/** Confirm gate for a rail drop while the Home board holds an unapplied
 *  edit: committing would silently invalidate the order the user is
 *  previewing, so the choice is theirs. Escape and the backdrop both keep
 *  the edit. */
export default function RailReorderPrompt({ onConfirm, onCancel }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // capture + stopPropagation: Welcome's own Escape handler (leave Home)
      // must never fire underneath the prompt
      e.stopPropagation();
      onCancel();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-dismiss, mirrored on Escape
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape is handled on window above
    <div
      data-testid="rail-reorder-prompt"
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: swallows backdrop dismissal inside the panel */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: not an interactive control */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Reorder the rail?"
        className="w-[340px] rounded-lg border border-border bg-bg-1 p-4
          shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-semibold text-text-1">Reorder the rail?</h2>
        <p className="mt-1.5 text-text-2">
          The Home board has unapplied changes. Reordering the rail now discards them.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className="w-full rounded-ctl bg-linear-to-br from-[#FFB43D] via-[#FF8A2A]
              to-[#F04E3E] px-4 py-2.5 font-semibold text-[#15181F]
              shadow-[0_0_12px_rgba(255,158,44,0.35)] transition-opacity duration-150
              hover:opacity-90"
          >
            Discard changes &amp; reorder
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-ctl border border-border bg-bg-2 px-4 py-2 text-text-1
              transition-colors duration-120 hover:border-accent"
          >
            Keep editing
          </button>
        </div>
      </div>
    </div>
  );
}
```

If `corepack pnpm lint` reports the biome-ignore comments as unused, delete the unused ones — they are there only in case biome's a11y rules fire on the click-to-dismiss backdrop.

- [x] **Step 5: Wire Rail**

In `src/renderer/src/components/Rail.tsx`:

5a. Add imports: `import { useState } from 'react';`, `import type { ServiceId } from '../../../shared/types';`, `import RailReorderPrompt from './RailReorderPrompt';`.

5b. Replace the top of the component (lines 47–56, through `if (!state) return null;`) with:

```tsx
export default function Rail() {
  const state = useShell((s) => s.state);
  // the hook must run before the early return, so its inputs are guarded
  // rather than the call site
  const visible = state ? state.services.filter((svc) => !state.settings.disabled[svc.id]) : [];
  // a drop over a dirty Home board is deferred behind the prompt; the
  // drafted order parks here until the user picks a side
  const [pending, setPending] = useState<ServiceId[] | null>(null);
  const reorder = useTileReorder(
    visible.map((svc) => svc.id),
    state ? state.services.map((svc) => svc.id) : [],
    (orderedIds) => {
      if (!useShell.getState().homeDirty) return false;
      setPending(orderedIds);
      return true;
    },
  );
  if (!state) return null;
```

5c. After the `silenced` line (`const silenced = …`), add the two handlers:

```tsx
  const confirmPending = () => {
    if (!pending) return;
    // clean the board first, so its follow-live sync adopts the new order
    useShell.getState().discardHomeDraft();
    window.goetia.send('service:reorder', { orderedIds: pending });
    setPending(null);
  };
  const cancelPending = () => {
    reorder.cancelDraft();
    setPending(null);
    // the kept edit lives on Home; make sure that is what the user sees
    window.goetia.send('home:setOpen', { open: true });
  };
```

5d. Wrap the returned JSX in a fragment and render the prompt after the `</nav>`:

```tsx
  return (
    <>
      <nav
        …everything currently returned, unchanged…
      </nav>
      {pending && <RailReorderPrompt onConfirm={confirmPending} onCancel={cancelPending} />}
    </>
  );
```

(The prompt uses `fixed inset-0`, so rendering inside Rail still covers the whole window; `z-30` sits above SettingsView's `z-20` and QuickSwitcher's `z-10`.)

- [x] **Step 6: Run the e2e file to verify it passes**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e tests/e2e/reorder.spec.ts`

Expected: PASS — all four tests in the file, including both prompt paths.

- [x] **Step 7: Run unit suite, lint, typecheck**

Run: `corepack pnpm test && corepack pnpm lint && corepack pnpm typecheck`

Expected: all green.

- [x] **Step 8: Commit gate**

Stop and ask the user to run `/grimoire-core:commit` (suggested subject: `feat(rail): confirm before a reorder discards a staged Home edit`). Do not commit yourself.

---

### Task 4: CLAUDE.md guardrail update + full verification

**Files:**

- Modify: `CLAUDE.md` (the "Tile reorder never streams to IPC" bullet under Reliability & performance)

**Interfaces:**

- Consumes: the shipped behavior from Tasks 1–3 (`followLiveOrder`, `RailReorderPrompt`).
- Produces: nothing — documentation and the definition-of-done run.

- [x] **Step 1: Extend the guardrail bullet**

In `CLAUDE.md`, find the bullet beginning `- Tile reorder never streams to IPC:` and append to the end of that bullet (same paragraph, after "…commit as a single frame (2026-08-15, user decision)."):

```text
 While Home is open a rail drop also lands on the board: a clean board follows the new live order silently (`followLiveOrder`), a dirty one holds the drop behind `RailReorderPrompt` — discard the staged edit and reorder, or keep editing (the rail snaps back and `home:setOpen` returns the board) — so reorder still reaches IPC at most once per drag (2026-08-24, user decision).
```

- [x] **Step 2: Lint the markdown**

Run: `npx markdownlint-cli2 CLAUDE.md`

Expected: 0 issues (fix anything the edit introduced; leave pre-existing findings elsewhere untouched and report them).

- [x] **Step 3: Full definition-of-done run**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`

Expected: everything green, including the untouched e2e suites (`home.spec.ts` still passes — the board's staged flows are unchanged).

- [x] **Step 4: Commit gate**

Stop and ask the user to run `/grimoire-core:commit` (suggested subject: `docs: record the board↔rail reorder sync guardrail`). Do not commit yourself.
