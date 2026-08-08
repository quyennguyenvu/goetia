# Code Signing and Notarization — future work

> **Status:** not started. Blocked on paid developer enrollments, so this is a
> parked decision record rather than an executable plan. Nothing here changes
> until someone buys the certificates.

**Goal:** Replace the ad-hoc macOS signature (and the unsigned Windows exe)
with real, stable signing identities, so the app's code-signing identity
survives rebuilds.

## What this fixes

Three separate symptoms, all the same root cause — no stable signing identity:

1. **macOS Gatekeeper blocks downloaded dmgs.** On macOS 15+ the dialog is
   "Apple could not verify 'Goetia' is free of malware" (older macOS said
   "damaged"), defaulting to *Move to Trash*. The ad-hoc signature itself is
   valid — `spctl -a -t install` reports `no usable signature` and
   `stapler validate` finds no ticket, i.e. the only thing missing is
   notarization. Users clear it once via System Settings → Privacy &
   Security → Open Anyway, or `xattr -dr com.apple.quarantine`; notarization
   removes it entirely.
2. **Windows SmartScreen "Windows protected your PC."** Users click *More info
   → Run anyway*; an OV/EV certificate (plus reputation) removes it.
3. **The recurring "Goetia Safe Storage" keychain prompt on every update.**
   This is the one users hit repeatedly, so it is the strongest argument.

### Why the keychain prompt recurs

`enableCookieEncryption: true` (`electron-builder.yml`) makes Chromium encrypt
the cookie/session store with a random key held in the macOS login keychain as
a generic password:

```text
svce = "Goetia Safe Storage"
acct = "Goetia Key"
```

A keychain item's ACL trusts the creating app by its code-signing **designated
requirement**. Under ad-hoc signing (`identity: '-'` plus
`resetAdHocDarwinSignature: true`) there is no team identity, so the DR
collapses to the binary's own hash:

```text
Signature=adhoc
TeamIdentifier=not set
# designated => cdhash H"d13d2d93e96cce75a38126b16017a9cec725e68c"
```

Every rebuild changes the cdhash, so the next launch is a different program
asking for someone else's keychain item, and macOS prompts. "Always Allow"
only pins that one build.

A Developer ID signature produces a DR of the form
`identifier "com.quyennguyenvu.goetia" and anchor apple generic and
certificate leaf[subject.OU] = "<TEAMID>"` — stable across every future
build, so the ACL keeps matching and the prompt stops for good.

Turning the fuse off is **not** an option: Chromium then falls back to a
hardcoded key, leaving every service's session cookies readable on disk. See
the fuse invariants in `CLAUDE.md`.

## Prerequisites and cost

- **macOS:** Apple Developer Program, USD 99/year. Yields a *Developer ID
  Application* certificate (for the app) and, if the dmg is signed too, a
  *Developer ID Installer* certificate. Notarization needs an app-specific
  password or an App Store Connect API key, plus the Team ID.
- **Windows:** an OV code-signing certificate (~USD 200–400/year, hardware
  token or cloud HSM) or Azure Trusted Signing (subscription-based, no token).
  OV still needs reputation to build before SmartScreen goes quiet; EV clears
  it immediately but costs more.

Only the macOS half is worth doing first — it is cheaper and fixes the
recurring prompt.

## macOS steps

1. Enroll, then create and install the *Developer ID Application* certificate
   in the login keychain (Xcode → Settings → Accounts, or the developer
   portal + a CSR).
2. In `electron-builder.yml`, drop `identity: '-'` so electron-builder
   auto-discovers the Developer ID cert, and add notarization:

   ```yaml
   mac:
     notarize:
       teamId: <TEAMID>
   ```

3. Keep `hardenedRuntime: true` and `build/entitlements.mac.plist` exactly as
   they are. Notarization rejects `allow-dyld-environment-variables`, which is
   already banned by `CLAUDE.md` — do not add it to get past a failure.
4. Export `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` (or
   the API-key equivalents) for the packaging run.
5. Re-verify the fuses on the signed build with `getCurrentFuseWire`, per the
   Packaging section of `CLAUDE.md`.

### Open question: fuse flipping vs. signing order

`resetAdHocDarwinSignature: true` exists because flipping fuses invalidates
the signature, and macOS refuses Notification Center registration for an
unsigned bundle. With a real identity that flag should become `false` so the
ad-hoc re-sign cannot land on top of the Developer ID signature — **but the
ordering of electron-builder's fuse step relative to its signing step must be
confirmed empirically**, not assumed. Verify on the first signed build:

```sh
codesign -dvvv --requirements - /Applications/Goetia.app
spctl -a -vvv -t install /Applications/Goetia.app
```

Expect `Authority=Developer ID Application: …`, a real `TeamIdentifier`, and
`accepted / source=Notarized Developer ID`. If the fuses read back wrong, or
the signature reads `adhoc`, the two steps ran in the wrong order.

`enableEmbeddedAsarIntegrityValidation: true` also interacts with any
post-signing modification of `app.asar`; re-check it on the signed build.

## Windows steps

Only once a certificate exists: point `win.certificateFile` /
`certificatePassword` (or the Azure Trusted Signing provider config) at it and
drop nothing else — the nsis config stays as is.

## CI

`.github/workflows/release.yml` currently forces
`CSC_IDENTITY_AUTO_DISCOVERY: "false"` because no signing material exists.
When certificates land, replace that with repository secrets (`CSC_LINK`,
`CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
`APPLE_TEAM_ID`) and remove the flag from the macOS job only.

## One-time migration cost

Switching from ad-hoc to Developer ID changes the designated requirement one
final time, so the first signed build prompts for "Goetia Safe Storage" once
more. Answer **Always Allow**; every build after that matches. Existing users
keep their sessions — the key itself is unchanged, only the ACL entry grows.

Users who clicked **Deny** at some point will have lost their saved sessions
already and simply log in again.

## Related

- `CLAUDE.md` → Security (fuses, entitlements) and Packaging.
- `docs/superpowers/specs/2026-08-07-hardening-and-remediation-design.md`.
- `README.md` → "If something looks off" (user-facing) and "Package the
  installers" (developer-facing).
