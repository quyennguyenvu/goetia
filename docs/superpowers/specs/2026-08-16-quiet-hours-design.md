# Quiet hours

Date: 2026-08-16. Status: accepted. A daily schedule silences Goetia the way global mute does — no banners, page audio muted, badges untouched — engaging on chosen days of the week, with a manual unmute overriding until the next window. Second slice of the v0.8 daily-driver phase; "daily window + active days" was chosen over a single every-day window and weekday/weekend profiles on 2026-08-16.

## Problem

The notification story has per-service mute, global mute, a per-service throttle, and the one-sound rule — but no clock. Anyone who sleeps near their machine either global-mutes every night by hand (and forgets in both directions) or gets 2 a.m. banners. The pieces to build on are already exactly right: `shouldNotify` and `audioMuted` are a pure pair in `lib/notification-rules.ts` defined as inverses "so the two can't drift", which means one added input silences banners and page audio together — the "mute means silence, never blindness" invariant holds by construction.

## Decision

Quiet hours is a scheduled global mute. Effective silence becomes `globalMuted || quietNow`, and everything that today reads `globalMuted` for behavior (banner gate, audio-mute callback, bell, tray and menu checkmarks) reads effective silence instead. Badges stay untouched — `aggregateBadges` remains ignorant of all muting.

**Schedule shape.** One window (`start`–`end`, 24-hour wall-clock times) plus seven day toggles. A window may cross midnight, and a crossing window belongs to the day it **starts**: with Friday unchecked, Friday 22:00 → Saturday 07:00 stays loud all the way through, and Saturday's own window begins Saturday night. That is the only attribution that never produces split half-nights. `start === end` is an empty window that never engages — not 24-hour quiet.

**Manual override (the macOS DND rule).** Unmuting mid-window wins until the next window starts. The engaged window's start timestamp is its identity; one persisted field, `quietOverrideWindowStart`, records the window the user dismissed. `quietNow` is true when a window is engaged *and* its start differs from the override. Muting manually mid-window just sets `globalMuted`, which rightly outlives the window. Persisting the override means a restart mid-window stays dismissed.

**Time math is local wall-clock.** Windows are constructed from local date parts (`new Date(y, m, d, hh, mm)`), so a DST jump lands boundaries where the wall clock says, and a timer that fires late — laptop asleep past a boundary — self-corrects because every fire recomputes from the current clock.

## Pure rules

`src/main/lib/quiet-hours-rules.ts`, per the `hibernation.ts` / `lib/hibernation-rules.ts` split. All functions take `now: Date` and the schedule; nothing reads the clock itself.

```ts
export interface QuietHoursSchedule {
  enabled: boolean;
  start: string; // 'HH:MM', 24h local
  end: string; // 'HH:MM'; end < start crosses midnight; end === start is an empty window
  /** indexed by Date.getDay(): 0 = Sunday … 6 = Saturday */
  days: [boolean, boolean, boolean, boolean, boolean, boolean, boolean];
}

/** The engaged window covering `now`, or null. Checks the windows starting
 *  today and yesterday (midnight crossers). `start` doubles as the window id. */
export function quietWindowFor(now: Date, q: QuietHoursSchedule): { start: Date; end: Date } | null;

/** Engaged and not the window the user dismissed. */
export function quietNow(now: Date, q: QuietHoursSchedule, overrideWindowStart: number | null): boolean;

/** The next instant the engaged state can change (a window start or end),
 *  scanning at most 8 days; null when disabled or no day is checked. */
export function nextBoundary(now: Date, q: QuietHoursSchedule): Date | null;

/** The mute toggle's two cases. Toggling silence off during an engaged window
 *  dismisses that window; toggling on is a plain persistent mute. */
export function muteToggleResult(o: {
  wantSilence: boolean;
  engagedWindowStart: number | null;
}): { globalMuted: boolean; quietOverrideWindowStart: number | null };
```

`shouldNotify` and `audioMuted` in `lib/notification-rules.ts` each gain a `quietNow: boolean` field in their existing opts object — the pair stays inverse-defined, so banners and page audio can never disagree about quiet hours.

## Wiring

`src/main/quiet-hours.ts` exports a small `QuietHoursController` following the `UpdateChecker` pattern: constructed with `{ schedule: () => QuietHoursSchedule, override: () => number | null, onBoundary: () => void }`, it owns exactly one `setTimeout` armed to `nextBoundary`, exposes `quietNow(): boolean` and `rearm(): void`, and `dispose()` clears the timer (called from `before-quit`, per the bounded-timers rule). On fire it calls `onBoundary` and re-arms.

In `index.ts`:

- `onBoundary` runs the same side effects `setGlobalMuted` already runs — `views.applyAudioMuteAll()`, `buildAppMenu(ctx)`, `tray?.refresh()`, `broadcast()` — extracted into one shared helper so the two can't drift. No settings write happens on a boundary; engagement is computed, never stored.
- The audio callback at `index.ts:100` and the banner gate at `notifications.ts:32` pass `quietNow: quiet.quietNow()` into the extended pair.
- `setGlobalMuted` becomes the override-aware toggle: it feeds `muteToggleResult` and persists both `globalMuted` and `quietOverrideWindowStart` in one `settings.update`, then runs the shared side effects. Every mute path (bell, tray, app menu, ⌘/Ctrl+⇧+M) already goes through it, so override semantics are automatic everywhere.
- Menu and tray checkmarks, and the shell bell, show effective silence (`globalMuted || quietNow`); their toggles request `!effective`. The `global:setMuted` channel and its classification are unchanged.
- `rearm()` is called after any settings write that can change the schedule (the `settings:update` IPC handler and `setGlobalMuted`), and by each boundary fire.

`ShellState` gains `quietActive: boolean`, supplied to `state.snapshot(...)` by `broadcast()` — it rides the existing broadcast; no new IPC channel anywhere.

## Settings and normalization

`Settings` gains `quietHours: QuietHoursSchedule` and `quietOverrideWindowStart: number | null`; `DEFAULT_SETTINGS` ships `{ enabled: false, start: '22:00', end: '07:00', days: [true ×7] }` and `null`. `normalize()` in `settings.ts` coerces per-field in its existing style: non-boolean `enabled`, times failing `/^([01]\d|2[0-3]):[0-5]\d$/`, or a `days` value that isn't a 7-boolean array fall back to the default field; a non-finite override becomes `null`. Persisted pre-quiet-hours settings files get the whole default block via the existing defaults spread.

## Settings UI

The Notifications pane gains a Quiet hours block: an enable toggle, two `<input type="time">` fields, and seven day dots rendered Monday-first (display order only — storage stays `getDay()`-indexed, so index 0 = Sunday renders last). Edits send one `settings:update` patch carrying the whole `quietHours` object. While quiet is active the bell shows the ordinary muted state and its tooltip reads "Quiet hours until HH:MM"; there is no toast on engage — silence that announces itself isn't silence.

## Testing

`tests/unit/quiet-hours-rules.test.ts` pins the matrix: same-day window in/out; midnight crosser before/after midnight; start-day attribution (Friday unchecked ⇒ loud at Friday 23:00 *and* Saturday 03:00, while Saturday 23:00 engages); empty window (`start === end`) never engages; disabled or zero-days schedules yield `quietNow` false and `nextBoundary` null; `nextBoundary` skips unchecked days and lands on the next start or the current window's end; override id dismisses exactly one window and the next engages; `muteToggleResult` both cases. `notification-rules.test.ts` gains the quiet term (quiet alone suppresses banner and mutes audio; badges have no code path to assert — unchanged by construction). The controller stays thin wiring, untested like `waking.ts`.

E2E: one settings-pane case — the Quiet hours block renders, an edit persists across the existing restart harness. Engagement timing is clock-dependent and stays manual: set a window starting one minute out, watch the bell flip and a test banner stay silent, unmute mid-window and confirm it holds, check the next night engages again.

## Documentation

README "Handy to know" muting bullet gains a sentence: quiet hours live in Settings ▸ Notifications, silence banners and page sounds on a schedule, and badges keep counting. `CLAUDE.md`'s "Notifications & mute" section gains one clause: effective silence is `globalMuted || quietNow`; the pair in `notification-rules.ts` is the single place both mute kinds gate banners and audio, and `aggregateBadges` stays ignorant of quiet hours too.

## Excluded on purpose

Per-service quiet hours, queue-and-deliver-at-window-end, multiple windows per day, and a toast on engage. All are addable later without changing the schedule shape.
