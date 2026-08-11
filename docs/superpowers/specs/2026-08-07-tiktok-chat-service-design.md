# TikTok chat service design

**Date:** 2026-08-07 **Goal:** Add TikTok personal DMs as a Goetia service: a tile that loads `www.tiktok.com/messages`, an unread badge fed by a cheap recipe, and synthesized notification banners.

## Context

- Goetia hosts each chat service in a `WebContentsView` with a recipe preload that polls `count(doc)` every ~2 s forever, even hidden — per-tick cost matters 24/7 (`CLAUDE.md` reliability rules).
- The "adding a service" checklist touches seven places: `ServiceId` + `SERVICES` (`src/shared/services.ts`), `DEFAULT_SETTINGS` (`src/shared/types.ts`), the recipe + registry (`src/preload/recipes/`), fixture + test rows (`tests/fixtures/`, `tests/unit/recipes.test.ts`), `ALLOWED_HOSTS` (`src/main/lib/navigation-policy.ts`), and a logo SVG that `scripts/build-notification-icons.mjs` turns into notification icons.
- TikTok's build hashes its class names; its `data-e2e` test hooks are the only durable selector surface. This design was written without a live TikTok login, so exact `data-e2e` values are best-effort until a calibration pass (the same convention as Shopee's dated "calibrated" comment and the `ALLOWED_HOSTS` "VERIFY LIVE" caveat).

## Decisions

| Question        | Decision                                              |
| --------------- | ----------------------------------------------------- |
| Surface         | Personal DMs, not TikTok Shop seller chat             |
| Count scope     | DM conversations only; `indirect` always 0            |
| Count source    | Messages nav-entry badge, title fallback              |
| Landing URL     | `https://www.tiktok.com/messages` (chat, not feed)    |
| Menu position   | Before Shopee in the rail order                       |
| Default state   | Ships `disabled: true`, like other new services       |
| Notifications   | `synthNotification` from the first unread chat row    |

Rejected alternatives:

- **Chat-list scan** (sum per-row unread badges): TikTok virtualizes the list, so off-screen rows silently undercount, and it walks far more DOM per tick for a number the nav badge already totals.
- **Hybrid badge + list-scan fallback:** two selector surfaces to keep calibrated for no extra signal.
- **TikTok Shop seller chat** (`seller-vn.tiktok.com`): a different product for a different account type; can be its own service later if wanted.

## Service registration

- `ServiceId` gains `'tiktok'`; every `DEFAULT_SETTINGS` record gains an entry: placed before `shopee` in `order` (so the rail shows TikTok ahead of Shopee), `muted: false`, `disabled: true`, `neverHibernate: true` (matches every existing service).
- `SERVICES` gains `{ id: 'tiktok', name: 'TikTok', url: 'https://www.tiktok.com/messages', color: '#FE2C55', waitForReady: true }`, inserted before the `shopee` entry — land directly on chat, same rationale as Messenger targeting `/messages`.

## Recipe (`src/preload/recipes/tiktok.ts`)

- `intervalMs: 2000`, like all others.
- `count(doc)`: read the numeric badge on the Messages nav entry via `data-e2e` hooks with a scoped `querySelector` — no layout reads, no IndexedDB, settles synchronously. Parse the first integer; `"99+"` counts as 99. Badge element absent (logged out, layout change) → `{ direct: unreadFromTitle(doc.title), indirect: 0 }`. Never throws on `blank.html`.
- `ready(doc)`: true once the DM conversation-list container mounts; false on blank/logged-out pages. `waitForReady: true` mirrors this (`recipes.test.ts` enforces the pairing).
- `synthNotification(doc)`: nickname + snippet from the first unread chat-list row, `null` when not found. TikTok web delegates to browser push, which Electron lacks — like facebook.com, banners must be synthesized. The runner only calls it on a direct-count rise while unfocused, so per-tick cost is unaffected.
- No `css`, `keepAlive`, or `keepRendered` until a live pass proves a need.

## Security and navigation

- `ALLOWED_HOSTS.tiktok: ['www.tiktok.com', 'tiktok.com']`. Google/Facebook OAuth login bounces through third-party hosts that must be confirmed in the live login pass before the (still unwired) navigation guard is ever enforced.
- No new IPC channels. No permission changes — `permissionAllowed` already grants only `notifications` + `media` to the service's own origin.
- Process boundaries untouched: service view keeps the existing `contextIsolation: false` + `sandbox: false` recipe environment; nothing new relies on it for isolation.

## Tests and fixtures

- `tests/fixtures/tiktok.html`: a nav Messages badge showing 3 and a mounted chat-list container with one unread row (for `synthNotification`).
- `recipes.test.ts`: case row `['tiktok', 'tiktok', 3, 0]`; blank.html yields `{ direct: 0, indirect: 0 }`; `ready()` asserted true on the fixture, false on blank.
- The fixture is synthetic — built from this contract, re-verified against the live DOM during calibration.

## Icons

- Add `src/renderer/src/assets/logos/tiktok.svg`: Simple Icons TikTok glyph, white fill, 24-unit viewBox (same provenance as `shopee.svg`).
- `corepack pnpm icons` regenerates `resources/notification-icons/tiktok.png` and `tiktok-mac.png`.

## Known risks

- **Selector calibration:** `data-e2e` values are unverified until a live login pass; the recipe carries a dated "calibrated" comment once done.
- **Bot detection:** TikTok is aggressive (cf. Shopee's `/webchat` wall). The UA is already Chrome-normalized app-wide (`src/main/lib/ua.ts`); a login wall would be a live-pass finding, not fixable offline.
- **Badge semantics:** whether the badge counts conversations or messages is TikTok's choice; either is acceptable for a tile badge.

## Definition of done

`corepack pnpm lint`, `typecheck`, `test` green; `corepack pnpm e2e` for the wiring; live login + calibration pass tracked as follow-up work.

## Post-ship feedback (2026-08-07)

Live usage showed TikTok's full site chrome leaking through (feed reachable from the in-app menu; reload stayed wherever the user had wandered). This produced the app-wide "chat ONLY" principle now recorded in `CLAUDE.md`:

- `views.refresh` (Cmd/Ctrl+R, F5, tile menu) now loads the service's chat URL instead of reloading the current page. Crash auto-reload (`ResilienceManager`) still reloads the current URL.
- Recipes gained `chatPaths` containment: once a document has been on a chat path, SPA routing off it snaps the view back to the service URL.
- The design-time `data-e2e` guesses (`chat-list`, `message-badge`, `chat-item-*`) turned out not to exist. The recipe was recalibrated 2026-08-07 by driving the packaged app against the live logged-in DOM: real hooks are `dm-new-chatbox` (ready + css gate), `top-dm-icon` (badge host), `dm-new-conversation-item`/`-nickname` (synth), `#app-header` and the side nav's two icon stacks (`DivFixedContentContainer`, `DivScrollingContentContainer`) as the chrome to hide. CAUTION: never hide the side-nav container itself — its `DivDrawerContainer` child hosts the DM conversation list (hiding the whole `DivSideNavPlaceholder` blanked the chat list and shipped as a bug). Verified live: nav stacks `display: none`, drawer and conversation list visible, DM surface fills the view.
