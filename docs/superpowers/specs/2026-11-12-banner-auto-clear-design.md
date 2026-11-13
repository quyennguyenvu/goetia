# Banner auto-clear — design

Date: 2026-11-12. Status: approved 2026-11-12 (user decision: clear per service at zero **and** per conversation on open, plus a launch sweep); implemented 2026-11-12; live checklist pending. Plan: `docs/superpowers/plans/2026-11-12-banner-auto-clear.md`. Scope: when a message banner leaves Notification Center without the user dismissing it, and keeping every banner that is still there clickable. Builds on `2026-08-17-banner-to-conversation-design.md`; the click lanes, the throttle, mute and quiet hours are untouched.

## Problem

Notification Center fills with Goetia banners that nothing ever removes, and the older ones no longer open their conversation. Reading a chat — in Goetia or on a phone — leaves its banners behind.

The cause is one line: `NotificationRouter.handle` builds a `Notification`, attaches a click handler, calls `show()` and drops the object (`notifications.ts`). Nothing in main can reach a banner afterwards, so nothing can remove one. Four things then break an old banner's click, the first two found while reading for this spec:

- **The object is garbage-collected.** Electron 43's `api::Notification` is owned by V8 with no keep-alive (read from `electron_api_notification.cc` at v43.3.0): its destructor only unsets the native delegate, so the banner stays in Notification Center and a click fires no event at all. Whether V8 really collects ours has not been observed — the registry below makes the question moot.
- **The banner is from a previous run.** macOS keeps delivered banners across a restart; the handler lived in the process that quit.
- **The page's click handle died** with its document (`forgetReplay`) and the row has no learned URL or name lane — plain activation.
- **The entry rotated out** of the 50-row `ActivityLog` — plain activation.

A large pile does not slow macOS or Windows in any measurable way (Windows keeps about 20 per app and expires them). The cost is the clutter and the dead clicks.

## Threat model

Every trigger below is fed by a service page, and service pages are unisolated.

- **What a hostile or XSS'd page gains:** it can report `unread:update 0/0` or a `conversation:active` naming any chat, and so dismiss banners. Only its own: both channels are validated on `serviceId` against the sending frame, and the registry is only ever searched by that validated id. A page that wants its banners gone could already have never fired them, so this is no new reach.
- **`conversation:active` is acted on only after `acceptReport`** — the service on screen, window focused, no overlay — exactly as for Recent. A hidden page cannot clear by naming chats.
- **No new IPC channel, nothing new on disk.** The registry holds one `Notification` handle per `ActivityLog` entry and no text of its own; it dies with the process like the log.
- **Bounded.** The registry can never exceed `ACTIVITY_CAP` (50) — see the invariant — so a page that floods banners inside the throttle now also caps what it can leave in Notification Center. Today that pile is unbounded.
- **Lock.** Closing a banner reveals nothing. Banners delivered before the lock engaged keep their real titles in Notification Center, as today — unchanged, out of scope.
- **`Notification.removeAll()` at launch** touches only this app's own delivered banners.

**Does not defend against:** a page clearing its own banners to hide a message from the user — it controls whether they exist in the first place.

## Decisions

- **Both clearing levels** (user decision). A service's banners go when its unread count reaches zero; one conversation's banners go when the user opens it in Goetia.
- **A launch sweep** (user decision). Banners from a previous run cannot open a conversation; they are removed.
- **Zero means `direct === 0 && indirect === 0`** (my choice, flagged for review). The conservative reading of "I read it all": a banner is never removed while its service still shows anything unread. Named trade-off: a Discord or Slack account with permanently unread channels never reaches zero, so those services clear per conversation only. Rejected: `direct === 0`, which would remove a banner for a still-unread channel message.
- **Banners are held, and closed through the handle** (`notification.close()`), not through `groupId` + `Notification.removeGroup`. One mechanism works on macOS and Windows, holding the object is what keeps its click alive, and macOS's static removers are darwin-only. Clearing never depends on `groupId`; stacking was added separately the next day (below).
- **A peek rarely clears.** A Light Sleep peek's view is normally destroyed on its first report, before any zero can be trusted (below); only a view kept alive by banner grace can outlast the dwell. Otherwise a sleeping service's banners clear the next time it is opened. Named trade-off.
- **A chat already on screen when its banner fired is not cleared by returning to it.** The runner reports a conversation on change only, so coming back to the window sends nothing; that banner waits for the zero rule or its own click. Re-reporting on focus was considered and left out: the report would race the chord walk's cancel rule (`MainState.walk`). Named trade-off.
- **A banner that can no longer open its chat is dropped once it is an hour old** (user decision, 2026-11-12, after the first build). "Can open its chat" is `canOpenChat`: the page's own click handle while that page is alive, a URL that passes `validatedConversationUrl`, or the name lane on a `bannerTitleNamesConversation` service. On Discord, Slack, Telegram and TikTok the handle is usually the only lane, and it dies with the page — for a sleeping service about two minutes after the banner. Rejected: dropping at once, which would take a message that arrived while a service slept out of Notification Center before anyone saw it. Named trade-off: on a name-lane service a click while the service sleeps still only wakes it (`resolveBannerClick` gives a dead view no name lane); those banners are kept, because the lane returns with the view.
- **Nothing is noted in Diagnostics.** A cleared banner is a success, and the ring holds only failures and harm-capable actions (2026-09-26).

## The invariant

**A message banner is in Notification Center only while its `ActivityLog` entry exists.** The registry maps entry id → live `Notification`. Whatever removes an entry closes its banner, so every banner the user can still see has an entry for `openActivityEntry` to resolve, and the "entry rotated out" dead click cannot happen.

- `ActivityLog` takes an optional `onDrop(ids)` callback, fired by the `append` eviction and by `clear(id?)` (purge). The log stays pure; the callback is its only new surface.
- A silenced entry (mute, quiet hours) never had a banner and has no registry row.

## When a banner is closed

| Trigger | Closes | Where it is wired |
| --- | --- | --- |
| Entry dropped (cap, purge) | that entry's banner | `ActivityLog.onDrop` |
| Banner clicked, or main opens the entry (the lock's parked click) | every banner of that conversation (`serviceId` + `conversation`, the log's own key) | `openActivityEntry` |
| The banner never reached the OS (`failed` event) | the registry row only — there is nothing to close | `NotificationRouter` |
| The conversation is opened in Goetia | that conversation's banners | `conversation:active`, after `acceptReport` |
| The service's unread stands at zero | the service's banners | `unread:update`, `service:ready` |
| The service is banished | the service's banners | `applyDisabledChange` |
| An hour old and no lane left to its chat | that banner (its entry stays in the log) | a `DEAD_SWEEP_MS` (5 min) interval in `index.ts`, cleared at quit |
| Quit | all | `before-quit` |
| Launch (macOS) | everything left from the previous run | `Notification.removeAll()` before the first banner |

The `close` event is deliberately **not** a trigger. On Windows it also fires when a toast times out into Action Center, where the banner is still clickable and still removable through the handle — forgetting the row there would lose both. A banner the user dismissed by hand keeps its row until its entry drops; the cap bounds that.

A banished service's banner was already `show-only`; removing it is the same rule as the invariant — a banner that leads nowhere does not stay. Muting never closes anything: mute means silence, never blindness.

Windows has no `removeAll`. A normal quit closes everything there; banners left by a crash stay until Action Center expires them (named trade-off, untested — no Windows machine).

## A zero that can be trusted

The runner reports its first count unconditionally on a document's first tick, and a page whose chat list has not rendered counts `{ direct: 0, indirect: 0 }` — the same answer `blank.html` gives. Every cold load, reload and wake therefore begins with a zero that means nothing. A live virtualized list can also read empty for one tick while its container is swapped.

So main clears on a zero only when all three hold, tracked per service in a pure reducer (`lib/banner-clear-rules.ts`):

1. **The document is ready.** `service:ready` has arrived since the last cross-document navigation. All ten recipes define `ready()`, and a login or checkpoint page never matches it.
2. **The count is zero and came from this document** — an `unread:update` since that navigation, not the runtime's remembered count from a document that is gone.
3. **Both have held for `ZERO_DWELL_MS` (6 s — three ticks)**, with no non-zero report, no `unread:stale`, no navigation and no view destruction in between. Any of those cancels the pending clear; the next qualifying zero re-arms it.

One timer per service at most, cleared on cancel, on destroy and on quit. Order does not matter: ready-then-zero and zero-then-ready both arm the dwell, which is why `service:ready` is a trigger — the runner de-dups, so a zero reported before ready is never sent again.

## Which conversation was opened

An accepted `conversation:active` report already yields a label (the recipe's hook name, else `conversationFromTitle`) and a URL. A banner's entry belongs to that conversation when either holds (`matchesSighting`, pure):

- **Name:** `nameKey(entry.conversation) === nameKey(label)`. `nameKey` (NFC, variation selectors dropped) moves from `preload/lib/conversation-open.ts` to `src/shared/` so main and the preload share one rule. Exact compare only — no prefix or `…` matching; a wrong match removes a banner for a chat the user has not read.
- **URL:** the entry's `openHref` (a synthetic banner's href, or the URL a landed replay taught) resolved against the service URL equals the report's URL — origin, path and hash, trailing slash ignored (`sameUrl`, already in `recents-rules.ts`). An entry whose URL is the service's own URL never matches this way: on a site whose address names no thread (WhatsApp, Shopee) it would match every chat.

Expected coverage, to be confirmed live: exact on the four `bannerTitleNamesConversation` services (WhatsApp, Zalo, Shopee, Teams) and on Messenger and Instagram (name and href); best-effort on Discord, Slack and Telegram, where the banner title is parsed and the label comes from the page title. A miss costs nothing — the banner waits for the zero rule or its own click.

## Components

- **`src/main/lib/banner-clear-rules.ts`** (pure, unit-tested): `ZERO_DWELL_MS`; the zero reducer (`ready`, `navigated`, `count`, `stale`, `destroyed` → `arm` / `cancel` / nothing); `matchesSighting`; `DEAD_BANNER_MS`, `DEAD_SWEEP_MS`, `canOpenChat`, `isDeadBanner`.
- **`src/main/banners.ts`** — `BannerRegistry`: `add(entryId, serviceId, handle)`, `noteShown(entryId)`, `forget(entryId)`, `closeEntries(ids)`, `closeService(id)`, `closeAll()`, `noteZero(id, event)` with the dwell timers, `dispose()`. It depends on nothing but a `{ close(): void }` handle, so tests pass stubs. It knows nothing about conversations: a caller names a conversation's banners with `ActivityLog.ids(serviceId, match)` and hands the ids over.
- **`NotificationRouter`** registers each banner before `show()`, reports `show`, and forgets a banner only on `failed`.
- **Wiring only** in `ipc-handlers.ts` (`unread:update`, `unread:stale`, `service:ready`, `conversation:active`, `applyDisabledChange`), `activate.ts` (`openActivityEntry`) and `index.ts` (`onNavigate`, `onDestroyed`, `before-quit`, the launch sweep). `AppContext` gains `banners`.

Two Electron details the registry must respect, both read from the v43.3.0 source:

- `close()` emits `close` synchronously, so a row is deleted **before** its handle is closed, or the `close` listener re-enters the map mid-iteration.
- On macOS a banner with an icon is scheduled asynchronously, and `close()` before that completes removes nothing. A close requested before the banner's `show` event is remembered and applied when `show` fires.

## The download banner

Added the same day (user decision). The download banner (`index.ts`, its own path by design, 2026-09-18) dropped its `Notification` the same way, so its reveal click could die to garbage collection too. It has no `ActivityLog` entry to hang a registry row on, so it gets `BannerShelf` (`src/main/banners.ts`): the newest `HELD_BANNERS_MAX` (20) handles are held, the one let go is closed, a clicked or failed banner is released, and the rest close at quit. Nothing else carries over — a download has no unread state to clear on, and its click re-checks the file at click time (reveal, or Settings → Downloads if it moved), so it never goes stale and needs no hour rule. What the click does is untouched: Never Open stands.

## Stacking per conversation

Added 2026-11-13 (user decision), after a deploy channel's seven Discord banners buried one WhatsApp message. Each banner carries a `groupId` — macOS's thread identifier — so Notification Center keeps one stack per conversation. Chosen over one stack per service, where a Discord DM would still sit under the noisy channel.

- **The id** is `bannerGroupId` (`lib/notification-rules.ts`): the service id plus the first 16 hex digits of a SHA-256 of the conversation's `nameKey`. The conversation is the one `splitBannerTitle` already derives, so Discord groups by channel whatever the sender. Hashed because an identifier is no place for a chat's name; a nameless banner groups by service.
- **While locked** the id is the service alone: a redacted banner must not be sorted by the conversation it hides.
- **Depends on the user's macOS setting**: System Settings → Notifications → Goetia → Notification grouping on Automatic. Stacks carry no text label.
- **Windows**: the id is set as the toast's `Group`, which is not a visible header; `groupTitle` is left unset. No visual change there, untested (named trade-off).
- Clearing is unaffected — it goes through the held handles, never through the group.

## Out of scope

- Re-attaching handlers to a previous run's banners (`Notification.getHistory`). The entries they need died with the process; removing them is the honest answer.
- Clearing from a peek; clearing on `direct === 0`.
- Redacting already-delivered banners when the lock engages.

## Testing

- **`banner-clear-rules.test.ts`:** the reducer's full table — zero before ready, ready before zero, a non-zero inside the dwell, stale inside the dwell, navigation and destruction inside the dwell, a zero remembered from the previous document; `matchesSighting` by name (emoji presentation, NFC), by URL (trailing slash, hash, other origin), and the refusals (prefix, other service); `isDeadBanner` — the hour boundary, a click handle with and without a live view, a learned and a synthetic URL, a URL that fails validation, a name-lane service.
- **`banners.test.ts`:** stubs for the handle — `closeService` leaves other services alone; delete-before-close under a synchronous `close`; a close before `show` is applied at `show`; the hard row cap; the dwell fires, and is cancelled by a count, a navigation and a destruction; `dispose` clears every timer.
- **`banners.test.ts`, `BannerShelf`:** the cap closes the oldest; a released banner is never closed; `closeAll` closes each once under a synchronous `close`.
- **`activity-log.test.ts`:** `onDrop` fires for the evicted id and for `clear`; `ids` filters by service and predicate.
- **No e2e.** Native banners are unreachable from Playwright (2026-08-17).
- **Live checklist** (`pnpm dev` works — `scripts/sign-dev-electron.mjs` ad-hoc signs the dev binary so Notification Center accepts it — but never beside the packaged app, which shares the profile): per service — read the chat on a phone and the banners go within ten seconds; open one of two unread chats and only its banners go; ⌘R with unread banners and they stay; banish and they go; quit and relaunch and none are left; click a banner an hour old and it still opens its chat.

## Guardrail to add to CLAUDE.md

Under Notifications & mute: the invariant (a banner lives only while its entry does), the rule that every `new Notification` for a message is registered and never dropped, the trusted-zero conditions and why a bare zero is never acted on, and that `aggregateBadges`, mute and quiet hours stay ignorant of clearing.
