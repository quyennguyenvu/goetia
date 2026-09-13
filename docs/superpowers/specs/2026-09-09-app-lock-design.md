# App lock — design

Date: 2026-09-09. Status: approved in brainstorm (user decision, same day); not implemented. Scope: an opt-in lock screen in front of the whole app, engaged at launch and on demand, released by Touch ID or a Goetia passcode. Motivation: someone else picking up the laptop must not be able to read the chats.

## Threat model

State this first, because it bounds every decision below and because a lock that is believed to do more than it does is worse than no lock.

**Defends against:** a person with physical access to the running, unlocked machine — the borrowed laptop, the walked-away-from desk, the colleague leaning over to check something. They can move the mouse and press keys; they cannot read files or run code.

**Does not defend against:** anyone who can read the profile directory or run a process as the user. Each service's session lives in a `persist:<id>` cookie jar on disk, and `enableCookieEncryption` binds the key to the user's login keychain — a process running as the user decrypts those cookies without going anywhere near Goetia. The lock is also a setting, not a cryptographic property: removing `lock.json` turns it off. That escape hatch is deliberate and documented, so a user who forgets the passcode and cannot reach Touch ID recovers rather than deleting their whole profile; it hands an attacker with file access nothing they did not already have.

A third boundary sits inside the credential itself: **Touch ID authenticates any finger enrolled on the Mac**, up to five, and people enroll a partner's or a family member's. Against that person Touch ID is not a lock at all — they press a thumb and Goetia opens. The passcode is the only credential here that is the owner's alone, which is why Touch ID is separately switchable (see Credential) rather than simply used whenever the sensor exists.

So this is a **screen guard, not encryption**. The OS screen lock remains the stronger and complementary control; app lock exists for the case the OS lock cannot express — Goetia specifically shut while the Mac stays unlocked and in someone else's hands.

Two residual exposures are accepted rather than hidden:

- A locked Goetia is still online. Recipes poll, peeks run, badges count, sessions stay signed in. "Locked" means "not readable here", not "offline".
- Standard edit commands (`Edit ▸ Copy`, and so on) stay enabled while locked. Harmless, because nothing is on screen to act on, and disabling them buys nothing.

## Decisions

- **One lock for the whole app, not per service** (user decision). Per-service unlocking would leave the three off-view leaks — banners, pins, recents — open anyway, and cost an authentication per switch.
- **Locking engages at launch and on demand only** (user decision). No idle timer and no lock-on-hide. Both were considered and dropped: they add a scheduler and a `powerMonitor` dependency for a case the manual command already covers, and lock-on-hide taxes every trip through the summon hotkey.
- **Touch ID with a passcode fallback** (user decision). Touch-ID-only has no second door on a lid-shut Mac, a Mac without the sensor, or Windows and Linux. Passcode-only is typed too often to survive contact with daily use.
- **Touch ID is separately switchable, on by default** (user decision, 2026-09-09). Not a convenience toggle: a Mac with someone else's finger enrolled cannot be locked against that person by Touch ID, and turning it off is the only way to make the passcode the sole door. Defaulting it on keeps the fast path for the common case where the enrolled fingers are all the owner's; the row is hidden entirely where no sensor exists, since there is nothing to switch.
- **The passkey prompt's native-confirm fallback is not reused.** `identitySharePrompt` and `electronPrompt` fall back to a `showMessageBox` whose OK button anyone can click. That is a consent gesture, not authentication, and it is exactly what an app lock must not accept.
- **The lock is a shell surface, gated through `anyOverlayOpen`** (approach A of three). A separate always-on-top lock window was rejected: the app documents that it assumes one long-lived window, and a second one fights the tray, the summon hotkey, and every `win.show()` in `commands.ts` for focus — for an isolation gain that is small, since the shell is already `contextIsolation: true` + `sandbox: true` under a strict CSP. A native-prompt-only lock with no surface was rejected because there is nowhere to type a passcode and a cancelled Touch ID leaves an unlocked-looking app, which is how a lock silently stops working.
- **Banners are redacted while locked, never suppressed** (user decision). Silence would cost the ping that says come back; full banners would leave the sender and the message on screen, which is most of what the feature is for.
- **Badges and counts are untouched by the lock.** A count is not content, and the same reasoning that keeps `aggregateBadges` ignorant of mute and quiet hours applies here.

## State and enforcement

`locked: boolean` joins `ShellState` and `anyOverlayOpen` (`main/lib/overlay-rules.ts`). Adding it there is not a shortcut — a lock screen is precisely "a shell-rendered surface a service view would cover", the predicate that function names — and it pays for itself three times over:

- `presentSurface` hides every service view while locked, on the same path settings and Home already use, including at startup.
- `pin-selection` becomes a no-op, because it already declines while an overlay is open.
- `devtools` already targets the shell rather than the service page when an overlay is up.

Views are still created and kept warm while locked; they are only never presented. Light Sleep peeks, the recipe runners, and badge reporting continue, which is what "badges keep counting" requires, and it means the last active service is loaded the instant the lock releases. Startup therefore needs no special case: `resolveStartupSurface` runs unchanged and `presentSurface` simply keeps the result hidden.

Hiding a view is not the same as denying a command, so three further gates:

1. **`runShellCommand` returns early while locked.** This is the single funnel the app menu items and the in-view `before-input-event` interceptor share, so one guard covers ⌘1…9, reload, the switcher, Home, zoom and developer tools by both routes. Without it, `View ▸ Toggle Developer Tools` is a one-click bypass and ⌘1 puts a service on screen. Menu items are additionally rendered disabled while locked, for legibility — the guard, not the greying, is the enforcement.
2. **Content-serving channels refuse while locked.** `activity:recent`, `pins:*`, and the `service:*` family are declined in the `register()` wrapper in `ipc-handlers.ts`, beside `ipcSenderAllowed`, so the rule is structural rather than repeated per handler. The set is a named constant in `shared/ipc.ts` next to `SHELL_ONLY_CHANNELS`, and is asserted in tests the way that set is.
3. **The broadcast is redacted while locked.** `ShellState.pins` goes out as `[]`; conversation titles never cross IPC. Runtime counts, service metadata, theme, and settings still do, so the lock screen can paint itself and the dock overlay badge keeps working. The effect is that even devtools on the shell renderer shows no message text.

A fourth gate was found during implementation and belongs with the other three: **the waking cover obeys the same predicate**. `loading.html` is a third view layered above the shell renderer, and `syncOverlay` hand-tested the three surface flags instead of calling `anyOverlayOpen` — so a launch with the lock on painted "Waking Zalo…" straight over the lock screen while the restored service loaded behind it. It leaked no conversation content, but it covered the passcode field, which is the one surface that must never be buried. Two other places had drifted the same way, both fixed here: the `win.on('focus')` handler, which would have handed keystrokes to the hidden service page instead of the passcode field, and the startup `views.activate` call, whose `show:` expression checked Home alone. Every one of them now reads `anyOverlayOpen`.

Unlocking clears `locked`, calls `presentSurface`, and touches state — the same tail every other surface change uses.

## Credential

New `src/main/lock.ts` (the store and the verify/ceremony wiring) and `src/main/lib/lock-rules.ts` (pure decisions: attempt backoff, passcode acceptability, what a redacted banner reads). `views.ts`, `index.ts` and `ipc-handlers.ts` stay thin wiring, per the process-boundary rule.

**Touch ID first, when it is switched on.** The biometric path is attempted only while `appLock.touchId` is true *and* the sensor can prompt; with it off, the lock screen opens straight to the passcode field and no biometric prompt is ever raised. `hasTouchId()` and `biometric()` move out of `main/passkeys/prompt.ts` into `src/main/lib/biometrics.ts`, and both callers import them. This is a targeted extraction in code the change already touches: the two features want the same two functions and emphatically not each other's dialogs. `prompt.ts` keeps every dialog it has today, unchanged. Availability is re-checked per attempt, not cached at launch, for the reason `confirmCreate` already documents — a Mac that could not prompt with the lid shut can prompt once it is open.

**Passcode as the second door.** Minimum six characters, no composition rules; rate limiting, not entropy rules, is what makes a local secret survive guessing. Stored as `scrypt(passcode, salt)` with a random per-install salt — never the passcode itself — in `lock.json`, which is `safeStorage`-encrypted the way `passkeys.json` is. Hashing matters beyond the file: `safeStorage` protects against another user, not against a process running as this one, and a passcode is the kind of secret people reuse. Comparison uses `timingSafeEqual`.

**An unreadable credential fails closed.** `safeStorage` can decline — a denied keychain prompt, a profile copied to another machine — and a credential that cannot be decrypted can never be verified. The store reports that state rather than reporting "no passcode set", which would silently unlock the app. Touch ID, where it is on, still opens it; otherwise the documented `lock.json` removal is the way back, and the lock screen names it rather than leaving the user guessing at a passcode that cannot work.

`lock.json` never enters `settings.json`. `ShellState.settings` is the raw `Settings` object broadcast to the renderer wholesale, so a hash placed there would be handed to every renderer on every state change.

**Failed attempts** back off through the existing `main/lib/backoff.ts` — 1s, 2s, 4s, capped at 30s — with the counter in memory, reset on any success. The delay is enforced in main and reported to the lock screen so it can say why the field is inert. No permanent lockout and no data wipe: both punish the owner far more reliably than an attacker, who can simply walk away.

**Settings additions.** `Settings` gains `appLock: { enabled: boolean; touchId: boolean }` and nothing else; the secret lives in `lock.json` alone, and the two flags are all the renderer needs to render the pane. Because `ShellState.settings` is broadcast raw, that flag is the entire contract between main and the Lock pane — the pane never learns the hash, the salt, or how many attempts have failed beyond the backoff main reports during an attempt.

## Surfaces

- **`LockScreen.tsx`**, z-50, above `PurgeConfirm` (z-40) so it covers every other shell surface. **Where both doors are open it asks which one** (user decision, 2026-09-13): two buttons, `Use Touch ID` and `Enter passcode`, and nothing else. The first cut drew the passcode field, the Unlock button *and* a Touch ID link together and then raised the macOS sheet on top of all three — four things competing for one decision. Nothing is auto-prompted now; the sheet appears because the user asked for it. With Touch ID off or absent there is no choice to offer, so the passcode field is the screen, and the chooser never renders. The sigil — the field is always present, never revealed only after biometrics fail, so the second door is visible before it is needed. It renders from a redacted state and asks for nothing across IPC beyond the unlock attempt.
- **Settings → Lock**, a new section, and the only place the lock is configured. Its rows:
  - **`Require Touch ID or a passcode to unlock Goetia`** — the master switch, bound to `appLock.enabled`. Off is the current behaviour exactly: no lock screen, no launch prompt, no redaction, and `Lock Now` renders disabled in the menu and the tray. Switching it **on** walks through setting a passcode and does not commit until that succeeds, so the setting can never be true with no credential behind it. Switching it **off** asks for the current credential first, then clears `lock.json` in the same step — an enabled flag outliving its secret, or a secret outliving its flag, are both states nothing else in the app could recover from.
  - **`Use Touch ID`** — on by default, shown only while the lock is on **and** the machine has a sensor, since there is otherwise nothing to switch. Off makes the passcode the only door, which is the correct setting on a Mac where anyone else's finger is enrolled. Turning it on or off requires the passcode, like every other row here: flipping it on widens who can unlock, and that widening must not be authorizable by the credential being widened.
  - **`Change passcode`** — current credential, then the new one twice. Shown only while the lock is on.
  - A line naming whether Touch ID is available on this machine, so the passcode's role as the only door on a Mac without the sensor is visible before it is discovered at a locked screen.

  The pane has three shapes. With **no passcode set** it is one row: the master switch and a field to set one. With a passcode set but not yet entered it is a **gate** — "Enter your passcode to change these settings", a field, and Unlock, and nothing else on screen. Once the passcode is **accepted** the gate is replaced by a `Settings unlocked · Lock again` bar and the three rows appear. There is no master-switch row in the last two shapes, because there is no toggle to flip: turning the lock off destroys the credential, which is the **Turn the lock off** button.

  **Verify, then reveal** (user decision, 2026-09-12) — the controls do not exist until `lock:configure { action: 'verify' }` has passed. The first cut merely *greyed* them until the field held any text, which meant a wrong passcode was reported by a rejected write: after the click, in a status line at the foot of the pane, with the Touch ID checkbox left showing the change it had not made. That last part is not a styling slip but a property of controlled inputs — the browser flips a checkbox on click, and when the rejected write leaves `appLock.touchId` unchanged React has no prop diff to apply, so the box keeps showing the user's click rather than the truth. Revealing only after verification removes the whole class: a control that exists is a control whose write will be accepted. A write rejected anyway means the passcode changed in another window, so the pane drops back to the gate rather than leaving live controls over a stale credential.

  The unlock is component state, so leaving the pane — closing Settings, or switching section — re-locks it. That is load-bearing rather than incidental: it must not be hoisted into the store, where it would outlive the surface it guards.

  Every one of these requires the **passcode** before it acts, not after, and specifically not Touch ID: an unlocked app is otherwise one passcode change away from belonging to whoever is sitting at it, and Touch ID is exactly the credential a second enrolled finger defeats. Reconfiguring the lock with the weaker credential would let the person the lock is aimed at turn it off. Unlocking may use either door; changing the lock uses only the one that is the owner's alone. The rows are plain Settings rows, not a modal — the pane is a shell surface, so no service view can cover the confirmation.
- **`Goetia ▸ Lock Now`**, accelerator `CmdOrCtrl+Shift+L`, declared in `shared/shortcuts.ts` per the shortcuts invariant, so the menu, Settings → Shortcuts, and the in-view interceptor all read the same entry. `⌘⇧L` is unclaimed in the current table, sits on the left half of the keyboard, and is clear of the ⌘⇧Q/W/Z/X/C/V/T/R set the OS and edit conventions own.
- **Tray item**, `Lock Goetia`, beside Show/Hide and Mute. The tray is the only Goetia surface visible while the window is hidden, which is exactly the moment locking is wanted. Per the tray invariant it carries no accelerator of its own, or the chord fires twice.

## Notifications while locked

`sanitizeBanner` (`main/lib/notification-rules.ts`) gains a locked path: the title becomes the service's name and the body is emptied. `NotificationRouter.handle` reads `ctx.locked` at fire time, so a lock taken mid-stream applies to the next banner without any re-registration. Sound and throttling are unchanged; redaction is about what is legible on screen, not about whether the ping happens.

The activity log still records the real title. It is in-memory, and `activity:recent` is refused while locked, so the switcher is both empty during the lock and correct the moment it lifts.

**A banner click while locked must not run `performBannerAction`** — that function activates a service, which would make a notification a one-click bypass. Instead the click shows the window (landing on the lock screen) and parks `{ serviceId, entryId }` in a single pending slot. On a successful unlock the slot is replayed through `resolveBannerClick`, which re-validates at that point exactly as it does for a live click — so the invariant that hrefs stay in main and are re-validated at click time is preserved rather than worked around. One slot, last write wins, cleared on unlock and on lock, so nothing accumulates and no stale action fires after a later lock.

## Testing

Unit (vitest), against `lib/` helpers with no Electron:

- `overlay-rules`: `locked` alone opens the overlay predicate; existing cases unchanged.
- `lock-rules`: backoff schedule and reset on success; passcode acceptance at the length boundary; the redacted banner for every service; which credentials a given `appLock` + sensor-availability pair admits — in particular that `touchId: false` admits the passcode alone, and that no combination admits neither.
- The redaction of `ShellState.pins` and the refusal set for content channels, asserted as data the way `SHELL_ONLY_CHANNELS` is.

Integration, in main with a temp userData dir: set a passcode, verify the right one and several wrong ones, confirm `lock.json` contains neither the passcode nor a recoverable form of it, and confirm the hash is absent from any broadcast `ShellState`.

e2e (playwright, `env -u ELECTRON_RUN_AS_NODE`): launch with the lock enabled and assert no service view is presented before unlock; assert `runShellCommand` declines while locked — driven on the view's `webContents` the way `shortcuts.spec.ts` must, since CDP key injection bypasses `before-input-event`; unlock and assert the previously active service appears without a reload.

Not covered by tests, and to be checked by hand on a real build: Touch ID accept, cancel, and the lid-shut unavailable case, since biometrics cannot be driven headlessly.

## Out of scope

Idle-timeout locking, lock-on-hide, per-service locks, encrypting the service partitions or `pins.json` at rest, and any form of passcode recovery beyond removing `lock.json`. Each was considered; the first two are the most likely follow-ups if the manual command proves too easy to forget.

Guarding *actions* rather than reading — summoning a banished service, purging a login — is deliberately not here either. It is a separate exposure with a separate answer, specified in `2026-09-13-guarded-actions-design.md`, which reuses this credential and adds a fourth row to the Lock pane described above.
