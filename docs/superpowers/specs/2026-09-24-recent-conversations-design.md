# Recent conversations — design

Date: 2026-09-24. Status: approved in brainstorm (user decision, same day); not implemented. Scope: ⌘K's Recent section becomes the conversations the user opened, persisted sealed, and `⌘/Ctrl ⇧ ]` / `⌘/Ctrl ⇧ [` walk that list. Supersedes the "Activity log + ⌘K recents" section of `2026-08-17-zoom-signout-and-recents-design.md` as the switcher's source, and `2026-09-21-next-unread-design.md` with its amendment as the chords' targets. The banner log itself stays, for banner clicks only.

## Problem

Recent is the banner stream remembered: a row exists only for a conversation that raised a web Notification this session. That is the wrong feed for "where was I", and both sites the user reads most suppress banners in exactly the situations where they read. WhatsApp mutes every incoming message in every chat while `document.hasFocus()` is true (`WAWebNotificationHelpers.shouldMuteDueToAppState`, live bundle read 2026-09-24), and drops anything that arrives during its reconnect sync or was already read on the phone. Discord drops the selected channel while the window is focused, never notifies the user's own messages, sends non-friend DMs to Message Requests, and receives messages missed while closed as state rather than as live events. On top of that the log is capped at 50 entries across all services, the switcher shows 8, and every restart empties it. The result the user reported: no WhatsApp chat and no Discord DM in ⌘K, while macOS Notification Center already held the pings.

The user's expectation is the practical one: Recent is what you had open, newest first. Pings are Notification Center's job.

## Decisions

- **Recent is opened only** (user decision, option A of 2). A row is a conversation that was on screen in a focused service view. Banners make no rows. Rejected: a merged list ordered by the later of opened and pinged, because busy group channels would keep crowding the 8 rows.
- **Persisted, sealed** (user decision, option A of 2). `recents.json` is a `safeStorage` envelope in the pins and download-history shape. Rejected: in-memory, which came up empty after every restart, and the user restarts often.
- **Detection lives in the preload runner's tick, gated on focus** (user decision, option 1 of 3). Rejected: a main-side `executeJavaScript` poll, which turns Pin Selection's one-off read into a steady poll with a promise round trip per tick; and an event-driven preload patching `pushState`, title mutations and clicks, which is more surface for a saving the existing 2 s tick already makes small.
- **The chords walk Recent** (user decision). `⌘/Ctrl ⇧ ]` opens the row below the current conversation in ⌘K order, `⌘/Ctrl ⇧ [` the row above, wrapping, over a snapshot taken at the first press. This reverses the 2026-09-21 decision that the pair walked unread conversations. Named trade-off: a service with a badge but no Recent row is no longer reachable by chord, only by `⌘/Ctrl 1…9` or ⌘K.
- **The on-screen conversation is left out of ⌘K's rows.** Enter on it would go nowhere, and the cursor starts on the newest row.
- **8 rows shown, 50 kept.** Unchanged from today; typing searches all 50 by label.
- **Labels**: `Next Conversation` for `⌘/Ctrl ⇧ ]`, `Previous Conversation` for `⌘/Ctrl ⇧ [`, defined as the row below and above in ⌘K's Recent list. Same `REBINDABLE` mirrored pair, same bracket `code` handling. The table keys become `nextConversation` / `prevConversation`; `normalizeShortcuts` carries a `settings.shortcuts` override stored under the old `nextUnread` / `prevUnread` names across, so a rebinding survives the rename.
- **`WALK_TIMEOUT_MS` = 4000.** Long enough to glance at a stop and keep going, short enough that a later lone press reads as "switch back".

## Data model

`src/main/lib/recents-rules.ts`:

```ts
export interface RecentEntry {
  id: number;
  serviceId: ServiceId;
  /** what the row shows: the recipe's conversation(doc) name, else the
   *  page title through conversationFromTitle */
  label: string;
  /** the hook name alone — the one string openConversation can match;
   *  absent when the label came from the title */
  conversation?: string;
  /** document URL at the last sighting; validated only at open time */
  url: string;
  /** last time it was on screen */
  at: number;
}

export const RECENTS_CAP = 50;
export const RECENT_LABEL_MAX = 80; // PIN_CONVERSATION_MAX
export const RECENT_URL_MAX = 2048;
```

A conversation is identified by `serviceId + '\n' + label`. Two chats with one label on one service share a row, as banners and pins already accept. An upsert moves the row to the top, refreshes `url` and `at`, and keeps the first `id`. Past `RECENTS_CAP` the oldest row is dropped.

## Detection

Preload, `src/preload/recipes/runner.ts`, inside the existing tick after the containment, login and chrome steps and before `count()`:

1. If `doc.hasFocus()` is false, do nothing. Goetia focuses the view it shows and the shell takes focus when Home, Settings or ⌘K opens, so at most one view passes this gate per tick. Zalo's visibility spoof is irrelevant here: `hasFocus()` is real.
2. Read `recipe.conversation?.(doc)` in a try/catch (a throwing hook must never stop the count), `doc.location.href` and `doc.title`.
3. Build the sighting key: the hook name when present, else `pathname + hash + '\n' + title`. If it equals the last key sent for this document, stop.
4. Call the new `reportConversation({ conversation, url, title })` callback, which the service preload wires to `ipcRenderer.send('conversation:active', { serviceId, conversation, url, title })`.

The preload stays a dumb reporter. Main derives the label, trims and caps, and decides whether the report counts.

Main, pure rules in `lib/recents-rules.ts`:

- `acceptReport(input: { serviceId, activeId, overlayOpen, windowFocused, disabled }): boolean` — true only for the active service while no overlay is open, the window is focused and the service is enabled. The preload's focus check runs in a world the page shares, so this rule is what stops a hidden or hostile page from writing rows the user never looked at.
- `recentLabel(input: { conversation, title, url, serviceUrl, serviceName }): { label: string; conversation?: string } | null` — the hook name, trimmed and capped, when present; else `conversationFromTitle(title, serviceName)`, capped; null when that is empty, and null when there is no hook name and the URL equals the service's landing URL (`SERVICES[].url`), so Discord's Friends page, WhatsApp's empty chat list and a login page make no row.
- Sanitisation before either: every string type-checked, control characters stripped, the URL capped at `RECENT_URL_MAX` and required to parse.

An accepted report upserts the store and records the label as "on screen" for that service (`onScreen: Map<ServiceId, string>` in `MainState`, in-memory, never broadcast). The on-screen key, read by ⌘K's exclusion and by the walk's anchor, is the active service's entry while Home is closed, and null while Home is open: Home covers every view, so nothing is on screen there. An entry left behind by a service the user switched away from is never read until that service is active again, when its next tick refreshes it. A conversation on screen at one tick is recorded; a click-through shorter than about 2 s may or may not be, and that is fine.

Coverage: WhatsApp, Zalo, Shopee, Teams, Messenger, Instagram, TikTok and Discord already implement `conversation(doc)`. Slack rows are channel-level, because its `conversationUrl` is selection-based and its title names the channel. Telegram's title does not name the chat, so it gets no rows until its recipe grows a `conversation(doc)` hook, which is a follow-up.

## Opening a row

`recents:open { id }` looks the row up and runs the banner tail unchanged: `resolveBannerClick({ disabled, hasView, href: entry.url, conversation: entry.conversation, serviceUrl, chatPaths })`, then `performBannerAction` without an `entryId`. A live view gets the name lane then the URL lane in one `OpenRequest`; a dead view is woken with the validated URL; an off-origin or off-chat URL falls through to plain activation; a disabled service is `show-only`. One difference from banners: the name lane is used whenever the row has a hook name, not only on `bannerTitleNamesConversation` services, because the name came from the recipe's own `conversation(doc)` and is the string its `openConversation` matches by construction. No replay lane and no `learnUrl`.

Landing on a row makes it the focused document's conversation, so the next tick reports it and it moves to the top. Nothing special is needed for that.

## The chords

`src/main/lib/recents-walk.ts`, replacing `lib/unread-jump.ts`:

```ts
export interface Walk {
  /** row keys in ⌘K order at the first press, enabled services only */
  keys: string[];
  /** where the last press landed; null when the walk began off any row */
  cursor: string | null;
  /** Date.now() past which the walk is over */
  deadline: number;
}

export const WALK_TIMEOUT_MS = 4_000;

export function walkTargets(rows: RecentEntry[], enabled: (id: ServiceId) => boolean): string[];
export function beginWalk(keys: string[], onScreenKey: string | null, now: number): Walk;
export function stepWalk(walk: Walk, step: 1 | -1, now: number): { walk: Walk; target: string | null };
```

`stepWalk` reuses the existing `nextTarget` stepper: from `cursor`, `step` 1 is the row below (older) and `-1` the row above (newer), wrapping; a null cursor starts at the newest row going down and the oldest going up; a lone target that is the cursor itself is nothing to jump to. `beginWalk` anchors the cursor on the on-screen row whenever it is listed; an on-screen conversation the store has not recorded yet is not in the list, so there is nothing to skip.

Wiring in `commands.ts`, `{ kind: 'conversation', step }`: if `MainState.walk` is null or past its deadline, `beginWalk` from `walkTargets(recents.rows(), enabled)` and the on-screen key of the active service, or null on Home. Then `stepWalk`, open the target through `recents:open`'s tail, store the walk with `deadline = now + WALK_TIMEOUT_MS`. The walk ends early on any other activation — a tile, a ⌘K row, `⌘/Ctrl 1…9`, a banner or pin click — and when an accepted report names a conversation the walk did not open, meaning the user clicked a chat themselves. After it ends, the next press starts fresh from the live order, whose row below the current one is the conversation just left, so a lone press is "switch back". Reports during a walk still upsert the store: a stop the user dwells on counts as opened.

`MainState.unreadCursor` is removed; `MainState.walk: Walk | null` takes its place, in-memory, never broadcast. The deadline is a timestamp compared on the next press, not a timer, so there is nothing to clear on quit.

## IPC and security

All registered through `register()` and classified in `shared/ipc.ts`.

- `conversation:active` (service send): `{ serviceId, conversation: string | null, url: string, title: string }`, validated against the sending frame like `unread:update`. Every string is page data until re-checked in main as above. The only effect is a row in the sealed store, and the URL is validated again at open time. At most one report per tick per view, and only one view passes the focus gate.
- `recents:list` (shell-only invoke): `{ rows: RecentView[]; storage: RecentsStorage }`. `RecentView` is `{ id, serviceId, title, at }`, hrefless; the on-screen row is removed main-side. `storage` is `sealed | plain | unreadable`, the `DownloadStorage` values.
- `recents:open` (shell-only send): `{ id }`.
- Removed: `activity:recent` and `activity:open`, their `SHELL_ONLY_CHANNELS` entries, their `RendererToMain` and `RendererInvoke` types and their rows in `ipc-sender-policy.test.ts`.

Both shell channels are refused while locked like every shell channel, so the switcher shows no rows under the lock. Diagnostics: `[recents]` notes storage state once at construction (unreadable or plaintext); a row whose lanes all miss notes `[open] <service> miss: lanes=…` through the existing tail. Rows never enter the ring.

## Storage

`RecentsStore` in `src/main/recents.ts`, `DownloadHistoryStore`'s shape with a `KeyCodec`. `recents.json` holds `{ sealed }`, or `{ recents }` plaintext on a machine with no keychain. A fresh profile writes nothing until the first row. A sealed file this launch cannot open is kept untouched, reads empty and refuses writes for the launch; the next launch that can read it gets it back. A plaintext file is re-sealed on load when a codec exists. Unknown service ids and malformed rows are dropped on load. Written on every accepted upsert; the file is a few kilobytes.

`purge.ts` calls `ctx.recents.clear(id)` beside `ctx.activity.clear(id)`. Banish keeps rows; the switcher and `walkTargets` skip disabled services. Recents are not a `Settings` key and never enter a settings backup.

## The banner log after this

`ActivityLog` keeps `append`, `get`, `learnUrl`, `forgetReplay` and `clear`, which banner clicks and the lock's parked click still need. `recent()` and `ActivityEntryView` are removed with their last consumers. `NotificationRouter` is unchanged. The `REGISTRY_CAP >= ACTIVITY_CAP` assertion stays: the shim registry is sized to the entries a banner click may replay.

## Renderer

`QuickSwitcher.tsx` fetches `recents:list` once per open, as today. `switcherRows` takes `RecentView[]`; the haystack is the title alone. A row is service icon, title and relative time; the 🌙 marker and the dimmed author go with the banner rows. When `storage` is `unreadable` or `plain`, one quiet line under the Recent header says so, in the words the pins band uses. `MAX_RECENTS` stays 8.

## Cost

One `hasFocus()` per tick per view. On the single focused view, one hook call and two property reads per tick, a string compare, and a send only on change. No new timers.

## Testing

- `recents-rules.test.ts`: label from hook vs title; the landing-URL rule; `acceptReport` across active, overlay, focus and disabled; upsert to the top with URL refresh and kept id; the cap; on-screen exclusion; unknown-service and malformed drop on load; sanitisation caps.
- `recents-store.test.ts`: sealed round trip with a fake codec; plaintext without one; an unreadable sealed file kept untouched and refusing writes; plaintext re-sealed on load.
- `recents-walk.test.ts`: `beginWalk` from an on-screen row and from null, including an unlisted on-screen conversation; both directions with wrap; a walk ended by deadline, by another activation and by a report it did not cause; "switch back" on a fresh press.
- `runner.test.ts`: no report while `hasFocus()` is false; one on the first focused tick; none while the key is unchanged; one on change; a throwing hook does not stop the count.
- `switcher-results.test.ts`: adapted to `RecentView`.
- `ipc-sender-policy.test.ts`: the two shell channels reject a service frame; `conversation:active` rejects a mismatched `serviceId`; the removed channels leave the table.
- `activity-log.test.ts`: `recent()` cases removed.
- E2E: the `--goetia-e2e` seed writes one Recent row instead of an activity row, so `shortcuts.spec.ts` keeps a conversation for `⌘⇧]` and the switcher spec has a row. The chords are still emitted on the view's `webContents`, since CDP bypasses `before-input-event`.
- Live, after `package:mac`: open two WhatsApp chats and a Discord DM; ⌘K shows the three in that order with the on-screen one absent; `⌘⇧]` twice reaches the third; `⌘⇧[` comes back; each lands in-page without a reload.

## Documentation

- This spec. The 2026-08-17 spec's recents section and the 2026-09-21 spec gain a one-line "superseded by" note at the top.
- CLAUDE.md, Notifications & mute: the "Recents are the banner stream remembered" invariant is rewritten. Recent is the conversations the user opened, sealed at rest in `recents.json`, fed by `conversation:active` under the acceptance rule, never by banners; the banner log serves banner clicks only; `⌘/Ctrl ⇧ ]` / `[` walk Recent over a snapshot with `WALK_TIMEOUT_MS`; the on-screen row is excluded from ⌘K.
- README: the ⌘K sentence and the Navigate and Unread shortcut bullets; 🌙 goes.

## Out of scope

- A Telegram `conversation(doc)` hook, needed before Telegram gets rows.
- Slack thread-level rows.
- Recent on Home.
- Holding reports during a walk so that only the destination is recorded, Alt-Tab style. The 2 s tick already leaves short stops unrecorded.
