# Download history and guard audit — design

Date: 2026-09-23. Status: implemented 2026-09-23 (plan `docs/superpowers/plans/2026-09-23-download-history.md`). Scope: Settings → Downloads keeps its list across launches, sealed at rest and capped at 200; removing rows becomes a **guarded action** behind the app lock's credential; the per-row button gives way to a clickable row, a selection gutter and an **Open folder** button; and a sweep of every action that could harm the user — recorded where it was not, guarded where it should have been — is folded in, including one real bypass of the lock. Extends `2026-09-23-downloads-pane-design.md` (the list) and `2026-09-13-guarded-actions-design.md` (the consent slot); read both first.

## Problem

The pane lists the session's downloads and forgets them at quit. That was a deliberate choice — a file name is conversation-adjacent content — but it leaves the user with no record of what a chat sent last week, and it leaves a second person at the laptop with a clean slate: download a file, quit, and nothing says it happened. The same session-only rule made Clear moot, so the pane has no way to remove a row; once the list persists, it needs one, and that removal is exactly the action the user named: **anything that could harm the user is recorded, and only the user removes the record**.

The pane also lies. Its hint says "Click a file to show it in Finder", but rows are not clickable; only the per-row button reveals, and with a long list that button is one more of the same thing on every line.

## Threat model

Two people can be at the laptop: the owner, and someone else while Goetia is unlocked. The app lock guards reading; the 2026-09-13 guard extends its credential to acting. This spec puts the download record on the guarded side.

- **The record survives its author.** A download completing writes a row that persists across launches. Removing it needs the lock's credential when a lock is configured, so a stranger's download stays on the list until the owner takes it off. Removal is also written to the Diagnostics ring, which has no Clear.
- **Sealed at rest.** `downloads.json` holds file names and paths — the content the pins decision sealed on the same day for the same reason. A copied profile yields nothing without the keychain.
- **Goetia still never touches a file.** Remove and Clear delete Goetia's record and nothing else. A row's click is `shell.showItemInFolder`, the banner's click. **Open folder** is the one `shell.openPath` in the app and only ever runs on a directory: the folder from settings, never a page-supplied path, checked to be a directory at click time.
- **The bypass the audit found.** `settings:update` writes every key in its patch, `appLock` included, and the shell's own console is one menu item away in a packaged build (`View ▸ Toggle Developer Tools` while Settings is open). One line there switched the lock and the guard off without a passcode. Main now drops `appLock` from every `settings:update` patch; `lock:configure` is its only writer, as `BACKUP_KEYS` already makes it for an import. Enforcement was always meant to live in main; this closes the one place it did not.
- **Does not exist without a lock.** With no passcode there is no credential, so Remove and Clear act at once and an Undo row follows — the 2026-09-13 rule, stated in the UI rather than degraded. Goetia cannot tell two people apart without a lock, and the Lock pane's row says what the guard covers.
- **Does not defend against** someone with the OS user session deleting `downloads.json` or `diagnostics.json` from disk — the line `lock.json` already holds — or a flood that rotates the 200-line ring; every page-driven source of lines is already deduplicated and capped, and finding 1 removes the one cheap way to silence it from inside the app.

## Decisions

- **History persists across launches, sealed** (user decision). Reverses the pane spec's "in memory, this session only". A `safeStorage`-sealed `downloads.json` in the shape of `pins.json`: plaintext plus a Diagnostics line when there is no keychain; a sealed file the keychain will not open is kept untouched, the list reads empty and nothing is written that launch. Rejected: plain JSON flushed at quit like `diagnostics.json` (a crash loses the session, and a copied profile reads every name and path), and a block in `settings.json` (it broadcasts whole to the renderer, and a path must never reach it).
- **`DOWNLOAD_HISTORY_CAP` is 200**, parity with `DIAG_CAP`, the one bounded-history number the app already has. A row is about 200 bytes; the sealed file stays near 40 KB; the pane scrolls. The eviction rule is unchanged — oldest ended row first, an in-flight row last.
- **Removing rows is a guarded action** (user decision — "actions that could harm users should be recorded and deleted by users only"). Two new `GuardedAction` kinds through the existing one-shot consent: `downloads-remove`, bound to the exact id set, and `downloads-clear`. Main enforces with `authorized()` exactly as it does a purge; the renderer only decides when to ask. Rejected: a passcode in the payload (rejected in 2026-09-13 and still) and a `PurgeConfirm`-style modal (the purge earns its modal with the sweep's acknowledgement tick, which this has no need of).
- **Restoring is not guarded.** Undo puts rows back for the toast's duration, the Passkeys and pin pattern. Restoring is the safe direction, as banish is to summon.
- **Model A: checkboxes in the gutter** (user decision; artifact `Goetia Download History`, model A of two). Every ended row carries a checkbox; the row body reveals; ticking one raises a selection bar. Declined: model B, a Select mode that hides the boxes at rest and makes the row's click mean two different things.
- **The row is the reveal; the button goes.** Clicking a saved row's body shows it in Finder, which makes the hint true. **Open folder** joins the folder card, the one place a folder action belongs.
- **Folder change is recorded, not guarded** (user decision). Pointing `downloads.dir` at a synced folder is an exfiltration channel, so it earns a Diagnostics line; a credential before Choose… was offered and declined.
- **The audit's five findings are folded in** (user decision) rather than split off: they reuse the consent slot and the ring this feature needs anyway, and the plan stays one plan.

## Data

`src/shared/types.ts`:

```ts
export type DownloadStorage = 'sealed' | 'plain' | 'unreadable';
export type DiagTag = /* today's tags */ | 'lock';
```

`src/shared/lock.ts`:

```ts
export type GuardedAction =
  | { kind: 'summon' }
  | { kind: 'purge-one'; serviceId: ServiceId }
  | { kind: 'purge-all' }
  /** bound to the exact rows: a consent for two ids is not a consent for three */
  | { kind: 'downloads-remove'; ids: number[] }
  | { kind: 'downloads-clear' }
  | { kind: 'passkey-forget'; id: string };
```

`sameAction` matches `downloads-remove` on equal id sets — sorted, deduplicated, compared element by element — and `passkey-forget` on the id. The `lock:confirm` handler normalises a `downloads-remove` before minting (finite safe integers, at most `DOWNLOAD_HISTORY_CAP` of them, sorted unique) and refuses anything else, so the slot never holds a shape `sameAction` was not written for. Binding the ids is what keeps the consent an authorization rather than a capability, the reason `purge-one` carries its service.

`src/main/lib/download-rules.ts`:

```ts
export const DOWNLOAD_HISTORY_CAP = 200;
/** What comes back from disk is data: exact shape, known service, state in
 *  saved | failed (a downloading row cannot survive quit), finite numbers,
 *  string name and path, name clipped; newest DOWNLOAD_HISTORY_CAP kept. */
export function restoreRecords(raw: unknown, known: ReadonlySet<ServiceId>): DownloadRecord[];
/** the rows the file holds: ended records only */
export function persistable(records: readonly DownloadRecord[]): DownloadRecord[];
```

`DownloadRecord` and `DownloadView` keep their shapes; `missing` is still decided at fetch against the disk, so a row from last week whose file has gone reads "moved or deleted since" — the cross-session case that makes the history worth keeping.

## The history store

`src/main/download-history.ts`, in `PinStore`'s shape and with the same `Conf` and `KeyCodec`:

```ts
interface DownloadsFile { sealed?: string; downloads?: DownloadRecord[] }
export class DownloadHistoryStore {
  constructor(cwd: string, codec: KeyCodec | null);
  /** restoreRecords over the opened file; [] when unreadable or absent */
  load(): DownloadRecord[];
  /** persistable(records) sealed (or plain with no codec); a no-op while unreadable */
  save(records: readonly DownloadRecord[]): void;
  storage(): DownloadStorage;
}
```

`{ sealed }` is the codec's output over `JSON.stringify({ downloads })`; `{ downloads }` is the plaintext written when no keychain is available and re-sealed at construction on a launch that has one. A sealed file the codec rejects sets `unreadable`: `load()` returns nothing, `save()` writes nothing, and the next launch that can open it gets it back — so this session's downloads are recorded in memory only that launch, which the pane's band says. No `downloads: []` default, for the reason `PinStore` gives: a fresh profile must not look like a legacy file.

`index.ts` constructs it beside `PinStore` with the same `pinCodec`, notes `[downloads] history stored unencrypted: the OS keychain is unavailable` when the codec is null, and `[downloads] history unreadable: sealed file, keychain would not open it` when the store says so.

## The manager

`DownloadManager` gains one dep, `history: { load(): DownloadRecord[]; save(records): void; storage(): DownloadStorage }`, and three more: `isDirectory(path): boolean`, `openFolder(path): void` (`shell.openPath`) and `note(line): void` (`ctx.diag.note('downloads', …)`). It loads at construction and sets `nextId` past the highest restored id.

`persist()` calls `history.save(records)` whenever the set of **ended** records changes: a finish that lands `saved` or `failed`, an eviction in `handle`, a remove, a clear, a restore. Never on `updated`, never on a `downloading` insert, never at quit — there is nothing to flush that a finish has not already written.

New methods for the handlers:

- `remove(ids): number` — deletes the ended records named, ignores an in-flight or unknown id (Cancel is the in-flight control), parks the removed rows as `lastRemoved` for one Undo, persists, returns the count.
- `clear(): number` — the same for every ended record.
- `restore(): number` — puts `lastRemoved` back once, evicting per `historyEvict` if that would exceed the cap, persists.
- `openFolder(): boolean` — `dir = settings().dir ?? defaultDir()`; `openFolder(dir)` only when `isDirectory(dir)`.
- `recent(): { rows: DownloadView[]; storage: DownloadStorage }`.
- `cancel(id)` additionally marks the item user-cancelled so `finish` can note `[downloads] cancelled by user: <service>`; a cancel from `detach`, `dispose` or a dismissed Save dialog notes nothing. Cancelled downloads still leave no row.

## IPC

| Channel | Kind | Guard | Body |
| --- | --- | --- | --- |
| `downloads:remove { ids }` | send | `downloads-remove` (ids) | validate and normalise ids; `authorized()`; `remove(ids)`; note `history: removed n rows` |
| `downloads:clear` | send | `downloads-clear` | `authorized()`; `clear()`; note `history cleared (n rows)` |
| `downloads:restore` | send | none | `restore()`; note `history: restored n rows` |
| `downloads:openDir` | send | none | `openFolder()` |
| `downloads:recent` | invoke | none | now returns `{ rows, storage }` |
| `passkeys:forget { id }` | invoke | `passkey-forget` (id) | `authorized()` else return the unchanged views; on success note `[passkey] forgot <rpId>` |

All of the download channels join `SHELL_ONLY_CHANNELS` and stay out of `LOCKED_ALLOWED_CHANNELS`, so a service page reaches none and a locked app removes, restores, opens and lists nothing. Every id is validated as a finite safe integer before the map lookup; an unknown id is a silent no-op, as today.

`authorized()` itself gains the recording half: when the guard is on and a consent is spent it notes `[lock] <kind> authorized` (with the service for `purge-one`, the count for `downloads-remove`), and when it refuses for want of one it notes `[lock] <kind> refused: no consent`. When the guard is off the handler still performs and the action's own line (below) still records it.

`applySettingsPatch` gains two things at its top. It **drops `appLock`** from any patch that carries it and notes `[ipc] settings:update carried appLock; dropped` — finding 1; `lock:configure` writes through `LockController.persist`, which calls `settings.update` directly and is unaffected. And it compares `patch.downloads` with the current block: a changed `dir` notes `[downloads] folder changed` or `folder reset to the OS default` (no path), a changed `ask` notes `[downloads] mode: ask` or `mode: save to folder`. `settings:export` notes `[app] settings exported` on success and `settings:import` notes `[app] settings imported (n keys)`.

## Recording the lock

`LockController` gains a `note?(line): void` dep that `index.ts` wires to `diag.note('lock', …)`. Lines, composed from methods, kinds and counts only:

- `unlocked (passcode)` / `unlocked (touch id)`; `unlock refused: wrong passcode (n failures)`; `unlock refused: touch id cancelled`; `unlock throttled`.
- `consent granted: <kind>`; `consent refused: <kind>, wrong passcode (n failures)`; `consent refused: <kind>, touch id cancelled`.
- `configured: enabled` / `disabled` / `passcode changed` / `touch id on|off` / `guard on|off`; `configure refused: wrong passcode`.

And the performed actions the guard used to let pass unrecorded, each noted by its handler whether or not a credential was asked: `[app] summoned: <ids>` (from `applySettingsPatch`, the same `summonedIds` line), `[app] purged login: <id>`, `[app] purged all logins (n)`, `[passkey] forgot <rpId>`. Nothing here names a file, a title or a person; an rpId is a host.

## Surface

**Settings → Downloads** keeps its two cards.

The folder row is rebuilt for balance (2026-09-23, user decision, after a live look at a long path): the **Folder** label with the hint "Where files a chat sends you land." and, on the same line, two equal buttons — **Open folder** (`downloads-open-dir`) and **Choose…** — then the path on its own full-width line beneath (`downloads-dir`, clipped with a `title` when it still overflows) with "Use Downloads folder" (`downloads-reset`) inline after it while a custom folder is set. Open folder stays enabled under Always ask, since a dialog accepted with its default still lands there. The first cut put the path in the label's column, where a long one wrapped to three lines and squeezed three controls into each other.

The list card is now rendered whole by `DownloadsPane`, header included, because the header carries state; `SettingsView` stops wrapping it in `Pane`. Its header reads **History · n files**, and ends with a quiet **Clear all…** link (`downloads-clear`) that is hidden while there is no ended row. The old hint "Click a file to show it in Finder" is gone (2026-09-23, user decision, after a live look): the row's hover ghost and `title` carry it. Under the guard, Clear all… opens the same card for `downloads-clear`; otherwise it clears at once.

A **search field** (`downloads-search`, "Search files…") is the card's first row whenever there are rows (2026-09-23, user request). It narrows by file name and service name, case-insensitive substring, through `shared/download-filter.ts` (`normalizeDownloadQuery`, `matchesDownloadQuery`) — renderer state only, never persisted, cleared with the pane. Both sides are NFC-normalised before comparing: macOS writes a file name decomposed (`e` + U+0301) while a keyboard types the composed `é`, so `té` found nothing in `tét.jpeg` until it was (2026-09-23, reported live). While it narrows, the header reads **History · n of m files**, the whole-list action becomes **Remove n shown…** (`downloads-remove-shown`, a `downloads-remove` bound to the shown ended ids, guarded like any remove) and an empty result reads "No files match." (`downloads-no-match`). Changing the query clears the selection, so rows ticked under one search are never removed under another. Escape with text clears the field and stops there; empty, it reaches Settings as anywhere else.

Rows (`download-row`, `data-state`) in `historyViews` order, in flight first then newest:

| State | Gutter | Body click | Right side |
| --- | --- | --- | --- |
| `downloading` | empty slot, for alignment | none | `<pct>%` and **Cancel** (`download-cancel`), as today |
| `saved` | checkbox (`download-select`) | reveal (`download-reveal` on the body; pointer cursor; a "Show in Finder" ghost at the right on hover) | — |
| `failed` | checkbox | none | `—` |
| `missing` | checkbox; row dimmed, name struck | none | `—` |

Ticking any box swaps the header line's right side for the **selection state** (`downloads-selection`): "n selected", **Remove from list** (`downloads-remove`), **Cancel** (`downloads-remove-cancel`, clears the selection), as text actions at the header's own size, so the header's height does not change and no row moves under the pointer (the first cut put a bar inside the card and pushed the list down — rejected on a live look, 2026-09-23). Under the guard, Remove opens the `CredentialConfirm` in a **card anchored under the header's right side** (`downloads-ask`, absolutely positioned, floating over the first rows), with `action: { kind: 'downloads-remove', ids }` and the copy "Prove it's you to remove n files from the list. The files themselves stay where they are."; it appears beside the control that opened it, moves neither the list nor the scroll, and Cancel or Escape (captured, so Settings does not close beneath it) dismisses it. `onVerified` sends `downloads:remove { ids }`. The foot of the card was tried first and rejected on a live look with 200 rows: it sat 40 screens away. With no guard, Remove sends at once. The selection is renderer-local — a set of ids — and clears on Cancel, on a completed removal and when the pane unmounts. There is no select-all; Clear all… is that case.

After a removal or a clear, the header line's right side shows the **Undo state** (`downloads-undo`) for `TOAST_MS`: "n files removed from the list. Undo", the Passkeys pattern moved to where the selection state lives. The line carries the toasts' clock (2026-09-24, user request): a thin accent bar beneath it drains over `TOAST_MS`, and hovering or focusing the line banks the remainder, as the pin toast does — including a pointer already resting on the line when it appears (Remove was clicked where Undo now sits, so it never enters; the hook reads `:hover` at mount and pauses on any movement inside, not only on enter) — `useToastTimer` and `ToastDrain` in `components/toast-timer.tsx`, the one copy of that machinery outside the toast cards. Undo sends `downloads:restore` and refetches. On that line a selection replaces everything; otherwise the pending Undo and the whole-list action (Clear all… or Remove n shown…) sit side by side behind a hairline, so Clear all… never waits out an Undo's 8 s (2026-09-24, user decision — the first cut ranked Undo above it). Undo stays single-level: a Clear all… inside the window parks the cleared rows and the earlier batch is gone for good, as in Finder. Nothing transient renders inside the card, so rows never shift and nothing lands out of view. A **band** (`downloads-band`) above the list when `storage` is not `sealed`: "Goetia cannot read its download history on this device. The file is sealed to a keychain this launch cannot open; it is kept as it is, and downloads this session are not being recorded." or "History is kept unencrypted on this device. The OS keychain is unavailable." The band is present from first paint, so it never appears mid-use. The empty state drops "this session": "Nothing downloaded yet. Files a chat sends land in `<folder>`." The 1 Hz poll while a row is downloading is unchanged, and each mutation refetches once.

**Settings → Passkeys**: under the guard, **Forget** opens the inline `CredentialConfirm` beneath its row with `action: { kind: 'passkey-forget', id }` and the copy "Prove it's you to forget the passkey for `<rpId>`."; `onVerified` invokes `passkeys:forget`. The Undo row is unchanged and never asks.

**Settings → Lock**: the guard row reads "Ask before summoning a service, purging a login or removing download history", and its hint gains "Removing history erases the record of what was downloaded."

**Settings → Shortcuts**: the Downloads line reads `⇧⌘D — downloads: your files`.

## Guard audit

The sweep covered every renderer channel, the app and tray menus, the tile and page context menus and the main-side prompts, against two tests: is the action recorded where its author cannot erase it, and is its destructive or exposing direction guarded.

| Action | Recorded | Guarded | Verdict |
| --- | --- | --- | --- |
| Summon (Home commit, settings import) | no → `[app] summoned` | yes | record |
| Purge one / purge all | no → `[app] purged …` | yes | record |
| Lock configure, unlock attempts, consent refusals | no → `[lock]` | passcode only | record |
| `settings:update` carrying `appLock` | no → `[ipc]` | **no → key dropped** | **fix** |
| Passkey forget | no → `[passkey] forgot` | no → `passkey-forget` | guard and record |
| Download history remove / clear | this spec | this spec | — |
| Download folder or mode change | no → `[downloads]` | no, by decision | record |
| Download cancel | no → `[downloads] cancelled by user` | no | record |
| Settings import / export | no → `[app]` | summon only | record |
| Pin Done / unpin | no | no, Undo | leave: the pin's daily action, and pins are visible to anyone at the unlocked app |
| Banish, reorder, mute, quiet hours, shortcuts, zoom | no | no, by 2026-09-13 | leave |
| Passkey create, Facebook identity seed | `[passkey]`, `[identity]` | Touch ID or confirm each time | holds |
| Diagnostics | is the record | no Clear | holds |

## Testing

- `tests/unit/download-filter.test.ts` — `normalizeDownloadQuery` trims and lower-cases; `matchesDownloadQuery` on the file name and the service name, case-insensitively, and everything on the empty query.
- `tests/unit/download-rules.test.ts` — `restoreRecords`: a malformed item, an unknown service and a `downloading` row are dropped, the name is clipped, the newest 200 are kept, ids survive; `persistable` holds ended rows only; `historyEvict` at the new cap.
- `tests/unit/download-history.test.ts` (new) — seals with a codec and writes plaintext without one; a sealed file the codec rejects reports `unreadable`, loads nothing and refuses to write; a plaintext file is re-sealed when a codec is present; a `downloading` record never reaches the file.
- `tests/unit/downloads.test.ts` — the store is written on finish, eviction, remove, clear and restore and never on `updated`; `remove` skips an in-flight id and returns the count; `restore` works once; `openFolder` runs only for a directory; `recent` carries `storage`; a user cancel notes and a detach cancel does not.
- `tests/unit/lock-consent.test.ts` — `sameAction`: `downloads-remove` is order-insensitive and deduplicated, two ids refuse three, `downloads-clear` and `passkey-forget` match only themselves; the controller notes each granted and refused consent.
- `tests/unit/lock-controller.test.ts` — unlock success, wrong passcode and configure lines; `guard off` noted.
- `tests/unit/ipc-sender-policy.test.ts`, `tests/unit/lock-ipc-policy.test.ts` — `downloads:remove`, `clear`, `restore`, `openDir` refused from a service frame and while locked.
- `tests/unit/guard-policy.test.ts` — `normalizeRemoveIds`, `normalizeAction` and `stripAppLock`: the handlers' decisions, extracted because vitest has no electron mock; the handler wiring (`downloads:remove` and `clear` refusing without a consent, `passkeys:forget` the same, `applySettingsPatch` dropping `appLock`) is verified by typecheck and the e2e specs.
- `tests/unit/settings-backup.test.ts` — unchanged, and the reason finding 1 mirrors it is stated there.
- `tests/e2e/downloads.spec.ts` — the rows survive a relaunch (the `diagnostics.spec.ts` relaunch) and `downloads.json` holds no filename in clear; a file deleted between launches reads "moved or deleted since"; tick two rows, Remove, they are gone, Undo, they are back; Clear all…; with a lock configured and the guard on, Remove asks, a wrong passcode leaves the rows and the right one removes them (the `guarded-actions.spec.ts` shape); a saved row's body carries the reveal control (the click itself is unit-tested against `deps.reveal`, since an e2e click would open Finder on the test machine); the Diagnostics pane shows the `[downloads] history: removed` and `[lock]` lines.
- `tests/e2e/lock.spec.ts` — a `settings:update` carrying `appLock` from the shell leaves the lock as it was.
- `tests/e2e/passkeys.spec.ts` — under the guard, Forget asks before it forgets, on the passkey the first test mints live.
- Manual (`docs/FEATURES.md`): Open folder opens Finder on the folder; Touch ID on the inline confirm.

## Documentation

- `CLAUDE.md`: the Downloads bullet loses "in memory" and "never Clear" — history persists sealed at 200, Remove and Clear are guarded actions, never Open stands, Open folder is the one directory-only `openPath`; the guarded-actions material gains the three new kinds, the rule that `settings:update` never writes `appLock`, and the rule that every guarded or destructive action notes itself.
- `docs/FEATURES.md`: the Downloads, Passkeys, App lock and Diagnostics rows.
- `2026-09-23-downloads-pane-design.md`: strike "In memory, this session only" and "never Clear" with a superseded note pointing here, as the 2026-09-18 spec was amended. `2026-09-13-guarded-actions-design.md`: a note that the set of guarded actions grew here.

## Out of scope

- Guarding the folder change (recorded only — user decision); guarding pin Done; a select-all or shift-click range; a `cancelled` row state; a time-based expiry; per-service folders; opening a file.
- Gating the shell's devtools in a packaged build: main-side enforcement is the line, and finding 1 restores it where it was missing.
- Hashing or signing the Diagnostics ring against edits from outside the app.
