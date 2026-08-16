# Quiet Hours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A daily start–end window with per-day toggles silences Goetia like global mute does (no banners, page audio muted, badges untouched), with a manual unmute dismissing exactly the current window.

**Architecture:** Pure schedule math in `src/main/lib/quiet-hours-rules.ts`; a one-timer `QuietHoursController` in `src/main/quiet-hours.ts`; effective silence (`globalMuted || quietNow`) fed through the existing `shouldNotify`/`audioMuted` pair and every checkmark/bell surface; schedule and override persisted in `Settings` with per-field normalization. Spec: `docs/superpowers/specs/2026-08-16-quiet-hours-design.md`.

**Tech Stack:** TypeScript, Electron, vitest, Playwright, React (settings pane), conf (settings store).

## Global Constraints

- **Never run `git commit`.** Commits happen only when the user runs `/grimoire-core:commit`; every task ends by stopping and asking them to.
- All scripts through corepack: `corepack pnpm test|typecheck|lint`; e2e and dev need `env -u ELECTRON_RUN_AS_NODE` in VS Code shells.
- After writing each source file, run `npx biome check --write <paths>` to settle formatting/import order before the lint gate.
- Effective silence is decided ONLY by `shouldNotify`/`audioMuted` in `src/main/lib/notification-rules.ts` (they stay inverse-defined) — never gate a banner or page audio anywhere else.
- Engagement is computed from the wall clock, never persisted; the only persisted quiet state is the schedule and `quietOverrideWindowStart`.
- No new IPC channel; `quietHours` rides the existing shell-only `settings:update`, `quietActive` rides the existing `shell:state` broadcast.
- The boundary timer is one `setTimeout`, re-armed on fire and on schedule edits, cleared in `dispose()` on `before-quit` (bounded-timers rule).
- `aggregateBadges` and everything badge-related stays ignorant of quiet hours.
- Times are `'HH:MM'` 24h local; `days` is indexed by `Date.getDay()` (0 = Sunday); a crossing window belongs to the day it starts; `start === end` is an empty window.
- Markdown edits must pass `npx markdownlint-cli2 <file>`; prose never hard-wrapped.

---

### Task 1: Pure schedule rules

**Files:**

- Modify: `src/shared/types.ts` (add the exported `QuietHoursSchedule` interface only — `Settings` changes come in Task 2)
- Create: `src/main/lib/quiet-hours-rules.ts`
- Test: `tests/unit/quiet-hours-rules.test.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces: `QuietHoursSchedule` (from `src/shared/types.ts`); from the rules file: `quietWindowFor(now: Date, q: QuietHoursSchedule): { start: Date; end: Date } | null`, `quietNow(now: Date, q: QuietHoursSchedule, overrideWindowStart: number | null): boolean`, `nextBoundary(now: Date, q: QuietHoursSchedule): Date | null`, `muteToggleResult(o: { wantSilence: boolean; engagedWindowStart: number | null }): { globalMuted: boolean; quietOverrideWindowStart: number | null }`.

- [ ] **Step 1: Add the schedule type**

In `src/shared/types.ts`, directly above `export type ThemePref`, insert:

```ts
export interface QuietHoursSchedule {
  enabled: boolean;
  /** 'HH:MM', 24h local wall-clock */
  start: string;
  /** 'HH:MM'; end < start crosses midnight; end === start is an empty window */
  end: string;
  /** indexed by Date.getDay(): 0 = Sunday … 6 = Saturday */
  days: [boolean, boolean, boolean, boolean, boolean, boolean, boolean];
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/unit/quiet-hours-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  muteToggleResult,
  nextBoundary,
  quietNow,
  quietWindowFor,
} from '../../src/main/lib/quiet-hours-rules';
import type { QuietHoursSchedule } from '../../src/shared/types';

const allDays: QuietHoursSchedule['days'] = [true, true, true, true, true, true, true];
// getDay(): Fri = 5
const noFriday: QuietHoursSchedule['days'] = [true, true, true, true, true, false, true];
const noDays: QuietHoursSchedule['days'] = [false, false, false, false, false, false, false];

const sched = (over: Partial<QuietHoursSchedule> = {}): QuietHoursSchedule => ({
  enabled: true,
  start: '22:00',
  end: '07:00',
  days: allDays,
  ...over,
});

// 2026-08-14 is a Friday, 2026-08-15 a Saturday
const fri = (h: number, m = 0) => new Date(2026, 7, 14, h, m);
const sat = (h: number, m = 0) => new Date(2026, 7, 15, h, m);

describe('quietWindowFor', () => {
  it('covers the evening side of a midnight-crossing window', () => {
    const w = quietWindowFor(fri(23), sched());
    expect(w?.start).toEqual(fri(22));
    expect(w?.end).toEqual(sat(7));
  });

  it('covers the morning side, attributed to the day the window started', () => {
    expect(quietWindowFor(sat(3), sched())?.start).toEqual(fri(22));
  });

  it('is null outside the window', () => {
    expect(quietWindowFor(sat(12), sched())).toBeNull();
  });

  it('handles a same-day window, end exclusive', () => {
    const q = sched({ start: '09:00', end: '17:00' });
    expect(quietWindowFor(fri(10), q)?.start).toEqual(fri(9));
    expect(quietWindowFor(fri(8, 59), q)).toBeNull();
    expect(quietWindowFor(fri(17), q)).toBeNull();
  });

  it('skips a window whose start day is unchecked — including past midnight', () => {
    expect(quietWindowFor(fri(23), sched({ days: noFriday }))).toBeNull();
    expect(quietWindowFor(sat(3), sched({ days: noFriday }))).toBeNull();
    expect(quietWindowFor(sat(23), sched({ days: noFriday }))?.start).toEqual(sat(22));
  });

  it('never engages when disabled or when start equals end', () => {
    expect(quietWindowFor(fri(23), sched({ enabled: false }))).toBeNull();
    expect(quietWindowFor(fri(23), sched({ start: '22:00', end: '22:00' }))).toBeNull();
  });
});

describe('quietNow', () => {
  it('is dismissed by the override for exactly one window', () => {
    const override = fri(22).getTime();
    expect(quietNow(fri(23), sched(), override)).toBe(false);
    expect(quietNow(sat(3), sched(), override)).toBe(false); // same window, still dismissed
    expect(quietNow(sat(23), sched(), override)).toBe(true); // next window engages again
  });

  it('ignores a stale override from some other moment', () => {
    expect(quietNow(fri(23), sched(), fri(10).getTime())).toBe(true);
    expect(quietNow(fri(23), sched(), null)).toBe(true);
  });
});

describe('nextBoundary', () => {
  it('inside a window: its end', () => {
    expect(nextBoundary(sat(3), sched())).toEqual(sat(7));
  });

  it('outside: the next start', () => {
    expect(nextBoundary(fri(12), sched())).toEqual(fri(22));
  });

  it('skips unchecked days to the next eligible start', () => {
    expect(nextBoundary(fri(12), sched({ days: noFriday }))).toEqual(sat(22));
  });

  it('is null when the schedule can never engage', () => {
    expect(nextBoundary(fri(12), sched({ enabled: false }))).toBeNull();
    expect(nextBoundary(fri(12), sched({ start: '08:00', end: '08:00' }))).toBeNull();
    expect(nextBoundary(fri(12), sched({ days: noDays }))).toBeNull();
  });
});

describe('muteToggleResult', () => {
  it('silence on: plain persistent mute, override cleared', () => {
    expect(muteToggleResult({ wantSilence: true, engagedWindowStart: 123 })).toEqual({
      globalMuted: true,
      quietOverrideWindowStart: null,
    });
  });

  it('silence off mid-window: dismisses exactly that window', () => {
    expect(muteToggleResult({ wantSilence: false, engagedWindowStart: 123 })).toEqual({
      globalMuted: false,
      quietOverrideWindowStart: 123,
    });
  });

  it('silence off with no window engaged: nothing to dismiss', () => {
    expect(muteToggleResult({ wantSilence: false, engagedWindowStart: null })).toEqual({
      globalMuted: false,
      quietOverrideWindowStart: null,
    });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `corepack pnpm test tests/unit/quiet-hours-rules.test.ts`

Expected: FAIL — cannot resolve `../../src/main/lib/quiet-hours-rules`.

- [ ] **Step 4: Write the implementation**

Create `src/main/lib/quiet-hours-rules.ts`:

```ts
import type { QuietHoursSchedule } from '../../shared/types';

function minutesOf(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** Window starting on `day` — end lands next day when the window crosses
 *  midnight. Built from local date parts so DST moves boundaries with the
 *  wall clock instead of shifting them. */
function windowStartingOn(day: Date, startMin: number, endMin: number): { start: Date; end: Date } {
  const start = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    Math.floor(startMin / 60),
    startMin % 60,
  );
  const endDayOffset = endMin > startMin ? 0 : 1;
  const end = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate() + endDayOffset,
    Math.floor(endMin / 60),
    endMin % 60,
  );
  return { start, end };
}

/** The engaged window covering `now`, or null. A crossing window belongs to
 *  the day it starts, so only the windows starting today and yesterday can
 *  cover `now`. `start` doubles as the window's identity. */
export function quietWindowFor(
  now: Date,
  q: QuietHoursSchedule,
): { start: Date; end: Date } | null {
  if (!q.enabled) return null;
  const startMin = minutesOf(q.start);
  const endMin = minutesOf(q.end);
  if (startMin === endMin) return null; // empty window, not 24h quiet
  for (const dayOffset of [0, -1]) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
    if (!q.days[day.getDay()]) continue;
    const w = windowStartingOn(day, startMin, endMin);
    if (now >= w.start && now < w.end) return w;
  }
  return null;
}

/** Engaged and not the one window the user dismissed by unmuting. */
export function quietNow(
  now: Date,
  q: QuietHoursSchedule,
  overrideWindowStart: number | null,
): boolean {
  const w = quietWindowFor(now, q);
  return w !== null && w.start.getTime() !== overrideWindowStart;
}

/** The next instant engagement can change — the current window's end, or the
 *  next start within a week. Null when the schedule can never engage. */
export function nextBoundary(now: Date, q: QuietHoursSchedule): Date | null {
  if (!q.enabled || q.days.every((d) => !d)) return null;
  const startMin = minutesOf(q.start);
  const endMin = minutesOf(q.end);
  if (startMin === endMin) return null;
  const current = quietWindowFor(now, q);
  if (current) return current.end;
  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
    if (!q.days[day.getDay()]) continue;
    const { start } = windowStartingOn(day, startMin, endMin);
    if (start > now) return start;
  }
  return null;
}

/** The mute toggle's two cases: silence on is a plain persistent mute;
 *  silence off mid-window dismisses exactly that window. */
export function muteToggleResult(o: { wantSilence: boolean; engagedWindowStart: number | null }): {
  globalMuted: boolean;
  quietOverrideWindowStart: number | null;
} {
  if (o.wantSilence) return { globalMuted: true, quietOverrideWindowStart: null };
  return { globalMuted: false, quietOverrideWindowStart: o.engagedWindowStart };
}
```

- [ ] **Step 5: Run the gates**

Run: `npx biome check --write src/main/lib/quiet-hours-rules.ts src/shared/types.ts tests/unit/quiet-hours-rules.test.ts`

Run: `corepack pnpm test tests/unit/quiet-hours-rules.test.ts` — expected: 14 passed.

Run: `corepack pnpm test && corepack pnpm typecheck && corepack pnpm lint` — expected: all green.

- [ ] **Step 6: Stop for the user's commit**

Do not run `git commit`. Ask the user to run `/grimoire-core:commit`. Suggested message: `feat(quiet-hours): add pure schedule rules`.

---

### Task 2: Settings fields and normalization

**Files:**

- Modify: `src/shared/types.ts` (`Settings` interface, `DEFAULT_SETTINGS`)
- Modify: `src/main/settings.ts` (`normalize()`)
- Test: `tests/unit/settings.test.ts` (append cases)

**Interfaces:**

- Consumes: `QuietHoursSchedule` from Task 1.
- Produces: `Settings.quietHours: QuietHoursSchedule` and `Settings.quietOverrideWindowStart: number | null`, normalized on every read — Tasks 3–5 rely on both fields existing with valid shapes.

- [ ] **Step 1: Write the failing tests**

Append inside the `describe('SettingsStore', …)` block in `tests/unit/settings.test.ts`:

```ts
  it('defaults quiet hours off, 22:00–07:00, every day', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    const s = new SettingsStore(dir).get();
    expect(s.quietHours).toEqual({
      enabled: false,
      start: '22:00',
      end: '07:00',
      days: [true, true, true, true, true, true, true],
    });
    expect(s.quietOverrideWindowStart).toBeNull();
  });

  it('persists quiet hours edits and the override across instances', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    new SettingsStore(dir).update({
      quietHours: {
        enabled: true,
        start: '21:30',
        end: '06:00',
        days: [false, true, true, true, true, true, false],
      },
      quietOverrideWindowStart: 1_755_000_000_000,
    });
    const reread = new SettingsStore(dir).get();
    expect(reread.quietHours.enabled).toBe(true);
    expect(reread.quietHours.start).toBe('21:30');
    expect(reread.quietHours.days[0]).toBe(false);
    expect(reread.quietOverrideWindowStart).toBe(1_755_000_000_000);
  });

  it('coerces a mangled quietHours block field by field', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({
        quietHours: { enabled: 'yes', start: '25:99', end: '06:30', days: [true, false] },
        quietOverrideWindowStart: 'soon',
      }),
    );
    const s = new SettingsStore(dir).get();
    expect(s.quietHours.enabled).toBe(false); // junk -> default
    expect(s.quietHours.start).toBe('22:00'); // invalid time -> default
    expect(s.quietHours.end).toBe('06:30'); // valid field survives
    expect(s.quietHours.days).toEqual([true, true, true, true, true, true, true]);
    expect(s.quietOverrideWindowStart).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `corepack pnpm test tests/unit/settings.test.ts`

Expected: FAIL — `s.quietHours` is undefined (and typecheck of the test would fail too; the runner surfaces the property miss).

- [ ] **Step 3: Extend `Settings` and `DEFAULT_SETTINGS`**

In `src/shared/types.ts`, inside `interface Settings`, after the `hibernationMinutes: number;` line add:

```ts
  /** scheduled global mute: window + active days; see lib/quiet-hours-rules */
  quietHours: QuietHoursSchedule;
  /** start (epoch ms) of the one window the user dismissed by unmuting */
  quietOverrideWindowStart: number | null;
```

In `DEFAULT_SETTINGS`, after `hibernationMinutes: 30,` add:

```ts
  quietHours: {
    enabled: false,
    start: '22:00',
    end: '07:00',
    days: [true, true, true, true, true, true, true],
  },
  quietOverrideWindowStart: null,
```

- [ ] **Step 4: Extend `normalize()`**

In `src/main/settings.ts`, extend the type import to include the schedule type:

```ts
import { DEFAULT_SETTINGS, type QuietHoursSchedule, type ServiceId, type Settings } from '../shared/types';
```

Above `function normalize(...)` add:

```ts
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Same job as fill() for the quiet-hours block: a settings.json written
 *  before the field existed, or hand-mangled, must coerce field by field. */
function fillQuietHours(raw: unknown): QuietHoursSchedule {
  const d = DEFAULT_SETTINGS.quietHours;
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<QuietHoursSchedule>;
  const days =
    Array.isArray(r.days) && r.days.length === 7 && r.days.every((x) => typeof x === 'boolean')
      ? ([...r.days] as QuietHoursSchedule['days'])
      : d.days;
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
    start: typeof r.start === 'string' && TIME_RE.test(r.start) ? r.start : d.start,
    end: typeof r.end === 'string' && TIME_RE.test(r.end) ? r.end : d.end,
    days,
  };
}
```

In `normalize()`'s returned `settings` object, after the `neverHibernate: …` line add:

```ts
      quietHours: fillQuietHours(raw.quietHours),
      quietOverrideWindowStart:
        typeof raw.quietOverrideWindowStart === 'number' &&
        Number.isFinite(raw.quietOverrideWindowStart)
          ? raw.quietOverrideWindowStart
          : null,
```

- [ ] **Step 5: Run the gates**

Run: `npx biome check --write src/shared/types.ts src/main/settings.ts tests/unit/settings.test.ts`

Run: `corepack pnpm test tests/unit/settings.test.ts` — expected: all pass, including the three new cases.

Run: `corepack pnpm test && corepack pnpm typecheck && corepack pnpm lint` — expected: all green (the new `Settings` fields are additive; nothing else reads them yet).

- [ ] **Step 6: Stop for the user's commit**

Do not run `git commit`. Ask the user to run `/grimoire-core:commit`. Suggested message: `feat(quiet-hours): persist schedule and override in settings`.

---

### Task 3: Effective silence across main

**Files:**

- Create: `src/main/quiet-hours.ts`
- Modify: `src/main/lib/notification-rules.ts` (`shouldNotify`/`audioMuted` gain `quietNow`)
- Modify: `src/shared/types.ts` (`ShellState` gains `quietActive`)
- Modify: `src/main/state.ts` (`snapshot` gains a `quietActive` parameter)
- Modify: `src/main/notifications.ts` (banner gate)
- Modify: `src/main/ipc-handlers.ts` (`AppContext` + schedule-edit hook)
- Modify: `src/main/menu.ts`, `src/main/tray.ts` (checkmarks/toggles read effective silence)
- Modify: `src/main/index.ts` (controller, broadcast, `setGlobalMuted`, dispose)
- Test: `tests/unit/notification-rules.test.ts`, `tests/unit/state.test.ts` (updated)

**Interfaces:**

- Consumes: everything Tasks 1–2 produced.
- Produces: `QuietHoursController` with `quietNow(): boolean`, `start()`, `rearm()`, `dispose()`; `AppContext.quietNow(): boolean` and `AppContext.quietScheduleChanged(): void`; `ShellState.quietActive: boolean` — Task 4's renderer reads `quietActive`, Task 5's e2e relies on the whole chain.

- [ ] **Step 1: Update the notification-rules tests to the three-input pair**

In `tests/unit/notification-rules.test.ts`, replace the `describe('shouldNotify', …)` and `describe('audioMuted', …)` blocks with:

```ts
describe('shouldNotify', () => {
  it.each([
    [{ serviceMuted: false, globalMuted: false, quietNow: false }, true],
    [{ serviceMuted: true, globalMuted: false, quietNow: false }, false],
    [{ serviceMuted: false, globalMuted: true, quietNow: false }, false],
    [{ serviceMuted: false, globalMuted: false, quietNow: true }, false],
    [{ serviceMuted: true, globalMuted: true, quietNow: true }, false],
  ])('%o -> %s', (opts, expected) => {
    expect(shouldNotify(opts)).toBe(expected);
  });
});

describe('audioMuted', () => {
  it('quiet hours alone mute the page, not just the banner', () => {
    expect(audioMuted({ serviceMuted: false, globalMuted: false, quietNow: true })).toBe(true);
  });

  it('is exactly the inverse of shouldNotify', () => {
    for (const serviceMuted of [true, false]) {
      for (const globalMuted of [true, false]) {
        for (const quietNow of [true, false]) {
          const opts = { serviceMuted, globalMuted, quietNow };
          expect(audioMuted(opts)).toBe(!shouldNotify(opts));
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run to verify the failure**

Run: `corepack pnpm typecheck`

Expected: FAIL — excess-property errors in `tests/unit/notification-rules.test.ts` (`quietNow` does not exist on the pair's opts type). Vitest itself would pass — it transpiles without typechecking and extra fields are ignored at runtime — so the type gate is the red here.

- [ ] **Step 3: Extend the pair in `src/main/lib/notification-rules.ts`**

Replace the first two functions with:

```ts
export function shouldNotify(opts: {
  serviceMuted: boolean;
  globalMuted: boolean;
  quietNow: boolean;
}): boolean {
  return !opts.serviceMuted && !opts.globalMuted && !opts.quietNow;
}

/** Muted means silent, so the page's own ding goes too — suppressing the
 *  banner alone left every service still audible. Defined as the inverse of
 *  shouldNotify so the two can't drift: whatever wouldn't raise a banner
 *  doesn't get to make a noise either. Badges are untouched by both, and
 *  quiet hours count as mute here, nowhere else. */
export function audioMuted(opts: {
  serviceMuted: boolean;
  globalMuted: boolean;
  quietNow: boolean;
}): boolean {
  return !shouldNotify(opts);
}
```

Run: `corepack pnpm typecheck` — expected: FAIL at `src/main/notifications.ts:32` and `src/main/index.ts:100` (missing `quietNow`). These are exactly the call sites the remaining steps fix; anything else failing means an unknown caller — stop and investigate.

- [ ] **Step 4: Create the controller**

Create `src/main/quiet-hours.ts`:

```ts
import type { QuietHoursSchedule } from '../shared/types';
import { nextBoundary, quietNow as quietNowAt } from './lib/quiet-hours-rules';

/** Fire just past the boundary, never marginally before it. */
const BOUNDARY_SLACK_MS = 250;

/** One timer, re-armed on every fire and on schedule edits. A fire that
 *  arrives late (sleep, clock jump) self-corrects: everything is recomputed
 *  from the wall clock, engagement is never stored. */
export class QuietHoursController {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private opts: {
      schedule: () => QuietHoursSchedule;
      override: () => number | null;
      onBoundary: () => void;
    },
  ) {}

  quietNow(): boolean {
    return quietNowAt(new Date(), this.opts.schedule(), this.opts.override());
  }

  start(): void {
    this.rearm();
  }

  rearm(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const boundary = nextBoundary(new Date(), this.opts.schedule());
    if (!boundary) return;
    const delay = Math.max(0, boundary.getTime() - Date.now()) + BOUNDARY_SLACK_MS;
    this.timer = setTimeout(() => {
      this.opts.onBoundary();
      this.rearm();
    }, delay);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
```

- [ ] **Step 5: `ShellState.quietActive` and the snapshot parameter**

In `src/shared/types.ts`, inside `interface ShellState`, after `globalMuted: boolean;` add:

```ts
  /** quiet-hours engaged right now (manual override already applied) */
  quietActive: boolean;
```

In `src/main/state.ts`, change the `snapshot` signature and returned object:

```ts
  snapshot(
    settings: Settings,
    theme: 'light' | 'dark',
    version: string,
    quietActive: boolean,
  ): ShellState {
```

and after `globalMuted: settings.globalMuted,` in the return, add:

```ts
      quietActive,
```

In `tests/unit/state.test.ts`, every existing `s.snapshot(...)` call gains a fourth argument `false` (four call sites), and this test is appended inside the `describe`:

```ts
  it('snapshot carries quietActive', () => {
    const s = new MainState();
    expect(s.snapshot(DEFAULT_SETTINGS, 'dark', '0.1.0', true).quietActive).toBe(true);
    expect(s.snapshot(DEFAULT_SETTINGS, 'dark', '0.1.0', false).quietActive).toBe(false);
  });
```

- [ ] **Step 6: `AppContext` gains the two late-bound hooks**

In `src/main/ipc-handlers.ts`, inside `interface AppContext` after the `setGlobalMuted` member, add:

```ts
  /** quiet-hours engagement right now, override applied; late-bound in index.ts */
  quietNow(): boolean;
  /** re-arm the boundary timer and re-apply mute after a schedule edit;
   *  late-bound in index.ts */
  quietScheduleChanged(): void;
```

In the `settings:update` handler, after `if ('railPosition' in patch) ctx.views.layout();` add:

```ts
    if ('quietHours' in patch) ctx.quietScheduleChanged();
```

- [ ] **Step 7: Banner gate and checkmarks read effective silence**

In `src/main/notifications.ts`, replace the `shouldNotify` line with:

```ts
    if (
      !shouldNotify({
        serviceMuted: s.muted[serviceId],
        globalMuted: s.globalMuted,
        quietNow: this.ctx.quietNow(),
      })
    ) {
      return;
    }
```

In `src/main/menu.ts`, replace the `muteItem` const with:

```ts
  const muteItem: Electron.MenuItemConstructorOptions = {
    label: 'Mute All Notifications',
    accelerator: 'CmdOrCtrl+Shift+M',
    type: 'checkbox',
    checked: s.globalMuted || ctx.quietNow(),
    // the item's own `checked` is stale the moment mute moves elsewhere; read
    // effective silence instead, and let setGlobalMuted rebuild both menus
    click: () => ctx.setGlobalMuted(!(ctx.settings.get().globalMuted || ctx.quietNow())),
  };
```

In `src/main/tray.ts`, the mute item's `checked` line becomes:

```ts
          checked: s.globalMuted || ctx.quietNow(),
```

(the `click` stays `(item) => ctx.setGlobalMuted(item.checked)` — the checkbox now renders effective silence, so `item.checked` is the desired new effective state).

- [ ] **Step 8: Wire the controller in `src/main/index.ts`**

Add imports (biome will sort them):

```ts
import { muteToggleResult, quietWindowFor } from './lib/quiet-hours-rules';
import { QuietHoursController } from './quiet-hours';
```

Directly above the `const views = new ServiceViewManager(` statement, insert (the `quietSideEffects` reference is lazy — it is defined after `broadcast` and only runs after startup completes):

```ts
    const quiet = new QuietHoursController({
      schedule: () => settings.get().quietHours,
      override: () => settings.get().quietOverrideWindowStart,
      onBoundary: () => quietSideEffects(),
    });
```

The audio-mute callback (currently `return audioMuted({ serviceMuted: s.muted[id], globalMuted: s.globalMuted });`) becomes:

```ts
        return audioMuted({
          serviceMuted: s.muted[id],
          globalMuted: s.globalMuted,
          quietNow: quiet.quietNow(),
        });
```

In `broadcast()`, the snapshot line becomes:

```ts
      win.webContents.send(
        'shell:state',
        state.snapshot(s, effectiveTheme(), app.getVersion(), quiet.quietNow()),
      );
```

Directly after the `broadcast` const's closing `};`, insert:

```ts
    // the boundary fire and the mute toggle share one tail so they can't drift
    const quietSideEffects = () => {
      views.applyAudioMuteAll();
      buildAppMenu(ctx);
      tray?.refresh();
      broadcast();
    };
```

In the `ctx` object literal, replace the `setGlobalMuted` member with, and add the two hooks:

```ts
      setGlobalMuted: (muted) => {
        settings.update(
          muteToggleResult({
            wantSilence: muted,
            engagedWindowStart:
              quietWindowFor(new Date(), settings.get().quietHours)?.start.getTime() ?? null,
          }),
        );
        quietSideEffects();
      },
      quietNow: () => quiet.quietNow(),
      quietScheduleChanged: () => {
        quiet.rearm();
        quietSideEffects();
      },
```

After `hibernation.start();` add:

```ts
    quiet.start();
```

The `before-quit` line `app.on('before-quit', () => updates.dispose());` becomes:

```ts
    app.on('before-quit', () => {
      updates.dispose();
      quiet.dispose();
    });
```

Note the old `setGlobalMuted` body's comment ("both menus capture the checkmark when they are built") moves into `quietSideEffects` conceptually — drop it or keep it above `buildAppMenu(ctx)` inside `quietSideEffects`; the four side-effect lines replace the old inline ones exactly.

- [ ] **Step 9: Run the gates**

Run: `npx biome check --write src/main src/shared tests/unit/notification-rules.test.ts tests/unit/state.test.ts`

Run: `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test` — expected: all green, including the updated notification-rules and state suites.

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e` — expected: all existing specs pass (quiet hours default disabled, so behavior is unchanged).

- [ ] **Step 10: Stop for the user's commit**

Do not run `git commit`. Ask the user to run `/grimoire-core:commit`. Suggested message: `feat(quiet-hours): enforce effective silence across main`.

---

### Task 4: Settings UI and bell awareness

**Files:**

- Modify: `src/renderer/src/components/SettingsView.tsx` (Notifications pane)
- Modify: `src/renderer/src/components/Rail.tsx` (bell shows effective silence)

**Interfaces:**

- Consumes: `ShellState.quietActive`, `Settings.quietHours` (Tasks 2–3); existing `settings:update` and `global:setMuted` channels.
- Produces: test ids Task 5's e2e uses: `quiet-enabled`, `quiet-start`, `quiet-end`, `quiet-day-<n>` (n = `Date.getDay()` index).

- [ ] **Step 1: Add the quiet-hours block to the Notifications pane**

In `src/renderer/src/components/SettingsView.tsx`, add module-level constants below the `SECTIONS` array:

```ts
// display Monday-first; storage stays Date.getDay()-indexed (0 = Sunday)
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
```

In the Notifications `Pane`, the "Mute all notifications" checkbox becomes effective-silence aware:

```tsx
                <Row label="Mute all notifications">
                  <input
                    type="checkbox"
                    checked={state.quietActive || s.globalMuted}
                    onChange={(e) =>
                      window.goetia.send('global:setMuted', { muted: e.target.checked })
                    }
                  />
                </Row>
```

After the "Play notification sound" `Row`, add:

```tsx
                <Row
                  label="Quiet hours"
                  hint="Banners and page sounds pause on schedule. Badges keep counting."
                >
                  <input
                    type="checkbox"
                    data-testid="quiet-enabled"
                    checked={s.quietHours.enabled}
                    onChange={(e) =>
                      update({ quietHours: { ...s.quietHours, enabled: e.target.checked } })
                    }
                  />
                </Row>
                <Row label="From">
                  <span className="flex items-center gap-2 text-text-2">
                    <input
                      type="time"
                      data-testid="quiet-start"
                      value={s.quietHours.start}
                      disabled={!s.quietHours.enabled}
                      onChange={(e) => {
                        if (e.target.value) {
                          update({ quietHours: { ...s.quietHours, start: e.target.value } });
                        }
                      }}
                      className="rounded-ctl border border-border bg-bg-2 px-2 py-1 text-text-1 disabled:opacity-40"
                    />
                    to
                    <input
                      type="time"
                      data-testid="quiet-end"
                      value={s.quietHours.end}
                      disabled={!s.quietHours.enabled}
                      onChange={(e) => {
                        if (e.target.value) {
                          update({ quietHours: { ...s.quietHours, end: e.target.value } });
                        }
                      }}
                      className="rounded-ctl border border-border bg-bg-2 px-2 py-1 text-text-1 disabled:opacity-40"
                    />
                  </span>
                </Row>
                <Row label="On days">
                  <span className="flex items-center gap-1">
                    {DAY_ORDER.map((d, i) => (
                      <button
                        key={d}
                        type="button"
                        data-testid={`quiet-day-${d}`}
                        aria-pressed={s.quietHours.days[d]}
                        disabled={!s.quietHours.enabled}
                        onClick={() => {
                          const days = [...s.quietHours.days] as Settings['quietHours']['days'];
                          days[d] = !days[d];
                          update({ quietHours: { ...s.quietHours, days } });
                        }}
                        className={`h-7 w-7 rounded-ctl text-[12px] transition-colors duration-120 disabled:opacity-40 ${
                          s.quietHours.days[d]
                            ? 'bg-accent/15 font-medium text-accent'
                            : 'bg-bg-2 text-text-2 hover:text-text-1'
                        }`}
                      >
                        {DAY_LABELS[i]}
                      </button>
                    ))}
                  </span>
                </Row>
```

- [ ] **Step 2: Bell shows effective silence with a quiet-hours tooltip**

In `src/renderer/src/components/Rail.tsx`, below the `const updateReady = updatePending(state.update);` line add:

```ts
  const silenced = state.globalMuted || state.quietActive;
```

Replace the bell button (the one sending `global:setMuted`) with:

```tsx
        <button
          type="button"
          title={`${
            silenced ? 'Unmute all notifications' : 'Mute all notifications'
          } (⌘/Ctrl+⇧+M) — badges stay${
            state.quietActive && !state.globalMuted
              ? ` — quiet hours until ${state.settings.quietHours.end}`
              : ''
          }`}
          onClick={() => window.goetia.send('global:setMuted', { muted: !silenced })}
          className={`flex h-7 w-7 items-center justify-center rounded-ctl transition-colors duration-120 ${
            silenced
              ? 'bg-badge/15 text-badge hover:bg-badge/25'
              : 'text-text-2 hover:bg-bg-2 hover:text-text-1'
          }`}
        >
          <BellIcon muted={silenced} />
        </button>
```

- [ ] **Step 3: Run the gates**

Run: `npx biome check --write src/renderer/src/components/SettingsView.tsx src/renderer/src/components/Rail.tsx`

Run: `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test` — expected: all green (no unit test targets the renderer).

- [ ] **Step 4: Stop for the user's commit**

Do not run `git commit`. Ask the user to run `/grimoire-core:commit`. Suggested message: `feat(quiet-hours): add settings block and effective-silence bell`.

---

### Task 5: E2E, docs, and the manual pass

**Files:**

- Modify: `tests/e2e/restart.spec.ts` (persistence case)
- Modify: `README.md` (muting bullet), `CLAUDE.md` (Notifications & mute clause)

**Interfaces:**

- Consumes: the test ids from Task 4 and the whole chain beneath them.
- Produces: nothing — verification and documentation.

- [ ] **Step 1: Add the e2e persistence case**

Append to `tests/e2e/restart.spec.ts`:

```ts
test('restart: quiet hours edits persist', async () => {
  const profile = makeProfile({ disabled: TWO_ENABLED });
  const first = await launch(profile);

  await first.win.locator('[data-testid="settings-btn"]').click();
  await first.win.locator('[data-testid="settings-nav-notifications"]').click();
  await first.win.locator('[data-testid="quiet-enabled"]').check();
  await first.win.locator('[data-testid="quiet-start"]').fill('21:30');
  await first.win.locator('[data-testid="quiet-day-1"]').click(); // Monday off
  await first.app.close();

  const second = await launch(profile);
  await second.win.locator('[data-testid="settings-btn"]').click();
  await second.win.locator('[data-testid="settings-nav-notifications"]').click();
  await expect(second.win.locator('[data-testid="quiet-enabled"]')).toBeChecked();
  await expect(second.win.locator('[data-testid="quiet-start"]')).toHaveValue('21:30');
  await expect(second.win.locator('[data-testid="quiet-day-1"]')).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await second.app.close();
});
```

- [ ] **Step 2: README bullet**

In `README.md`, the muting bullet (starts `- **Muting means silence, not blindness**`) gains this appended sentence, keeping the bullet one unwrapped line:

```markdown
 **Quiet hours** (Settings → Notifications) do the same on a schedule — pick the hours and days, and unmuting mid-window keeps that night loud until the next window starts.
```

- [ ] **Step 3: CLAUDE.md clause**

In `CLAUDE.md`, the "Notifications & mute" section gains one bullet after the "Mute means silence, never blindness" bullet:

```markdown
- **Quiet hours are a scheduled global mute.** Effective silence is `globalMuted || quietNow`, decided solely by the `shouldNotify`/`audioMuted` pair in `lib/notification-rules.ts` — never gate a banner or page audio anywhere else. Engagement is computed from the wall clock (`lib/quiet-hours-rules.ts`), never persisted; boundary fires and `setGlobalMuted` share one side-effects tail in `index.ts`; unmuting mid-window records `quietOverrideWindowStart` and holds until the next window; `aggregateBadges` stays ignorant of quiet hours too.
```

- [ ] **Step 4: Run all gates**

Run: `npx markdownlint-cli2 README.md CLAUDE.md docs/superpowers/specs/2026-08-16-quiet-hours-design.md docs/superpowers/plans/2026-08-16-quiet-hours.md` — expected: 0 issues.

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test` — expected: all green.

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e` — expected: all specs pass including the new persistence case.

- [ ] **Step 5: Hand the manual pass to the user**

Report results, then list the clock-dependent checks only a human can run in `env -u ELECTRON_RUN_AS_NODE corepack pnpm dev`:

- Set a window starting one minute out (today checked): at the boundary the bell flips to muted with the quiet-hours tooltip, both menu checkmarks check themselves, and a test message raises no banner and no page sound.
- Click the bell mid-window: silence lifts, banners return, and it stays lifted for the rest of that window.
- Confirm the next occurrence engages again (set a two-minute window to see the cycle end-to-end).
- Toggle a day off and confirm that day's window never engages.

- [ ] **Step 6: Stop for the user's commit**

Do not run `git commit`. Ask the user to run `/grimoire-core:commit`. Suggested message: `feat(quiet-hours): cover persistence e2e and document the schedule`.
