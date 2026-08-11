# Welcome screen design

**Date:** 2026-08-08

**Goal:** A fresh install opens on a single-screen welcome: a brief walkthrough plus a service picker with a confirm button. No service loads until the user chooses. Short, clean, no scrolling, and in the app's warm ember style.

## Context

- Rail, Settings modal, and Quick Switcher already filter out disabled services; `disabled` means "no tile, no view, no network" (`src/shared/types.ts`).
- Settings flow: renderer sends a `settings:update` patch → `SettingsStore` persists to `settings.json` → the handler destroys/creates views → `broadcast()` sends a fresh `ShellState` snapshot.
- The app's visual identity: ember portal on the loading screen (spinning ring, breathing core, drifting embers), "Molten Squircle" rail tiles with the warm `#FFB43D → #FF8A2A → #F04E3E` gradient, tokenized light/dark palette (`tokens.css`), global reduced-motion override.
- Service logos already exist as maskable SVGs in `src/renderer/src/assets/logos/`.

## Decision: welcome is derived, not flagged

The welcome screen shows whenever **every** service is disabled:

```ts
const welcome = state.services.every((svc) => state.settings.disabled[svc.id]);
```

- No new settings field, no new `ShellState` field, no new IPC channel.
- `DEFAULT_SETTINGS.disabled` flips to all `true`, so fresh installs land on the welcome screen. Existing installs are untouched — `normalize()` only fills keys missing from their `settings.json`.
- The "can't disable the last enabled service" checkbox guard in `SettingsView` is removed. Disabling everything destroys all views (existing handler loop) and returns the user to the welcome screen — that is the way back to the walkthrough and picker.

Rejected alternative: a persisted one-time `onboarded` flag. It adds state that can desync from reality, and offers no way back to the picker.

## Main-process guards (all-disabled must mean zero views)

Two code paths currently create a view for a disabled service when nothing is enabled; both must be guarded:

1. **Startup** (`src/main/index.ts`): today `activeId = order.find(enabled) ?? order[0]` followed by an unconditional `views.activate(activeId)`. New behavior: only activate when an enabled service exists; otherwise set `activeId = order[0]` and create nothing.
2. **`settings:update` disabled-patch handler** (`src/main/ipc-handlers.ts`): today falls back to `?? after.order[0]` and activates unconditionally. Replace with a pure helper in `src/main/lib/` (vitest-covered), shape:

   ```ts
   resolveActivation(input: {
     order: ServiceId[];
     disabled: Record<ServiceId, boolean>;
     activeId: ServiceId;
     hasActiveView: boolean;
   }): ServiceId | null;
   ```

   Rules: keep `activeId` if it is enabled **and** has a view; if it is enabled without a view (welcome confirm selected the current `activeId`), activate it; if it is disabled, activate the first enabled service in order; if nothing is enabled, return `null` and activate nothing.

Already safe (verified): the app menu and Quick Switcher filter disabled services, `views.refresh` no-ops without a view, the waking overlay only shows for a waking runtime, and hibernation never creates views.

## Welcome UI

New `src/renderer/src/components/Welcome.tsx`, rendered by `App.tsx` in the content area **instead of** `ContentPlaceholder` when the derived flag is true. The rail stays visible (zero tiles; bell and gear remain reachable) and the Settings modal can still open above it.

A single centered column — fits the 940×600 minimum window with no scroll:

1. **Portal hero** — the loading screen's ember portal (~100 px), extracted into a `Portal.tsx` component. Its keyframes move to a shared stylesheet imported by both the shell entry and the loading page; `loading.html` keeps its inline critical-CSS copy.
2. **Title + tagline** — "Welcome to Goetia" / "All your chats. Nothing else."
3. **Three tip cards** in a row, styled like Settings sections (`rounded-modal border-border bg-bg-1`), each an icon plus two short lines:
   - Your chats live in the rail — `⌘/Ctrl 1…6` jumps to one.
   - Chat only: no feeds, no shops. Reload (`⌘/Ctrl R`) always returns to the chat.
   - `⌘/Ctrl K` quick switcher · `⌘/Ctrl ,` settings · right-click a tile to mute.
4. **Service picker grid** — one 48 px molten-squircle toggle per service in rail order (`settings.order`), logo glyph plus name below. Unselected: `bg-bg-2`, accent glyph, dimmed. Selected: the active-tile gradient with slight scale and ember glow — tapping a tile "lights" it. Rendered as buttons with `aria-pressed`; keyboard friendly. **Selection starts empty** — enabling is a deliberate opt-in.
5. **Hint line** — "Pick at least one — you can change this anytime in Settings."
6. **Confirm button** — label "Summon N services", pluralized ("Summon 1 service", "Summon 3 services"), count in tabular numerals, accent gradient, disabled while nothing is selected.

Selection is local React state; nothing persists until confirm. The portal breathes with the existing keyframes; the global `prefers-reduced-motion` rule already disables all animation.

## Confirm flow

Confirm sends one existing IPC message: `settings:update` with a `disabled` patch built by a small pure helper (`{ id: !selected }` for every service in order, vitest-covered). Main persists the patch, `resolveActivation` picks the first selected service in rail order, its view is created and covered by the waking overlay (existing flow), and the broadcast makes the welcome screen disappear because its derived condition went false. Newly enabled `neverHibernate` services background-load exactly as they do today when enabled through Settings.

## Testing

- **Unit (vitest):**
  - `resolveActivation`: all disabled → `null`; active service disabled → first enabled; active service enabled but viewless → itself; active service enabled with view → no change.
  - The disabled-patch builder: full record, selected ids `false`, others `true`.
- **E2E (Playwright):**
  - New `welcome.spec.ts`: fresh profile shows the welcome screen with an empty rail; confirm is disabled with nothing selected; selecting Zalo enables "Summon 1 service"; confirming hides the welcome, shows one rail tile, and activates Zalo; relaunching with the same profile skips the welcome.
  - Existing `smoke.spec.ts` and `loading.spec.ts`: seed each test's temp profile with a `settings.json` enabling messenger and zalo before launch so current assertions keep holding.

## Out of scope

- No changes to recipes, navigation policy, notifications, or packaging.
- No multi-step onboarding, tours, or additional welcome content — the screen stays a single view.
