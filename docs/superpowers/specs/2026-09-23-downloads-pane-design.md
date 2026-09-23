# Downloads pane — design

Date: 2026-09-23. Status: implemented 2026-09-23. Scope: a **Downloads** pane in Settings that holds the folder choice already in General and lists this session's downloads, newest first, with one action per row — show it in Finder, or cancel it while it is still coming down — plus `⌘/Ctrl ⇧ D` to open it. Nothing about how a download is decided, saved or announced changes; the 2026-09-18 spec stands and this fills the "list can come later" it left open.

## Problem

A file a chat sends lands silently and is announced by one banner. Miss the banner, or click it an hour later after the file was moved, and Goetia has no way back to it: the folder is the OS's and the banner is gone. The 2026-09-18 spec rejected a list because the page covers the shell at download time and the OS owns the folder; both still hold, and neither helps the user who wants to see what came down this session and where it went. A long video also has no cancel anywhere but the dock's progress, which offers none.

## Decisions

- **A Settings pane, not a rail indicator** (user decision, variant A of the two mocked; artifact `Goetia Downloads`). The folder choice already lives in Settings; the list joins it and "Downloads" becomes one pane in the Passkeys and Diagnostics shape. Variant B — a browser-style arrow beside the bell opening a panel — was mocked and declined: a new rail glyph, a new overlay, and a count pill that borrows the rail's unread language.
- **Cancel on an in-flight row** (user decision). The 2026-09-18 spec's "no pause or resume" stands; cancel is neither, it is the one thing a stuck 2 GB video needs. A cancelled download leaves the list, as the banner spec already says a cancelled file gets no banner.
- **`⌘/Ctrl ⇧ D` opens Settings on the pane** (user decision). Left half of the keyboard like Home and Pin, D for Downloads; the same path Check for Updates takes to the Updates pane. Declared once in `shared/shortcuts.ts`, so the menu, the Shortcuts pane and every view's `before-input-event` interceptor agree.
- **In memory, this session only.** Bounded at `DOWNLOAD_HISTORY_CAP` (50) like the activity log; gone at quit. A file name is conversation-adjacent content, and across sessions the Downloads folder is the OS's own history. The oldest ended record is dropped first; only if every record is still in flight does the oldest of those leave the list, and its download continues.
- **One action per row, and never Open.** Saved → **Show in Finder** (`shell.showItemInFolder`, the banner's click). Downloading → **Cancel**. Could not save, or moved or deleted since → nothing. No Open, no Clear, no retry.
- **The banner's click learns the pane.** A completed banner clicked after the file was moved did nothing visible; it now opens the pane instead, where the row reads "moved or deleted since". The reveal path is unchanged when the file is still there.
- **Fetched on open, polled only while something is in flight.** The pane invokes `downloads:recent` when it opens and, while any row is downloading, again once a second from the renderer; nothing is broadcast per byte, and the poll ends with the last in-flight row or the pane.

## Threat model

Everything new is shell-only and read from main's own records:

- **`downloads:recent`, `downloads:reveal`, `downloads:cancel`** join `SHELL_ONLY_CHANNELS` and stay out of `LOCKED_ALLOWED_CHANNELS`: a service page reaches none of them, and a locked app lists, reveals and cancels nothing. Reveal and cancel carry an opaque numeric `id`; the path is main's record, never renderer-supplied, and reveal re-checks `locked()` and `exists(path)` at click time exactly as the banner does.
- **The view carries no path.** `DownloadView` has the file name, the service, the state, the byte counts and the time — the pane needs nothing else, and a path is where a later feature would be tempted to open something.
- **Bounded and renderer-paced.** Fifty records; a 1 Hz poll only while the pane is open with a download running. A page cannot grow the list faster than the burst cap already lets it download.
- **Nothing on disk, nothing in the activity log, nothing through the router.** Same as the banners.

Rolling back reads nothing: the history never existed on disk.

## Data

`src/shared/types.ts`:

```ts
export type DownloadState = 'downloading' | 'saved' | 'failed' | 'missing';
export interface DownloadView {
  id: number;
  serviceId: ServiceId;
  filename: string;
  state: DownloadState; // `missing`: saved, but exists(path) was false when fetched
  received: number;
  total: number; // 0 when unknown
  at: number; // epoch ms the download started
}
/** which Settings pane a main-side command asked for; `seq` makes a repeat press land again */
export interface SettingsFocus { section: 'downloads'; seq: number }
```

`ShellState` gains `settingsFocus: SettingsFocus | null`, held on `MainState`, set by the command and cleared by `setOverlayOpen(ctx, 'settingsOpen', false)`.

`src/main/lib/download-rules.ts`:

```ts
export const DOWNLOAD_HISTORY_CAP = 50;
export interface DownloadRecord {
  id: number; serviceId: ServiceId; filename: string; path: string;
  state: 'downloading' | 'saved' | 'failed'; received: number; total: number; at: number;
}
/** in-flight first, then newest first; a saved record whose file is gone reads `missing` */
export function historyViews(records: readonly DownloadRecord[], exists: (p: string) => boolean): DownloadView[];
/** the one record to drop when the cap is met: the oldest ended one, else the oldest of all */
export function historyEvict(records: readonly DownloadRecord[]): number | null;
```

`src/shared/format.ts` (renderer-importable): `formatBytes(n: number): string` — `812 KB`, `3.1 MB`, one decimal under 10 and none above; `formatProgress(received: number, total: number): string` — `48 of 77 MB`, both numbers in the total's unit, `48 MB so far` when the total is 0; `extensionChip(filename: string): string` — the extension upper-cased and clipped to four characters, `FILE` when there is none.

## The manager

`DownloadManager` keeps `records: Map<number, DownloadRecord>` beside `inflight`, with ids from a counter. A record's `filename` is the name on disk — the basename of the save path once it is known — so a de-duplicated save reads `note (1).txt`, not the `note.txt` the page asked for (the e2e caught the first cut showing the requested name for both rows). `handle` adds a `downloading` record (evicting per `historyEvict` when at the cap); `updated` writes the byte counts into it; `finish` marks `saved` (completed) or `failed` (interrupted) and **deletes** it on `cancelled`. `detach` cancels the service's items as today, so their records go with them.

Three methods for the handlers: `recent(): DownloadView[]` = `historyViews(records, deps.exists)`; `cancel(id): boolean` — the in-flight item's `cancel()`, false when the id is not in flight; `reveal(id): boolean` — `deps.reveal(path)` only when the record is `saved`, `!deps.locked()` and `deps.exists(path)`, else false. One new dep, `openDownloads(): void`, which the completed banner's click calls when `exists(path)` is false and the app is not locked; `index.ts` wires it to `runShellCommand(ctx, { kind: 'downloads' })`.

## IPC

- `downloads:recent` — invoke, `{ result: DownloadView[] }`.
- `downloads:reveal` — send, `{ id: number }`.
- `downloads:cancel` — send, `{ id: number }`.

All three shell-only and refused while locked. `id` is validated as a finite integer before the map lookup, and an unknown id is a silent no-op.

## Command and chord

`ACCELERATORS.downloads = 'CmdOrCtrl+Shift+D'`; `ShellCommand` gains `{ kind: 'downloads' }`, mapped in `FIXED`; `runShellCommand` handles it as `openDownloads(ctx)`: set `ctx.state.settingsFocus = { section: 'downloads', seq: previous + 1 }`, then `openSettings(ctx)`. `Go ▸ Downloads` joins the menu after Previous Unread with that accelerator. `setOverlayOpen(ctx, 'settingsOpen', false)` sets `settingsFocus = null`.

## Surface

**Settings nav** gains **Downloads** between Notifications and Shortcuts (`settings-nav-downloads`). The pane (`Pane title="Downloads"`) has two cards.

The first card is the two rows lifted from General unchanged in behaviour and test ids (`downloads-mode`, `downloads-reset`, `downloads-choose`), with the first row relabelled **When a chat sends a file** — a row named Downloads inside a pane named Downloads said nothing. Its hint keeps today's two sentences by mode.

The second card, headed **Recent · this session** with the right-aligned hint `Click a file to show it in Finder`, lists `DownloadView` rows in `historyViews` order — in flight first, then newest first (`download-row`): the service's colour dot, an extension chip (`extensionChip`), the file name (bold, truncated), and one sub-line by state:

| State | Sub-line | Right side |
| --- | --- | --- |
| `downloading` | `<Service> · downloading · <formatProgress>`, a thin accent bar beneath | `<pct>%` (or `…` when total is 0) and **Cancel** (`download-cancel`) |
| `saved` | `<Service> · <relative time> · <size>` | **Show in Finder** (`download-reveal`) |
| `failed` | `Could not save · <Service> · <relative time>` (the first phrase in `text-danger`) | `—` |
| `missing` | `<Service> · <relative time> · moved or deleted since` (row dimmed, name struck through) | `—` |

Empty (`downloads-empty`): `Nothing downloaded yet this session. Files a chat sends land in <folder>.` where `<folder>` is `downloads.dir` or `your Downloads folder`; under Always ask it reads `Nothing downloaded yet this session.` `relativeTime` moves from `DiagnosticsPane.tsx` to `components/relative-time.ts` so both panes import it.

The pane fetches on mount and polls at 1 s while any row is `downloading`; Cancel and Show in Finder send their channel and refetch once. Arriving through `settingsFocus` selects the pane the way `focusSection === 'updates'` selects Updates, keyed on `seq` so a second `⌘⇧D` with Settings already open on another pane lands again.

**Settings → Shortcuts**, Navigate group, gains `⇧⌘D — downloads: this session's files`.

## Testing

- `tests/unit/download-rules.test.ts` — `historyViews`: in-flight first then newest, `missing` from `exists`, no path in a view; `historyEvict`: oldest ended before any in-flight, oldest in-flight when all are, null under the cap.
- `tests/unit/format.test.ts` — `formatBytes` at B, KB, MB and GB boundaries with one decimal under 10 and none above; `formatProgress` sharing the total's unit and the `so far` form at total 0; `extensionChip` for `photo.jpg`, `archive.tar.gz` (`GZ`), `README` (`FILE`), `.env` (`FILE`), `x.jpeg` (`JPEG`), `x.webarchive` (`WEBA`).
- `tests/unit/downloads.test.ts` — a record appears as `downloading` on handle, carries progress from `updated`, becomes `saved` on completed and `failed` on interrupted, and vanishes on cancelled; `cancel(id)` cancels the fake item and returns false for a saved or unknown id; `reveal(id)` reveals only saved-and-present-and-unlocked, false otherwise; the completed banner's click calls `openDownloads` when the file is gone and `reveal` when it is there; `detach` drops the service's in-flight rows; the cap evicts per `historyEvict`.
- `tests/unit/shortcuts.test.ts` — `⌘⇧D` / `Ctrl+Shift+D` map to `{ kind: 'downloads' }` and `ACCELERATORS.downloads` is pinned; the existing "covers every chord the menu declares" case picks it up.
- `tests/unit/state.test.ts` and `tests/unit/activate.test.ts` — `settingsFocus` rides the snapshot and is cleared when Settings closes.
- `tests/unit/ipc-sender-policy.test.ts`, `tests/unit/lock-ipc-policy.test.ts` — the three channels refused from a service frame and while locked.
- `tests/e2e/downloads.spec.ts` — the Settings assertions move behind `settings-nav-downloads`; after the first download lands, the pane shows one `download-row` reading `note.txt` with **Show in Finder**; after the second, two rows with `note (1).txt` first; delete `note.txt` on disk, reopen the pane, and its row reads `moved or deleted since`; emit `⌘⇧D` on the service view's `webContents` (the `shortcuts.spec.ts` technique) and assert Settings opens with `settings-nav-downloads` current.

## Out of scope

- Persisting the history across launches; a rail indicator or panel (variant B, declined).
- Opening a file; pause, resume or retry; Clear; per-service folders.
- Cancelling a download from anywhere but the pane.
