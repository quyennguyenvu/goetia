# Rebindable shortcuts — design

Date: 2026-09-23. Status: implemented 2026-09-23. Scope: eight of Goetia's chords become the user's to change from Settings → Shortcuts by pressing the new key, with per-key and whole-table reset. Which commands exist, where they run and how a chord beats the page do not change.

## Problem

Every chord is a constant in `shared/shortcuts.ts`. The table is the single source for the menu, the in-page interceptor and the Shortcuts pane — which is right — but it means a chord a site or a habit fights (`⌘K` is Slack's and Discord's switcher too; a Windows user may want `Ctrl+Shift+H` back for Home) can only be changed by a release. The summoning hotkey already has a per-install choice; the rest of the table has none.

## Decisions

- **Press to record, no dialog** (user decision, variant A of the two mocked). Click a key cap, press the chord, it is saved on the spot; a refusal is one inline line and the cap keeps listening; Escape or ten seconds of silence ends it. Variant B — a dropdown of allowed chords per row, the summoning hotkey's pattern — was declined: nothing could collide, but the list would be Goetia's choice of keys.
- **Eight chords are rebindable, the rest are fixed.** `switcher`, `nextUnread`, `prevUnread`, `home`, `downloads`, `pinSelection`, `mute`, `lock`. Fixed and never rows you can change: `⌘/Ctrl 1…9` (the rail order), `settings` (`⌘,`), `reload` (`⌘R` / `F5`), zoom, `findService` (`⌘F`), dev tools and `Esc` — OS and browser conventions — and the summoning hotkey, which keeps its own dropdown in General.
- **Next and Previous Unread are one pair** (user decision). The row records one chord; its opposite is inferred from a mirror table and both are validated and saved together. Direction follows the key pressed: `]` `.` `=` Right Down PageDown and Tab are the "next" side, their mirrors the "previous" side, so either half can be recorded. A key with no opposite is refused.
- **Overrides, not a new table.** `settings.shortcuts` is a partial map of the eight ids to accelerators; the defaults stay in `shared/shortcuts.ts` and `resolveAccelerators(overrides)` is the one table the menu, the interceptor and the pane read. Missing means default. It joins `BACKUP_KEYS`, validated on import like everything else there.
- **Validation lives in main, once.** The pane never writes a chord: it asks main to record, and main builds the chord from the physical key, validates it with one pure rule, writes the setting and answers. The same rule normalises `settings.json` at boot and a backup on import, so a hand-edited or imported override that is reserved, colliding or half a pair is dropped, never applied.
- **Recording holds off everything else.** While main records, every key on the shell window is `preventDefault`ed in `before-input-event`, which is what stops `⌘K` from opening the switcher through the menu accelerator while the user is trying to record it, and stops the renderer from seeing the keydown at all. Settings is a shell surface, so the service view is hidden and its interceptor is not in the path.

## Threat model

Nothing here reaches a service page, and nothing a page can send changes a key:

- **`shortcuts:record` is shell-only** and refused while locked, like every other shell channel. The payload is an id checked against the eight; the chord itself never crosses IPC in — main reads it off the OS key event. Nothing can be recorded from a service frame, and the recorder cancels when Settings closes.
- **An override is data.** `settings.json`, a backup file and the record path all pass through `normalizeShortcuts`: string values only, parseable as an Electron accelerator, carrying `CmdOrCtrl`, not in the reserved set, not colliding with another command, a pair only complete. Anything else is dropped, not defaulted to something surprising.
- **The reserved set is the safety rail.** `⌘Q W H M N T`, `⌘Z X C V A P`, `⇧⌘Q W Z X C V T R`, `⌘Tab`, the fixed accelerators above and `⌘/Ctrl 1…9`: a chord that would take copy, paste, quit or a service number away from the page or the OS is refused up front. A rebound chord is still only intercepted where the fixed ones are — inside service views and via the app menu — so the blast radius of a bad choice is Goetia's own windows.
- **Bounded.** One recording at a time, ten seconds, one settings write per accepted chord. The pane's re-listen after a refusal is a new invoke, not a loop in main.

## Data

`src/shared/shortcuts.ts`:

```ts
export const ACCELERATORS = { … } as const;           // unchanged: the defaults
export type Accelerators = { -readonly [K in keyof typeof ACCELERATORS]: (typeof ACCELERATORS)[K] extends readonly string[] ? readonly string[] : string };
export const REBINDABLE = ['switcher', 'nextUnread', 'prevUnread', 'home', 'downloads', 'pinSelection', 'mute', 'lock'] as const;
export type RebindableId = (typeof REBINDABLE)[number];
export type ShortcutOverrides = Partial<Record<RebindableId, string>>;
/** the defaults with the overrides laid over the eight rebindable keys; ids outside REBINDABLE are ignored */
export function resolveAccelerators(overrides: ShortcutOverrides | undefined): Accelerators;
/** the human name a refusal uses: `taken by Quick Switcher` */
export const SHORTCUT_LABELS: Record<RebindableId, string>;
```

`Settings.shortcuts: ShortcutOverrides` (default `{}`), normalised by `fillShortcuts` in `settings.ts` through `normalizeShortcuts`, and `'shortcuts'` joins `BACKUP_KEYS` with `accept` handing the object to the same function.

`src/main/lib/shortcut-rules.ts` (pure, vitest):

```ts
export const RECORD_TIMEOUT_MS = 10_000;
export type RecordFailure = 'modifier' | 'reserved' | 'taken' | 'pair' | 'cancelled';
export type RecordResult =
  | { ok: true; patch: ShortcutOverrides }        // one id, or both halves of the pair
  | { ok: false; reason: RecordFailure; takenBy?: RebindableId };
/** an Electron accelerator from a keyDown, off the physical key: `Key`/`Digit` codes, brackets, period, comma, equal, minus, arrows (Right/Left/Up/Down), Page keys, Tab, Space, F1–F12; null for a bare modifier or an unmapped code */
export function chordFromInput(input: KeyInput, platform: string): string | null;
/** the reserved set above, with the fixed ACCELERATORS entries and CmdOrCtrl+1…9 folded in */
export function isReserved(chord: string): boolean;
/** `{ next, prev }` from the mirror table (]/[  ./,  =/-  Right/Left  Down/Up  PageDown/PageUp  Tab/Shift+Tab), or null */
export function pairFor(chord: string): { next: string; prev: string } | null;
/** the verdict on recording `chord` for `id` against the currently resolved table */
export function recordVerdict(id: RebindableId, chord: string, resolved: Accelerators): RecordResult;
/** data in, valid overrides out: strings only, parseable, CmdOrCtrl present, not reserved, no two ids on one chord (later REBINDABLE order loses), a pair kept only whole */
export function normalizeShortcuts(raw: unknown): ShortcutOverrides;
```

`recordVerdict` for `nextUnread` / `prevUnread` runs `pairFor` first (`pair` failure when null), then validates both halves with the pair's two ids excused from `taken`, and returns both in `patch`. `taken` names the holder's id so the pane can say "taken by Quick Switcher" through `SHORTCUT_LABELS`; a chord equal to the row's own current one is `ok` with an empty patch.

## Matching and the menu

`shellCommandFor(input, platform, accelerators = ACCELERATORS)`: the fixed table becomes a function of the resolved accelerators. `views.ts` gets an `accelerators()` hook returning `resolveAccelerators(settings.get().shortcuts)` and passes its result per event; `buildAppMenu` reads the same and is rebuilt when a `settings:update` carries `shortcuts` (the `applySettingsPatch` tail, beside `order`). The `CODES` table in `lib/shortcuts.ts` grows `Period`, `ArrowRight/Left/Up/Down` (for `Right/Left/Up/Down`), `PageUp`, `PageDown`, `Tab` and `Space`, so a recorded chord and a matched chord agree on the physical key. `comboLabel` draws `Right/Left/Up/Down` as `→ ← ↑ ↓`.

## Recording

`src/main/shortcut-recorder.ts`, `ShortcutRecorder`, electron-free with injected `now`/timers:

- `start(id): Promise<RecordResult>` — resolves once, `cancelled` included; a second `start` while one is pending resolves the first as `cancelled` and takes over (clicking another row). Arms `RECORD_TIMEOUT_MS`.
- `onInput(e: { preventDefault(): void }, input: KeyInput): void` — called from the shell window's existing `before-input-event` handler before its F5 branch; a no-op when idle. While recording: `preventDefault()` on every event; `keyUp` ignored; `Escape` resolves `cancelled`; a bare modifier ignored; else `chordFromInput` → `recordVerdict(id, chord, resolved())` → resolve.
- `cancel()` — Settings closing (`setOverlayOpen('settingsOpen', false)`) and the lock engaging resolve a pending recording as `cancelled`.

The IPC handler for `shortcuts:record` (invoke, shell-only, payload `{ id }` validated against `REBINDABLE`) awaits `start`, and on `ok` with a non-empty patch applies `{ shortcuts: { ...current, ...patch } }` through `applySettingsPatch` — so the menu rebuilds and the broadcast carries the new table — then returns the result to the pane. The pane never touches settings for a recording.

## Surface

Settings → Shortcuts keeps its groups and rows. A rebindable row's chord becomes a **key cap button** (`shortcut-cap-<id>`; the pair row is one cap showing `⇧⌘] / ⇧⌘[`) and the row gains a right-hand slot for **Reset to `<default>`** (`shortcut-reset-<id>`), shown only when the row differs from its default; the pair's reset clears both halves. Fixed rows render as today, plain text.

States, as mocked:

| State | Cap | Description column |
| --- | --- | --- |
| idle | the chord | the action, as today |
| recording | `Press a shortcut… esc cancels` (accent border) | the action |
| refused | the refused chord, danger border, still listening | `⇧⌘K is taken by Quick Switcher — press another, or esc` / `⌘C is reserved — …` / `Needs ⌘ — …` / `Needs a key with an opposite: brackets, arrows, Page Up/Down, Tab — …` |

Clicking a cap invokes `shortcuts:record`; a refusal shows its line and re-invokes at once so the cap keeps listening; `cancelled` returns the row to idle; `ok` needs nothing — the broadcast redraws the cap from the resolved table. The intro sentence becomes: `Goetia's keys work inside every chat page, even where the site binds the same chord. Click a key to change it — keep the ones you press with the mouse in your other hand on the left half.` A footer line reads `<n> keys changed from the defaults.` with **Reset all to defaults** (`shortcuts-reset-all`, one `settings:update({ shortcuts: {} })`), present only when `n > 0`. The Notifications group's summoning-hotkey row's description gains the words `chosen in General` after a dash.

## Testing

- `tests/unit/shortcut-rules.test.ts` — `chordFromInput`: letters, digits, brackets and period from `code` (a shifted `}` records `]`), arrows and Page keys, Tab and Space, F-keys; `Cmd` vs `Ctrl` by platform; null for a bare Shift; `isReserved` for each family; `pairFor` for every mirror, both directions, Tab with Shift toggled, null for `G`; `recordVerdict`: ok, `modifier`, `reserved` (`⌘C`, `⌘1`, `⌘,`), `taken` naming the holder, the pair (`⌘Right` → both, `⌘=` refused as reserved through its mirror, `⌘G` refused as `pair`), same chord as its own current is ok with an empty patch; `normalizeShortcuts`: drops non-strings, unparseable, modifier-less, reserved, the later of two ids on one chord, a lone pair half, unknown ids; `resolveAccelerators` lays overrides over defaults and ignores unknown ids.
- `tests/unit/shortcuts.test.ts` — `shellCommandFor` with a resolved table: the override wins, the default no longer matches, the new codes map.
- `tests/unit/shortcut-recorder.test.ts` — fake timers: `preventDefault` on every event while recording and never when idle; Escape cancels; timeout cancels; a second start cancels the first; a refusal resolves and leaves the recorder idle; keyUp and bare modifiers ignored; `cancel()` on close.
- `tests/unit/settings.test.ts` — `fillShortcuts` from missing, partial and malformed; `tests/unit/settings-backup.test.ts` — `shortcuts` travels and a bad entry is dropped on import.
- `tests/unit/ipc-sender-policy.test.ts`, `lock-ipc-policy.test.ts` — `shortcuts:record` refused from a service frame and while locked; `activate.test.ts` — closing Settings cancels a recording.
- `tests/e2e/shortcuts.spec.ts` — open Settings → Shortcuts; click Home's cap; emit `⇧⌘E` on the **shell** window's `webContents` (`BrowserWindow.getAllWindows()[0]`, the recorder's listener) and assert the cap reads `⇧⌘E` with a Reset; close Settings and emit `⇧⌘E` on the service view (the existing `chord` helper) and assert Home opens, then `⇧⌘G` and assert it does not; reopen, click Pin Selection's cap, emit `⌘K`, assert the line names Quick Switcher, emit Escape, assert idle; click the unread pair's cap, emit `⌘→` (`ArrowRight`), assert the cap reads `⌘→ / ⌘←`; Reset all, assert every cap is back to its default.

## Out of scope

- Rebinding the fixed chords, the service numbers or the summoning hotkey (its dropdown stays in General).
- Unbinding a command, chords without `⌘/Ctrl`, or more than one chord per command.
- Global (system-wide) shortcuts beyond the existing summon hotkey.
- Detecting collisions with the sites' own keys.
