# Pins encrypted at rest — design

Date: 2026-09-23. Status: implemented 2026-09-23. Scope: `pins.json` becomes a `safeStorage`-sealed envelope, read and written by `PinStore` alone. Nothing about what a pin is, how it is captured, ordered, opened or shown changes.

## Problem

`pins.json` is the one place Goetia writes conversation content to disk, and it is plaintext: every pinned message, its note and the thread it came from, readable by anything that can read the profile directory — a Time Machine or iCloud copy, a disk read without the login session, another account on the machine. The 2026-08-25 pins spec rejected encrypting it because, under ad-hoc signing, every rebuild re-prompts for the keychain item safeStorage uses. That cost has since been paid twice over: `passkeys.json` (2026-08-30) and `lock.json` (2026-09-09) rest under safeStorage, and `enableCookieEncryption` opens the very same `Goetia Safe Storage` item at every boot. Sealing the pins adds no prompt the app does not already raise.

## Threat model

The key is the OS login keychain (DPAPI on Windows, libsecret on Linux), the tier the session cookies and the passkey private keys already rest under, and it carries exactly their limits:

- **Defends against** a copy of the profile directory read anywhere but this login session: backups, a cloned disk, another user account, forensics without the keychain. A copied `pins.json` yields nothing on another machine.
- **Does not defend against** a process running as this user, which decrypts through the login keychain as freely as Goetia does — the same honest limit the passkeys spec and the app-lock spec state. The app lock is a screen guard and stays one; this design does not touch it, and the passcode is not the key (a passcode-derived key would make a forgotten passcode destroy the todo list, and a user with no passcode would get no protection at all).
- **New failure mode:** a sealed file the keychain will not open on some boot — a denied prompt, a profile copied between machines. The store must never turn that into an overwrite: a keychain hiccup on one boot cannot be allowed to erase pins the next boot would have read.
- **A legacy plaintext file is still read.** Refusing it would protect nothing — whoever can write the file could write a sealed one just as well — and reading it is what migrates every existing install silently.

Rolling back to a build older than this one reads `{ sealed }` as an empty board and overwrites it on the first click. Releases only go forward; noted, not defended.

## Decisions

- **Whole-file envelope** (approach A of 3). The file becomes `{ "sealed": "<base64>" }`, one `safeStorage.encryptString` of the pins JSON. Per-field encryption (text, note, conversation sealed; ids and hrefs plain) was rejected: more code, and a Slack or Discord href names the thread anyway. Encrypting only while the app lock is on was rejected for the reasons in the threat model.
- **Migrate on load, silently.** A file in the old `{ pins: [...] }` shape is parsed exactly as today and re-saved sealed at once, before any window opens, so the plaintext leaves the disk without waiting for a click. Nothing is announced: the user asked for nothing and lost nothing.
- **Unreadable fails safe, not silently.** A `sealed` string that will not decrypt leaves the file untouched; the store reports an empty board and refuses every write. Two things say why: one Diagnostics line at boot, and a sentence on Home's Pinned band. This deliberately differs from `PasskeyStore`, which sets a corrupt file aside and starts fresh — a corrupt file can never come back, an undecryptable one usually can on the next boot, so it is kept in place for that boot to read.
- **No keychain, no seal.** When `safeStorage.isEncryptionAvailable()` is false at boot (a Linux box without a keyring) the store is handed no codec and keeps today's plaintext shape for both load and save, and one Diagnostics line says the pins are stored unencrypted. A half-working store is worse than an honest one, the same rule the passkey shim follows.
- **The codec moves.** `KeyCodec` and `safeStorageCodec` leave `src/main/passkeys/` for `src/main/codec.ts` now that three stores share them; the interface is unchanged. Tests keep handing in the reversible fake from `passkey-store.test.ts`.

## Data

```ts
// src/main/codec.ts — moved verbatim from passkeys/store.ts + passkeys/codec.ts
export interface KeyCodec { encrypt(plain: string): string; decrypt(cipher: string): string }
export function safeStorageCodec(): KeyCodec;

// pins.json, on disk — one of the two keys, or neither on a fresh profile
interface PinsFile {
  sealed?: string; // the codec's output over JSON.stringify({ pins })
  pins?: Pin[]; // legacy plaintext, and the shape written with no codec
}
```

`PinStore` gains a second constructor argument, `codec: KeyCodec | null`, and one flag, `unreadable: boolean` (read through `isUnreadable()`).

Load, in order:

1. `store.sealed` is a string → `codec.decrypt`, `JSON.parse`, `parsePins(parsed.pins)`. Any throw → `unreadable = true`, `pins = []`, and the file is not written. With no codec and a `sealed` string present the same applies: the file cannot be read on this machine.
2. Else `store.pins` is an array → `parsePins` as today; then, when a codec is present, `save()` immediately (the migration).
3. Else → empty board; nothing written until the first pin, as today.

`save()` writes `{ sealed: codec.encrypt(JSON.stringify({ pins })) }` with a codec, `{ pins }` without one, and is a no-op that returns early while `unreadable` — reached only if a caller ignores the guards below. `isFull()` returns true while `unreadable`, so `pinsFull()` disables the context-menu item and `pin()` returns null; `unpin`, `restore`, `setNote` and `reorder` all return false while `unreadable`, since the board they would edit is empty anyway.

`conf` keeps `clearInvalidConfig: true` and its `defaults` become `{}`: a missing file and a file that is not JSON both land on rule 3 — an empty board, nothing written until the first pin — exactly as today. Defaults of `{ pins: [] }` would make a fresh profile look like a legacy file and write a sealed empty envelope at every first boot.

## Surface

`ShellState` gains `pinsUnreadable: boolean` (false while locked, like `pins` is emptied). Home's Pinned band, when it is true, replaces the empty-state sentence with: `Your pins can't be read right now — Goetia couldn't open its keychain entry. They come back on a launch where it can; to start over, remove pins.json from the profile folder.` Nothing else in the band changes; the tally pill is absent, as it is for any empty board.

Two Diagnostics lines, tag `app`, once each at boot and only when they apply: `pins.json is sealed but could not be decrypted; pins are read-only until a launch where the keychain opens (remove the file to start over)`, and `pins stored unencrypted: the OS keychain is unavailable`. Neither carries content.

## Wiring

`index.ts` constructs `new PinStore(app.getPath('userData'), safeStorage.isEncryptionAvailable() ? safeStorageCodec() : null)` after `diag` exists and notes the line the store's state calls for; `MainState.snapshot` gains a `pinsUnreadable` parameter beside `pins`, fed from `pins.isUnreadable()` in `broadcast()`. `lock.ts`, `passkeys/store.ts`, the passkey authenticator wiring and the four tests that import `KeyCodec` or `safeStorageCodec` repoint at `src/main/codec.ts`; `passkeys/codec.ts` is deleted.

## Testing

- `tests/unit/pins.test.ts` — every existing case runs with the fake codec; new cases: a fresh store's file has a `sealed` key and its bytes contain neither the pin text nor the note; a legacy `{ pins }` file loads and is rewritten sealed by the constructor alone, with the same views after; a sealed file round-trips across two store instances; a `sealed` value the codec rejects yields an empty board, `isUnreadable()` and `isFull()` true, `pin` null, every mutation false, and the file bytes byte-for-byte unchanged afterwards; a `sealed` file opened with a null codec is likewise unreadable and untouched; a null codec writes and reads the plaintext shape exactly as today; a file that is not JSON still yields an empty board.
- `tests/unit/state.test.ts` — `snapshot` carries `pinsUnreadable`, and forces it false while locked.
- `tests/unit/passkey-store.test.ts`, `lock-store.test.ts`, `lock-consent.test.ts`, `lock-controller.test.ts` — import paths only.
- `tests/e2e/pins.spec.ts` — the seeded plaintext file is the migration oracle: after the first launch settles, read the file back and assert it has a `sealed` key and no longer contains the seeded pin text; the existing relaunch test already proves the sealed file decrypts under Playwright (as `lock.spec.ts` proves for `lock.json`). One new test seeds `{ "sealed": "not a real blob" }`, launches, and asserts Home shows the unreadable sentence, the tally pill is absent, and the file bytes are unchanged after the launch.

## Out of scope

- Encrypting `settings.json`, `diagnostics.json` or the in-memory activity log.
- A recovery flow beyond the documented removal of `pins.json`; migrating pins between machines.
- Any change to the app lock, or any coupling between the lock and the pins' key.
