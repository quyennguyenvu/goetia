# Welcome sections, Dispel, and selling points implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the Home screen's service picker into a SUMMONED and an UNBOUND section that only re-sort on confirm, add a `Dispel` button that abandons a staged edit in place, and replace the three tip cards with three non-overlapping ones.

**Architecture:** One new pure helper (`welcomeSections`) in `src/shared/welcome.ts` partitions the service list by the **live** enabled set. `Welcome.tsx` renders two sections from that partition while `PickTile`'s glow keeps following the **staged** selection — two independent axes, which is what makes a deselected tile stay put. `Dispel` reuses the reseed the component already performs on every visit, and reuses `summonLabel().disabled` for its own disabled state, so no new decision logic enters the codebase.

**Tech Stack:** Electron + electron-vite, React 19, Tailwind v4 (CSS-first tokens in `src/renderer/src/tokens.css`), vitest for unit tests, Playwright (`_electron`) for e2e, Biome for lint/format.

Spec: `docs/superpowers/specs/2026-08-10-welcome-sections-and-selling-points-design.md`

## Global Constraints

- **Section labels** are the literal strings `Summoned` and `Unbound` in source, cased by the CSS `uppercase` class — never typed in capitals.
- **Empty-section copy** is exactly `Nothing yet.` under SUMMONED and `Every one is bound.` under UNBOUND.
- **Reset button label** is exactly `Dispel`. No count, no suffix.
- **Card copy** is exact and must not be reworded:
  - `Chat only` — `No feeds, no shops. Reload (⌘/Ctrl R) returns to the chat.`
  - `Stays signed in` — `Each service keeps its own session. Sign in once.`
  - `Quiet & light` — `Only messages for you get a count. Idle chats sleep.`
- **Section membership is derived from `state.settings.disabled`** (live), never from the local `selected` state. Getting this backwards is the one bug this feature can have.
- **`src/shared/**` stays process-agnostic** — no `electron` import, no DOM import, per `CLAUDE.md`.
- **Seven services exist**: `messenger`, `telegram`, `zalo`, `whatsapp`, `discord`, `tiktok`, `shopee`. Both sections list in `settings.order`.
- **No commits by the agent.** Where a task ends in a commit, stop and ask the human to run `/commit`; a drafted message is provided to paste.
- **Definition of done** (`CLAUDE.md`): `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` green, plus `corepack pnpm e2e` because this touches renderer wiring. Run e2e as `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e` — a VS Code shell exports that variable and it breaks Electron launch.

---

## File Structure

| File | Responsibility | Change |
| --- | --- | --- |
| `src/shared/welcome.ts` | Pure welcome-screen decision logic | Add `WelcomeSections` + `welcomeSections()` |
| `tests/unit/welcome.test.ts` | Unit oracle for that logic | Add a `welcomeSections` describe block |
| `src/renderer/src/components/Welcome.tsx` | The Home surface | Two sections, Dispel button, new cards/icons |
| `tests/e2e/welcome.spec.ts` | Fresh-install flow | Assert sections, and that a pick does not move a tile |
| `tests/e2e/home.spec.ts` | Seeded-profile flow | Assert deselect keeps position, and Dispel restores |

`Welcome.tsx` is ~220 lines and gains a `Section` subcomponent plus two icons while losing two icons — it stays a single focused file, in line with the other components in that directory. No split needed.

---

## Task 1: `welcomeSections` partition helper

**Files:**

- Modify: `src/shared/welcome.ts` (append after `summonLabel`)
- Test: `tests/unit/welcome.test.ts` (append a new `describe`)

**Interfaces:**

- Consumes: `ServiceId` from `./types`; `DEFAULT_SETTINGS.order` in the test.
- Produces:

  ```ts
  export interface WelcomeSections {
    summoned: ServiceId[];
    unbound: ServiceId[];
  }
  export function welcomeSections(
    order: ServiceId[],
    enabled: ReadonlySet<ServiceId>,
  ): WelcomeSections;
  ```

  Task 2 imports both.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/welcome.test.ts`. The existing file already has `import { summonDelta, summonLabel } from '../../src/shared/welcome';` at the top — extend that import to `import { summonDelta, summonLabel, welcomeSections } from '../../src/shared/welcome';` and add the block below. It reuses the existing `order` and `set` helpers defined at the top of that file.

```ts
describe('welcomeSections', () => {
  it('puts everything in unbound on a fresh install', () => {
    expect(welcomeSections(order, set())).toEqual({
      summoned: [],
      unbound: order,
    });
  });

  it('puts everything in summoned when all are enabled', () => {
    expect(welcomeSections(order, set(...order))).toEqual({
      summoned: order,
      unbound: [],
    });
  });

  it('splits a mixed set', () => {
    expect(welcomeSections(order, set('messenger', 'zalo'))).toEqual({
      summoned: ['messenger', 'zalo'],
      unbound: ['telegram', 'whatsapp', 'discord', 'tiktok', 'shopee'],
    });
  });

  it('lists each section in rail order, not enabled-set order', () => {
    // 'shopee' is last in order but first into the Set
    expect(welcomeSections(order, set('shopee', 'telegram')).summoned).toEqual([
      'telegram',
      'shopee',
    ]);
  });

  it('ignores ids that are enabled but not in order', () => {
    expect(welcomeSections(['messenger', 'zalo'], set('messenger', 'discord'))).toEqual({
      summoned: ['messenger'],
      unbound: ['zalo'],
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
corepack pnpm test -- welcome
```

Expected: FAIL. Vitest reports a transform/import error along the lines of `"welcomeSections" is not exported by "src/shared/welcome.ts"`. The existing `summonDelta` / `summonLabel` blocks in the same file also fail to run, because the bad import kills the whole module — that is expected at this step.

- [ ] **Step 3: Write the minimal implementation**

Append to `src/shared/welcome.ts`:

```ts
export interface WelcomeSections {
  summoned: ServiceId[];
  unbound: ServiceId[];
}

/** Partition for the Home picker, in rail order. Keyed on the LIVE enabled set,
 *  never the staged selection: a tile must not move out from under the cursor
 *  mid-edit, so sections re-sort only once a confirm lands. */
export function welcomeSections(
  order: ServiceId[],
  enabled: ReadonlySet<ServiceId>,
): WelcomeSections {
  return {
    summoned: order.filter((id) => enabled.has(id)),
    unbound: order.filter((id) => !enabled.has(id)),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
corepack pnpm test -- welcome
```

Expected: PASS — all four `summonDelta` cases, all six `summonLabel` cases, and the five new `welcomeSections` cases.

- [ ] **Step 5: Lint and typecheck**

```bash
corepack pnpm lint && corepack pnpm typecheck
```

Expected: both exit 0. If Biome rewrites formatting, accept its output.

- [ ] **Step 6: Hand off the commit**

Do **not** run `git commit`. Stop and tell the human:

> Task 1 is green. Please run `/commit` — suggested message: `feat(welcome): add welcomeSections partition helper`

---

## Task 2: two sections in the picker

**Files:**

- Modify: `src/renderer/src/components/Welcome.tsx`
- Test: `tests/e2e/welcome.spec.ts`, `tests/e2e/home.spec.ts`

**Interfaces:**

- Consumes: `welcomeSections` from Task 1. The `WelcomeSections` type is only inferred, never imported. `serviceById` is **not** used — map ids back through `state.services`, which is already the rail-ordered list.
- Produces: two DOM anchors that Task 3's tests and the e2e specs rely on: `data-testid="welcome-section-summoned"` and `data-testid="welcome-section-unbound"`. `PickTile`'s public shape is unchanged (`{ service, on, onToggle }`), and its `aria-pressed` still mirrors the **staged** selection, which is what the existing `home.spec.ts` assertions read.

- [ ] **Step 1: Write the failing e2e assertions**

Two edits.

First, in `tests/e2e/welcome.spec.ts`, replace the block from the `// fresh profile: welcome shows…` comment through `await expect(summon).toHaveText('Summon 1 service');` with:

```ts
  // fresh profile: welcome shows, no rail tiles, no service views
  const welcome = win.locator('[data-testid="welcome"]');
  await expect(welcome).toBeVisible();
  const tiles = win.locator('[data-testid="service-tile"]');
  await expect(tiles).toHaveCount(0);

  // nothing is summoned yet: that section is empty and all seven wait below
  const summoned = welcome.locator('[data-testid="welcome-section-summoned"]');
  const unbound = welcome.locator('[data-testid="welcome-section-unbound"]');
  await expect(summoned).toContainText('Nothing yet.');
  await expect(unbound.getByRole('button')).toHaveCount(7);

  // confirm is disabled until something is selected
  const summon = win.getByRole('button', { name: /^Summon/ });
  await expect(summon).toBeDisabled();

  // selecting stages the change without moving the tile out of Unbound
  await unbound.getByRole('button', { name: 'Zalo' }).click();
  await expect(summon).toHaveText('Summon 1 service');
  await expect(unbound.getByRole('button', { name: 'Zalo' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(summoned.getByRole('button', { name: 'Zalo' })).toHaveCount(0);
```

Leave everything from `await summon.click();` onward exactly as it is. Do **not** assert the re-sort here: on a fresh install, confirming enables a service, which unmounts the whole welcome screen (`homeOpen` is false, so the derived `showWelcome` goes false). The existing `await expect(welcome).toHaveCount(0);` below already covers that, and the re-sort belongs in the seeded-profile spec instead — the second edit.

Second, in `tests/e2e/home.spec.ts`, inside the existing test `home: banishing the active service leaves welcome on screen`, replace the two lines

```ts
  await win.locator('[data-testid="home-btn"]').click();
  await welcome.getByRole('button', { name: 'Messenger' }).click();
```

with:

```ts
  await win.locator('[data-testid="home-btn"]').click();
  const summoned = welcome.locator('[data-testid="welcome-section-summoned"]');
  const unbound = welcome.locator('[data-testid="welcome-section-unbound"]');
  await summoned.getByRole('button', { name: 'Messenger' }).click();

  // deselecting drops the glow but leaves the tile exactly where it was
  await expect(summoned.getByRole('button', { name: 'Messenger' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(unbound.getByRole('button', { name: 'Messenger' })).toHaveCount(0);
```

Then, at the end of that same test — after the existing `await expect(win.getByRole('button', { name: 'No changes' })).toBeDisabled();` and before `await app.close();` — add the re-sort assertion. Home stays open here, so the screen is still mounted to observe it:

```ts
  // confirming is the one moment a tile changes section
  await expect(unbound.getByRole('button', { name: 'Messenger' })).toBeVisible();
  await expect(summoned.getByRole('button', { name: 'Messenger' })).toHaveCount(0);
```

- [ ] **Step 2: Run the e2e specs to verify they fail**

```bash
env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e -- welcome.spec.ts home.spec.ts
```

Expected: FAIL. Playwright times out resolving `[data-testid="welcome-section-summoned"]` — the element does not exist yet.

- [ ] **Step 3: Add the `Section` subcomponent**

In `src/renderer/src/components/Welcome.tsx`, insert this immediately after the `PickTile` function and before `export default function Welcome()`:

```tsx
function Section({
  testid,
  label,
  services,
  empty,
  selected,
  onToggle,
}: {
  testid: string;
  label: string;
  services: ServiceMeta[];
  empty: string;
  selected: ReadonlySet<ServiceId>;
  onToggle(id: ServiceId): void;
}) {
  return (
    <div data-testid={testid} className="flex flex-col items-center gap-1.5">
      <p className="text-xs uppercase tracking-wide text-text-2">
        {label}
        <span className="tabular"> · {services.length}</span>
      </p>
      {services.length === 0 ? (
        <p className="text-xs text-text-2 opacity-70">{empty}</p>
      ) : (
        <div className="flex flex-wrap items-start justify-center gap-2">
          {services.map((svc) => (
            <PickTile
              key={svc.id}
              service={svc}
              on={selected.has(svc.id)}
              onToggle={() => onToggle(svc.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Derive the partition and render both sections**

Still in `Welcome.tsx`, extend the existing import on line 4 to pull in the new helper:

```tsx
import {
  buildDisabledPatch,
  summonDelta,
  summonLabel,
  welcomeSections,
} from '../../../shared/welcome';
```

Then, just below the existing `const order = state.services.map((svc) => svc.id);` line, add:

```tsx
  // sections follow the LIVE enabled set; the tile glow follows `selected`.
  // Keeping the two axes independent is what stops a tile jumping out from
  // under the cursor when it is deselected.
  const byId = new Map(state.services.map((svc) => [svc.id, svc]));
  const sections = welcomeSections(order, enabled);
  const pick = (ids: ServiceId[]) => ids.map((id) => byId.get(id)).filter((svc) => svc !== undefined);
```

Finally, replace the flat tile row — the whole `<div className="flex flex-wrap items-start justify-center gap-2"> … </div>` block that maps over `state.services` — with:

```tsx
      {/* wide enough for all seven tiles on one row (7 × 76px + 6 × gap) */}
      <div className="flex w-full max-w-[600px] flex-col items-center gap-3">
        <Section
          testid="welcome-section-summoned"
          label="Summoned"
          services={pick(sections.summoned)}
          empty="Nothing yet."
          selected={selected}
          onToggle={toggle}
        />
        <div className="h-px w-full bg-border" />
        <Section
          testid="welcome-section-unbound"
          label="Unbound"
          services={pick(sections.unbound)}
          empty="Every one is bound."
          selected={selected}
          onToggle={toggle}
        />
      </div>
```

- [ ] **Step 5: Run lint, typecheck, and unit tests**

```bash
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test
```

Expected: all three exit 0. If `typecheck` complains that `pick` returns `(ServiceMeta | undefined)[]`, the `.filter((svc) => svc !== undefined)` predicate is what narrows it — do not replace it with a non-null assertion.

- [ ] **Step 6: Run the e2e specs to verify they pass**

```bash
env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e -- welcome.spec.ts home.spec.ts
```

Expected: PASS, all four tests across the two files.

- [ ] **Step 7: Hand off the commit**

Do **not** run `git commit`. Stop and tell the human:

> Task 2 is green. Please run `/commit` — suggested message: `feat(welcome): split the picker into summoned and unbound sections`

---

## Task 3: the Dispel button

**Files:**

- Modify: `src/renderer/src/components/Welcome.tsx`
- Test: `tests/e2e/home.spec.ts`

**Interfaces:**

- Consumes: `summonLabel`'s existing return shape `{ label: string; disabled: boolean }` from Task 1's module, and the `welcome-section-summoned` anchor from Task 2.
- Produces: a `Dispel` button. Its accessible name is exactly `Dispel`, so `getByRole('button', { name: /^Summon/ })` in `welcome.spec.ts` still matches only the confirm.

- [ ] **Step 1: Write the failing e2e test**

Append to `tests/e2e/home.spec.ts`:

```ts
test('home: Dispel abandons a staged edit without leaving the screen', async () => {
  const { app, win } = await launch();
  const welcome = win.locator('[data-testid="welcome"]');
  const dispel = win.getByRole('button', { name: 'Dispel' });

  await win.locator('[data-testid="home-btn"]').click();

  // nothing staged: both buttons rest dead together
  await expect(dispel).toBeDisabled();
  await expect(win.getByRole('button', { name: 'No changes' })).toBeDisabled();

  const summoned = welcome.locator('[data-testid="welcome-section-summoned"]');
  const unbound = welcome.locator('[data-testid="welcome-section-unbound"]');
  await summoned.getByRole('button', { name: 'Messenger' }).click();
  await unbound.getByRole('button', { name: 'Telegram' }).click();
  await expect(win.getByRole('button', { name: 'Summon 1 · Banish 1' })).toBeEnabled();
  await expect(dispel).toBeEnabled();

  await dispel.click();

  // back to the live set, still on Home, nothing persisted
  await expect(welcome).toBeVisible();
  await expect(summoned.getByRole('button', { name: 'Messenger' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(unbound.getByRole('button', { name: 'Telegram' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(win.getByRole('button', { name: 'No changes' })).toBeDisabled();
  await expect(dispel).toBeDisabled();
  await expect(win.locator('[data-testid="service-tile"]')).toHaveCount(2);
  await app.close();
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e -- home.spec.ts
```

Expected: FAIL. Playwright times out on `getByRole('button', { name: 'Dispel' })` — no such button.

- [ ] **Step 3: Add the handler and wrap the button row**

In `src/renderer/src/components/Welcome.tsx`, add a `dispel` handler beside the existing `summon` handler:

```tsx
  const summon = () =>
    window.goetia.send('settings:update', { disabled: buildDisabledPatch(order, selected) });
  // the same reseed the screen does on every visit, under the user's thumb
  const dispel = () => setSelected(enabled);
```

Then replace the single confirm `<button>` element at the end of the JSX with this row. The confirm's own attributes and classes are unchanged; it is only being wrapped and given a sibling:

```tsx
      <div className="flex items-center gap-2">
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
```

`disabled={disabled}` on both is deliberate: `summonLabel` already returns `disabled: true` exactly when the delta is empty — both the fresh `0 → 0` case and the `n → n` no-change case — which is precisely when there is nothing to dispel. Do not introduce a second predicate for it.

`setSelected(enabled)` is safe to pass the `enabled` set directly: `enabled` is rebuilt on every render from `state.settings.disabled` and never mutated, and `selected` is typed `ReadonlySet<ServiceId>`.

- [ ] **Step 4: Run lint, typecheck, and unit tests**

```bash
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test
```

Expected: all three exit 0.

- [ ] **Step 5: Run the e2e specs to verify they pass**

```bash
env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e -- welcome.spec.ts home.spec.ts
```

Expected: PASS, all five tests across the two files.

- [ ] **Step 6: Hand off the commit**

Do **not** run `git commit`. Stop and tell the human:

> Task 3 is green. Please run `/commit` — suggested message: `feat(welcome): add Dispel to abandon a staged edit in place`

---

## Task 4: three non-overlapping cards

**Files:**

- Modify: `src/renderer/src/components/Welcome.tsx`

**Interfaces:**

- Consumes: the existing `Tip` component, unchanged (`{ icon, title, body }`).
- Produces: nothing other tasks depend on. `RailIcon` and `KeysIcon` are deleted; `ChatIcon` stays; `LockIcon` and `MoonIcon` are added.

There is no unit or e2e test for this task: the deliverable is three strings and two SVG paths, and asserting copy in a Playwright test would only restate the source. Verification is `lint` (which fails on the now-unused icon components) plus a look at the real screen in Step 5.

- [ ] **Step 1: Delete the two dead icons**

In `src/renderer/src/components/Welcome.tsx`, delete the entire `RailIcon` function (the one rendering three `<rect>`s) and the entire `KeysIcon` function (the one rendering a `<rect>` and a `<path d="M7 15h10" />`). Leave `ChatIcon` exactly as it is.

- [ ] **Step 2: Add the two replacement icons**

Insert after `ChatIcon`, matching its attribute style exactly:

```tsx
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
```

- [ ] **Step 3: Replace the three cards**

Replace the whole `<div className="flex flex-wrap justify-center gap-3">` block containing the three `<Tip>` elements with:

```tsx
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
```

Leave the hint line below the sections untouched — `Pick at least one — come back here anytime with ⌘/Ctrl 0` is now the only place `⌘/Ctrl 0` is taught on this screen, and Settings → Shortcuts still lists every binding.

- [ ] **Step 4: Run the full gate**

```bash
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test
env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e
```

Expected: all four green. The full e2e run (not just the two specs) matters here: `loading.spec.ts`, `smoke.spec.ts`, and `updates.spec.ts` seed their own profiles and must be unaffected.

- [ ] **Step 5: Look at the real screen**

```bash
corepack pnpm dev
```

Check, with a profile that has at least one service enabled, that: `⌘/Ctrl 0` opens Home; both section headers render with counts; deselecting a summoned tile dims it in place; `Dispel` restores it; confirming re-sorts it into the other section; and the three cards read correctly in both light and dark themes.

- [ ] **Step 6: Hand off the commit**

Do **not** run `git commit`. Stop and tell the human:

> Task 4 is green and the full gate passes. Please run `/commit` — suggested message: `feat(welcome): replace the tip cards with three distinct selling points`

---

## Notes for the implementer

**The one bug this feature can have.** If sections are derived from `selected` instead of `enabled`, everything still compiles and looks plausible — tiles just teleport between sections as you click them, which is exactly the behavior this work exists to prevent. `welcomeSections(order, enabled)` — never `welcomeSections(order, selected)`.

**Why `PickTile` is not touched.** Its `on` prop already means "is staged on", and that is still the only thing driving the molten face. A tile in SUMMONED with `on={false}` renders today's dim treatment, which is precisely the staged-to-banish look the spec asks for. Resist adding a ring or badge for pending state.

**Why there is no new unit test for Dispel.** Its disabled state is `summonLabel().disabled`, already covered by all six rows of the existing label table in `tests/unit/welcome.test.ts`; its click handler is a one-line `setSelected`, covered end-to-end in Task 3.
