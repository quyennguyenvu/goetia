# Home Redesign and Summon Cap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cap summoned services at 9 (the ⌘1…⌘9 accelerator ceiling), replace Home's two layouts with one split-console screen (hero column + board), and move Summon/Discard into the hero where they are always in reach.

**Architecture:** Pure decision logic (`MAX_SUMMONED`, `capBlocked`, `trimToCap`, label copy) lands in `src/shared/welcome.ts` with vitest coverage; `SettingsStore.normalize` enforces `enabled ≤ 9` on every read and persists a one-time boot trim surfaced as `ShellState.capTrimmed`; the renderer recomposes `Welcome.tsx` into `HomeHero` (portal, gauge, actions) beside the existing two `ServiceBand`s, deleting `WelcomeIntro` and the `fresh` branch.

**Tech Stack:** Electron + electron-vite, React 19, Tailwind v4 tokens, motion/react, vitest, Playwright e2e, Biome.

**Spec:** `docs/superpowers/specs/2026-08-14-home-redesign-and-summon-cap-design.md`

## Global Constraints

- **Commits:** NEVER run `git commit` or write `GRIMOIRE_COMMIT_MSG.txt`. At each task's commit step, STOP and ask the user to run `/grimoire-core:commit`, offering the suggested message. Wait for the user; do not auto-commit to keep the workflow moving.
- Definition of done for the whole plan: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` all green, and `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e` green (VS Code shells export `ELECTRON_RUN_AS_NODE`, which breaks Playwright's Electron launch).
- `src/shared/**` stays process-agnostic: no `electron` imports, no DOM types.
- No new IPC channels. `settings:update` already carries `disabled` + `order`; main-process normalize is the cap's enforcement point.
- `MAX_SUMMONED` must equal `MAX_SERVICE_ACCELERATORS` (9) — locked by a unit test.
- Copy strings, verbatim: `Pick a service to begin` (empty-state primary), `Discard` (reset button), `Nothing summoned yet — pick from below.` (empty Summoned band), `At 9 of 9 — unpick a summoned tile to make room.` (at-cap hint), `9 services is the maximum` (capped tile title), gauge captions `summoned` / `after summon` / `full`.
- Markdown edits must pass `npx markdownlint-cli2 <file>`; never hard-wrap prose.
- Service views layer above the shell renderer: any state where Home must be visible resolves views with `show: false`.

---

### Task 1: Shared cap seams (`MAX_SUMMONED`, `capBlocked`, `trimToCap`, label copy)

**Files:**

- Modify: `src/shared/welcome.ts`
- Test: `tests/unit/welcome.test.ts`
- Create: `tests/unit/cap.test.ts`

**Interfaces:**

- Consumes: `MAX_SERVICE_ACCELERATORS` from `src/main/lib/service-accelerator.ts` (test only — the shared module must not import from `src/main`).
- Produces: `MAX_SUMMONED: 9`; `capBlocked(selected: ReadonlySet<ServiceId>, id: ServiceId): boolean`; `trimToCap(order: ServiceId[], disabled: Record<ServiceId, boolean>): { disabled: Record<ServiceId, boolean>; trimmed: ServiceId[] }`; `summonLabel` now returns `{ label: 'Pick a service to begin', disabled: true }` for the empty state. Tasks 2, 5, 6 rely on these exact names.

- [ ] **Step 1: Update the empty-state label expectation and add the new tests**

In `tests/unit/welcome.test.ts`, change the first `summonLabel` case:

```ts
  it('invites a pick on a fresh install', () => {
    expect(label([], [])).toEqual({ label: 'Pick a service to begin', disabled: true });
  });
```

Append to the same file's imports: `capBlocked`, `trimToCap`, `MAX_SUMMONED` from `../../src/shared/welcome`. Then append these suites at the end of the file:

```ts
describe('capBlocked', () => {
  const nine = order.slice(0, 9);

  it('blocks an unpicked tile once the staged set is full', () => {
    expect(capBlocked(set(...nine), order[9])).toBe(true);
  });

  it('never blocks a tile that is already picked', () => {
    expect(capBlocked(set(...nine), nine[0])).toBe(false);
  });

  it('blocks nothing below the cap', () => {
    expect(capBlocked(set(...nine.slice(0, 8)), order[9])).toBe(false);
  });
});

describe('trimToCap', () => {
  const flags = (enabled: ServiceId[]) =>
    Object.fromEntries(order.map((id) => [id, !enabled.includes(id)])) as Record<
      ServiceId,
      boolean
    >;

  it('disables everything past the ninth enabled position, in rail order', () => {
    const { disabled, trimmed } = trimToCap(order, flags([...order]));
    expect(trimmed).toEqual([order[9]]);
    expect(disabled[order[9]]).toBe(true);
    expect(order.slice(0, 9).every((id) => !disabled[id])).toBe(true);
  });

  it('returns a legal set untouched, same reference', () => {
    const input = flags(order.slice(0, 9));
    const { disabled, trimmed } = trimToCap(order, input);
    expect(trimmed).toEqual([]);
    expect(disabled).toBe(input);
  });

  it('never mutates its input', () => {
    const input = flags([...order]);
    const copy = { ...input };
    trimToCap(order, input);
    expect(input).toEqual(copy);
  });
});

describe('MAX_SUMMONED', () => {
  it('is nine', () => {
    expect(MAX_SUMMONED).toBe(9);
  });
});
```

Create `tests/unit/cap.test.ts` — the constant-drift lock:

```ts
import { describe, expect, it } from 'vitest';
import { MAX_SERVICE_ACCELERATORS } from '../../src/main/lib/service-accelerator';
import { MAX_SUMMONED } from '../../src/shared/welcome';

describe('summon cap', () => {
  // the cap exists because ⌘/Ctrl 1…9 runs out; the two must never drift
  it('equals the service-accelerator ceiling', () => {
    expect(MAX_SUMMONED).toBe(MAX_SERVICE_ACCELERATORS);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `corepack pnpm vitest run tests/unit/welcome.test.ts tests/unit/cap.test.ts`
Expected: FAIL — `capBlocked`, `trimToCap`, `MAX_SUMMONED` are not exported; the fresh-install label case gets `Summon 0 services`.

- [ ] **Step 3: Implement in `src/shared/welcome.ts`**

Add after the imports:

```ts
/** Summoned services stop at nine because service accelerators do: ⌘/Ctrl+0
 *  is Home and Electron cannot bind CmdOrCtrl+10 (service-accelerator.ts).
 *  cap.test.ts keeps the two constants equal. */
export const MAX_SUMMONED = 9;

/** Whether picking `id` is blocked by the cap: the staged result is full and
 *  this tile is not part of it. Picked tiles stay live so a slot can be freed
 *  within the same edit. */
export function capBlocked(selected: ReadonlySet<ServiceId>, id: ServiceId): boolean {
  return selected.size >= MAX_SUMMONED && !selected.has(id);
}

/** Enforce the cap on a persisted enabled set: every enabled id past the
 *  ninth enabled position in `order` is disabled. A legal set comes back as
 *  the same reference with an empty `trimmed`. */
export function trimToCap(
  order: ServiceId[],
  disabled: Record<ServiceId, boolean>,
): { disabled: Record<ServiceId, boolean>; trimmed: ServiceId[] } {
  const enabled = order.filter((id) => !disabled[id]);
  if (enabled.length <= MAX_SUMMONED) return { disabled, trimmed: [] };
  const trimmed = enabled.slice(MAX_SUMMONED);
  const next = { ...disabled };
  for (const id of trimmed) next[id] = true;
  return { disabled: next, trimmed };
}
```

In `summonLabel`, change the final return:

```ts
  return { label: hasEnabled ? 'No changes' : 'Pick a service to begin', disabled: true };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `corepack pnpm vitest run tests/unit/welcome.test.ts tests/unit/cap.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit gate**

STOP — ask the user to run `/grimoire-core:commit`. Suggested message: `feat(cap): add MAX_SUMMONED seams — capBlocked, trimToCap, empty-state label`.

---

### Task 2: Settings boot trim, persisted once

**Files:**

- Modify: `src/main/settings.ts`
- Test: `tests/unit/settings.test.ts`

**Interfaces:**

- Consumes: `trimToCap` from Task 1.
- Produces: `SettingsStore.bootTrimmed: ServiceId[]` (readonly field — ids the cap disabled when this store first read the file; empty on every later launch). `SettingsStore.get()` now never returns more than 9 enabled. Task 3 reads `bootTrimmed`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/settings.test.ts` (inside `describe('SettingsStore', …)`); add `SERVICES` to the imports from `../../src/shared/services`:

```ts
  it('trims an over-cap install to nine on first read and persists the trim', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    const allOn = Object.fromEntries(SERVICES.map((s) => [s.id, false]));
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ disabled: allOn }));

    const store = new SettingsStore(dir);
    const s = store.get();
    const enabled = s.order.filter((id) => !s.disabled[id]);
    expect(enabled).toHaveLength(9);
    // default order ends with zalo — the tenth enabled position is the trim
    expect(store.bootTrimmed).toEqual(['zalo']);
    expect(s.disabled.zalo).toBe(true);

    // persisted: a second instance reads a legal file and trims nothing
    const again = new SettingsStore(dir);
    expect(again.bootTrimmed).toEqual([]);
    expect(again.get().disabled.zalo).toBe(true);
  });

  it('reports no boot trim for a legal install', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    expect(new SettingsStore(dir).bootTrimmed).toEqual([]);
  });

  it('caps a hostile update payload on read', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    const store = new SettingsStore(dir);
    const allOn = Object.fromEntries(SERVICES.map((s) => [s.id, false])) as Settings['disabled'];
    const s = store.update({ disabled: allOn });
    expect(s.order.filter((id) => !s.disabled[id])).toHaveLength(9);
  });
```

Add `Settings` to the type imports from `../../src/shared/types` if not already there.

- [ ] **Step 2: Run to verify failure**

Run: `corepack pnpm vitest run tests/unit/settings.test.ts`
Expected: FAIL — `bootTrimmed` does not exist; over-cap reads return 10 enabled.

- [ ] **Step 3: Implement in `src/main/settings.ts`**

Add to the imports: `import { trimToCap } from '../shared/welcome';` and `ServiceId` is already imported.

Change `normalize` to return the trim alongside the settings — replace its final `return { … }` with:

```ts
  const disabled = fill(raw.disabled, DEFAULT_SETTINGS.disabled);
  const capped = trimToCap(order, disabled);
  return {
    settings: {
      ...raw,
      order,
      muted: fill(raw.muted, DEFAULT_SETTINGS.muted),
      disabled: capped.disabled,
      neverHibernate: fill(raw.neverHibernate, DEFAULT_SETTINGS.neverHibernate),
    },
    trimmed: capped.trimmed,
  };
```

and change its signature to `function normalize(raw: Settings): { settings: Settings; trimmed: ServiceId[] }` (update the doc comment's last sentence: "…fill missing record keys from defaults, and cap the enabled set at `MAX_SUMMONED`.").

In `SettingsStore`:

```ts
export class SettingsStore {
  private conf: Conf<Settings>;
  /** ids the cap disabled when this store first read the file — persisted
   *  immediately so the trim happens once, surfaced so the shell can say so */
  readonly bootTrimmed: ServiceId[];

  constructor(cwd: string) {
    this.conf = new Conf<Settings>({ cwd, configName: 'settings', defaults: DEFAULT_SETTINGS });
    const first = normalize({ ...DEFAULT_SETTINGS, ...this.conf.store });
    this.bootTrimmed = first.trimmed;
    if (first.trimmed.length > 0) this.conf.set('disabled', first.settings.disabled);
  }

  get(): Settings {
    return normalize({ ...DEFAULT_SETTINGS, ...this.conf.store }).settings;
  }
  // update() unchanged — it already returns this.get()
}
```

- [ ] **Step 4: Run to verify pass**

Run: `corepack pnpm vitest run tests/unit/settings.test.ts tests/unit/welcome.test.ts`
Expected: PASS (including the pre-existing legacy-migration cases — new ids still arrive disabled, so the trim never fires there).

- [ ] **Step 5: Commit gate**

STOP — ask the user to run `/grimoire-core:commit`. Suggested message: `feat(cap): enforce enabled ≤ 9 in settings normalize, persist boot trim once`.

---

### Task 3: Broadcast `capTrimmed`, land on Home when it fired

**Files:**

- Modify: `src/shared/types.ts:141-154` (ShellState)
- Modify: `src/main/state.ts`
- Modify: `src/main/index.ts:200-215` (startup surface block)
- Test: `tests/unit/state.test.ts`

**Interfaces:**

- Consumes: `SettingsStore.bootTrimmed` from Task 2.
- Produces: `ShellState.capTrimmed: ServiceId[]` and `MainState.capTrimmed: ServiceId[]` (default `[]`). Task 4's toast reads `state.capTrimmed` in the renderer.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/state.test.ts` inside the `MainState` describe:

```ts
  it('snapshots capTrimmed, defaulting to empty', () => {
    const s = new MainState();
    expect(s.snapshot(DEFAULT_SETTINGS, 'dark', '0.1.0').capTrimmed).toEqual([]);
    s.capTrimmed = ['zalo'];
    const snap = s.snapshot(DEFAULT_SETTINGS, 'dark', '0.1.0');
    expect(snap.capTrimmed).toEqual(['zalo']);
    // a copy, not the live array
    snap.capTrimmed.push('shopee');
    expect(s.capTrimmed).toEqual(['zalo']);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `corepack pnpm vitest run tests/unit/state.test.ts`
Expected: FAIL — `capTrimmed` missing.

- [ ] **Step 3: Implement**

`src/shared/types.ts` — add to `ShellState` after `homeOpen`:

```ts
  /** ids the summon cap banished at startup; the shell toasts them once */
  capTrimmed: ServiceId[];
```

`src/main/state.ts` — add the field after `homeOpen = false;`:

```ts
  /** set once at boot from SettingsStore.bootTrimmed; constant for the run */
  capTrimmed: ServiceId[] = [];
```

and in `snapshot()` add `capTrimmed: [...this.capTrimmed],` after `homeOpen`.

`src/main/index.ts` — in the startup block, replace:

```ts
    state.activeId = surface.activeId ?? s0.order[0];
    state.homeOpen = surface.homeOpen;
    if (surface.activeId) {
      ctx.noteActivated(surface.activeId);
      // Home covers the view: resolve now, present when Home closes
      views.activate(surface.activeId, { show: !surface.homeOpen });
    }
```

with:

```ts
    state.activeId = surface.activeId ?? s0.order[0];
    // a boot trim must be seen: land on Home, where the board reads 9/9 and
    // the toast names what was banished (a covered shell toast is invisible)
    state.homeOpen = surface.homeOpen || settings.bootTrimmed.length > 0;
    state.capTrimmed = settings.bootTrimmed;
    if (surface.activeId) {
      ctx.noteActivated(surface.activeId);
      // Home covers the view: resolve now, present when Home closes
      views.activate(surface.activeId, { show: !state.homeOpen });
    }
```

- [ ] **Step 4: Run to verify pass**

Run: `corepack pnpm vitest run tests/unit/state.test.ts && corepack pnpm typecheck`
Expected: unit PASS; typecheck fails only if a ShellState literal elsewhere misses `capTrimmed` — fix any such literal by adding `capTrimmed: []`.

- [ ] **Step 5: Commit gate**

STOP — ask the user to run `/grimoire-core:commit`. Suggested message: `feat(cap): broadcast capTrimmed and open Home when the boot trim fired`.

---

### Task 4: Trim toast (`capTrimMessage` + `CapTrimToast`)

**Files:**

- Modify: `src/renderer/src/components/toast-rules.ts`
- Create: `src/renderer/src/components/CapTrimToast.tsx`
- Modify: `src/renderer/src/App.tsx`
- Test: `tests/unit/toast-rules.test.ts`

**Interfaces:**

- Consumes: `ShellState.capTrimmed` (Task 3), `TOAST_MS` (existing).
- Produces: `capTrimMessage(names: string[]): string | null`; `<CapTrimToast />` mounted in App with `data-testid="cap-trim-toast"`. Task 7's e2e asserts on that testid and message text.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/toast-rules.test.ts` (add `capTrimMessage` to the import):

```ts
describe('capTrimMessage', () => {
  it('is silent when nothing was trimmed', () => {
    expect(capTrimMessage([])).toBeNull();
  });

  it('names a single banished service', () => {
    expect(capTrimMessage(['Zalo'])).toBe(
      'Zalo was banished — nine services is the maximum. Summon it back any time from Home.',
    );
  });

  it('lists several with a plural verb', () => {
    expect(capTrimMessage(['Zalo', 'Shopee'])).toBe(
      'Zalo and Shopee were banished — nine services is the maximum. Summon them back any time from Home.',
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `corepack pnpm vitest run tests/unit/toast-rules.test.ts`
Expected: FAIL — `capTrimMessage` not exported.

- [ ] **Step 3: Implement**

Append to `src/renderer/src/components/toast-rules.ts`:

```ts
/** Names the services the summon cap banished at startup. Null when none. */
export function capTrimMessage(names: string[]): string | null {
  if (names.length === 0) return null;
  const list =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  const verb = names.length === 1 ? 'was' : 'were';
  const it = names.length === 1 ? 'it' : 'them';
  return `${list} ${verb} banished — nine services is the maximum. Summon ${it} back any time from Home.`;
}
```

Create `src/renderer/src/components/CapTrimToast.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { useShell } from '../store';
import { capTrimMessage, TOAST_MS } from './toast-rules';

/** Says which services the summon cap banished at startup, once, then leaves.
 *  Same machinery as UpdateToast: timer dismissal, hovering banks the
 *  remainder. Sits bottom-left so a simultaneous update toast keeps its
 *  bottom-right corner. */
export default function CapTrimToast() {
  const trimmed = useShell((s) => s.state?.capTrimmed ?? []);
  const services = useShell((s) => s.state?.services ?? []);
  const [showing, setShowing] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const shown = useRef(false);
  const remaining = useRef(TOAST_MS);

  const names = trimmed.map((id) => services.find((svc) => svc.id === id)?.name ?? id);
  const message = capTrimMessage(names);

  useEffect(() => {
    if (!message || shown.current) return;
    shown.current = true;
    remaining.current = TOAST_MS;
    setShowing(message);
  }, [message]);

  useEffect(() => {
    if (!showing || paused) return;
    const startedAt = Date.now();
    const id = setTimeout(() => setShowing(null), remaining.current);
    return () => {
      clearTimeout(id);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
    };
  }, [showing, paused]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-x-4 bottom-4 z-10 flex justify-start"
    >
      {showing && (
        <div
          data-testid="cap-trim-toast"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          className="toast-in pointer-events-auto relative flex w-[340px] max-w-full items-start gap-3 overflow-hidden rounded-modal border border-border bg-bg-1 p-3.5 text-left shadow-[0_8px_32px_rgba(0,0,0,.4)]"
        >
          <span className="h-7 w-7 flex-none rounded-tile bg-gradient-to-br from-[#FFB43D] via-[#FF8A2A] to-[#F04E3E]" />
          <span className="min-w-0 text-text-1">{showing}</span>
          <span
            aria-hidden="true"
            style={{
              animationDuration: `${TOAST_MS}ms`,
              animationPlayState: paused ? 'paused' : 'running',
            }}
            className="toast-drain absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-[#FFB43D] via-[#FF8A2A] to-[#F04E3E]"
          />
        </div>
      )}
    </div>
  );
}
```

In `src/renderer/src/App.tsx`: add `import CapTrimToast from './components/CapTrimToast';` and mount `<CapTrimToast />` directly after `<UpdateToast />`.

- [ ] **Step 4: Run to verify pass**

Run: `corepack pnpm vitest run tests/unit/toast-rules.test.ts && corepack pnpm typecheck && corepack pnpm lint`
Expected: all PASS.

- [ ] **Step 5: Commit gate**

STOP — ask the user to run `/grimoire-core:commit`. Suggested message: `feat(cap): toast the services the boot trim banished`.

---

### Task 5: `SummonGauge`, `hero-glow` keyframes, `PickTile` capped state

**Files:**

- Create: `src/renderer/src/components/welcome/SummonGauge.tsx`
- Modify: `src/renderer/src/tokens.css`
- Modify: `src/renderer/src/components/welcome/PickTile.tsx`

**Interfaces:**

- Consumes: `MAX_SUMMONED` (Task 1).
- Produces: `<SummonGauge staged cap dirty />` (`data-testid="summon-gauge"`); `PickTile` gains optional prop `capped?: boolean` — dimmed, `aria-disabled`, click is a no-op (NOT the `disabled` attribute: a disabled button swallows pointer events and would kill drag-reorder on an unpicked Summoned tile). Task 6 wires both.

- [ ] **Step 1: Create `SummonGauge.tsx`**

```tsx
const R = 44;
const CIRCUMFERENCE = 2 * Math.PI * R;

interface Props {
  /** the staged result — selected.size, not the live enabled count */
  staged: number;
  cap: number;
  dirty: boolean;
}

/** The cap made visible: an ember ring that fills as picks approach the cap.
 *  Previews the staged result, not the live one. Purely presentational. */
export default function SummonGauge({ staged, cap, dirty }: Props) {
  const frac = Math.min(1, staged / cap);
  const full = staged >= cap;
  const caption = full ? 'full' : dirty ? 'after summon' : 'summoned';
  return (
    <div data-testid="summon-gauge" className="relative h-[100px] w-[100px]">
      <svg width="100" height="100" viewBox="0 0 104 104" className="-rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id="gauge-arc" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFB43D" />
            <stop offset="1" stopColor="#F04E3E" />
          </linearGradient>
        </defs>
        <circle cx="52" cy="52" r={R} fill="none" stroke="var(--border)" strokeWidth="9" />
        <circle
          cx="52"
          cy="52"
          r={R}
          fill="none"
          stroke="url(#gauge-arc)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - frac)}
          className="transition-[stroke-dashoffset] duration-300 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tabular text-[19px] font-bold leading-none text-text-1">
          {staged}
          <span className="text-xs font-normal text-text-2"> / {cap}</span>
        </span>
        <span
          className={`text-[9px] uppercase tracking-wide ${full ? 'font-bold text-accent' : 'text-text-2'}`}
        >
          {caption}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the glow keyframes to `tokens.css`**

Append after the `tile-breathe` block:

```css
.hero-glow {
  animation: hero-glow 3.6s ease-in-out infinite;
}
@keyframes hero-glow {
  0%,
  100% {
    opacity: 0.55;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.06);
  }
}
```

- [ ] **Step 3: Add `capped` to `PickTile.tsx`**

Replace the file's `Props` and component with:

```tsx
interface Props {
  service: ServiceMeta;
  on: boolean;
  /** the staged set is full and this tile is not in it — inert until a slot
   *  frees. aria-disabled + no-op click, NOT disabled: a disabled button
   *  swallows pointer events, which would break drag-reorder on an unpicked
   *  Summoned tile. */
  capped?: boolean;
  onToggle(): void;
}

export default function PickTile({ service, on, capped = false, onToggle }: Props) {
  const logo = logos[`../../assets/logos/${service.id}.svg`];
  // same molten-squircle language as the rail's active tile
  const face = on
    ? `scale-105 bg-linear-to-br from-[#FFB43D] via-[#FF8A2A] to-[#F04E3E] text-[#15181F]
       shadow-[0_0_10px_rgba(255,158,44,0.45),0_2px_14px_rgba(240,78,62,0.5)]`
    : capped
      ? 'bg-bg-2 text-accent opacity-30 grayscale'
      : `bg-bg-2 text-accent opacity-70 group-hover:opacity-100
       group-hover:shadow-[0_0_0_1px_rgba(255,158,44,0.35)]`;
  return (
    <button
      type="button"
      data-testid="pick-tile"
      aria-pressed={on}
      aria-disabled={capped}
      onClick={() => {
        if (!capped) onToggle();
      }}
      title={capped ? '9 services is the maximum' : service.name}
      // width comes from the grid track, not the tile
      className={`group flex w-full min-w-0 flex-col items-center gap-1.5 rounded-tile p-1 outline-none
        focus-visible:ring-2 focus-visible:ring-accent ${capped ? 'cursor-not-allowed' : ''}`}
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

- [ ] **Step 4: Verify**

Run: `corepack pnpm typecheck && corepack pnpm lint`
Expected: PASS (SummonGauge is not imported anywhere yet — that is fine for typecheck; if lint flags the unused file, proceed to Task 6 before the commit gate and commit the two tasks together).

- [ ] **Step 5: Commit gate**

STOP — ask the user to run `/grimoire-core:commit`. Suggested message: `feat(home): SummonGauge, hero glow keyframes, capped PickTile state`.

---

### Task 6: `HomeHero` + single-layout `Welcome`, delete `WelcomeIntro`, update e2e

**Files:**

- Create: `src/renderer/src/components/welcome/HomeHero.tsx`
- Modify: `src/renderer/src/components/Welcome.tsx` (full rewrite below)
- Delete: `src/renderer/src/components/welcome/WelcomeIntro.tsx`
- Test: `tests/e2e/welcome.spec.ts`, `tests/e2e/home.spec.ts`

**Interfaces:**

- Consumes: `SummonGauge`, `PickTile.capped` (Task 5); `capBlocked`, `MAX_SUMMONED`, `summonLabel` (Task 1).
- Produces: `HomeHero` props `{ staged: number; label: string; disabled: boolean; dirty: boolean; atCap: boolean; onSummon(): void; onDiscard(): void }`; testids `home-hero`, and the existing `welcome`, `welcome-section-summoned`, `welcome-section-unbound` unchanged (e2e and capture-media depend on them). `welcome-intro` testid is gone.

- [ ] **Step 1: Update the e2e specs to the new contract (they are the failing tests)**

`tests/e2e/welcome.spec.ts` — in the first test, replace the intro assertion and the disabled-summon check:

```ts
  // nothing is summoned yet: the hero invites the first pick and the whole
  // catalog waits below
  const summoned = welcome.locator('[data-testid="welcome-section-summoned"]');
  const unbound = welcome.locator('[data-testid="welcome-section-unbound"]');
  await expect(welcome.locator('[data-testid="home-hero"]')).toBeVisible();
  await expect(unbound.locator('[data-testid="pick-tile"]')).toHaveCount(SERVICES.length);

  // the primary rests inert until something is selected
  const summon = win.getByRole('button', { name: 'Pick a service to begin' });
  await expect(summon).toBeDisabled();

  // selecting stages the change without moving the tile out of Unbound
  await unbound.getByRole('button', { name: 'Zalo' }).click();
  const confirm = win.getByRole('button', { name: 'Summon 1 service' });
  await expect(confirm).toBeVisible();
```

then `await confirm.click();` replaces `await summon.click();`. The rest of the file is unchanged.

`tests/e2e/home.spec.ts` — rewrite the Dispel test:

```ts
test('home: Discard abandons a staged edit without leaving the screen', async () => {
  const { app, win } = await launch();
  const welcome = win.locator('[data-testid="welcome"]');
  const discard = win.getByRole('button', { name: 'Discard' });

  await win.locator('[data-testid="home-btn"]').click();

  // nothing staged: the hero shows one inert button and no Discard at all
  await expect(win.getByRole('button', { name: 'No changes' })).toBeDisabled();
  await expect(discard).toHaveCount(0);

  const summoned = welcome.locator('[data-testid="welcome-section-summoned"]');
  const unbound = welcome.locator('[data-testid="welcome-section-unbound"]');
  await summoned.getByRole('button', { name: 'Messenger' }).click();
  await unbound.getByRole('button', { name: 'Telegram' }).click();
  await expect(win.getByRole('button', { name: 'Summon 1 · Banish 1' })).toBeEnabled();
  await expect(discard).toBeVisible();

  await discard.click();

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
  await expect(discard).toHaveCount(0);
  await expect(win.locator('[data-testid="service-tile"]')).toHaveCount(2);
  await app.close();
});
```

- [ ] **Step 2: Build and run the two suites to verify they fail**

Run: `corepack pnpm build && env -u ELECTRON_RUN_AS_NODE corepack pnpm exec playwright test tests/e2e/welcome.spec.ts tests/e2e/home.spec.ts`
Expected: FAIL — `home-hero` testid absent, `Pick a service to begin` absent, Discard absent.

- [ ] **Step 3: Create `HomeHero.tsx`**

```tsx
import { MAX_SUMMONED } from '../../../../shared/welcome';
import Portal from '../Portal';
import SummonGauge from './SummonGauge';

interface Props {
  staged: number;
  label: string;
  disabled: boolean;
  dirty: boolean;
  atCap: boolean;
  onSummon(): void;
  onDiscard(): void;
}

/** The welcome hero, made permanent furniture: portal, wordmark, the cap
 *  gauge, and the actions — always in the same place at any board state. */
export default function HomeHero({
  staged,
  label,
  disabled,
  dirty,
  atCap,
  onSummon,
  onDiscard,
}: Props) {
  return (
    <aside
      data-testid="home-hero"
      className="relative flex w-[246px] flex-none flex-col items-center gap-2.5 overflow-hidden
        border-r border-border bg-bg-1 px-4 pb-3 pt-6"
    >
      {/* ember wash behind the whole column */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0
          bg-[radial-gradient(60%_40%_at_50%_8%,rgba(232,89,12,.15),transparent_70%)]"
      />
      <div className="relative">
        <div
          aria-hidden="true"
          className="hero-glow absolute -inset-3 rounded-full
            bg-[radial-gradient(circle,rgba(255,138,42,.30),transparent_68%)]"
        />
        <Portal className="relative h-14 w-14" />
      </div>
      <div className="relative text-center">
        <h1 className="text-lg font-semibold text-text-1">Goetia</h1>
        <p className="text-text-2">All your chats. Nothing else.</p>
      </div>
      <SummonGauge staged={staged} cap={MAX_SUMMONED} dirty={dirty} />
      <div className="relative flex w-full flex-col gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={onSummon}
          className="tabular w-full rounded-ctl bg-linear-to-br from-[#FFB43D] via-[#FF8A2A]
            to-[#F04E3E] px-4 py-2.5 font-semibold text-[#15181F]
            shadow-[0_0_12px_rgba(255,158,44,0.35)] transition-opacity duration-150
            enabled:hover:opacity-90 disabled:opacity-40 disabled:shadow-none"
        >
          {label}
        </button>
        {dirty && (
          <button
            type="button"
            onClick={onDiscard}
            className="w-full rounded-ctl border border-border bg-bg-2 px-4 py-2 text-text-1
              transition-colors duration-120 hover:border-accent"
          >
            Discard
          </button>
        )}
      </div>
      <p className="relative mt-auto pt-2 text-center text-[10px] leading-relaxed text-text-2">
        {atCap ? (
          <>
            Every seat taken — banish one
            <br />
            to make room for another
          </>
        ) : (
          <>
            Chat only · no feeds, no shops
            <br />
            Signs in once · idle chats sleep
          </>
        )}
        <br />
        ⌘/Ctrl 0 returns you here
      </p>
    </aside>
  );
}
```

- [ ] **Step 4: Rewrite `Welcome.tsx`**

Full replacement (hooks and helpers survive; the `fresh` branch, header, footer, and `nineUp` die):

```tsx
import { Reorder } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { ServiceId } from '../../../shared/types';
import {
  buildDisabledPatch,
  byName,
  capBlocked,
  enabledKey,
  matchesQuery,
  MAX_SUMMONED,
  summonDelta,
  summonLabel,
  summonOrder,
  welcomeSections,
} from '../../../shared/welcome';
import { useShell } from '../store';
import { useTileReorder } from './useTileReorder';
import HomeHero from './welcome/HomeHero';
import PickTile from './welcome/PickTile';
import ServiceBand from './welcome/ServiceBand';

export default function Welcome() {
  const state = useShell((s) => s.state);
  const key = state ? enabledKey(state.services, state.settings.disabled) : '';
  // the same list welcomeSections produces for `summoned`, derived from the
  // same broadcast state — the hook has to run before the early return, so it
  // cannot read `sections`
  const reorder = useTileReorder(
    state
      ? state.services.filter((svc) => !state.settings.disabled[svc.id]).map((svc) => svc.id)
      : [],
    state ? state.services.map((svc) => svc.id) : [],
  );
  const [selected, setSelected] = useState<ReadonlySet<ServiceId>>(new Set());
  const [query, setQuery] = useState('');
  // read through a ref so the window listener is registered once instead of on
  // every keystroke, and never closes over a stale query
  const queryRef = useRef('');
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  // ⌘/Ctrl+F is the reflex for "find" — Home spends it on the unbound filter.
  // Nothing else on this surface searches, and the shell has no page-find.
  useEffect(() => {
    const onFind = (e: KeyboardEvent) => {
      if (e.key !== 'f' || !(e.metaKey || e.ctrlKey) || e.altKey) return;
      const s = useShell.getState().state;
      if (!s?.homeOpen && !s?.services.every((svc) => s.settings.disabled[svc.id])) return;
      if (s?.settingsOpen || s?.switcherOpen) return;
      const input = searchRef.current;
      if (!input) return;
      e.preventDefault();
      input.focus();
      input.select();
    };
    window.addEventListener('keydown', onFind);
    return () => window.removeEventListener('keydown', onFind);
  }, []);

  // Re-seed every time the screen becomes visible or the live set changes, so
  // a discarded edit never survives to the next visit. A fresh install has an
  // empty enabled set, which reproduces the original empty selection.
  useEffect(() => {
    setSelected(new Set(key ? (key.split(',') as ServiceId[]) : []));
    setQuery('');
  }, [key]);

  // Home is a place, not a modal — but Escape is the reflex. Guarded the way
  // SettingsView guards its own handler: only when nothing is layered on top,
  // and never when there is no service to go back to.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // first rung: an active filter is what Escape clears, before leaving
      if (queryRef.current) {
        setQuery('');
        return;
      }
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
  const delta = summonDelta(order, enabled, selected);
  const { label, disabled } = summonLabel(delta, enabled.size > 0);
  const dirty = delta.add.length > 0 || delta.remove.length > 0;
  const atCap = selected.size >= MAX_SUMMONED;

  // sections follow the LIVE enabled set; the tile glow follows `selected`.
  // Keeping the two axes independent is what stops a tile jumping out from
  // under the cursor when it is deselected.
  const byId = new Map(state.services.map((svc) => [svc.id, svc]));
  const sections = welcomeSections(order, enabled, named);
  const pick = (ids: ServiceId[]) =>
    ids.map((id) => byId.get(id)).filter((svc) => svc !== undefined);

  // one patch, not a reorder followed by an update: settings:update already
  // resolves activation and rebuilds the app menu against `after.order`, so
  // splitting it would broadcast a frame where order and enablement disagree
  const summon = () =>
    window.goetia.send('settings:update', {
      disabled: buildDisabledPatch(order, selected),
      order: summonOrder(order, enabled, selected, named),
    });
  // the same reseed the screen does on every visit, under the user's thumb
  const discard = () => setSelected(enabled);

  const tiles = (ids: ServiceId[]) => (
    <div className="grid grid-cols-[repeat(auto-fill,76px)] gap-2">
      {pick(ids).map((svc) => (
        <PickTile
          key={svc.id}
          service={svc}
          on={selected.has(svc.id)}
          capped={capBlocked(selected, svc.id)}
          onToggle={() => toggle(svc.id)}
        />
      ))}
    </div>
  );

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
            capped={capBlocked(selected, svc.id)}
            onToggle={() => {
              if (reorder.consumeDrag()) return;
              toggle(svc.id);
            }}
          />
        </Reorder.Item>
      ))}
    </Reorder.Group>
  );
  const emptyLine = (text: string) => <p className="text-xs text-text-2 opacity-70">{text}</p>;

  const visibleUnbound = sections.unbound.filter((id) => {
    const svc = byId.get(id);
    return svc !== undefined && matchesQuery(svc.name, query);
  });

  // rides the label row, so filtering costs no vertical height. No autoFocus:
  // Home is a place, not a modal, and the tiles want the arrow keys.
  const search = (
    <span
      className="flex h-6 w-[168px] items-center gap-1.5 rounded-ctl border border-border bg-bg-2
        px-2 transition-colors duration-120 focus-within:border-accent focus-within:ring-1
        focus-within:ring-accent"
    >
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
        ref={searchRef}
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

  return (
    <div data-testid="welcome" className="flex min-h-0 flex-1 bg-bg-0">
      <HomeHero
        staged={selected.size}
        label={label}
        disabled={disabled}
        dirty={dirty}
        atCap={atCap}
        onSummon={summon}
        onDiscard={discard}
      />

      {/* the board: min-h-0 is what lets the bands shrink instead of the page grow */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3.5 px-6 py-4">
        <ServiceBand
          testid="welcome-section-summoned"
          label="Summoned"
          count={sections.summoned.length}
        >
          {sections.summoned.length === 0
            ? emptyLine('Nothing summoned yet — pick from below.')
            : summonedTiles}
        </ServiceBand>
        <ServiceBand
          testid="welcome-section-unbound"
          label="Unbound"
          count={sections.unbound.length}
          aside={sections.unbound.length > 0 ? search : undefined}
          className="flex-1"
        >
          {sections.unbound.length === 0 ? (
            emptyLine('Every one is bound.')
          ) : visibleUnbound.length === 0 ? (
            emptyLine(`No service matches “${query}”.`)
          ) : (
            <div className="flex flex-col gap-2">
              {tiles(visibleUnbound)}
              {atCap &&
                emptyLine(
                  `At ${MAX_SUMMONED} of ${MAX_SUMMONED} — unpick a summoned tile to make room.`,
                )}
            </div>
          )}
        </ServiceBand>
      </div>
    </div>
  );
}
```

Delete `src/renderer/src/components/welcome/WelcomeIntro.tsx` (`rm src/renderer/src/components/welcome/WelcomeIntro.tsx`).

- [ ] **Step 5: Run unit + the two e2e suites to verify pass**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm build && env -u ELECTRON_RUN_AS_NODE corepack pnpm exec playwright test tests/e2e/welcome.spec.ts tests/e2e/home.spec.ts`
Expected: all PASS. If `home.spec.ts`'s reorder or search tests fail on selectors, they use only band testids and role names that this rewrite preserves — investigate before changing them.

- [ ] **Step 6: Commit gate**

STOP — ask the user to run `/grimoire-core:commit`. Suggested message: `feat(home): one split-console layout — HomeHero + board, Discard-when-dirty`.

---

### Task 7: Cap behaviour e2e — picker cap and boot-trim migration

**Files:**

- Modify: `tests/e2e/home.spec.ts`
- Create: `tests/e2e/cap-trim.spec.ts`

**Interfaces:**

- Consumes: everything above; `launch()` helper in `home.spec.ts` (enables messenger + zalo).

- [ ] **Step 1: Add the picker-cap test to `home.spec.ts`**

```ts
test('home: the ninth pick caps the rest, unpicking frees them', async () => {
  const { app, win } = await launch();
  const welcome = win.locator('[data-testid="welcome"]');

  await win.locator('[data-testid="home-btn"]').click();
  const unbound = welcome.locator('[data-testid="welcome-section-unbound"]');

  // stage seven more on top of the two seeded picks → nine staged
  const seven = ['Discord', 'Instagram', 'Microsoft Teams', 'Shopee', 'Slack', 'Telegram', 'TikTok'];
  for (const name of seven) {
    await unbound.getByRole('button', { name }).click();
  }

  // the tenth tile goes inert: dimmed, aria-disabled, click does nothing
  const whatsapp = unbound.getByRole('button', { name: 'WhatsApp' });
  await expect(whatsapp).toHaveAttribute('aria-disabled', 'true');
  await whatsapp.click();
  await expect(whatsapp).toHaveAttribute('aria-pressed', 'false');
  await expect(unbound).toContainText('unpick a summoned tile to make room');

  // freeing a slot re-enables it within the same edit
  await unbound.getByRole('button', { name: 'Telegram' }).click();
  await expect(whatsapp).toHaveAttribute('aria-disabled', 'false');
  await whatsapp.click();
  await expect(whatsapp).toHaveAttribute('aria-pressed', 'true');

  await app.close();
});
```

- [ ] **Step 2: Create `tests/e2e/cap-trim.spec.ts`**

```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { SERVICES } from '../../src/shared/services';

const isShell = (p: { url(): string }) =>
  p.url().startsWith('file://') && !p.url().includes('loading.html');

async function launch(profile: string) {
  const app = await electron.launch({
    args: ['out/main/index.js', `--goetia-user-data=${profile}`],
  });
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
  return { app, win };
}

test('an over-cap install is trimmed to nine, told once, and lands on Home', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-'));
  // an upgrade profile with all ten enabled; default order ends with zalo
  writeFileSync(
    join(profile, 'settings.json'),
    JSON.stringify({
      disabled: Object.fromEntries(SERVICES.map((s) => [s.id, false])),
      lastActiveId: 'messenger',
    }),
  );

  const { app, win } = await launch(profile);

  // trimmed to nine, forced onto Home, and the toast names the banished one
  await expect(win.locator('[data-testid="welcome"]')).toBeVisible();
  await expect(win.locator('[data-testid="service-tile"]')).toHaveCount(9);
  const toast = win.locator('[data-testid="cap-trim-toast"]');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('Zalo was banished');
  await app.close();

  // the trim persisted: a relaunch has nothing to trim and nothing to say
  const second = await launch(profile);
  await expect(second.win.locator('[data-testid="service-tile"]')).toHaveCount(9);
  await expect(second.win.locator('[data-testid="cap-trim-toast"]')).toHaveCount(0);
  await second.app.close();
});
```

- [ ] **Step 3: Run to verify pass**

Run: `corepack pnpm build && env -u ELECTRON_RUN_AS_NODE corepack pnpm exec playwright test tests/e2e/home.spec.ts tests/e2e/cap-trim.spec.ts`
Expected: PASS. (These are new tests over already-implemented behaviour — if the trim test fails, debug the implementation from Tasks 2–4, not the test.)

- [ ] **Step 4: Commit gate**

STOP — ask the user to run `/grimoire-core:commit`. Suggested message: `test(cap): e2e for the picker cap and the boot-trim migration`.

---

### Task 8: Capture matrix, capture-media shrink removal, README

**Files:**

- Modify: `scripts/lib/shots.mjs`
- Modify: `tests/unit/capture-shots.test.ts`
- Modify: `scripts/capture-media.mjs` (welcome interaction)
- Modify: `README.md`

**Interfaces:**

- Consumes: the cap (a 10-enabled capture profile would be trimmed at boot and the toast would photobomb every shot).

- [ ] **Step 1: Update the failing capture test first**

In `tests/unit/capture-shots.test.ts`, replace the rail-badges expectation:

```ts
  it('shows a full rail with one muted service for the badge shot', () => {
    const shot = SHOTS.find((s) => s.stem === 'rail-badges' && s.theme === 'dark');
    if (!shot) throw new Error('rail-badges/dark missing from the matrix');
    const seeded = settingsFor(shot);
    // nine enabled is a full rail now: a tenth would be trimmed at boot and
    // the trim toast would photobomb the capture
    expect(Object.values(seeded.disabled).filter((d) => d === false)).toHaveLength(9);
    expect(seeded.muted.whatsapp).toBe(true);
    expect(seeded.muted.zalo).toBe(false);
  });
```

Run: `corepack pnpm vitest run tests/unit/capture-shots.test.ts`
Expected: FAIL — the matrix still enables all ten.

- [ ] **Step 2: Update `scripts/lib/shots.mjs`**

Above `SURFACES`, add:

```js
// nine, not all ten: the summon cap trims a tenth enabled service at boot and
// the trim toast would photobomb the shot. zalo stays — it carries the badge.
const NINE_UP = ALL_SERVICE_IDS.filter((id) => id !== 'teams');
```

and change the two full-rail surfaces:

```js
  {
    stem: 'rail-badges',
    surface: 'rail',
    enabled: NINE_UP,
    muted: ['whatsapp'],
  },
  { stem: 'quick-switcher', surface: 'switcher', enabled: NINE_UP },
```

Run: `corepack pnpm vitest run tests/unit/capture-shots.test.ts` — Expected: PASS.

- [ ] **Step 3: Simplify the welcome capture in `scripts/capture-media.mjs`**

The shrink/slack loop existed to pull the bottom-right footer into frame; the footer is gone and the hero column fills the window's height. Delete the entire block from `const shrink = (drop) =>` through the `for (let i = 0; i < 3; i++) { … }` loop (keep the staging clicks, the blur, and the `clipAround` capture). Update the comment above the staging loop: Dispel is now Discard, and it *appears* rather than *goes live*:

```js
    // stage one of each so the confirm names a real change and Discard
    // appears: whatsapp lights up under Unbound, messenger dims in place under
    // Summoned. Neither moves section until confirm — that is the point.
```

- [ ] **Step 4: Reword the README**

Three edits, keeping every line unwrapped:

1. The "A look around" paragraph (currently starting "Nothing loads until you pick") becomes:

   ```markdown
   Nothing loads until you pick — a fresh install starts with every service off. Home is one screen for every state: a hero column whose ember gauge fills as picks approach the nine-service cap (one seat per ⌘/Ctrl 1…9 shortcut), and the board beside it keeping the summoned apart from the unbound. A pick only changes which side a tile is on once you confirm: the button spells out the change first (**Summon 1 · Banish 1** below), and **Discard** — it appears only while an edit is staged — throws the edit away. The unbound row filters by name, and dragging a summoned tile sets the rail order — a drop takes effect on its own, so reordering never rides along with an enable:
   ```

2. In "The first time you open it", replace the first sentence:

   ```markdown
   You'll see every service waiting under **Unbound** beside the hero column. Click the ones you want — they light up but stay put — then press **Summon** to bring them in.
   ```

3. In "Handy to know", replace the "Add or drop services later" bullet:

   ```markdown
   - **Add or drop services later**: press ⌘/Ctrl+0, or click the ember sigil at the head of the icon bar, for **Home**. Summoned and unbound sit in separate rows; nothing changes until you press **Summon**/**Banish**, and **Discard** throws a staged edit away. Nine services can be summoned at once — one per ⌘/Ctrl 1…9 shortcut; banish one to make room. Banishing keeps the login — summon it back and you're still signed in. ⌘/Ctrl+F jumps to the box that filters the unbound row by name, and dragging a summoned tile reorders the icon bar right away — that one doesn't wait for **Summon**.
   ```

Also update the welcome screenshot's `alt` text to `alt="Goetia's Home screen: the hero column with the summon gauge at left, summoned and unbound bands at right"`.

Run: `npx markdownlint-cli2 README.md` — Expected: 0 issues.

- [ ] **Step 5: Regenerate the committed screenshots**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm media`
Expected: PNGs under `docs/media/` regenerate (welcome/rail-badges/quick-switcher change; the git diff shows modified binaries). Eyeball `docs/media/welcome-light.png` — hero column at left with the gauge, two bands at right, Discard visible under the staged edit.

- [ ] **Step 6: Commit gate**

STOP — ask the user to run `/grimoire-core:commit`. Suggested message: `docs(home): nine-up capture matrix, simplified welcome shot, README rewording`.

---

### Task 9: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run everything**

```bash
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm build && env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e
```

Expected: all green. Known trip-wires if something fails:

- A `ShellState` literal somewhere missing `capTrimmed` → add `capTrimmed: []`.
- `home.spec.ts` reorder test: the drag path is unchanged, but if Motion's drag needs more room in the narrower board, widen via `win.setSize` is NOT available — the board still has ≥640px, so investigate the selector first.
- The trim e2e relaunch showing Home instead of a service is fine (rememberSurface may have recorded the forced Home) — the spec only asserts tile count and toast absence.

- [ ] **Step 2: Confirm the invariants section of CLAUDE.md still holds**

Read `CLAUDE.md` top-to-bottom once against the diff: no view shown while an overlay is open (the forced-Home boot resolves views with `show: false` via `!state.homeOpen`), no new IPC channels, no unbounded timers added (the gauge animates in CSS; both toasts clear their timeouts).

- [ ] **Step 3: Final commit gate (if anything is uncommitted)**

STOP — ask the user to run `/grimoire-core:commit` for any remaining changes.
