# Downloads — design

Date: 2026-09-18. Status: approved in brainstorm (user decision, same day); not implemented. Scope: what happens when a service page starts a download — where the file lands, how the user is told, and what bounds a page that downloads on its own. Files and photos are chat, so this sits inside the chat-only principle; it adds no surface beyond a Settings row and an OS banner.

## Problem

Nothing in Goetia listens for downloads. A photo saved from WhatsApp or a PDF sent on Slack falls through to Electron's default: Chromium's Save dialog, every time, with no word when the file has landed and no way back to it from the app. The context menu's `Save Image As…` calls `webContents.downloadURL` with nothing on the other end but that same dialog. A shell toast cannot fix the second half, because the service page covers the shell at the moment a download finishes — the same reason pins never toast at pin time.

## Threat model

A service view runs unsandboxed with the recipe preload, and a page can start a download without a user gesture (`a.click()` on an anchor with `download`). Once saving is silent, that is a page writing files into the user's Downloads folder on its own say-so. Chrome bounds this with its automatic-downloads permission; Electron has nothing. Two bounds keep silent saving honest:

- **A burst cap per service.** More than `DOWNLOAD_BURST_CAP` downloads inside `DOWNLOAD_BURST_WINDOW_MS` (5 in 30s) turns every further one in the window back into a Save dialog, which needs a human. The cap is decided in a pure rule off the item's start time; a user saving a handful of photos never meets it.
- **Goetia never opens a file.** The completion banner's click is `shell.showItemInFolder`, never `shell.openPath`. A received `.dmg` or `.exe` is only ever revealed. **Electron does not quarantine what it downloads** (checked 2026-09-19 on the e2e's blob download from the dev binary: the file carries `com.apple.provenance` and no `com.apple.quarantine`), so Gatekeeper will not gate a downloaded executable the way it gates one Safari saved — the reveal-only click is the whole line Goetia holds. Writing the quarantine attribute ourselves on `completed` is a candidate follow-up, out of scope here.

Filenames come from `item.getFilename()`, which Chromium has already stripped of path separators. The rule still refuses an empty name or a dotfile and substitutes `download`, and the target path is always `join(dir, name)` — never anything the page supplied. A `dir` the user chose is a string from the folder picker, written through `settings:update`, which is shell-only; a service frame cannot move it.

**Does not defend against:** a user who reveals a malicious file and double-clicks it in Finder. That line belongs to the OS.

## Decisions

- **Two modes, chosen in Settings** (user decision): save to a folder without asking, or always ask. No third path.
- **Default is the OS Downloads folder, silently** (user decision, after confirming the same works on Windows): `app.getPath('downloads')` resolves the platform's folder on macOS, Windows (the Known Folder, so a relocated Downloads is honoured) and Linux (XDG). The setting stores `null` for that and a real path only once Choose… has been used, so nothing platform-specific is persisted.
- **`Save Image As…` always asks.** Its label promises a dialog. The context menu records the URL before calling `downloadURL`, and the rule matches `item.getURL()` against that set.
- **Completion is a native notification plus the dock bounce** (user decision, approach 1 of 3). One silent OS banner per file with the service icon; click reveals the file. macOS also calls `app.dock.downloadFinished(path)`. Rejected: bounce and progress only (no way to find the file from Goetia); banner only (no progress for a large video).
- **Its own notification path, not `NotificationRouter`.** A download is not a message: it must not enter the activity log, must not be gated by mute or quiet hours (the banner is silent regardless, and the user asked for the file), and its click is a folder reveal, not a conversation. This is a deliberate second path and not the unthrottled one the guardrails forbid — the burst cap above is its throttle.
- **A `DownloadManager` in main with a pure rules helper** (approach A of 3). `src/main/downloads.ts` is thin wiring in the shape of `NotificationRouter` and `PinStore`; every decision lives in `src/main/lib/download-rules.ts` under vitest. Rejected: inline in `configureSession`, which already carries permissions and spellcheck and would leave the naming and cap logic untested; and a shell-side download list (a pane or rail badge), because the page covers the shell at download time, the OS already owns a download-folder UI, and a list is one more place conversation-adjacent content would live. The list can come later if banners prove insufficient.

## Settings

One block on `Settings`:

```ts
downloads: { ask: boolean; dir: string | null };
```

Default `{ ask: false, dir: null }`. Normalised field-by-field in `settings.ts` like `appLock` (`fillDownloads`): a non-boolean `ask` falls to `false`, a non-string `dir` to `null`. The resolved folder is `dir ?? app.getPath('downloads')`, computed at decision time, never stored.

Settings → General gains a **Downloads** row: a two-option choice, **Save to folder** showing the resolved path with a **Choose…** button, or **Always ask**. Choose… is a new shell-only invoke, `downloads:chooseDir`, which runs `dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], defaultPath })` and returns the picked path or `null` on cancel; the renderer then writes it through the ordinary `settings:update`. The channel joins `SHELL_ONLY_CHANNELS`.

## The download

`configureSession(id)` attaches one `will-download` listener to the `persist:<id>` session and hands `(id, item)` to `DownloadManager.handle`. Session scope is deliberate: the call window, the contained window and an identity popup share the service's partition, so a file saved from any of them lands the same way.

`decideSave` (pure) takes the item's filename and URL, the settings block, the resolved folder, the burst history, the ask-URL set, and an `exists(path)` probe, and returns one of:

- `{ mode: 'ask', defaultPath }` — the setting says ask; or the URL is a `Save Image As…` request; or the burst cap is exceeded; or the folder no longer exists (an unmounted drive), checked with one `existsSync`; or de-duplication ran out of names.
- `{ mode: 'save', path }` — the de-duplicated target: `photo.jpg`, then `photo (1).jpg` … up to `DOWNLOAD_DEDUP_MAX` (99), each probed with `exists`.

`save` calls `item.setSavePath(path)`. `ask` calls `item.setSaveDialogOptions({ defaultPath })` and lets Chromium show its dialog; a cancelled dialog ends the item as `cancelled`. The ask-URL entry is consumed on match so a later page-initiated download of the same URL is not mistaken for a user request.

## Completion and the lock

`item.once('done', (_e, state))`:

| State | Banner | Else |
| --- | --- | --- |
| `completed` | `<filename>` / `Saved from <Service>` (`bannerFor`, pure) | `app.dock?.downloadFinished(path)` on macOS; click → `shell.showItemInFolder(path)` |
| `interrupted` | `Could not save <filename>` / `<Service>` | click → `win.show()` |
| `cancelled` | none | — |

Every banner is `silent: true` and carries the service icon from the same `resolveIcons` table the router uses. While the app lock is engaged the banner is redacted to the service name with an empty body — `redactBanner` from `lib/lock-rules.ts`, reused as is — and its click only shows the window; nothing is parked on the lock, because revealing a file is not a conversation to return to.

Progress rides `win.setProgressBar(fraction)` with the aggregate of every in-flight item across services (`progressFraction`, pure, from received and total bytes; indeterminate when any total is unknown), cleared with `-1` when the last item ends. macOS shows it on the dock icon, Windows on the taskbar button.

## Lifecycle

`DownloadManager` tracks in-flight items per service. `views.destroy(id)` calls `downloads.detach(id)`, which drops the session listener and cancels each of the service's items; `before-quit` calls `dispose()`, which does that for every service and clears the progress bar. `attach(id, session)` is idempotent, because a hibernated service re-creates its view on the same persistent session. Every `done` and `updated` callback checks `win.isDestroyed()` first. The burst history is bounded to the window and trimmed on each decision; the ask-URL set is bounded to `ASK_URL_CAP` (16) entries and consumed on match.

## Testing

- `tests/unit/download-rules.test.ts` — `decideSave` for each ask reason (setting, Save-Image-As URL, burst cap, missing folder, de-dup exhausted) and for a clean save; de-duplication naming; empty and dotfile names; `bannerFor` for each state; `progressFraction` with and without unknown totals.
- `tests/unit/downloads.test.ts` — a fake `DownloadItem` driven through save, ask, `completed`, `interrupted` and `cancelled`; asserts `setSavePath` vs `setSaveDialogOptions`, the banner (or its absence), progress set and cleared, `cancelAll` on destroy, and the lock redaction.
- `tests/unit/settings.test.ts` — the `downloads` block normalises from a missing, partial and malformed file.
- `tests/e2e/downloads.spec.ts` — a fixture page with an anchor carrying `download` is loaded into a service view; with `settings.json` pointing `downloads.dir` at a temp folder, the file lands there under the expected name, and a second click lands `name (1).ext`.
- Manual (listed in `FEATURES.md`): the banner and its click, the dock bounce, the Windows taskbar progress, and the quarantine attribute on a real download.

## Out of scope

- ~~A download list or history surface (see Decisions).~~ Superseded 2026-09-23: Settings → Downloads lists the session's downloads (`2026-09-23-downloads-pane-design.md`).
- Opening a file from Goetia.
- Per-service download folders.
- Pausing or resuming downloads; an interrupted item is reported and dropped.
