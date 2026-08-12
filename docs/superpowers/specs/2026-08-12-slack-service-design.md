# Slack service

Date: 2026-08-12. Status: draft (brainstorming complete).

## Context

Slack is the ninth service. Unlike facebook.com and tiktok, the whole client under `app.slack.com/client` is chat (Discord precedent) — no feed to wander into, so no `chatPaths`; cosmetic CSS hiding is the entire chat-only treatment. Slack web fires its own HTML5 desktop notifications, so no `synthNotification` (the one-sound rule holds with `synthetic: false`). The client is workspace-scoped: `/client` redirects to the last-active workspace after login, and the built-in workspace-switcher rail covers additional teams — no per-workspace configuration in Goetia.

## Decisions

- **Catalog**: id `slack`, name Slack, url `https://app.slack.com/client` (the generic client URL, never a pinned `{team}.slack.com`), color `#4A154B` (Slack aubergine), `waitForReady: true`. Placed between `shopee` and `telegram` (name order) in `ServiceId`, `SERVICES`, and every `DEFAULT_SETTINGS` record; ships disabled like every service. `normalize()`'s catalog-position slotting (built for instagram) puts it beside shopee on existing installs — no new mechanism, just exercised.
- **Containment**: none — no `chatPaths`. Login flows live on `slack.com` and SSO hosts; the recipe's CSS is gated on the chat surface being mounted so those pages stay untouched.
- **Recipe `ready()`**: `visiblyPresent` on the channel sidebar (candidates: `.p-channel_sidebar`, `[data-qa="workspace_sidebar"]`) — Slack's "loading your workspace" splash is long, so the waking cover earns its keep.
- **Recipe `count()`**: one `querySelectorAll` pass scoped to the sidebar container. `direct` = sum of numeric mention badges (`.c-mention_badge`: DMs + mentions), falling back to `unreadFromTitle(doc.title)` when no badges are present. `indirect` = number of unread, non-muted channel rows (`.p-channel_sidebar__channel--unread:not(.p-channel_sidebar__channel--muted)`) that carry no badge — badge rows excluded so a mentioned channel is not counted twice. No layout reads, no store access, settles synchronously.
- **Recipe `css`** (Discord-level chat-only, per user decision 2026-08-12): hide Upgrade/Pro-trial CTAs, get-the-app banners, and the Canvases/Files/Automations/Templates rail-and-sidebar entries. Home, DMs, Activity, threads, and the workspace switcher stay — that is chat. No `hideChrome` initially; add it only if the live pass finds chrome without stable selectors.
- **First-run entry** (user feedback 2026-08-12, post-implementation): logged out, `app.slack.com/client` 302s to the workspace-first signin, which assumes the user already knows a workspace URL. So the very first creation of the slack view — and only that one — loads `ServiceMeta.firstRunUrl` (`https://slack.com/get-started`, the email-first entry that finds every workspace for an email); a persisted `Settings.visited` record marks the service, and every later load (reload, relaunch, wake from hibernation) uses `url` with Slack's own behavior untouched — no runtime redirects, no interference. The pure choice lives in `lib/start-url.ts`; `views.create` asks an injected accessor. The service URL — refresh target and permission origin — is unchanged. (A first design used a `loginRedirect` recipe hook that re-routed the workspace-signin page on every visit; rejected same day as over-reach — first run only.)
- **Not needed**: `synthNotification` (in-page notifications work), `keepAlive`, `keepRendered`.
- **Calibration caveat**: selectors follow Slack's long-stable BEM classes and `data-qa` test hooks but are uncalibrated against a live logged-in session (tiktok/instagram precedent). Noted in a recipe comment until a live login pass.
- **Navigation policy**: `slack` hosts are `app.slack.com`, `slack.com`, `www.slack.com`. A comment flags two live-pass items before the (not-yet-wired) guard is enforced: per-user workspace hosts (`{team}.slack.com`) which exact-host matching cannot express, and the SSO bounce hosts (Google/Apple).
- **Permissions**: no change — `permissionAllowed` matches the requesting origin against the service URL origin, and the client lives entirely on `app.slack.com`, so notifications + media grants just work.
- **Icons**: `src/renderer/src/assets/logos/slack.svg` (simple-icons glyph, white fill); `pnpm icons` regenerates `resources/notification-icons/slack{,-mac}.png`.
- **Copy**: Settings shortcut line becomes `⌘/Ctrl + 1…9`; README service list gains Slack.

## Testing

- `tests/fixtures/slack.html` is the count oracle: two mention-badge rows (2 + 1 → `direct: 3`), two unread badge-less channels (→ `indirect: 2`), one muted unread row that counts nothing, and the sidebar mounted so `ready()` is true.
- `recipes.test.ts`: count row `['slack', 'slack', 3, 2]` (blank-page zeros come free from the shared `describe.each`) plus a `ready()` case; the `waitForReady` loop enforces the flag automatically.
- `services.test.ts`, `settings.test.ts`, `welcome.test.ts` expectations extend to the nine-service catalog; `settings.test.ts` locks slack slotting beside shopee on pre-existing installs.

## Out of scope

- Live-login calibration: verifying the sidebar/badge selectors, the CSS hiding, and `ALLOWED_HOSTS` (workspace + SSO hosts) against a real workspace.
- Wiring `will-navigate` enforcement (tracked separately in CLAUDE.md).
- Multi-workspace handling beyond Slack's built-in switcher.
