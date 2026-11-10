# Download toast — design

Date: 2026-11-10. Status: approved in brainstorm 2026-11-10 (user decisions, same day); not implemented. Scope: how a finished download is announced while Goetia's window is in front — an in-app toast in the pin toast's shape, drawn on its own layer above the service page, with one action that reveals the file. Amends the completion half of `2026-09-18-downloads-design.md`; saving, the burst cap, the history and Settings → Downloads are untouched.

## Problem

A finished download is announced by a silent OS banner. With Goetia in front that is the wrong surface: the banner slides in at the screen corner, away from the chat the file came from, and lands in Notification Center afterwards. The user asked for an in-app toast "like the pinned toast" instead, with two actions: open the file and open its folder.

Two standing decisions stood in the way, and each got an explicit answer.

- **"Goetia never opens a file"** (2026-09-18). Kept — see Threat model. The toast carries the reveal and nothing else.
- **A shell toast is invisible under a service page** — the reason pins never toast at pin time, and the reason the 2026-09-18 spec chose a banner. Solved by giving the toast its own layer above the page, not by reusing the shell's toast slot.

## Threat model

Unchanged from 2026-09-18, and the reason Open was declined: Electron does not quarantine what it downloads, a service page can start a download with no user gesture, and the page picks the filename. An Open button on a toast the page can summon would put one click between a silent download and an unquarantined executable. Bounded variants were offered (an extension allowlist; stamping the quarantine attribute first) and the user chose to keep the rule whole: **the toast's only file action is the reveal.**

What this design adds to the attack surface, and what bounds it:

- **A third kind of Goetia page.** The toast layer is a `WebContentsView` with `contextIsolation: true` and `sandbox: true`, its own minimal preload, and a bundled page under the shell's CSP (`default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `frame-src 'none'`). It never navigates: `will-navigate` is prevented and `setWindowOpenHandler` denies.
- **No new IPC channel.** The page answers on a `MessagePort` main mints per toast (`MessageChannelMain`, sent with `webContents.postMessage` — the `OpenRequest` pattern). `ipcSenderAllowed`, `SHELL_ONLY_CHANNELS` and `register()` are not touched. Rejected: `toast:*` channels with a third sender class, which would edit the gate every other channel relies on.
- **The port can say four things**: pointer entered, pointer left, dismiss, reveal. None carries a path, an id or a URL. Main holds the download row id for the toast on screen, so `reveal` can only ever mean "the file this toast names", and it runs through the existing `DownloadManager.reveal(id)`, which re-checks the lock and that the file exists. A new toast closes the previous port; a late message on an old port is dropped.
- **Page-controlled text.** The filename is the only page-fed string on the card, as it already is on the banner. It is set with `textContent`; the layer's page has no `innerHTML`.
- **A page that downloads in a loop** can keep a toast over the header's middle the way it can already spam banners; the burst cap (5 per 30 s, then Save dialogs) bounds both.

**Does not defend against:** a user who reveals a malicious file and double-clicks it in Finder — the OS's line, as before.

## Decisions

- **No Open; reveal only** (user decision). "Never Open a file" stands everywhere in the app.
- **The toast is its own layer above the service page** (user decision, approach 1 of 3). Rejected: a shell toast with the banner as fallback under a service page (most downloads would still get the banner), and insetting the service view for the toast's lifetime (the chat reflows twice per download).
- **Out of view, the OS banner stays** (user decision). A download that lands while Goetia is hidden, minimized, behind another app or locked is announced exactly as today. Rejected: holding the toast until the window returns (a stale announcement), and announcing nothing.
- **Top centre of the content area** (user decision, option D of 4, reviewed as a mock over a Messenger-shaped page with the top rail). Bottom centre is the pin toast's slot but sits on the message box, and a download often finishes mid-sentence; bottom right sits on the send button; top right on the call and info buttons. The middle of a chat header is the one region that is usually empty.
- **Wording**: the action is `Show in Finder` on macOS and `Show in folder` elsewhere — the Downloads pane's `REVEAL_LABEL`, moved to `src/shared/` so main can send it. The lines reuse `bannerFor`'s copy: `Saved from <Service>` over the filename; `<Service>` over `Could not save <filename>`.
- **One slot, newest wins.** A second completion replaces the toast and restarts the clock, as `PinToast` does. Five photos saved together show the last one; the rest are in Settings → Downloads (`⌘/Ctrl ⇧ D`). A coalesced "5 files saved" card is not built (named trade-off).
- **Main owns the clock.** The page reports hover; main banks the remainder and decides when the toast leaves. A page-owned timer would strand the layer on screen if its renderer hung.
- **No standing renderer.** The layer is created at the first toast and destroyed `TOAST_LAYER_IDLE_MS` (60 s) after the last one leaves. The waking cover loads at startup because a cover must paint instantly; a toast that appears a few hundred milliseconds after the file lands costs nothing.

## Toast or banner

One pure rule in `lib/download-rules.ts`:

```ts
announceVia({ visible, minimized, focused, locked }): 'toast' | 'banner'
```

`toast` only when the shell window is visible, not minimized, focused and the app is not locked; `banner` otherwise. `DownloadManager.finish` asks it once per ended download through a new `inFront()` dep and keeps today's banner code for the `banner` answer, redaction included.

| Situation | Announcement |
| --- | --- |
| Window focused, visible, unlocked | Toast |
| Hidden to tray, minimized, or another app in front | Silent OS banner, as today |
| Locked | Redacted banner, as today |
| Toast layer could not load | Banner for that download, plus one Diagnostics line |
| Cancelled | Nothing, as today |

Unchanged in both paths: `app.dock.downloadFinished`, the progress bar, the history row, the burst cap. The toast, like the banner, is not `NotificationRouter`'s: no activity log, no mute or quiet-hours gating.

## The toast

The card is `PinToast`'s: service chip (the service colour with its logo glyph), two text lines, an accent action, the draining bar, `rounded-modal`, `bg-bg-1`, the same shadow and `toast-in` entrance. 360 px wide — 20 px more than the pin toast, because a filename and `Show in Finder` share the row — and never wider than the content area less a 16 px gutter each side.

| State | Small line | Main line | Action |
| --- | --- | --- | --- |
| Saved | `Saved from <Service>` | filename, ellipsized | `Show in Finder` / `Show in folder` |
| Failed | `<Service>` | `Could not save <filename>` | none |

- The action reveals the file and dismisses. If the file has been moved or deleted since, it opens Settings → Downloads instead, where the row reads "moved or deleted since" — the banner click's existing behaviour.
- Clicking the body dismisses. Nothing must be clicked: the toast leaves after `TOAST_MS` (8 s, moved to `src/shared/` so main and the renderer share it), and the remainder is banked while the pointer is over the card.
- The theme follows `effectiveTheme()`, sent with each toast.

## The layer

`ToastLayer` (`src/main/toast-layer.ts`) is thin wiring in `LoadingOverlay`'s shape; its decisions are pure helpers in `src/main/lib/toast-layer-rules.ts`.

- **Bounds**: the card's rectangle plus a shadow margin, centred horizontally in the content rect (`viewBounds`, so it follows the rail position), 12 px below its top edge. Background `#00000000`; only that rectangle takes clicks, the rest of the service page stays live. Recomputed in the existing coalesced layout pass (`toastBounds`, pure).
- **Stacking**: added last and re-raised at the seam that already re-raises the waking cover, so a service view re-stacked by `activate()` never buries it. It is the top layer: it shows over a service page, the waking cover, Home, Settings and the quick switcher alike.
- **Never over the lock**: the rule refuses a toast while locked, and the lock engaging while one is up hides it at once. It also hides when the window hides.
- **Protocol**: main posts `{ toast, theme }` with a fresh port. The page renders it and posts `enter`, `leave`, `dismiss` or `reveal`; `parseToastReply` (pure) drops anything else. The page keeps no state between toasts.
- **Clock**: a pure rule in `toast-layer-rules.ts` — start at `TOAST_MS`, bank on `enter`, resume on `leave`, restart on a new toast. One timer in main, cleared on hide, on destroy and on quit.
- **Focus**: showing the layer never focuses it. A click does focus its `webContents`, which has no chord interceptor, so on every port message main returns focus to what held it — the active service view, or the shell when a surface covers it. Typing and Goetia's chords carry on.
- **Lifecycle**: created lazily; a toast arriving before `did-finish-load` is held as `pending` and sent on load, as the waking cover does. `did-fail-load` or `render-process-gone` before the toast is shown falls back to the banner for that download and notes `[downloads] toast layer failed: <code>` through `ctx.diag.note`; a death while showing just hides. Destroyed `TOAST_LAYER_IDLE_MS` after the last toast, and on quit. Every deferred callback checks `isDestroyed()`.

New files: `src/main/toast-layer.ts`, `src/main/lib/toast-layer-rules.ts`, `src/preload/toast.ts`, `src/renderer/toast.html`, `src/renderer/src/toast.ts` (vanilla, like `loading.ts`, importing `tokens.css`), plus the two entries in `electron.vite.config.ts`.

## Wiring

`DownloadManagerDeps` gains three members and loses nothing:

- `inFront(): { visible, minimized, focused }` — read from the shell window, guarded by `isDestroyed()`.
- `toast(t, unavailable)` — `t` is the two lines, the service id, the action label or null, and the history row id; `unavailable` is the banner fallback above.
- `revealLabel` — the platform's words for the action.

`index.ts` turns that into `ToastLayer.show(card, { action, unavailable })`: the card it forwards carries no row id, and `action` closes over it and calls `DownloadManager.toastAction(id)` — reveal, or the Downloads pane once the file has gone, inert while locked. `ToastLayer` never imports `DownloadManager`. `notify` and its banner stay as they are, with one change that applies to both announcements: the file is named as saved on disk (`note (1).txt` for a de-duplicated save), as the history row already is, where the banner used the name the page asked for.

## Testing

- `tests/unit/download-rules.test.ts` — `announceVia` for each row of the table.
- `tests/unit/toast-layer-rules.test.ts` — `toastBounds` for each rail position and a window narrower than the card; the clock banking across enter and leave and restarting on a new toast; `parseToastReply` refusing unknown and malformed messages.
- `tests/unit/downloads.test.ts` — in front: `toast` called and `notify` not; out of view and locked: the reverse, redaction intact; failed carries no action; `unavailable` produces the banner; cancelled produces neither.
- `tests/e2e/downloads.spec.ts` — with the window focused, the fixture download raises the toast page (`toast.html`) with the filename and the reveal label; the reveal dismisses it; a second download replaces the first. Lazy creation matters here: every other spec finds the shell as "a `file://` page that is not `loading.html`", and a toast page that exists only after a download keeps that true for them. `downloads.spec.ts` excludes `toast.html` in its own predicate.
- Manual (added to `docs/FEATURES.md`): the toast over a live service page in each rail position and both themes; hover banking; typing in the chat while it shows; a chord pressed right after clicking it; the banner when another app is in front; nothing shown while locked.

## Docs

CLAUDE.md's "Downloads are saved, never opened" bullet is amended: completion is a toast on its own layer while the window is in front and the silent banner otherwise; the toast's action is the reveal; the layer answers on a main-minted port and adds no IPC channel; "Never Open a file" stands. `2026-09-18-downloads-design.md` gets a superseded note on its "Completion is a native notification" decision pointing here.

## Out of scope

- Open, in any bounded form (declined above), and writing the quarantine attribute on completed downloads (still the 2026-09-18 follow-up).
- A coalesced toast for several files, and a progress toast for a download in flight.
- Moving the shell's other toasts (pin, purge, update, cap trim) onto the layer. They fire only on shell surfaces, where they are already visible.
