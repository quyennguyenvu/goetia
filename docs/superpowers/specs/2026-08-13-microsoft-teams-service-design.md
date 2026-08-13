# Microsoft Teams service

Date: 2026-08-13. Status: draft (brainstorming complete).

## Context

Teams is the tenth service and the second work chat after Slack. Two things make it unlike every service shipped so far.

First, **it routes in the hash**: the whole v2 client lives at one pathname (`teams.microsoft.com/v2/`) and switches surfaces in the fragment — `#/chat`, `#/conversations/19:…`, `#/calendar`, `#/calls`. `chatPaths` matched `location.pathname` only, so as written it could not tell chat from Calendar. Teams is more than chat (calendar, calls, files, communities), so it needs real containment, not cosmetics — hence a runner change rather than a recipe workaround (user decision, 2026-08-13).

Second, **the hash makes snapback free**: the runner's snapback is `window.location.assign(SERVICES[].url)`. With the chat route in the service URL, returning from `#/calendar` to `#/chat` is a same-document fragment navigation — Teams' own router restores chat with no page reload, no boot splash, no re-login.

Teams web fires its own HTML5 desktop notifications, so no `synthNotification`; the shim catches them and the one-sound rule holds with `synthetic: false`.

## Decisions

- **Catalog**: id `teams`, name Microsoft Teams, url `https://teams.microsoft.com/v2/#/chat`, color `#6264A7` (Teams purple), `waitForReady: true`. Placed between `messenger` and `shopee` (display-name order) in `ServiceId`, `SERVICES`, and every `DEFAULT_SETTINGS` record; ships disabled like every service. `normalize()` slots it beside messenger on existing installs and fills the four boolean records from defaults — no migration code.
- **Flavor**: the work/school client (`teams.microsoft.com`), not the consumer one (`teams.live.com`) — that is the gap next to Slack. Microsoft redirects personal accounts to `teams.live.com` itself, so those users still land somewhere usable, with the permission caveat below.
- **Chat URL carries the hash** (`#/chat`, not bare `/v2/`): it makes snapback a fragment navigation instead of a full load, and `views.refresh` (⌘R, tile context menu) uses `loadURL` so the hash survives the reload path too.
- **Containment — hash-aware `chatPaths`**: the runner matches prefixes against `pathname + hash`, and the recipe declares `['/v2/#/chat', '/v2/#/conversations']` (Teams uses both spellings for threads). Pathname-only recipes are untouched: `hash` is `''` for them, so every existing prefix still matches. This is the containment; nothing else contains Teams.
- **No `css`** (user decision, 2026-08-13 — "keep it as it is, just like whatsapp"): the Teams app bar (Calendar, Calls, Contacts, Communities, Activity) stays visible and clickable. Leaving chat is contained by the snapback rather than prevented by hiding, which costs a visible navigate-then-return on a mis-click — accepted, and the fragment-navigation snapback makes it cheap. WhatsApp is the precedent for a recipe with no cosmetic layer at all.
- **Recipe `ready()`**: `visiblyPresent` on the chat list (candidates: `[data-tid="chat-list"]`, `[data-tid="chat-list-container"]`). Teams' boot splash is long and covers a chat list that mounts underneath it, so the waking cover earns its keep and hit-testing is what keeps it up.
- **Recipe `count()`**: one `querySelectorAll` pass scoped to the chat list. `direct` = sum of the numeric unread badges on chat rows, falling back to `unreadFromTitle(doc.title)` (Teams titles as `(3) Chat | Microsoft Teams`) when no badge is rendered. `indirect` = unread rows carrying no numeric badge — Teams marks a muted chat unread without a count, so it lands in the badge-dimming bucket exactly like Slack's badge-less unread channels. No layout reads, no store access, settles synchronously.
- **Not needed**: `synthNotification` (in-page notifications work), `keepAlive`, `keepRendered`, `hideChrome`, `firstRunUrl` (logged out, `/v2/` bounces to a normal email-first Microsoft sign-in — no workspace-URL trap like Slack's).
- **Calibration caveat**: selectors follow Teams' `data-tid` test hooks and are uncalibrated against a live logged-in session (slack/tiktok/instagram precedent). Noted in a recipe header comment; the fixture is the oracle until a live login pass.
- **Navigation policy**: `teams` hosts are `teams.microsoft.com`, `teams.live.com` (the personal-account redirect), `login.microsoftonline.com`, `login.live.com`, `login.microsoft.com`. A comment flags the live-pass gap: tenant SSO/ADFS hosts are per-organization and exact-host matching cannot express them, so the (not-yet-wired) `will-navigate` guard must not be enforced for Teams until a real tenant login has been observed.
- **Passkeys are blocked in every service view** (found during the first live login, 2026-08-13): Microsoft's sign-in defaulted to a passkey and parked forever on "your device is opening a security window" — Electron 43 has no platform authenticator, so `navigator.credentials.get({publicKey})` never settles. `src/preload/lib/webauthn-block.ts` deletes `PublicKeyCredential` and the two `Authenticator*Response` interfaces and rejects passkey requests with `NotSupportedError`, so sites feature-detect no support and offer a password. Installed for all ten services, not gated on a flag: Electron can't complete WebAuthn for any of them, and Google/Meta push passkeys too. Non-passkey Credential Management (password autofill) is passed through untouched. Delete the shim once Electron implements WebAuthn.
- **Permissions**: no change to `permissionAllowed`, but note the consequence — it compares the requesting origin to the service URL origin, so a personal account redirected to `teams.live.com` is denied notifications and media. Work/school accounts stay on `teams.microsoft.com` and are granted. Live-pass item, not a code change.
- **Icons**: `src/renderer/src/assets/logos/teams.svg` (simple-icons Microsoft Teams glyph, white fill); `pnpm icons` regenerates `resources/notification-icons/teams{,-mac}.png`.
- **Copy**: README service roster gains Microsoft Teams. The Settings shortcut line stays `⌘/Ctrl + 1…9` — correct as written: `serviceAccelerator` clamps at nine, so the tenth enabled service is reachable by click, `⌘K`, or reorder, and advertises no shortcut it does not have.

## Testing

- `webauthn-block.test.ts`: the interfaces are gone after install, `{publicKey}` requests reject as `NotSupportedError`, a non-passkey `credentials.get` still reaches the page's own implementation, and a page with no `credentials` API at all does not throw.
- `tests/fixtures/teams.html` is the count oracle: two badged unread rows (2 + 1 → `direct: 3`), two unread rows with no badge (→ `indirect: 2`), one read row that counts nothing, and the chat list mounted so `ready()` is true.
- `recipes.test.ts`: count row `['teams', 'teams', 3, 2]` (blank-page zeros come free from the shared `describe.each`) plus a `ready()` case; the `waitForReady` loop enforces the flag automatically.
- `runner-containment.test.ts`: a hash-routed recipe stays put on `/v2/#/chat/19:abc` and snaps once on `/v2/#/calendar`, and `fakeDoc` grows an optional `hash` — the existing pathname-only cases keep passing unchanged, which is the regression proof for the other eight recipes.
- `services.test.ts`, `settings.test.ts`, `welcome.test.ts` expectations extend to the ten-service catalog.

## Out of scope

- Live-login calibration: verifying the chat-list and badge selectors, the `chatPaths` spellings the real client uses, and `ALLOWED_HOSTS` (tenant SSO hosts) against a real tenant.
- Wiring `will-navigate` enforcement (tracked in CLAUDE.md).
- Personal Teams (`teams.live.com`) as a separate service, and the permission-origin fix a redirected personal account would need.
- Hiding the non-chat app bar; explicitly declined for now, reversible with a `css` block if the snapback proves jarring in use.
