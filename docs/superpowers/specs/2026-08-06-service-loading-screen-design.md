# Service loading screen ("waking" overlay) design

Date: 2026-08-06. Status: approved pending review.

## 1. Problem

Activating a service shows the raw page mid-load:

- Messenger paints the Facebook header before the recipe CSS (injected at `DOMContentLoaded`) removes it — a visible glitch on every wake.
- Shopee finishes loading its shopping homepage long before the keep-alive trusted click expands the mini-chat (runner polls every 2 s, then clicks), so the homepage is visible for seconds before chat appears.

The user wants every load hidden behind a branded loading screen until the chat UI is actually usable.

## 2. Verified facts (probed 2026-08-06)

- Service pages run in `WebContentsView`s stacked above the shell renderer; `activate()` shows the view immediately, even mid-load (`src/main/views.ts`).
- A loading placeholder already exists behind the views (`ContentPlaceholder.tsx`, "Waking {name}…") but is covered by them.
- Synthetic input does not reach invisible views — `trustedClick()` flashes hidden views visible to work around this (`src/main/views.ts`). Shopee's readiness *depends* on that click, so the cover must not make the service view invisible.
- `did-finish-load` fires long before chat is usable on Messenger (SPA renders after load) and Shopee (homepage loads, chat expands later).
- On failed loads, `ResilienceManager.onLoadFailed` hides the active view so the shell Retry placeholder shows (`src/main/resilience.ts`).
- Theme tokens exist for light/dark via `data-theme`, and a global `prefers-reduced-motion` rule disables all animations (`tokens.css`).
- The app icon (`resources/icon.svg`, "Ember Portal") is a fire ring around a white-hot core — it decomposes naturally into a spinning ring and a breathing orb.
- The electron-vite renderer build currently has a single HTML entry.

## 3. Decisions (user-approved)

- **Scope: every load.** Cold start, wake from hibernation, manual reload (F5/⌘R), and crash auto-reload all show the loading screen.
- **Mechanism: dedicated overlay `WebContentsView`** stacked above the service view. The service page stays fully visible and interactive underneath, so keep-alive clicks, focus, and paint behave exactly as today. Rejected alternatives: hiding the view breaks Shopee's trusted click (a 300 ms reveal flash would defeat the feature); an in-page veil lives in hostile third-party DOM and must survive redirects.
- **Readiness: per-recipe `ready?(doc): boolean`.** Messenger and Shopee define it; other services keep `did-finish-load` semantics and can adopt `ready()` later.
- **Fallback: 10 s timeout reveal.** Login walls, captchas, and Shopee's anti-bot page can never signal ready; after 10 s the page is revealed as-is. No extra UI.
- **Visual: Ember Portal animation.** App logo rebuilt as inline SVG — fire ring spinning (~2 s/turn), core orb breathing (~2.4 s pulse) — over a `--bg-0` background that follows the effective theme (system resolved), with a "Waking {Service}…" caption. Rail service tiles breathe (soft opacity/glow pulse) while their service is waking.

## 4. Waking state machine

`ServiceRuntime` gains `waking: boolean` — "the loading screen should cover this service."

Set **true**:

- when the view is created (cold start, hibernation wake, re-enable);
- on `did-start-loading` (manual reload, crash auto-reload). SPA-internal navigation does not fire this, so no spurious overlay mid-use.

Set **false** on the first of:

- `service:ready` IPC — the recipe's `ready(doc)` returned true;
- `did-finish-load`, only for services without `waitForReady`;
- the 10 s timeout (one timer per service in main, armed when `waking` becomes true, cleared on any resolution);
- crash or failed load (existing Retry placeholder takes over);
- view destroyed (hibernation sweep, service disabled) — prevents eternally-breathing tiles.

`ServiceMeta` gains `waitForReady?: true` (messenger, shopee) so main knows `did-finish-load` must not clear `waking` for them. A unit test asserts the flag matches which recipes define `ready()`, so the two cannot drift.

New renderer→main IPC channel: `service:ready { serviceId }`.

Transition logic lives in a pure module (`src/main/lib/waking-rules.ts`, same pattern as `hibernation-rules.ts`) so it is unit-testable.

## 5. Readiness recipes

`Recipe` gains optional `ready?(doc: Document): boolean`:

- **messenger**: chat list rows exist — `doc.querySelectorAll("a[href*='/t/']").length > 0`. By then the recipe CSS has long since hidden the banner, so no header flash is visible.
- **shopee**: mini-chat expanded — the `#shopee-mini-chat-embedded` wrapper has both header and body children (same structural check as `chatHeader()`), i.e. the keep-alive click already worked.

The service preload polls `ready()` every 250 ms after `DOMContentLoaded` and sends `service:ready` once, then stops. `ready()` throwing counts as not-ready (the timeout still resolves it).

## 6. Overlay module

New `src/main/loading-overlay.ts` owning **one** `WebContentsView`:

- Created hidden at startup and loads `loading.html` immediately, so showing it later is instant — no white flash. Its background color is set to the theme's `--bg-0` value.
- Shown by re-adding it at the top of the z-order (same trick as `activate()`); bounds are the shared `viewBounds(...)`, synced wherever `ServiceViewManager.layout()` runs.
- **Visible ⇔** the active service has `waking && !crashed`, and neither Settings nor the Quick Switcher is open. Recomputed in one place on every state broadcast.
- Main pushes `{ theme, serviceName }` via a minimal contextBridge preload (shell-preload pattern); updates live on theme change while waking.

## 7. Renderer changes

- `loading.html` + a small plain-TS entry as a second renderer input in `electron.vite.config.ts`, reusing `tokens.css`. No React — one static SVG, CSS animations, one IPC listener updating caption and `data-theme`.
- `ServiceTile` breathes while `runtime.waking` (crash/stale dots and badges render unchanged on top).
- `ContentPlaceholder` is unchanged — the overlay covers its loading branch for the active service; the crashed branch still works because `waking` clears on crash.

## 8. Testing

- Unit (vitest + happy-dom): `messenger.ready()` against the messenger fixture (rows present) and `blank.html` (absent); `shopee.ready()` against `shopee.html` (expanded) and `shopee-collapsed.html`; waking-rules transitions including the timeout with fake timers; the `waitForReady` ↔ `recipe.ready` consistency test.
- E2E (playwright): the overlay is visible right after activating a fresh service and gone within the 10 s timeout on a logged-out page.
- Manual: wake Messenger (no header flash) and Shopee (no homepage flash); theme switch while waking recolors the overlay; reduced-motion disables the animations.

## 9. Risks

- Ready selectors drift when sites ship new markup: worst case is the old behavior delayed to the 10 s timeout reveal — same maintenance contract as every recipe, never a lockout.
- Slow network or slow login flows reveal a partial page at 10 s — accepted trade-off for never trapping the user behind a spinner.
- Keyboard focus goes to the covered (visible-under-overlay) service view during waking, as it does today for loading pages; keystrokes land in the page. Unchanged from current behavior, noted for awareness.

## 10. Out of scope

- `ready()` recipes for Telegram, WhatsApp, Discord, Zalo.
- Any change to keep-alive, notification, or hibernation machinery beyond the `waking` flag.
