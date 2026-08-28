# Pinned messages — a todo dashboard on Home

Date: 2026-08-25. Status: implemented (plan `docs/superpowers/plans/2026-08-26-pinned-messages.md`).

A pinned-messages board: pin any visible message in any service from the right-click context menu, order the pins by priority on Home, and click one to land back in the conversation it came from. Pins are the user's explicit todo list — they persist across restarts, survive purge and banish, and are removed only by the user.

## Decisions (user, 2026-08-25)

- **Capture point is the context menu.** "Pin message…" appears when right-clicking inside a service page with a text selection (or a same-origin conversation link). Pinning from the recents stream and a pin-current-conversation shortcut were both considered and not chosen.
- **Pins persist to disk.** This is a deliberate amendment to the privacy invariant: *unchosen* conversation content still never touches disk (the activity log stays in-memory), but content the user explicitly pinned lives in `pins.json` and is deleted with the pin. In-memory-only and safeStorage-encrypted variants were rejected — the first makes the todo list vanish on quit, the second adds keychain prompts on every ad-hoc rebuild.
- **The dashboard is a section on Home**, not a new overlay. Home is already the destination surface with the right layering; no new surface plumbing.
- **No modal at pin time.** The original idea was a small note modal on pin, but any shell modal hides the service page (BrowserViews cover the shell), losing sight of the message being pinned — and the user prefers non-blocking UI. The pin lands instantly; notes are edited on Home.
- **Acknowledgement is the Home sigil, not a toast** (2026-08-26). A pin is captured while a service page covers the whole content area, so a shell toast at that moment is invisible — the same layering fact that ruled out the modal. The rail is the one shell surface always on screen: a **tally pill beside the Home sigil** (pin glyph + count, ember tint, hidden at zero) shows the pin count and pulses when a new pin lands. It is deliberately not a badge on the sigil — a count circle at a tile's top-right is Goetia's *unread* language, and in review the first proposal (an ember circle there) read as "Home has 3 unread" (2026-08-26). At the 50-pin cap the context-menu item itself renders disabled ("Pin Message — 50 max"), so no refusal feedback is needed. A rail pill toast (top rail only), an OS notification, and a bottom-right pin tag on the sigil were considered and rejected.
- **Architecture A: a dedicated `PinStore` in main.** Extending `ActivityLog` (ring buffer, in-memory, banner-fed — three lifecycle mismatches) and storing pins in `Settings` (message text in plaintext `settings.json`, menu rebuilds on every pin edit) were both rejected.
- **Board layout: the focus altar** (2026-08-26, chosen from three mocked directions — see the Home board section). Done removes the pin outright; a completed-pins archive was considered and rejected as YAGNI.

## Data model

`src/main/lib/pins.ts`, main-process only:

```ts
interface Pin {
  id: number;            // opaque, monotonic, never recycled (same rationale as ActivityLog)
  serviceId: ServiceId;
  text: string;          // captured selection, trimmed and capped ~300 chars — the "message"
  note: string;          // user's brief description, '' until edited
  href: string;          // document URL at pin time; validated only at jump time
  at: number;            // pinned-at timestamp
}
```

`PinStore` is a pure class with a vitest unit test. Array order is priority order. `pin()` appends to the end of the queue. `unpin(id)`, `setNote(id, note)`, and `reorder(ids)` — reorder validates that `ids` is a permutation of the current ids and ignores anything else, so a stale renderer can never drop or duplicate a pin. `views()` returns renderer-safe rows: display fields and the opaque id only, **no href** — URLs stay in main, exactly like `ActivityEntryView`.

Capacity is 50 pins. At the cap the "Pin Message" item renders **disabled**, never a silent shift — this is a todo list; silently dropping the oldest todo would be data loss. (Contrast `ActivityLog`, whose ring semantics are correct for ambient history.) `unpin()` keeps the removed pin and its index as `lastRemoved`, so `restore(id)` can undo the most recent Done/unpin (refused at the cap).

## Persistence

`pins.json` in `userData`, beside `settings.json`, through `conf` (the engine `SettingsStore` uses) with `clearInvalidConfig` so a corrupt file yields an empty list instead of a boot crash. One atomic write per mutation — every mutation is a user click, and a drag reaches main once — so no deferral is needed. Load is schema-tolerant (`parsePins`): a missing, corrupt, or wrong-shaped file yields an empty list; a pin whose `serviceId` no longer exists in `SERVICES` is dropped. Ids continue from the highest loaded id.

## Capture

`buildContextMenuTemplate` gains a `pin` section emitting `{ kind: 'pin-message', text, href, enabled }` when `selectionText` is non-empty (href `null` = the document URL). When there is no selection but `linkURL` stays on the service's origin, the item pins that link instead (href = `linkURL`, text = page title). `enabled` is false at the cap, with the label "Pin Message — 50 max". The wiring in `views.ts` already closes over the `serviceId` and `webContents`, so it supplies the page title, the service origin and the cap state, resolves the href from `params.pageURL` (or the triggering `linkURL`) and hands the whole record to main — **no new service-side IPC**. The captured string is attacker-influenced page content and is treated as inert display text everywhere: React text nodes only, no HTML paths.

## IPC and state

Five new channels, all in `SHELL_ONLY_CHANNELS`: `pins:reorder { ids }`, `pins:unpin { id }`, `pins:restore { id }`, `pins:setNote { id, note }`, `pins:open { id }`. Pin rows ride `ShellState` as `pins: PinView[]` — they change only on pin/unpin/restore/note/reorder, so the broadcast is cheap. Reorder follows the rail rule: drag-local draft in the renderer, ONE `pins:reorder` on drag end, draft cleared when the broadcast lands.

## Jump

`pins:open` looks up the pin in main and reuses the recents path verbatim: `resolveBannerClick({ disabled, hasView, href, serviceUrl, chatPaths })` → `performBannerAction`. A live view routes in-page (no SPA reboot), a dead view wakes on the URL, an off-chat or cross-origin href falls back to plain activation, and a disabled service resolves to `show-only`. Zero new navigation logic; the href is validated at click time, not pin time, because chatPaths can change between releases.

## Home board

A "Pinned" section on `Welcome`, above the service bands, in the **focus altar** layout (chosen 2026-08-26 from three mocked directions; a uniform full-width row band and a right-edge ledger column were rejected — the first made the in-progress item a highlight rather than a landmark, the second squeezed the board below its nine-tile single-row width assumption):

- **The altar**: the first pin renders as a compact two-line card, still the largest element on the board (larger type, accent border and glow) but no taller than two queue rows: the header line carries the service chip, the conversation (when known), the "In progress" flag, and two affordances — **✓ Done** and **×** unpin; the second line is the message text, which is itself the open affordance, with the note trailing after a separator. (A separate Open button shipped first and was removed after live use on 2026-08-27 — it duplicated the text click and cost width.) Done and unpin both remove the pin (there is no completed-pins archive — YAGNI) but carry different toast copy ("Done — nice." vs "Unpinned"), each with Undo. Removing the altar pin promotes the next queue item onto the altar. **Row 1 in-progress is automatic** — no separate state; reordering is how the in-progress item changes.
- **The queue** ("Up next"): compact rows — drag handle, service chip, text, note, ✓ done and × unpin — so a task finished out of order never needs promoting to the altar first.
- **Height cap**: the band never grows past the altar plus ~6 queue rows (5–7 depending on window height); beyond that the queue scrolls internally. The Summoned band's full single row and at least one row of Unbound stay visible at every window size — the pinboard never buries the service picker.
- **Empty state**: one quiet line like the other bands — "Nothing pinned — right-click a message in any service."

Clicking the message text (altar or queue row) fires `pins:open` and closes Home through the existing surface machinery, so the service view presents only after Home closes (overlay invariant intact).

Unlike the services board, pin actions are **not staged**: unpin, note edits, and reorder commit immediately. Staging bought Home atomic service-set commits; a todo list has no equivalent multi-part edit.

Note editing is inline: click the note area, an input appears, commit on blur or Enter, one `pins:setNote` per commit.

## Acknowledgement

At pin time: a tally pill sits beside the Home sigil on the rail — a pin glyph and the count, ember tint on a soft ground, hidden at zero, clicking it opens Home — and pulses briefly when a new pin lands (the renderer notices the highest pin id rising between broadcasts, so an Undo never pulses). On a side rail the pill sits under the sigil. It is a label, not a badge: nothing about it shares the unread badge's corner, shape or colour. No toast — the shell content area is covered by the service page at that moment.

On Home: Done and unpin each show a self-dismissing toast (pattern-copied from `PurgeToast`) — "Done — nice." or "Unpinned." — with an **Undo** action that sends `pins:restore`. Home is a shell surface, so this toast is visible. No required CTA.

## Edge cases

- **Banish**: pins survive (banish clears the rail, not todos). The row renders dimmed; jump resolves to `show-only`.
- **Purge** (single or all): pins survive. Purge's contract is "clear the login"; unlike recents — ambient history that would deep-link into a logged-out session — pins are explicit user artifacts, and after re-login their jumps work again.
- **Service removed from the app**: pin dropped at `pins.json` load.
- **Waking/dead views**: handled by `resolveBannerClick`'s existing navigate-vs-open-in-page split.

## Testing

- `pin-rules.test.ts`: text clamping, permutation guard, tolerant `parsePins` (corrupt shapes, unknown service ids, duplicate ids), `pinViews` stripping hrefs.
- `pins.test.ts`: append order, cap refusal, unpin + restore at the old index, note edits, reorder, persistence across instances, corrupt-file recovery.
- `context-menu.test.ts`: pin item appears on selection, on same-origin link without selection, disabled at the cap, and not otherwise.
- `state.test.ts`: `snapshot` carries pins.
- e2e (`pins.spec.ts`, pre-seeded `pins.json`): sigil badge count → Home shows altar + queue → Done promotes the next pin and toasts → Undo restores → Open closes Home and activates the service view → relaunch keeps the pins.

Definition of done: `corepack pnpm lint`, `typecheck`, `test`, and `e2e` all green.

## CLAUDE.md updates

The Product principle section gains a pins bullet (capture, persistence exception, purge/banish survival, sigil acknowledgement, one reorder per drag), and the "Recents are the banner stream remembered" bullet points at it as the one exception to "conversation titles never touch disk".

## Revisions after first live use (2026-08-27)

Seven findings from the user's first session with the feature, and what each became (the report's items 2 and 5 were one bug, so they share an entry):

1. **Conversation and author on the row.** The row now shows the conversation the message was pinned in, read best-effort from `document.title` (`conversationFromTitle`: unread markers and brand segments peeled from both ends; Slack keeps the thread, not the workspace). Sites whose title is only their own name (WhatsApp, Telegram, Messenger on most threads) show nothing. The **author** is not captured: main never learns per-service DOM, and neither the author nor a reliable thread name for those sites exists anywhere but the page's markup — that would be per-service recipe hooks (`describeSelection`) calibrated against live sessions, a separate piece of work if wanted.
2. **Open landed on the wrong place and reloaded the service every time.** One bug: `openConversationInPage` matched anchors by raw `href` attribute, and a pin's href is the absolute document URL, so no sidebar link ever matched and every open fell through to a full `location.assign` — an SPA reboot. It now matches by resolved URL and is a no-op when the document is already on the URL. Exact-message jumps stay impossible in general: the services expose no message anchors; a pin lands in the conversation.
3. **Discord owns right-click.** A second capture door: `Edit ▸ Pin Selection` (⌘/Ctrl ⇧ P) reads the page selection through `executeJavaScript` and pins it with the page URL and title. Discord also shows the native menu on Shift+right-click.
4. **Toast hung after Undo → Done.** The pointer that clicked Undo never "left" the toast (it unmounted underneath), so `paused` stayed true and the next toast never started its timer. A new toast now resets `paused`.
5. **Summoned tiles drifting when a pin is removed.** Motion animated every layout-tracked tile from its old position while the Pinned band had already shrunk. Broadcasts that change the pin set are now applied inside `useInstantLayoutTransition`, so the board snaps as one; all other broadcasts keep their animations.
6. **Pinning the same message twice.** `PinStore.pin` refuses a duplicate of service + href + clamped text.

Second live pass, later the same day:

1. **Open button removed from the altar.** The message text already opens; the button duplicated it and cost width.
2. **Messenger still showed the waking cover when opening a pin from another thread.** The anchor match was exact-string on the resolved URL; facebook's sidebar links end in a slash and the pinned URL can carry a query, so they never met and the open fell back to a full navigation again. Matching now compares origin + path (trailing slash stripped) + hash and ignores the query.
3. **WhatsApp never moved.** `web.whatsapp.com/` is the URL of every thread, so a pin's href can never single one out. New optional recipe hooks — `conversation(doc)` (the open chat's name from the header) and `openConversation(doc, name)` (replay a press on the chat-list row with that name) — implemented for WhatsApp; the name is captured at pin time (main reads it through a frozen `window.__goetia.conversation()` the preload installs), stored on the pin, shown on the row, and tried **before** any URL logic on open. The selectors follow the live WhatsApp Web DOM but were written without a captured fixture; the first live open is the verification. Zalo has the same shape and no hooks yet.

Third live pass (2026-08-28), from a recording and a DevTools dump of the WhatsApp body:

1. **Dragging a pin broke the board.** A paragraph-length pin made Home wider than the window (65px at rest, +530px once the drag re-styled it as a one-line row), and Motion measured the drag against a board that kept growing — the card landed 200px to the right with a horizontal scrollbar. Root cause: `Welcome`'s root is a flex item in a row container without `min-w-0`, so its automatic minimum width was its content's min-content width, and a `nowrap` pin row is exactly that; `truncate` on the leaf cannot help when the page is being sized by the leaf. Fixed with `min-w-0` on the root (the board already applied the height-axis twin). E2E `pins.spec.ts` now seeds the long pin and asserts zero horizontal overflow before, during and after a stepped drag.
2. **WhatsApp showed the member list and never jumped.** The dump showed the header's chat title is `span[data-testid="conversation-info-header-chat-title"]` with **no** `title` attribute; the only `span[title]` in the header is the subtitle (member list), so the previous selector pinned the members and `openConversation` then searched the chat list for a row named after them. Rows are `role="row"` (not `listitem`), the name is the `span[dir=auto][title]` inside `[data-testid="cell-frame-title"]`, and the message preview beneath is a `span[title]` too — the search is scoped to the title cell. The press is dispatched on the name span (bubbling), not the row, so it crosses whichever wrapper owns the handler. A clamped label (`…`) matches the live name by prefix. A synthetic fixture with this shape (`tests/fixtures/whatsapp-chat.html`) is the oracle — the dump itself holds real names and phone numbers and stays out of the repo.
3. **Messenger showed no conversation name.** facebook.com/messages titles itself only "Messenger". New `conversationFromRows` in `meta-unread.ts` names the thread whose sidebar link is the document URL (trailing slash tolerant), with the same span rule the banner synth uses; wired as `conversation()` on messenger and instagram. Null on the inbox or when the thread's row is not rendered.
4. **Goetia's chords lose to the page.** A page receives a key before the menu does and may swallow it — Discord binds ⌘⇧H, so Home never opened from Discord and `Pin Selection` looked absent. Every chord is now declared once in `lib/shortcuts.ts` (the menu reads its labels from the same table) and intercepted in each view's `before-input-event`; because `preventDefault` there also drops the menu accelerator, the interceptor runs the command through `commands.ts`, which the menu items call too. Held keys repeat only zoom and reload (the reload guard rate-limits). Trade-off accepted knowingly: ⌘K and ⌘1…9 now belong to Goetia inside Slack and Discord as well. Playwright cannot drive this path — CDP key injection reaches the renderer but bypasses `before-input-event` (verified 2026-08-28) — so `shortcuts.spec.ts` emits the event on the live view's `webContents` and covers listener → matcher → hook → command → shell.
5. **DevTools.** `View ▸ Toggle Developer Tools` (⌥⌘I / Ctrl⇧I) opens a detached inspector for the service page on screen, or for the shell when a surface covers it — detached because a docked panel would shrink the host while the views keep laying out to the window.
6. **Zalo** (from a DevTools dump of the body, same day). The open conversation is named in `.threadChat__title .header-title`; the list is a ReactVirtualized grid (`#conversationList`) of `.msg-item` rows whose name is `.conv-item-title__name` — NBSP-joined, behind a community icon, on custom tags like `div-b16`, so names are flattened on both sides and matched by prefix when the pin's label was clamped. Zalo ignores synthetic clicks (the reason its `keepAlive` already hands a point to main), so `openConversation` may now return a **point** instead of `true`: the preload forwards it on `service:trusted-click` (the keep-alive channel, renamed — same serviceId validation) and main clicks it with `sendInputEvent`. A row rendered past the pane's edge is scrolled into view first and given up on if it still lies outside the list, since its centre would land on a neighbour. Synthetic fixture `tests/fixtures/zalo-chat.html`. Known gap: a pin opened into a **hibernated** Zalo view wakes the page on `chat.zalo.me/` and does not retry the name once the list mounts.
7. **Chords moved to the left hand** (user decision): ⌘⇧H and ⌘⇧P needed two hands, and both are pressed while the right hand is on the mouse — selecting the text to pin, or aiming at a tile. Home is now `⌘/Ctrl ⇧ G` (Goetia) and Pin Selection `⌘/Ctrl ⇧ S` (Selection); S/D/E/F/G were the comfortable left-hand letters free of OS and edit conventions (⌘⇧Q logs out of macOS, W/Z/X/C/V/T/R are close/undo/cut/copy/paste/reopen/hard-reload). The accelerator table moved to `src/shared/shortcuts.ts` so the renderer can read it: Settings → Shortcuts now renders grouped sections (Navigate / Pins / Service page / Notifications / Rail) with platform labels from the same table, so the pane cannot drift from the keys.
