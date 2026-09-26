# Diagnostics records the unusual only — design

Date: 2026-09-26. Status: approved 2026-09-26 (user decision). Scope: the Diagnostics ring stops recording routine successes and the peek cadence, keeps every refusal, failure, transition and harm-capable action, and the rule that decides which is which is written down. Amends `2026-09-19-diagnostics-pane-design.md` (the ring), the recording half of `2026-09-13-guarded-actions-design.md` and `2026-09-23-download-history-design.md`, and one line of `2026-09-25-guard-groups-design.md`; read the 2026-09-19 and 2026-09-23 specs first.

## Problem

The ring was built as the record of "what Goetia noticed going wrong" — the pane's own copy and the README both say so — and the 2026-09-23 guard audit added to it the actions that harm the user if someone else performs them. Two days of use showed that it had also picked up lines that are neither.

- **Every hibernation peek writes two lines**, `<id> peek started` and `<id> peek ended: report`. Eight sleeping services on the ten-minute cadence produce about 96 lines an hour, so the 200-line ring holds roughly two hours. A morning's `[nav] contained:` is rotated out by lunch, which defeats the 2026-09-20 amendment that restores the ring at boot so a report still holds the session before it.
- **A guarded action writes three lines**: `[lock] consent granted: <kind> (<method>)`, `[lock] <kind> authorized`, then the action's own line (`[app] summoned: …`, `[downloads] history: removed n rows`). The first two say the same thing as the third.
- **Successes with no failure to explain**: `[lock] unlocked (touch id)` on every unlock, `[passkey] asserted rp=…` on every passkey sign-in, `[passkey] created rp=…` when Settings → Passkeys already lists the passkey, `[downloads] history: restored n rows` for an Undo that is never guarded, `[downloads] cancelled by user: <id>` for the user's own cancel, and `[app] settings exported` for a read.

None of these is evidence of anything, and each one pushes a line that is out of the ring sooner.

## Threat model

Unchanged from 2026-09-19 and 2026-09-23, with one clarification. The ring is still the record the author of a harmful action cannot erase: it still has no Clear, and every harm-capable action the 2026-09-23 audit named stays in it (`settings exported`, which that audit also named, is a read and leaves). What leaves is the **grant** of a credential, never the **refusal**: `refused: no consent` is someone asking for a guarded action without the credential, `unlock refused` and `consent refused` are a wrong passcode or a cancelled Touch ID, and `throttled` is a scripted loop being held off. Those are the abnormal case and stay. The grant is the normal case, and the action it granted writes its own line.

**Does not defend against:** the same things as before. Removing the cadence lines makes the flood the 2026-09-23 spec worried about slower, not possible.

## Decisions

- **The rule** (user decision, option 1 of 3): a ring line is either something going wrong, or an action that would harm the user if they were not its author. Never a success, never a cadence. A refused guarded action is abnormal and notes; a granted one does not, because the action's own line records it. This line goes into CLAUDE.md beside the ring's other four rules.
- **The audit stays** (user decision). The alternative, a ring of problems only, would have reversed the 2026-09-23 "recorded where its author cannot erase it" decision; declined. `summoned`, `purged login(s)`, `history: removed` and `history cleared`, `forgot <rpId>`, `folder changed` and `mode: …`, and every `configured: …` line stay, as does `settings imported (n keys)`: an import writes where an export reads.
- **Dropped lines are deleted, not demoted** (user decision, over a console-only path). A second sink beside the ring is a second truth, and the peek cadence already prints under `GOETIA_DEBUG_PEEKS` for whoever wants it. The console mirror of the ring itself is unchanged: a dev run still prints every line the ring records.
- **No mechanism.** No severity field on `DiagEntry`, no default filter in the pane, no second ring, no tag change. `peek` keeps its tag for the timeout line. The fix is ten fewer `note` calls and the rule that keeps them from coming back.

## Lines

Leaving the ring:

| Emitter | Line | Why it is noise |
| --- | --- | --- |
| `hibernation.ts` `beginPeek` | `<id> peek started` | cadence |
| `hibernation.ts` `endPeek` | `<id> peek ended: report` | cadence |
| `lock.ts` `unlock` | `unlocked (<method>)` | a success |
| `lock.ts` `consent` | `consent granted: <kind> (<method>)` | a success; the action's line follows |
| `ipc-handlers.ts` `authorized()` | `<kind> authorized` | a success; the action's line follows |
| `ipc-handlers.ts` `settings:export` | `settings exported` | a read; nothing secret leaves |
| `ipc-handlers.ts` `downloads:restore` | `history: restored n rows` | the safe direction, never guarded |
| `downloads.ts` `finish` | `cancelled by user: <id>` | the user's own cancel |
| `passkeys/authenticator.ts` `create` | `created rp=<rpId> via=<id>` | Settings → Passkeys lists it |
| `passkeys/authenticator.ts` `get` | `asserted rp=<rpId> via=<id>` | every sign-in |

Staying, grouped by the rule's two halves:

- **Going wrong**: `[recipe] stale` and `recovered` and `ready() never matched`; `[view] crashed`, `load failed` and `recovered`; `[peek] <id> peek ended: timeout`; `[nav] contained`, `popup denied` and `popup contained`; `[open] miss`; `[notifications] <err>`; `[downloads] banner: <err>`; `[ipc] handler failed` and `settings:update carried appLock; dropped`; `[identity]`'s one warning; the keychain notices for pins, history and recents; `[lock] unlock refused`, `unlock throttled`, `consent refused`, `consent throttled`, `configure refused` and `<kind> refused: no consent`.
- **Harm if not the user**: `[app] summoned`, `purged login`, `purged all logins`, `settings imported`; `[downloads] history: removed`, `history cleared`, `folder changed`, `folder reset to the OS default`, `mode: ask`, `mode: save to folder`; `[passkey] forgot <rpId>`; `[lock] configured: …`.
- **The session boundary**: `[app] started <version>`, one per launch.

## Code

`src/main/hibernation.ts`: `beginPeek` loses its note. `endPeek` keeps `reason?: 'report' | 'timeout'` — the quiet-streak accounting still keys on `destroy` — and notes only when `reason === 'timeout'`, with the page as today. The doc comment says a timeout is the one peek line.

`src/main/lock.ts`: the `unlocked (…)` and `consent granted: …` notes go. `LockDeps.note` stays for the refusals, the throttles and `configured: …`; its doc comment says so.

`src/main/ipc-handlers.ts`: `authorized()` notes only the refusal, `<kind> refused: no consent`, and its comment says a grant is recorded by the action's own line. `settings:export` and `downloads:restore` lose their notes.

`src/main/downloads.ts`: the `note` dep and the `cancelled by user` line go; `userCancelled` and `cancel(id)`'s marking go with them, since the note was the only reader (a cancelled download already leaves no row and no banner either way). `index.ts` drops the `note:` wiring.

`src/main/passkeys/authenticator.ts`: the `log` dep and both `this.deps.log(…)` calls go; `index.ts` drops the `log:` wiring and its "prefixes its own tag" comment.

Nothing else moves. `Diagnostics`, `DiagTag`, `diag-filter.ts`, the pane and both channels are untouched.

## Testing

- `tests/unit/hibernation.test.ts`: two new cases on the harness's `diag.note` (a `vi.fn()` in place of the no-op): a peek that ends on the service's report notes nothing; a peek that times out notes once, `[peek]`, `<id> peek ended: timeout`, with the service id.
- `tests/unit/lock-controller.test.ts`: the `unlocked (touch id)` and `unlocked (passcode)` expectations go; the refusal sequences are asserted as the whole of `notes`, so a grant creeping back fails the test.
- `tests/unit/lock-consent.test.ts`: `consent granted: purge-one slack (passcode)` leaves the expected list; the refusal line stays.
- `tests/unit/downloads.test.ts`: the `notes` sink leaves the harness; the cancel case asserts a user cancel leaves no row and no banner and that `detach` mid-download is equally silent.
- `tests/unit/passkey-authenticator.test.ts`: the `log` mock and its two `toHaveBeenCalledWith` assertions go.
- `tests/e2e/downloads.spec.ts`: the `[lock] downloads-remove (1 rows) authorized` row is asserted to have count 0; the `history: removed` and `history cleared` rows keep pinning the audit.
- `tests/e2e/diagnostics.spec.ts`, `guarded-actions.spec.ts`, `lock.spec.ts`: unchanged — they assert `[app] started`, `configured: guard …` and the dropped-`appLock` line, all of which stay.
- Definition of done: `corepack pnpm lint`, `typecheck`, `test` and `e2e` green.

## Docs

- `CLAUDE.md`: the guard-audit bullet ("Every performed or refused guarded action notes itself…") becomes "Every refused guarded action notes itself, and so does every performed harm-capable action the audit named; a grant does not"; the Diagnostics bullet's "`endPeek` notes only with a reason" becomes "only a timeout"; the rule above joins the four rules as the fifth.
- `2026-09-13-guarded-actions-design.md` line 31, `2026-09-19-diagnostics-pane-design.md`'s `peek` table row, `2026-09-23-download-history-design.md`'s "Recording the lock" section and `2026-09-25-guard-groups-design.md`'s "The `authorized()` lines … are unchanged" each get a one-line amendment pointing here.

## Out of scope

- A severity or level on `DiagEntry`, and a pane default that hides routine lines.
- A second sink for the dropped lines.
- Raising `DIAG_CAP`.
- Any change to what the report header carries.
