# Summon hotkey

Date: 2026-08-16. Status: accepted. One system-wide shortcut shows or hides Goetia from anywhere. Third slice of the v0.8 daily-driver phase; a curated combo dropdown was chosen over a fixed combo and a free-form recorder on 2026-08-16.

## Problem

Goetia lives in the tray, but reaching it always takes the mouse (tray icon) or an app switcher — there is no keyboard path from another app to your chats and back. A hub app earns its place by being one keypress away. Nothing in the codebase uses `globalShortcut` today.

## Decision

**Press behavior.** Window focused → hide. Anything else — hidden to tray, minimized, or visible but behind another app — → show and focus. Two existing behaviors come free: the `win.on('focus')` handler already routes keyboard focus into the active service view, and the tray's Hide/Show label already rebuilds on the window's `show`/`hide` events. Accepted quirk: when the window is fullscreen and focused, the press is a no-op — hiding a fullscreen macOS window strands an empty desktop space.

**Binding.** A curated list, not a recorder: four cross-platform-safe accelerators, default `Alt+CmdOrCtrl+G`. The list, the default, and a pure `comboLabel(accelerator, isMac)` formatter (⌥⌘G on macOS, Ctrl+Alt+G elsewhere, modifiers in each platform's conventional order) live in `src/shared/summon.ts` so the settings select, normalization, and main share one source.

```ts
export const SUMMON_COMBOS = [
  'Alt+CmdOrCtrl+G',
  'Alt+CmdOrCtrl+Space',
  'Ctrl+Shift+Space',
  'Ctrl+Shift+G',
] as const;
```

**No silent failure.** `globalShortcut.register` returns false when another app owns the combo. That result lands on a `MainState.summonHotkeyOk` public field (event-driven state, so a field like `switcherOpen`, not a snapshot parameter), rides the existing broadcast into `ShellState.summonHotkeyOk`, and the settings row shows a pick-another-combo hint while an enabled combo is unregistered.

## Settings

`Settings.summonHotkey: { enabled: boolean; accelerator: string }`, default `{ enabled: false, accelerator: 'Alt+CmdOrCtrl+G' }`. `normalize()` coerces a non-boolean `enabled` and any accelerator not in `SUMMON_COMBOS` back to defaults, in its existing per-field style.

## Wiring

`src/main/summon-hotkey.ts` exports a small `SummonHotkey` class: constructed with the press handler, `apply(setting)` unregisters its previous combo, registers the new one when enabled, and returns success (`true` when disabled — off is never a failure); `dispose()` unregisters. In `index.ts`: the handler implements the press behavior against `win` (guarded by `isDestroyed`); `applySummon()` runs `state.summonHotkeyOk = summon.apply(settings.get().summonHotkey)` at startup and from a late-bound `ctx.summonHotkeyChanged()` (the `quietScheduleChanged` shape) which the `settings:update` handler calls when the patch carries `summonHotkey`, followed by a broadcast so the warning hint is live. `dispose()` joins the existing `before-quit` block. No new IPC channel; the setting rides the shell-only `settings:update`.

## Settings UI

Settings ▸ General gains two rows: a "Summoning hotkey" toggle whose hint reads "Show or hide Goetia from anywhere." normally and "That combo is taken by another app — pick a different one." while `summonHotkeyOk` is false, and a combo `<select>` (disabled while off) listing the four combos through `comboLabel` with the platform detected via `navigator.platform`. The Shortcuts pane's static list gains a line showing the chosen combo while the hotkey is enabled.

## Testing

`tests/unit/summon.test.ts`: `comboLabel` renders macOS glyphs in ⌃⌥⇧⌘ order and Windows names in Ctrl+Alt+Shift order for every combo in the list; the list has no duplicates. `settings.test.ts` gains default and coercion cases. `state.test.ts` pins that `summonHotkeyOk` defaults true and the snapshot carries it. Registration itself is an Electron API behind thin wiring — untested like the other controllers — and Playwright cannot synthesize OS-level global keystrokes, so e2e covers only the settings rows persisting across the restart harness. The real press, the focus landing in the active service, and the taken-combo warning are a manual pass.

## Documentation

README's Shortcuts bullet gains a clause pointing at the system-wide summoning hotkey in Settings → General. `CLAUDE.md` gets nothing: the feature adds no invariant beyond unregister-on-quit, which the bounded-timers rule's spirit already covers and the `dispose()` placement satisfies.

## Excluded on purpose

Free-form recording, jump-to-unread on summon, per-service hotkeys, and any second binding. All addable without changing the settings shape.
