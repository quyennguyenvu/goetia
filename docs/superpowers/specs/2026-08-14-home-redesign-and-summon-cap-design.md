# Home redesign and summon cap — design

Date: 2026-08-14. Validated in a brainstorm with visual mockups (split-console direction chosen over an actions-on-band variant and a circle-of-seats variant; Discard-when-dirty chosen over an always-visible Dispel and over a destructive Dispel-all).

## Problem

Three complaints against today's Home ([Welcome.tsx](../../../src/renderer/src/components/Welcome.tsx)):

- **No cap on summoned services.** The catalog has 10 services but service accelerators stop at ⌘/Ctrl 9 (`MAX_SERVICE_ACCELERATORS` in [service-accelerator.ts](../../../src/main/lib/service-accelerator.ts)), so a tenth enabled service gets a menu item with no shortcut and the rail grows without limit.
- **Two layouts for one surface.** The screen branches on `fresh` (nothing summoned): first run shows a hero intro with tip cards and a nine-up grid; steady state shows a compact header and two bands. The wow of the intro is spent once, and every layout change has to be designed twice.
- **Summon/Dispel are far away and confusing.** Both live in the bottom-right footer — a long diagonal from the tiles they act on — and "Dispel" reads like "banish my services" when it actually discards a staged edit.

## Decisions

- Cap **summoned** services at 9. The catalog keeps all 10 and can grow; the cap is on how many can be enabled at once, and it exists because ⌘1…⌘9 runs out.
- The cap is evaluated against the **staged result** (`selected.size ≤ 9`), live in the picker, not at confirm time.
- One layout for every state: a fixed **hero column** at the left (portal, wordmark, gauge, actions), the board at the right. No `fresh` branch, no separate welcome intro.
- The second button becomes **Discard**, rendered only when there is a staged change. No always-visible reset, no destructive Dispel-all.
- Existing installs over the cap are **trimmed to 9 on first load and told** via a self-dismissing toast.

## The cap

- `MAX_SUMMONED = 9` lives in [shared/welcome.ts](../../../src/shared/welcome.ts). A unit test asserts `MAX_SUMMONED === MAX_SERVICE_ACCELERATORS` — the two must never drift, because the cap's reason for existing is the accelerator ceiling.
- **Picker rule:** while `selected.size >= MAX_SUMMONED`, every unpicked tile renders dimmed (reduced opacity, grayscale) and `disabled`, with `title="9 services is the maximum"`. Picked tiles stay clickable, so unpicking one re-enables the rest within the same edit. A hint line appears under Unbound: "At 9 of 9 — unpick a summoned tile to make room."
- **Invariant rule:** `normalize()` in [settings.ts](../../../src/main/settings.ts) enforces `enabled ≤ 9` on every read. Overflow is defined as every enabled id past the 9th enabled position in `settings.order`; those ids are disabled. Rail, app menu, quick switcher and activation therefore never see a 10th enabled service.
- **Migration:** on boot, if normalize had to trim, the store persists the trimmed settings once and the trimmed ids ride the state broadcast (new `ShellState.capTrimmed: ServiceId[]`, empty thereafter). The shell shows a self-dismissing toast on the same machinery as the update toast: "Zalo was banished. Nine services is the maximum — summon it back any time from Home." Banishing keeps the login, so nothing is lost.

## The screen

`Welcome.tsx` drops the `fresh` branch and composes two children side by side (`flex-row`; the shell window's `minWidth: 940` leaves the board ≥640px, so no responsive fallback is needed):

### HomeHero (new, `welcome/HomeHero.tsx`)

246px fixed-width left column with its own ember wash and a `border-r`. Top to bottom:

- The ember portal (54px, existing `Portal` component and its animations) over a soft breathing glow.
- Wordmark "Goetia" and the tagline.
- **SummonGauge** (below).
- The action stack: the ember-gradient primary button, and beneath it Discard, present only when the staged delta is non-empty.
- Micro-copy pinned to the bottom, absorbing the deleted tip cards: chat only · signs in once · idle chats sleep · ⌘/Ctrl 0 returns here. At the cap it switches to "Every seat taken — banish one to make room for another."

[WelcomeIntro.tsx](../../../src/renderer/src/components/welcome/WelcomeIntro.tsx) is deleted. The pitch stops being a first-run reward and becomes permanent furniture.

### The board

The right side (`flex-1 min-w-0`), still two `ServiceBand`s:

- **Summoned** is always rendered. Empty, it shows the line "Nothing summoned yet — pick from below." Drag-to-reorder is unchanged (draft order, commit on `onDragEnd`).
- **Unbound** keeps the name filter in its label row and gains the at-cap hint line. The nine-up first-run grid variant is gone; the auto-fill track is the only layout.
- Summoned's `max-h-[46%]` cap is removed: at ≤9 tiles over a ≥640px board it is at most two rows, so `min-h-0` with `flex-1` on Unbound suffices.

### Buttons

- Primary label by state: no services and nothing staged → "Pick a service to begin" (inert); staged delta → existing wording ("Summon 2 services", "Summon 1 · Banish 1"); no delta with services enabled → "No changes" (inert).
- **Discard** resets `selected` to the live enabled set (today's dispel behaviour) and unmounts.

## SummonGauge

New leaf component `welcome/SummonGauge.tsx`: a 100px SVG ring (r=44, `stroke-dasharray`), track in a border tone, fill in the existing ember `arcA` gradient. Purely presentational — props `{ staged: number, cap: number, dirty: boolean }`, no store access.

- Fill fraction is `staged / cap` — the number the user is **about to have**, not the live one.
- Caption: "summoned" at rest, "after summon" when dirty, "full" in accent at 9.
- Fill animates via CSS `transition` on `stroke-dashoffset` (~300ms ease-out). All hero animation is CSS in the shell renderer — no recipe cost, no JS timers, nothing to clean up; when a service view is visible the shell is covered anyway.

## Behavior seams (pure, in `shared/welcome.ts`)

- `summonLabel` — extended for the two inert states above; existing delta cases unchanged.
- `capBlocked(selected, id)` — whether a given unpicked tile is inert under the cap.
- `trimToCap(order, disabled)` — returns `{ disabled, trimmed }`; used by `normalize()` and unit-tested against reordered rails, already-legal sets, and all-ten-enabled.

## Testing

- Unit: `welcome.test.ts` label cases; new `cap.test.ts` (`MAX_SUMMONED === MAX_SERVICE_ACCELERATORS`, `capBlocked`, `trimToCap`); `settings.test.ts` boot trim persists once and reports the trimmed ids.
- E2E: [welcome.spec.ts](../../../tests/e2e/welcome.spec.ts) drops the `welcome-intro` assertion; [home.spec.ts](../../../tests/e2e/home.spec.ts) rewrites the Dispel test as Discard-appears-when-dirty; new e2e: pick to 9 → tenth tile inert → unpick one → tenth clickable again.
- README: rewrite the two Dispel mentions and the first-run walkthrough to match the single layout.

## Out of scope

- Rail position variants — the hero column is fixed left regardless of `railPosition`.
- Dark theme needs no special work: every color in the new components comes from tokens.
- No new IPC channels; `settings:update` already carries `disabled` + `order`, so the security surface is unchanged. Main-process normalize is the enforcement point, so a hostile renderer payload cannot exceed the cap.
