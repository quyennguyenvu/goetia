# Settings backup and restore — design

Date: 2026-09-22. Status: approved in brainstorm (user decision, same day); not implemented. Scope: export Goetia's preferences to a JSON file and import them back from Settings → General. Preferences only — never a login, a pin, a passkey or the lock.

## Problem

Moving to a new Mac, or reinstalling, means rebuilding the rail order, the mutes, quiet hours, zoom levels and the rest by hand. `settings.json` holds all of it, but it also holds moments (`lastUsedAt`, `mutedUntil`), the remembered surface and the lock's switches, none of which belong on another machine, and copying the file by hand is not something Goetia should ask of anyone.

## Decisions

- **A file, chosen through the native Save and Open dialogs.** The dialog is the consent: nothing is written or read without the user naming the file. Default name `goetia-settings-<YYYY-MM-DD>.json` in Documents.
- **Preferences only — an allowlist, not a denylist.** `BACKUP_KEYS` names exactly what travels: `order`, `muted`, `disabled`, `globalMuted`, `notificationSound`, `neverHibernate`, `zoom`, `hibernationMinutes`, `autoBanish`, `lightSleep`, `peekSaver`, `shareFacebookLogin`, `downloads` (its `ask` only — a folder path is this machine's), `quietHours`, `summonHotkey`, `closeToTray`, `launchAtLogin`, `theme`, `railPosition`, `checkForUpdates`. Left behind on purpose: `mutedUntil`, `globalMutedUntil`, `lastUsedAt`, `quietOverrideWindowStart` (moments); `lastActiveId`, `lastHomeOpen`, `lastNotifiedVersion` (this session's state); `appLock` (its passcode lives in `lock.json` and stays; restoring `enabled` without it would be a lockout, and `guardActions` is a security switch that should be set knowingly). A key added to `Settings` later is not exported until someone adds it to the list.
- **The file is data.** Import parses it, keeps only allowlisted keys, type-checks every scalar (a wrong-typed boolean, an unknown theme or a non-positive `hibernationMinutes` is dropped, not defaulted) and runs the records through the same `normalize` the store applies at boot — so a corrupt or hand-edited file can restore nothing the UI could not have set. A file that is not JSON, not a Goetia backup (`format !== 'goetia-settings'`), larger than `BACKUP_MAX_BYTES`, or empty of known keys is refused with a reason the row shows.
- **Import runs the ordinary settings tail.** The `settings:update` handler's body becomes `applySettingsPatch(ctx, patch)`, and import calls it — so summoning stamps `lastUsedAt`, banishing destroys views, the hotkey re-registers, quiet hours re-arm, `launchAtLogin` reaches the OS — plus the tails that handler never needed because the UI moves them elsewhere: the app menu (order), page zoom on live views, page audio and both menus for mutes (through `quietScheduleChanged`, whose side effects are exactly those).
- **The guard holds.** An import whose `disabled` would summon a service is a summon, and with `guardActions` on it needs the same consent Home asks for. Main answers `guarded` and parks the parsed patch for `IMPORT_PENDING_MS`; the row shows `CredentialConfirm` for `{ kind: 'summon' }`, and on verification re-invokes with `retry: true`, which applies the parked patch without a second dialog. Cancelling drops it.
- **No confirm dialog on import.** The Open dialog already asked; a second question would be the modal the user's preferences reject. The row reports the outcome inline for a few seconds (`Saved to …`, `Restored from …`, `Not a Goetia settings file`), the pattern Diagnostics' Copy button uses.
- **Shell-only, refused while locked.** `settings:export` and `settings:import` are invoke channels on the shell-only list; a locked app writes and reads nothing.
- **e2e seam**: dialogs cannot be driven, so under `--goetia-e2e` the env `GOETIA_E2E_BACKUP_PATH` stands in for both dialogs. Never read outside the e2e flag.

## Data

```ts
// lib/settings-backup.ts
export const BACKUP_FORMAT = 'goetia-settings';
export const BACKUP_VERSION = 1;
export const BACKUP_MAX_BYTES = 1_000_000;
export const BACKUP_KEYS: readonly BackupKey[];
export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  app: string;        // Goetia version that wrote it
  exportedAt: string; // ISO
  settings: Pick<Settings, BackupKey>;
}
export function buildBackup(s: Settings, app: string, now: Date): BackupFile;
export function backupFileName(now: Date): string; // goetia-settings-2026-09-22.json
export type ParseFailure = 'not-json' | 'not-goetia' | 'too-large' | 'empty';
export function parseBackup(text: string): { ok: true; patch: Partial<Settings> } | { ok: false; reason: ParseFailure };
```

`SettingsStore.sanitize(patch)` runs `normalize` over defaults plus the patch and returns only the patch's keys, so what reaches the file on disk is already the shape the store would coerce it to.

## IPC

```ts
'settings:export': { result: { ok: true; path: string } | { ok: false; reason: 'cancelled' | 'write-failed' } };
'settings:import': {
  payload: { retry: boolean };
  result: { ok: true; path: string } | { ok: false; reason: 'cancelled' | 'read-failed' | 'guarded' | ParseFailure };
};
```

## Surfaces

Settings → General gains a `Backup` row (hint `Preferences only — never logins, pins or passkeys.`) with `Export…` and `Import…`; a status line under the row for `BACKUP_STATUS_MS`; when import answers `guarded`, `CredentialConfirm` renders in the row's place until verified or cancelled.

## Testing

- `settings-backup.test.ts` — `buildBackup` carries exactly `BACKUP_KEYS`, no moment or lock key, `downloads.dir` null, the header; `backupFileName`; `parseBackup` refuses non-JSON, a non-Goetia object, an array, an oversize text and a file with no known keys; drops a mistyped boolean, an unknown theme and a zero `hibernationMinutes` while keeping the valid keys beside them; ignores `appLock`, `lastActiveId` and `mutedUntil` in the file; forces `downloads.dir` to null.
- `settings.test.ts` — `sanitize` coerces a corrupt zoom, drops an unknown id from `order`, and returns only the patch's keys.
- `ipc-sender-policy.test.ts`, `lock-ipc-policy.test.ts` — both channels shell-only and refused while locked.
- `tests/e2e/settings-backup.spec.ts` — profile A exports to `GOETIA_E2E_BACKUP_PATH` (the file holds `format`, no `lastActiveId`); profile B, with a different rail order and theme, imports it: the rail shows A's order, `settings.json` holds A's theme, and B's own `lastActiveId` is untouched.

## Out of scope

- Automatic or scheduled backups; cloud sync.
- Exporting logins, pins, passkeys or the lock — by design, not by omission.
