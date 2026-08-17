# Banner → exact conversation — design

Date: 2026-08-17. Status: approved for planning.

## Goal

Clicking a Goetia banner should land the user in the conversation that fired it, not just the service. Today the click activates the service (`notifications.ts` → `activateService`); the user still hunts for the thread. This is the workflow follow-up to Light Sleep: the banner wakes the right chat.

## Principle

The site stays the source of truth for its own routing. Goetia never learns any service's conversation URLs or DOM — it either replays the site's own notification click handler (lane A) or follows an href the recipe already held in its hand (lane B). Every failure mode degrades to exactly today's behavior: activate the service.

## Lane A — replay the page's own click (generic)

`installNotificationShim` currently constructs a `GoetiaNotification`, forwards `{title, body}`, and forgets the instance — discarding the `onclick` the site attaches, which is precisely its "focus this thread" code.

- `GoetiaNotification` gains a working click surface: the existing `onclick` property plus a minimal `addEventListener('click', fn)` / `removeEventListener` list. Other event types stay no-ops.
- Each instance registers in a preload-scoped registry: `Map<number, GoetiaNotification>`, monotonic id, capped at 20 entries (oldest evicted). The registry lives and dies with the page's JS context — the correct lifetime, since the handlers it holds are page closures.
- `notification:fired` carries the instance's `clickId`. Replay dispatches `new Event('click')` to `onclick` and the listener list, each call wrapped in try/catch — a throwing page handler must never break the preload.
- Tampering is a non-issue: the page can already call its own handlers; a replayed handler that routes off-chat is contained by the existing `chatPaths` snapback.
- Honest coverage: sites that construct `Notification` and attach `onclick` (expected: WhatsApp, Telegram, Discord, Slack, Zalo) get exact-conversation routing. Sites the shim reroutes from `ServiceWorkerRegistration.showNotification` (expected: Teams) never hold the instance, attach no handler, and fall back to service activation. Which bucket each service lands in is empirical — the implementation plan carries a per-service live checklist.

## Lane B — synthetic banners carry an href (messenger, instagram)

`synthFromRows` walks the unread thread row whose anchor is the conversation link. It returns one more field, `href` (the anchor's `href` attribute), with no new DOM walking. The recipes' `synthNotification` passes it through, and the runner forwards it on `notification:fired`. An href survives view teardown — it is a URL, not live JS — so synthetic banners route correctly even long after a peek view died.

## IPC changes

- `RendererToMain['notification:fired']` gains `clickId?: number` (lane A) and `href?: string` (lane B). Same channel: still serviceId-validated by `ipcSenderAllowed`, still throttled by `NotificationThrottle`. A payload carrying both is treated as lane B (href wins — it works dead or alive).
- New `MainToService` interface in `shared/ipc.ts` with one channel, `notification:replayClick { clickId: number }`, sent via the service view's `webContents.send`. Main→renderer needs no sender policy (that guards renderer→main), and the preload acts only on ids in its own registry.

## Click resolution in main

Pure decision logic in `lib/notification-click.ts`; `NotificationRouter` stays thin wiring that stores `{clickId, href}` per banner and executes the decision on click:

- `show-only` — the service is now disabled (stale banner). Window comes forward, nothing activates. This absorbs the existing disabled-guard.
- `activate + navigate(url)` — lane B, dead view only. The href must resolve (relative to the service's URL) to the service's own host, and its pathname must start with one of the recipe's `chatPaths` — or with the service URL's own pathname when the recipe declares no `chatPaths`. An href that fails validation downgrades to plain `activate`. A freshly woken view simply gets the conversation URL as its first load.
- `activate + open-in-page(href, url)` — lane B, live view (correction, 2026-08-17: shipped as `navigate` first, and a cross-document `loadURL` on a live view reboots the SPA and raises the waking cover for a 1-2 s thread switch). Main sends `notification:openConversation`; the preload clicks the anchor whose `href` attribute matches — the newest-unread row the recipe just extracted, so it is in the live chat list — and the site's own router switches threads instantly, same-document, no cover. If the anchor left the DOM, the preload falls back to `location.assign(url)` (the full-load behavior, correct worst case).
- `activate + replay(clickId)` — lane A, only when the view is still alive. Ordering: `win.show()` → `activateService` → `webContents.send('notification:replayClick', …)`.
- `activate` — everything else (no clickId or href, view dead, validation failed). Exactly today's behavior.

## Banner grace (the Light Sleep interaction)

Light Sleep destroys a peek view seconds after its first report — usually before the user can click the banner it just fired, which would kill lane A for exactly the sleeping-service case the feature exists for. One rule fixes it:

**Never destroy a service view within `BANNER_GRACE_MS` (2 minutes) of its last banner.** A late-bound `ctx.noteBannerFired(id)` — called by `NotificationRouter` when it shows a banner — stamps the time in the hibernation controller. Both destroy paths consult it: the hibernate step skips the service this sweep (the next sweep retries), and the peek teardown defers destruction with a bounded timer to the grace boundary (cleared on activation and `dispose()`, tolerant of an already-gone view). Grace never extends a view the user activated — activation already keeps it.

Grace defers only the destruction: the peek itself still ends on its first report (slot freed, `lastPeekEndedAt` stamped), so the next due service peeks on schedule. A grace view can therefore briefly coexist with the next peek — bounded by the 2-minute window, the per-service throttle, and the roster size.

The stamp also decays naturally: a banner older than the grace window has no effect, and mute/quiet hours produce no banner, hence no stamp (`shouldNotify` runs before the router shows anything).

## Edge cases

- Banner clicked after quit/relaunch: Electron delivers no click to the dead process; nothing to handle.
- Banner clicked twice: second replay finds the same instance; sites treat a repeat click on a focused thread as a no-op. Second navigate re-loads the same conversation URL. Both harmless.
- Service disabled between fire and click: `show-only` (absorbed guard).
- View crashed during grace: `ResilienceManager` handles the crash; replay's `hasView`/liveness check falls back to `activate`.
- Throttle: unchanged — `clickId`/`href` ride the existing payload; a throttled banner never shows, so never stamps grace.

## Testing

- `notification-shim.test.ts` (exists, jsdom): registry ids increment, cap evicts oldest, replay fires `onclick` and listeners, a throwing handler doesn't propagate, SW-rerouted notifications register too (harmlessly — no handler ever attaches).
- New `notification-click.test.ts`: full decision table — disabled, href valid/invalid (wrong host, path outside `chatPaths`, no `chatPaths` declared, relative href), clickId with/without live view, neither.
- `messenger-synth.test.ts` / `instagram-synth.test.ts`: fixtures assert the returned `href`.
- Hibernation unit coverage for grace: destroy deferred inside the window, allowed after, cleared on activation.
- No new e2e: native banners are unreachable from Playwright. The plan carries a per-service live checklist recording which sites attach `onclick` (lane A verified) and that messenger/instagram navigate to the thread (lane B verified).

## Out of scope

- Inline reply / mark-as-read actions on banners.
- Conversation routing for SW-push services beyond the fallback (would need per-service URL synthesis — rejected as fragile).
- Persisting clickIds across app restarts.
