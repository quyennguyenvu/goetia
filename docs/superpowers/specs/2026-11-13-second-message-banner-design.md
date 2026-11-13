# A banner for every message in an unread chat

Date: 2026-11-13. Status: built. User decision: build it, accepting that a reaction or an unsent message banners too.

## Problem

Two messages arrive in one Messenger conversation and only the first raises a banner.

Messenger never notifies in-page in a browser tab. Its own per-message `new Notification` (`MWDesktopNotifications.triggerLocalNotification`, read from the live bundle) runs only for the installed messenger.com PWA: `isMessengerPWA` requires `display-mode: standalone` and `isMessengerDotComOnComet`, behind a knob, and only while the page is hidden. Everyone else gets browser push, which Electron cannot receive. So Goetia synthesizes the banner from the thread list, and the runner did that only when the count of unread **conversations** rose. A second message in a chat that is already unread leaves that count where it was.

The same trigger had a second defect: it always named the **first** unread row. With a pinned chat unread on top, a message in any other chat raised a banner for the pinned one.

## Decision

A recipe may declare `unreadBanners(doc)` instead of `synthNotification(doc)`: a banner for every unread conversation that is not muted, in list order. The runner asks on every count that finds something unread and hands the rows to `UnreadRows` (`src/preload/recipes/unread-banners.ts`), which answers the rows to announce, in list order:

1. every row whose preview changed since that row was last seen, once the page has settled;
2. and, when the count rose, every row never seen before;
3. or, when the count rose and no row accounts for it, the first row — the same words again after the chat was read change no preview.

Two chats can change inside one count, and `NotificationThrottle` drops a second banner inside its 800 ms floor, so the runner sends one banner a tick and holds the rest (`WAITING_BANNERS_MAX`, 10). What is still waiting is dropped the moment the page has focus: the user is looking at the list, and a later blur must announce nothing stale.

A row is keyed by its thread link, or by its name where the site gives it no link. Rows are remembered after they leave the list (`SEEN_ROWS_MAX`, 200), because a read row and one scrolled out of a virtualized list look the same from the page. The runner asks whether or not the page has focus, so the rows stay known and a blur announces nothing stale; it reports only while `!doc.hasFocus()`, as before. A throwing hook announces nothing and never marks the count stale.

Messenger alone declares it. Its preview is the thread's last-message snippet and nothing else: `MWThreadSnippetForDisplay` has no typing state, and the relative time is its own element. Instagram, TikTok and Shopee keep `synthNotification` and the count-rise trigger until their previews are read the same way — a row that shows "Typing…" would banner on every keystroke pause. TikTok's row has no preview to compare at all.

## What is not a message

- **A clock.** `previewOf` drops a trailing `· 5m` before comparing, in case a build puts the time in the preview's element.
- **A page still loading.** `useGetSnippetFromLS` fills some encrypted threads' previews in asynchronously after the list renders, over a placeholder. A changed preview is announced only `PREVIEW_SETTLE_MS` (30 s) after the document started; a rise in the count is announced at once, as before — and as before with one banner, because a list that renders after the first count reads as a rise for every row in it.

## Trade-offs, named

- A reaction ("Reacted 😆 to your message") or an unsent message rewrites the preview of an unread chat and banners. Accepted.
- A second message inside the first 30 s of a document is not announced.
- Detection waits for the next count: the list observer does not watch text, so it is the row's `aria-label` time change or the `FORCE_RECOUNT_TICKS` floor (about 10 s) that triggers it.
- **The same preview twice is one banner.** Two photos in a row both read "sent a photo"; two stickers, or "ok" twice, are the same. The row gives no other safe signal — its time label changes every minute on its own — so the second is announced only if the chat was read in between (rule 3).
- A held banner goes out a tick or more after its message, and one for a chat read on another device in that gap still goes out.
- The hook sweeps every row where `synthNotification` stopped at the first, on each count that runs with something unread. It is held to `count()`'s cost rules.
- A sleeping service announces nothing new this way: a peek's document never outlives the settle window.

## Unverified

Built from Facebook's bundle and the DOM fixtures, not from a live second message. Watch for one message raising two banners (a placeholder that outlives the settle window) and for a banner with no new message behind it.

## Testing

`tests/unit/unread-banners.test.ts` (the rule), `tests/unit/runner-synth.test.ts` (the runner: second message, two chats in one count, load settle, focus, throwing hook), `tests/unit/messenger-synth.test.ts` and `tests/unit/muted-conversations.test.ts` (the rows, muted ones left out).
