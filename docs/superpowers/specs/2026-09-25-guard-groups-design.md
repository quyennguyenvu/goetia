# Guard groups — design

Date: 2026-09-25. Status: implemented 2026-09-25 (plan `docs/superpowers/plans/2026-09-25-guard-groups.md`). Scope: the app lock's action guard becomes four switches — summon, purge, download history, passkeys — in place of the one `appLock.guardActions` boolean, so a user who finds one guard too strict can turn that one off and keep the rest. Amends `2026-09-13-guarded-actions-design.md` (the consent slot and the single switch) and the guard half of `2026-09-23-download-history-design.md`; read both first. Nothing new is guarded and nothing guarded stops being recorded.

## Problem

One switch, `Ask before summoning a service, purging a login or removing download history`, covers six actions of very different weight. Summoning a banished service reveals the conversations that were taken off the rail; a purge signs the user out for good, ten times over on the sweep. Removing a download row erases a record that Undo puts back for eight seconds, and forgetting a passkey has the same Undo. A user who reads the download prompt as too strict has one way out today: turning the whole guard off, which also drops the summon and purge guards that they never objected to. The user's request (2026-09-25): review every feature, name the ones that need the lock's credential, and let each be switched off on its own.

### The review

Every renderer channel, menu and prompt was checked against the two tests of the 2026-09-23 audit — does the action expose something the owner hid, or destroy something the owner cannot get back — and the audit's verdicts stand. The six guarded actions are the right set, and they fall into four concerns:

| Group | Actions | Why it earns a guard |
| --- | --- | --- |
| `summon` | Home commit that un-banishes; a settings import that does | the exposing direction: a banished service keeps its login |
| `purge` | `service:purgeLogin`, `services:purgeAll` | irreversible; the sweep is ten sign-ins |
| `downloads` | `downloads:remove`, `downloads:clear` | erases the record of what was downloaded; Undo covers eight seconds |
| `passkeys` | `passkeys:forget` | removes a sign-in credential; Undo covers eight seconds |

Unchanged, and staying unguarded: banish, reorder, mute, quiet hours, shortcuts, zoom and pin Done/unpin (the safe or daily direction); the download folder and mode change, cancel, reveal and Open folder (recorded, not guarded, user decision 2026-09-23); settings export (nothing secret leaves, `BACKUP_KEYS`); and every Undo and restore. Staying unconditional, with no switch: reconfiguring the lock (passcode only, never Touch ID), unlock itself, passkey creation and the Facebook identity seed, which each prompt every time outside this system.

## Threat model

What the guard defends is unchanged from 2026-09-13: acting at an unlocked Goetia, not reading it. What changes is the size of the switch. Turning one group off is exactly as authorized as turning the whole guard off today — a `lock:configure` write behind the Lock pane's passcode gate, never Touch ID (the credential a second enrolled finger defeats must not weaken the lock), and never `settings:update`, which keeps dropping `appLock` (`stripAppLock`). A group that is off means that action performs for anyone at the unlocked app, and it is still written to Diagnostics: the recording half of `authorized()` never depended on the guard, and the ring has no Clear.

Two edges are new:

- **The migration must not drop a guard.** A `settings.json` written before this change holds `guardActions: true` for every user who never touched the switch. It must land as all four groups on; a bug there would silently remove the summon and purge guards from every existing install. `tests/unit/settings.test.ts` pins the three cases.
- **The group name is renderer data.** `lock:configure { action: 'setGuard', group }` arrives from the shell, whose console is one menu item away in a packaged build. Main checks `group` against `GUARD_GROUPS` and `on` against `boolean` before the record is touched, so `guard` can never hold a stray key. Reachable only with the passcode, since the credential is checked first, but a record with a fixed shape must stay that shape.

The backup allowlist keeps `appLock` out in both directions, so an imported file cannot flip a group. **Does not defend against** anything the 2026-09-13 spec did not: someone reading what is already on the rail, or someone with the OS user session editing `settings.json` on disk.

## Decisions

- **Four groups, one switch each** (user decision, option A of 3). Purge-one and purge-all are one concern, as are remove and clear; a per-action split (option B) allows the state where Clear all… asks and Remove from list does not, for no gain. A master switch with the groups as exceptions beneath it (option C) is two truths for one question — "master on, every group off" and "master off" mean the same thing — and `normalize` would have to reconcile them.
- **All four on by default** (user decision, option A of 3). Today's posture exactly, for a fresh install and for every existing user. Declined: downloads off by default (the softest action, but it changes the posture of existing installs without their say), and all off (opt-in guarding).
- **The single boolean is replaced, not kept beside the record.** `appLock.guardActions` is read once, at normalize, to seed the four groups, and is absent from the normalized object thereafter. One truth.
- **Passcode only, behind the gate, like every row in the pane.** A switch that weakens the guard is a lock reconfiguration; the 2026-09-09 rule holds.
- **`lock:confirm` is unchanged.** It mints a consent for any well-formed action whether or not that action's group is on. A consent for an off group is never spent, because `authorized()` never asks for one, and it expires at `CONSENT_TTL_MS`. Refusing to mint would add a second place that reads the guard setting, for no protection.
- **One rule for both processes.** The four renderer sites that decide when to ask each repeat `guardActions && lockConfigured` today. They and main's `authorized()` now read one function in `shared/lock.ts`.

## Data model and rules

`GUARD_GROUPS`, `GuardGroup` and `GuardSettings` are defined in `src/shared/types.ts` beside `Settings` (the field they type; `lock.ts` already imports from `types.ts`, so defining them there would be a cycle) and re-exported from `src/shared/lock.ts`, which holds the functions:

```ts
/** The concerns the guard is switched by, in the pane's order. */
export const GUARD_GROUPS = ['summon', 'purge', 'downloads', 'passkeys'] as const;
export type GuardGroup = (typeof GUARD_GROUPS)[number];

export type GuardSettings = Record<GuardGroup, boolean>;

export function isGuardGroup(v: unknown): v is GuardGroup;

/** Which switch an action answers to. Exhaustive: a new kind fails typecheck until it is placed. */
export function guardGroupOf(action: GuardedAction): GuardGroup;
// summon → summon; purge-one, purge-all → purge;
// downloads-remove, downloads-clear → downloads; passkey-forget → passkeys

/** Whether a group asks right now. The setting alone is not enough: with no passcode stored there is nothing to ask for. */
export function guardOn(appLock: { guard: GuardSettings }, configured: boolean, group: GuardGroup): boolean;
// configured && appLock.guard[group]
```

`src/shared/types.ts`: `appLock: { enabled: boolean; touchId: boolean; guard: GuardSettings }`, default `guard: { summon: true, purge: true, downloads: true, passkeys: true }`. The doc comment names the four groups and points here.

`src/main/lib/guard-policy.ts` loses `actionGuarded` (replaced by `guardOn`) and keeps `normalizeRemoveIds`, `normalizeAction` and `stripAppLock`.

`src/main/settings.ts` `fillAppLock`, the migration:

1. `raw.guard` is an object → each of the four keys coerced field by field; a non-boolean falls back to the default (`true`), the summonHotkey rule; unknown keys are dropped.
2. Otherwise `raw.guardActions` is a boolean → all four seeded from it: `false` → all off, `true` → all on.
3. Otherwise → defaults.

`SettingsStore.sanitize` runs the same function on an imported backup, but `BACKUP_KEYS` keeps `appLock` out, so the only file this ever migrates is `settings.json` at boot. The next `settings.update` writes the normalized object, and the old key is gone from disk.

## Configuring

`LockConfigure` in `shared/lock.ts`:

```ts
| { action: 'setGuard'; current: string; group: GuardGroup; on: boolean }
```

in place of `setGuardActions`. `LockConfigResult.error` gains `'invalid'`, returned when `group` is not a `GuardGroup` or `on` is not a boolean, checked after the passcode and before anything is written.

`LockDeps.persist` accepts `guard?: Partial<GuardSettings>`. The implementation in `index.ts` merges it into the record — `{ ...appLock, ...patch, guard: { ...appLock.guard, ...patch.guard } }` — rather than spreading over it, since a shallow spread of a partial record would drop the other three groups. `LockController.configure` persists `{ guard: { [group]: on } }` and notes `configured: guard <group> on|off`.

## Enforcement

`authorized()` in `ipc-handlers.ts`:

```ts
const guarded = guardOn(ctx.settings.get().appLock, ctx.lock.configured(), guardGroupOf(action));
if (!guarded) return true;
const ok = ctx.lock.consumeConsent(action);
ctx.diag.note('lock', ok ? `${what} authorized` : `${what} refused: no consent`);
return ok;
```

Everything downstream is unchanged: a group that is off performs the action and its handler still writes its own line (`[app] summoned: …`, `[app] purged login: …`, `[downloads] history: removed n rows`, `[passkey] forgot <rpId>`); a group that is on spends the one-shot consent. The summon check inside `applySettingsPatch`, the import's parked patch and `retry`, `stripAppLock` and `BACKUP_KEYS` are untouched.

## Surface

**Settings → Lock.** The single guard row becomes a block, shown only once a passcode is set and only past the pane's gate, exactly where the row is today. A heading line reads **Ask for your credential before…** with the shared hint beneath it: "This asks even while Goetia is unlocked, and Touch ID counts here. It does not guard services already on your rail." Then four checkbox rows in `GUARD_GROUPS` order, each with its own one-line hint:

| Row (`data-testid`) | Label | Hint |
| --- | --- | --- |
| `lock-guard-summon` | Summoning a banished service | A banished service keeps its login; bringing it back reveals its conversations. |
| `lock-guard-purge` | Purging a login | Signs you out of that service and cannot be undone. |
| `lock-guard-downloads` | Removing download history | Erases the record of what was downloaded. Undo still covers the next few seconds. |
| `lock-guard-passkeys` | Forgetting a passkey | Removes a sign-in credential from this Mac. |

The block is `lock-guard-rows`. Each checkbox sends one `lock:configure { action: 'setGuard', current: verified, group, on }` through the pane's `change` helper, with the status line "Asking before <label, lower case>." or "No longer asking before <label, lower case>."; a rejected write drops the pane back to the gate, as every row does. An `invalid` result renders through `errorText`'s existing fallback, "That did not work.", and needs no new copy. The old `lock-guard-row` and `lock-guard-toggle` ids go; no test drives them.

**Ask sites.** The four places that decide when to ask read `guardOn(appLock, lockConfigured, group)` for their group and nothing else: `Welcome`'s summon (`summon`), `PurgeConfirm` (`purge`), the `guarded` prop `SettingsView` hands `DownloadsPane` (`downloads`) and `PasskeysPane` (`passkeys`). Their behaviour under a group that is on is unchanged, and under a group that is off each acts at once as it does today with the guard off — `PurgeConfirm` still needs its acknowledgement tick, Remove and Forget still show their Undo. `CredentialConfirm` is untouched.

**Diagnostics.** `configured: guard <group> on|off` replaces `configured: guard on|off`. The `authorized()` lines and every handler's own line are unchanged.

**CLAUDE.md.** The guarded-actions sentence in the Security section names `appLock.guard`, the four groups, `guardGroupOf` and `guardOn`, and that the renderer sites read `guardOn` for their group.

## Testing

Unit, against `shared/` and `lib/` with no Electron:

- `tests/unit/guard-policy.test.ts`: `guardGroupOf` places every `GuardedAction` kind; `guardOn` is true only when configured and the group is on; one group off leaves the other three guarded; `isGuardGroup` refuses a stranger.
- `tests/unit/settings.test.ts`: a `guard` object coerces field by field and drops unknown keys; a legacy `guardActions: true` lands all four on and `guardActions: false` all four off; a missing block defaults to all on; `guardActions` is absent from the normalized object.
- `tests/unit/lock-controller.test.ts`: `setGuard` persists `{ guard: { purge: false } }` and notes `configured: guard purge off`; a bad `group` or a non-boolean `on` returns `invalid` and persists nothing; the existing note sequence updates.
- `tests/unit/settings-backup.test.ts`: the fixture's `appLock` moves to the new shape; `appLock` still never leaves or enters.
- `tests/unit/lock-consent.test.ts`: unchanged, since `sameAction` and the slot are untouched.

e2e (`tests/e2e/`):

- `lock.spec.ts`, `guarded-actions.spec.ts`, `downloads.spec.ts`: the seeded `appLock` moves to the new shape; the console-bypass case in `lock.spec.ts` sends a patch with every group off and asserts all four are still on in `settings.json` afterwards.
- `guarded-actions.spec.ts`, one new case: with a passcode set, open Settings → Lock, pass the gate, untick `lock-guard-downloads`; in Settings → Downloads, Remove from list acts at once and shows Undo; a purge still asks. Ticking it back asks again.

Touch ID is hand-verified only, as in every lock spec.

## Out of scope

A master switch; per-action toggles; a grace window (the 2026-09-13 follow-up, still not asked for); guarding the download folder change (declined 2026-09-23, stands); a per-service guard; any new guarded action. Each was considered in the review.
