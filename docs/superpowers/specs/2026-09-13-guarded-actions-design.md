# Guarded actions — design

Date: 2026-09-13. Status: approved in brainstorm (user decision, same day); not implemented. Scope: require the app lock's credential before three actions that an unattended, *unlocked* Goetia would otherwise perform on anyone's say-so — summoning a banished service, purging one login, and purging every login. Extends `2026-09-09-app-lock-design.md`; read that first, since this reuses its credential wholesale.

## Threat model

The app lock guards **reading**: it stops someone opening a locked Goetia and going through the chats. This guards **acting while unlocked**, which is a different exposure with a different answer, and conflating the two produces the wrong design.

Two holes, both named by the user:

- **Banish is how a service is hidden, and summon was the free bypass.** A banished service is off the rail but keeps its login — that is the whole point of keeping purge and banish orthogonal. So anyone sitting at an unlocked Goetia could open Home, summon the service back, and read exactly the conversations that were taken off the rail to keep them out of view. The lock does not help: the app is already unlocked, by the owner, minutes ago.
- **Purge is irreversible and unattended.** `purgeAll` clears all ten `persist:<id>` partitions. Walk away from an unlocked laptop, come back to ten signed-out services and ten 2FA flows. Nothing in the app asks for anything stronger than a tick-box.

**Does not defend against:** someone at an unlocked Goetia reading what is already on the rail. This is not a second reading gate, and must not be sold as one — an attacker who wanted to read your WhatsApp never needed to summon anything, because WhatsApp was already there. The guard is worth having precisely because *banished* is the state a user chose as "not visible", and because purge destroys.

**Does not exist at all when the app lock is off.** There is no credential to ask for, so the row does not appear. Stated in the UI rather than degraded into something weaker — the same reason the app lock refuses a native confirm as a fallback.

**Touch ID passes this guard**, and Touch ID accepts any of the up-to-five fingers enrolled on the Mac. A household member who is enrolled defeats this the way they defeat the lock screen. The `Use Touch ID` switch from the app-lock spec governs here too, and the Settings copy says so.

## Decisions

- **Summon is guarded; banish is not** (user decision). The guard goes on the direction that *exposes*. Banishing is the safe direction — it hides a service and keeps its login — so taxing it would cost a prompt to protect nothing. This also settles the Home problem below: the test is not "did the disabled set change" but "did anything get un-banished".
- **Reorder is never guarded** (user decision). Home commits summon, banish and reorder as one `settings:update` (the single-frame invariant from 2026-08-15), so a patch-level gate would make dragging a tile ask for a passcode. The guard inspects the transition, not the patch's existence.
- **Both purges are guarded**, single and sweep. They differ only in blast radius.
- **A timer never prompts.** Auto-banish (`ctx.banishServices`) and the startup cap-trim both move `disabled`, and both are machine-initiated. Neither is a summon, so the un-banish test excludes them by construction rather than by a special case — which is the reason to test the transition rather than the caller.
- **Its own switch, on by default** (user decision). `appLock.guardActions`, a row in Settings → Lock that appears only once the lock is configured, and which is itself behind that pane's passcode gate: weakening the guard is an authorized change like every other.
- **Every guarded action asks** (user decision). No grace window. A window would leave exactly the walk-away gap the feature exists to close, and the one case where repetition would grate — summoning four services at once — is already a single commit and therefore a single prompt.
- **One-shot, action-bound consent minted in main** (approach A of three). Rejected: carrying the passcode in each channel payload, which sprays the secret across three payloads and has nothing to carry for a Touch ID confirm; and prompting natively inside the handler the way `identitySharePrompt` does, which is far smaller but is Touch ID or nothing — on a Mac without a sensor, or with Touch ID switched off, the guard would silently not exist. That is the trap the app lock was built to avoid.
- **Touch ID is accepted here, unlike in the Lock pane.** The pane refuses it because reconfiguring the lock with the weaker credential lets the person the lock is aimed at turn it off. These actions do not weaken the lock; they are ordinary work being authorized, so the fast path is appropriate.

Amended 2026-09-23 (`2026-09-23-download-history-design.md`): the set grew to `downloads-remove` (bound to the exact ids), `downloads-clear` and `passkey-forget` (bound to the id); every guarded action, grant and refusal is recorded in Diagnostics under a `lock` tag; and `settings:update` drops `appLock`, closing the shell-console bypass the audit found. Amended 2026-09-26 (`2026-09-26-diagnostics-unusual-only-design.md`): the grant is no longer recorded — only the refusal and the action's own line.

## What is guarded

| Path | Guarded | Why |
| --- | --- | --- |
| Home commit that un-banishes any service | yes | the exposing direction |
| Home commit that only banishes and/or reorders | no | hiding is safe; reorder is a daily action |
| `service:purgeLogin` — Home, and Settings → Services | yes | irreversible |
| `services:purgeAll` | yes | irreversible, ten times over |
| Rail tile menu → Banish | no | hiding |
| Auto-banish sweep, startup cap-trim | never | machine-initiated; no summon in either |

The test is `summonedIds(order, before, after)` — the line `stampSummoned` already computes at `lib/banish-rules.ts:37`, extracted so the guard and the unused-clock stamp share one definition of "a summon". A targeted extraction in code this change already touches; `stampSummoned` calls it rather than repeating it.

## Consent

`LockController` gains one slot:

```ts
interface Consent {
  kind: 'summon' | 'purge-one' | 'purge-all';
  /** the service a 'purge-one' was granted for; absent for the others */
  serviceId?: ServiceId;
  at: number;
}
```

- **`lock:confirm { kind, serviceId? }`** — a shell-only invoke channel. Verifies Touch ID (when `appLock.touchId` and the sensor allow) or the passcode, through the same `LockController` paths the lock screen uses, including the failure backoff. On success it mints the consent.
- **`consume(kind, serviceId?)`** — returns true only for an exact match on both fields, and clears the slot. Single-use and expiring at `CONSENT_TTL_MS` (60s), so a confirm the user then abandons cannot sit armed.
- A guarded handler with no matching consent **returns silently**, exactly as a channel from a disallowed sender does today. No error path, nothing for a caller to probe.

Binding to the action is what makes the slot safe: a consent for `purge-one` on Slack cannot be spent purging Discord, and a summon consent cannot be spent on a purge. Without the binding, "a consent exists" would be a capability, and the single slot would be one logic bug away from a confused deputy.

Enforcement is in **main**, in the handlers — never in the renderer. The renderer decides when to *ask*; it does not decide whether the action is allowed.

## Surfaces

- **Settings → Lock** gains `Ask before summoning a service or purging a login`, bound to `appLock.guardActions`. Shown only once a passcode is set, default on, authorized by the pane's passcode gate like every other row there. Its hint names what it covers and what it does not: it does not guard services already on the rail.
- **`CredentialConfirm`** — one shared renderer component: a Touch ID button where the setting and sensor allow, a passcode field beneath it always, the backoff countdown, and an error line. It reports success upward; it never decides anything. Both call sites read identically because there is one implementation of "prove it's you".
- **Purge** folds it into the existing `PurgeConfirm` as that modal's final step, rather than stacking a second dialog on the one that already explains the damage and carries the sweep's acknowledgement tick. The confirm button stays disabled until the credential passes.
- **Summon**: Home's confirm bar opens the same block when — and only when — the staged edit un-banishes something. A banish-only or reorder-only edit commits exactly as it does today, with no new surface at all.

## Testing

Unit, against `lib/` helpers with no Electron:

- `summonedIds`: summon-only, banish-only, reorder-only, and mixed patches; that a banish-only patch yields the empty list, which is the case the daily path depends on.
- Consent: an exact match consumes; a wrong kind, a wrong `serviceId`, a second use, and an expired slot all refuse.

Integration, in main: each guarded handler refuses without a matching consent and performs with one; `ctx.banishServices` never consumes a consent and never prompts.

e2e: with the guard on, a single purge asks, a wrong passcode leaves the login intact, and the right one wipes it; a banish-only Home commit does not ask; a Home commit that summons does. Touch ID is hand-verified only, as in the app-lock spec — biometrics cannot be driven headlessly.

## Out of scope

A grace window; guarding banish, reorder, or any other settings change; guarding services already on the rail; and any second reading gate for an unlocked app. Each was considered. The first is the most likely follow-up if per-action prompts prove to grate during a multi-service purge.
