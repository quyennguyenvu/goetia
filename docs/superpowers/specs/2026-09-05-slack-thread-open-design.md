# Slack threads: a pin or a recents row opens the thread, not just its channel

Date: 2026-09-05. Status: accepted (user decision). Slack keeps a thread out of the address bar, so a pin captured in a thread and a recents row for a thread reply both degrade to the channel. The recipe learns to mint a canonical thread URL from the flexpane and to open one in-page, and the open chain gains a URL lane to run it.

## Problem

A Slack pin jumps to the right channel or DM but never to a thread (reported 2026-09-05, live workspace). A live DOM snapshot of the open thread explains it:

- The document URL with the flexpane open is `https://app.slack.com/client/T0GCQ370X/C1755B8LV` — the channel. Slack does not put the thread in the URL, so the pin's `href` (the document URL at pin time) names no thread, and the full-load lane can only ever land in the channel.
- Slack's sidebar rows are divs keyed by `data-qa-channel-sidebar-channel-id`, not anchors. The anchor lane can never hit on Slack; channel and DM pins work today only through the full-load lane, which is a Slack cold boot.
- The flexpane (`[data-qa="threads_flexpane"]`) holds everything a thread URL needs: its root message is `.c-message_kit__thread_message--root` carrying `data-msg-ts` and `data-msg-channel-id`, and the team id is the first segment of the document path.
- Messages in the channel pane carry the same `data-msg-ts` / `data-msg-channel-id` pair, and a message with replies has a `[data-qa="reply_bar_view_thread"]` control that opens its thread in the flexpane in place.

Recents rows have the same ceiling. A thread-reply banner replays through the shim while its handle is alive, and the replay lands in the thread. But `learnUrl` records `location.href`, which on Slack is the channel, so once the handle is gone (a reload, an eviction) the row can only reach the channel.

## Decision

Approach A of three considered (user decision, 2026-09-05): the thread gets a canonical in-service URL, and the Slack recipe both mints it and opens it. A structured `handle` field on pins, activity entries and the open request was rejected as the same result with a new schema in four places; encoding the thread into the conversation label was rejected as corrupting a user-visible string and abusing the name lane.

The canonical form is Slack's own client route, `https://app.slack.com/client/<T>/<C>/thread/<C>-<ts>`. It is same-origin with the service URL, so a thread pin looks exactly like a channel pin to main: `pin-rules`, `pins.json`, the Home row and the origin check in `resolveBannerClick` are all untouched. An `archives` permalink on the workspace host (`we-build-vn.slack.com/archives/<C>/p<ts>?thread_ts=…`) is not a pin form and the origin rule does not learn the workspace host; pasting one stays unsupported.

## Design

### Recipe hooks

Two optional hooks join `Recipe` in `src/preload/recipes/types.ts`, beside the name pair `conversation` / `openConversation`:

- `conversationUrl(doc): string | null` — the open thread as its canonical in-service URL, or null when no thread is open. Cheap and synchronous.
- `openUrl(doc, url): boolean | Promise<boolean>` — open that URL in-page. `true`: the thread is on screen. `false`: a miss, and the caller moves to the next lane. May be async but must stay bounded.

`recipes.test.ts` pins that the two come as a pair: a recipe declaring one declares the other.

Slack's `conversationUrl` returns null unless the flexpane is present with a root message. It reads `data-msg-channel-id` and `data-msg-ts` from the root and the team id from `location.pathname` (`/client/<T>/…`); a path without a team segment yields null. **The flexpane rule**: if `doc.getSelection()` is non-empty and its anchor node is outside the flexpane, the hook returns null, so a selection made in the channel pane while a thread happens to be open pins the channel, as today. An empty selection or one inside the flexpane pins the thread.

Slack's `openUrl` parses the thread form and returns `false` for any other URL, leaving channel and DM URLs to the load lane they use today. For a thread it:

1. Returns `true` at once if the flexpane already shows a root with that channel id and timestamp.
2. Clicks the sidebar row `[data-qa-channel-sidebar-channel-id="<C>"]` unless it is already selected (`data-qa-channel-sidebar-channel-is-selected="true"`), then waits, bounded, for a message with the root's `data-msg-ts` and `data-msg-channel-id` to exist in the channel pane.
3. Clicks that message's `[data-qa="reply_bar_view_thread"]` control and returns `true`.
4. Returns `false` when the row is missing, the wait expires, or the root has no reply bar — the channel pane is virtualized, so a root scrolled far out of view does not exist in the DOM. A miss here is what makes the fallback safe: the load lane lands in the channel, which is where today's behaviour ends anyway.

The waits reuse the pattern of `openWhatsAppConversation` (a settle constant and a page cap) and never poll unbounded. Whether an injected anchor carrying the permalink and clicked synthetically is a cheaper first attempt — Slack's router opens in-page permalinks in the flexpane — is decided by the live check, not here; if it works, it becomes step 2 and the row-and-reply-bar path becomes the fallback. The recipe header keeps its UNCALIBRATED note until that pass.

### Capture

The frozen `window.__goetia` the service preload installs gains `conversationUrl()`, delegating to the recipe like `conversation()` does. `capturePin` in `views.ts` reads it with the same `executeJavaScript` guard and, when the result is a non-empty string, uses it as the pin's `href` in place of the document URL. Both capture doors — the page context menu and `Edit ▸ Pin Selection` — end in `capturePin`, so both learn threads with one change. Main still never learns per-service DOM: it receives a URL and validates it at open time exactly as before.

The pin's `conversation` label is unchanged: `conversationFromTitle` yields the channel name from Slack's title, and a thread pin reads as a pin in that channel. Author and thread text are not captured (the 2026-08-25 decision stands).

### Open

`openConversationInPage` gains a `url` lane between `same` and `anchor`:

1. replay — the shim's own onclick.
2. name — the recipe's row click (WhatsApp, Zalo).
3. same — already on the URL.
4. **url** — `opts.byUrl(doc, req.url)`, wired to `recipe.openUrl`; `true` returns `'url'`, `false` or a throw moves on.
5. anchor — click the anchor that leads there.
6. load — full navigation.

`OpenLane` in `shared/ipc.ts` gains `'url'` and the `LANES` set in `lib/open-reply.ts` accepts it. The lane runs only when the request carries a validated `url`, so an unvalidated href never reaches a recipe. For Slack the `same` check does not short-circuit a thread — the document URL is the channel, the request URL is the thread — and `openUrl`'s own first step handles "already showing this thread". The worst case is unchanged: every miss ends in the load lane and the channel.

### Recents

The preload's reply after a landed `replay` reports `recipe.conversationUrl?.(document) ?? location.href` as its `url`. Main's `openInPage` currently learns a URL only when the document moved and `getURL()` equals the report. That rule becomes: learn when the report equals the current document URL (the existing case), **or** when the report passes the same validation a href gets at click time (the private `conversationUrl` in `lib/notification-click.ts`, exported as `validatedConversationUrl` so it does not share a name with the recipe hook) and differs from the document URL before the open. Slack's document never moves on a thread open, so the second branch is what lets a thread-reply row learn its thread URL and survive a reload, the way a Discord row survives one today.

The report crosses from an unisolated renderer. Accepting it under validation grants nothing new: a learned URL is re-validated by `resolveBannerClick` on every click, and a page that wanted to steer its own service's rows to a same-origin chat URL could already do so by navigating there during the replay. Cross-origin and off-chat reports are refused as they always were.

`ActivityLog.learnUrl` and `append`'s inheritance are unchanged; only what main passes them widens.

### Dead view

A pin or row opened while Slack's view is gone is still a `navigate` action: `loadURL` of the thread URL wakes the view, and Slack boots into the channel and drops the thread, as it does today. Re-running the in-page open once the view is ready is a follow-up, not part of this change; the spec records it so the limit is a known one.

## Testing

- `tests/fixtures/slack-thread.html` — trimmed from the 2026-09-05 live snapshot: the sidebar rows (one selected), the channel pane with the root message and its reply bar, and the flexpane with the root. It is the oracle for both hooks. Only structure, hooks and one line of text per message survive the trim; no message content beyond what the assertions need.
- `recipes.test.ts` — `conversationUrl` returns the thread URL for the fixture and null for `blank.html` and `slack.html`; a selection anchored in the channel pane returns null, one inside the flexpane returns the thread; `openUrl` returns `true` at once when the flexpane already shows the root, clicks the row and the reply bar when it does not, and returns `false` for a non-thread URL, a missing row, and an absent root; the hook-pair invariant.
- `conversation-open.test.ts` — the `url` lane runs after `same` and before `anchor`, is skipped without a `url`, and a `false` or a throw falls through to the anchor lane.
- `open-reply.test.ts` — `'url'` parses; an unknown lane still does not.
- `views` learn rule — a unit test on the extracted decision (a `lib/` helper, per the thin-wiring rule): equal-to-document learns, validated-and-different learns, cross-origin and off-chat refuse.
- Live pass (recorded in this spec once done): pin inside a thread, open it from Home with the view live; a thread-reply banner, replay, reload Slack, open the row again; and which click mechanism Slack honours.

## Documentation

`CLAUDE.md` gains one line under the Pins bullet: Slack never puts the thread in the URL, so its recipe mints the canonical `/client/<T>/<C>/thread/<C>-<ts>` form from the flexpane root at pin time (selection inside the flexpane, else the channel) and opens it in-page through the `url` lane by clicking the row and the root's View thread control; a landed replay teaches a recents row the recipe's URL, not `location.href`.

## Out of scope

- `archives` permalinks on the workspace host as a pin form, and any change to the origin rule.
- Re-opening the thread after a dead-view wake.
- A thread name or author on the pin row.
- Any other service beyond Slack and Discord (see below).

## Addendum: Discord (2026-09-06)

The same lane fixed the same gap on Discord one day later. A pin captured with a thread open beside its channel carries `/channels/<guild>/<parent>/threads/<thread>`, and Discord's DOM has no anchor for a thread at all — the sidebar lists channels only — so every lane missed and the load lane rebooted Discord (reported with a recording and a DOM snapshot). Discord's recipe now declares the pair: `conversationUrl` returns the document URL only in that split form (the one that names the parent the opener must visit; a full-window thread at `/channels/<guild>/<thread>` is indistinguishable from a channel by URL), and `openUrl` takes both forms. It returns true if the document already shows the thread in either form. The full-window form is opened by clicking the sidebar item `[data-list-item-id="channels___<id>"]` — a `role=button` div for a thread, an anchor for a channel, which is why the anchor lane reached channels and never threads (second report, same day: the full-window pin still reloaded after the split-form fix). The split form clicks the parent's sidebar anchor when it is not current, waits bounded for the root message, and clicks its Open Thread accessory — `#message-accessories-<thread>`, since a thread takes its starter message's id — falling back to the thread's sidebar row when the root is outside the virtualized list. With neither clickable — a thread Discord does not list in the sidebar at all, the third report the same day (an alert-channel thread whose id appeared nowhere in the DOM) — the opener's last resort is Discord's router itself: `history.pushState` to the pin's path plus a synthetic `popstate`, the event browser back fires and Discord's router already handles. It is trusted only once the thread's own messages render (`[id^="chat-messages-<id>-"]`, since every message list item is id'd `chat-messages-<channel>-<message>` in both panes); if they never do within the bounded wait, `history.back()` pops the pushed entry so the address bar does not claim a view that did not change, and the lane misses into the load lane as before. That the router honours a synthetic `popstate` is the one live check this addendum owes; the fallback makes a wrong guess cost only the reload it costs today. `tests/fixtures/discord-thread.html` is the oracle.
