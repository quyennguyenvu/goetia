# Logged-out login landing — design

Date: 2026-08-30. Status: approved (user decision, same day). Scope: a recipe hook that sends a service's logged-**out** shell to the site's login page. TikTok is the only declarer.

## Problem

`SERVICES.tiktok.url` is `https://www.tiktok.com/messages`. Signed in, that is the DM surface. Signed out, TikTok renders the feed's navigation rail plus an **empty** DM drawer and a small "Log in" button — no sign-in form anywhere (live capture 2026-08-29, `tests/fixtures/tiktok-logged-out.html`). A first-time user sees TikTok's chrome and has to find the button; the page they need is `https://www.tiktok.com/login`.

## Decision and precedent

A login redirect was rejected before, twice, and this design reopens it deliberately:

- 2026-08-12 (Slack): a `loginRedirect` recipe hook that re-routed the logged-out page on every visit was rejected the same day as over-reach, in favour of a first-run-only `firstRunUrl`.
- 2026-08-13: `firstRunUrl`, `Settings.visited` and `lib/start-url.ts` were torn down — every service starts on `url`, and reload is the escape hatch (`2026-08-13-service-back-affordance-design.md`).

Slack's case differs from TikTok's in the one way that matters: Slack's logged-out `/client` **already is a sign-in form** (it 302s to `app.slack.com/workspace-signin`). TikTok's logged-out `/messages` is not a form at all. So the new rule is narrow (user decision, 2026-08-30): **a recipe may declare a login URL to load when its document is the logged-out shell — a surface with no sign-in form in sight.** It fires on every visit while logged out and never once a session exists. Slack keeps starting on `url`; nothing about first-run state is persisted.

## Design

### Contract — `Recipe.loginUrl`

```ts
/** The page to load when this document is the site's logged-OUT shell — a
 *  surface with no sign-in form in sight. Return the login URL only for that
 *  shell; null while signed in, on the login page itself, and on captcha or
 *  checkpoint pages, or the runner would fight the site's own flow. */
loginUrl?(doc: Document): string | null;
```

TikTok's implementation returns `https://www.tiktok.com/login?redirect_url=https%3A%2F%2Fwww.tiktok.com%2Fmessages` when `[data-e2e="top-login-button"]` is present **and** `LOGGED_IN` (`[data-e2e="top-dm-icon"]`) is absent, and `null` otherwise. TikTok's `/login` page renders neither hook, so the result is `null` there by construction — no path check. `redirect_url` is TikTok's own parameter (its Log in button builds `login?redirect_url=…&enter_method=mandatory`); after sign-in TikTok lands on `/messages`, `top-dm-icon` appears, and the hook goes quiet.

### Runner

In `startRecipe`'s tick, directly after the `chatPaths` block and before `hideChrome`, the runner calls `recipe.loginUrl(doc)` inside a `try` — a throwing hook never stops counting, exactly as `hideChrome` is treated. A non-null result is navigated through a new optional `goTo(url: string)` callback that `service.ts` wires to `window.location.assign(url)`: page-initiated, so `will-navigate` containment still sees it (`www.tiktok.com` is an allowed host), and no IPC surface is added — main never learns TikTok's DOM.

Guards: at most **once per document** (`redirectedToLogin` flag), and never inside `SNAPBACK_MIN_INTERVAL_MS` of the last snap-back, sharing the `lastSnapBack` clock — so a `/login` → logged-out `/messages` bounce (captcha, expired cookie) can loop no faster than the containment floor. Cost is one `querySelector` pair per tick, on TikTok only.

### Interaction with existing behaviour

- **Waking cover**: `ready()` is false on both the logged-out shell and `/login`, so the cover holds until `WAKE_TIMEOUT_MS` and reveals on `/login` instead of `/messages` — same timing as today, better page.
- **Reload, wake, peek** still load `SERVICES[].url`. Signed in, `loginUrl` is `null` and nothing changes. A Light Sleep peek of a logged-out TikTok redirects the hidden view to `/login`; harmless (no badge either way) and torn down by the peek's own timeout.
- **Chrome CSS** is gated on `LOGGED_IN`, so `/login` keeps TikTok's whole page, form included.
- **`chatPaths`** untouched: `/login` is not a chat path and `wasInChat` stays false through the whole login, so no snap-back fires mid-flow.
- **Navigation containment** unaffected: the target host is allowed, and containment is top-level-frame only.

### Approaches rejected

- **Point `SERVICES.tiktok.url` at `/login?redirect_url=…`**: one line, but every wake, peek and ⌘R would hop through `/login` even when signed in, and `views.refresh`'s "reload lands on the chat URL" would become indirect — the reload guard and peek scheduler assume `url` is chat.
- **Main-side redirect via a `service:logged-out` channel**: a new service channel to validate for no gain; main needs nothing from it, and a cross-document `loadURL` from main re-raises the waking cover.

## Testing

- `tests/unit/tiktok-login.test.ts`: `loginUrl` on `tiktok-logged-out.html` returns the `/login?redirect_url=…` URL; on `tiktok.html` (signed in) returns `null`; on `blank.html` returns `null`.
- `tests/unit/runner-login.test.ts` (following `runner-containment.test.ts`): a stub recipe whose `loginUrl` returns a URL has `goTo` called exactly once with it across several ticks; a `null` hook never calls it; a throwing hook still reports `count()`; a recipe without the hook never calls it.
- `recipes.test.ts` unchanged: `count()` on `blank` stays `{ direct: 0, indirect: 0 }`.
- Live check, manual: a signed-out TikTok lands on `/login`; after sign-in `redirect_url` returns to `/messages` and the chrome hides. The `redirect_url` round-trip is the one claim a fixture cannot prove; if TikTok ever dropped the user on the feed instead, a follow-up would decide whether a signed-in, never-in-chat document should snap to `url` — today snap-back deliberately requires having been on a chat path, so login flows never snap.

## Out of scope

- Any other service. Instagram, Messenger and Zalo already bounce signed-out users to a login page themselves; Slack's logged-out page is a form.
- Persisting first-run or visited state — the 2026-08-13 teardown stands.
- Changing `SERVICES[].url`, `chatPaths`, the waking cover's timing, or the reload guard.
