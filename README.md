# Goetia

Personal multi-service chat client — WhatsApp, Messenger, Telegram, Discord, Zalo,
Shopee in one window, with native notifications and unread badges. macOS + Windows.

Built with Electron + TypeScript + React. Local-only: no server, no accounts,
no telemetry.

## Install (for everyone)

Goetia is a normal desktop app — no account, no sign-up, nothing to set up.
Download it, install it, open it. One heads-up first:

Goetia isn't signed with a paid Apple or Microsoft certificate (it's a
personal project, not a company). So the **first** time you open it, your
computer pops up a scary-looking warning. **The app is safe** — the warning
only means "the developer didn't buy a certificate," not that anything is
wrong. Here's how to get past it, once.

Grab the installer for your computer from the
[Releases page](https://github.com/quyennguyenvu/goetia/releases).

### On a Mac

1. Download the right `.dmg` (see "Which Mac file?" just below),
   double-click it, and drag the **Goetia** icon onto the **Applications**
   folder.
2. Open **Goetia** from your Applications folder. If it opens, you're done.
3. If macOS says **"Goetia is damaged"** or **"cannot be opened because Apple
   cannot check it"**, that is only the unsigned-app warning — clear it once
   with the step below.

To clear the warning, open the **Terminal** app (press ⌘+Space, type
`Terminal`, press Return), then copy-paste this exact line and press Return:

```sh
xattr -dr com.apple.quarantine /Applications/Goetia.app
```

Now open Goetia again — it opens normally from here on. (If Terminal replies
"permission denied", type `sudo`, a space, then the same command again, and
enter your Mac login password when asked; the password stays invisible as you
type.)

**Which Mac file?** Use `Goetia-<version>-arm64.dmg` for Apple Silicon
(M1/M2/M3/M4 — most Macs since 2020), or `Goetia-<version>-x64.dmg` for older
Intel Macs. Not sure? Apple menu (top-left) → **About This Mac**: a "Chip"
that starts with "Apple" means arm64; "Intel" means x64.

### On Windows

1. Download `Goetia Setup <version>.exe` and run it.
2. Windows shows a blue box, **"Windows protected your PC."** Click **More
   info**, then **Run anyway**. (This shows only because the app isn't signed
   with a paid certificate — it's safe.)
3. It installs and opens on its own, and afterwards launches from the Start
   menu like any other app.

### The first time you open it

You'll see a row of chat-service icons. Click each one and log in the normal
way — scan the QR code (WhatsApp, Zalo) or type your username and password.
**You only log in once per service**; Goetia remembers each account
separately, even after you quit and reopen.

Closing the window does **not** quit Goetia — it keeps running in the menu
bar (Mac) or the system tray next to the clock (Windows) so notifications
still arrive. To fully quit, click that icon → **Quit**, or press ⌘Q (Mac) /
Ctrl+Q (Windows).

### Handy to know

- **Service icons sit in a top bar** by default (each chat app already has
  its own left-hand column, so a second left rail would double up). Want them
  on the side? **Settings → General → Menu position**.
- **Shortcuts**: ⌘/Ctrl+1…6 jump to a service, ⌘/Ctrl+K opens a quick
  switcher, ⌘/Ctrl+R (or F5) reloads the current service, right-click an icon
  to mute it, and drag icons to reorder them.
- **On a Mac, allow notifications the first time**: System Settings →
  Notifications → **Goetia** → turn on **Allow Notifications**.

### If something looks off

None of these mean the app is broken — they're the known rough edges of a
free, unsigned personal app:

- **The "damaged" / "unverified" (Mac) or SmartScreen (Windows) warning** is
  expected; follow the install steps above. It only appears the first time.
- **Mac asks to use "confidential information stored in Goetia Safe
  Storage"**: click **Always Allow**. Goetia locks your saved logins with a
  key kept in your Mac's keychain, and because the app isn't signed with a
  paid certificate macOS treats each new version as a different app — so it
  asks again after every update. Clicking **Deny** leaves those saved logins
  locked and you'd have to sign in to every service again.
- **A service shows new messages in its own window but the icon has no red
  badge** (or shows a small grey dot): that service tweaked its website and
  Goetia's unread counter for it needs a small update. Chatting still works —
  only the badge is out of date. Tell me and I'll push a fix.
- **A service logs you out after a while**: some services do that on their
  own; just log back in. Your other services stay logged in.
- **Notifications from a service never appear**: open that service once and
  check its own notification setting is on, and (Mac) that Goetia is allowed
  to notify in System Settings.

## Build from source (developers)

pnpm may not be on PATH (Node via Homebrew); run it through corepack — the
version is pinned in `package.json`'s `packageManager` field:

```sh
cd ~/workspace/gh_leo/goetia
corepack pnpm install   # first time only
corepack pnpm dev       # start with hot reload
```

Sessions persist across restarts in `~/Library/Application Support/Goetia`
(one isolated `persist:<id>` session per service).

To use plain `pnpm` instead of the `corepack pnpm` prefix, add the corepack
shims to your shell (`~/.zshrc`):

```sh
export PATH="$HOME/.local/corepack-bin:$PATH"
```

(Shims were created with `corepack enable --install-directory ~/.local/corepack-bin`.
Tools that spawn pnpm themselves — e.g. electron-builder — also need this.)

### Package the installers

```sh
corepack pnpm package:mac   # → dist/Goetia-<version>-arm64.dmg
corepack pnpm package:win   # run on a Windows machine
```

A locally built app is **not** quarantined, so it opens with no warning on
the machine that built it. The "damaged"/Gatekeeper prompt only affects
copies that were **downloaded** (a downloaded file carries a quarantine
flag) — see the install steps above for the one-time fix.

Every build gets a fresh ad-hoc signature, whose designated requirement is
the binary's own cdhash, so macOS sees a brand-new app identity each time.
The first launch after installing a rebuild therefore prompts for keychain
access to **Goetia Safe Storage** — the cookie-encryption key that the
`enableCookieEncryption` fuse makes Chromium store there. Click **Always
Allow**; it only covers that build. `security delete-generic-password -s
"Goetia Safe Storage"` silences the prompt but discards every saved session.
The permanent fix is a stable signing identity — see
`docs/superpowers/plans/2026-08-07-code-signing-and-notarization.md`.

Releases are cut by pushing a version tag
(`git tag v0.1.0 && git push origin v0.1.0`); the tag must match
`package.json`'s `version`.

## Develop

```sh
corepack pnpm dev          # run with HMR
corepack pnpm test         # unit tests (Vitest)
corepack pnpm e2e          # smoke test (Playwright-Electron)
corepack pnpm lint         # Biome
corepack pnpm typecheck    # tsc --noEmit
```

## Notes

- Unread counts come from small per-service "recipes" (`src/preload/recipes/`),
  adapted from [ferdium-recipes](https://github.com/ferdium/ferdium-recipes) (Apache-2.0).
  If a service redesigns and its count breaks, the tile shows a "stale" dot —
  fix the selector + fixture pair together in `tests/fixtures/`; `pnpm test`
  locks them to each other.
- Viber is intentionally absent: it has no web client to embed.
- `ERROR:base/process/process_mac.cc … task_policy_set TASK_SUPPRESSION_POLICY:
(os/kern) invalid argument (4)` on startup is harmless: Chromium failing to put
  a child process under macOS App Nap. Not ours, and nothing breaks.
- Branding: the icon is "Ember Portal" — a summoning circle as pure energy,
  matching the app's ember accent (dark `#FF9E2C`, light `#E8590C`). SVG
  sources live in `resources/` (`icon.svg`, `tray/*.svg`); regenerate PNGs
  with `rsvg-convert` (e.g. `rsvg-convert -w 1024 -h 1024 resources/icon.svg
-o resources/icon.png`).
- Design spec: `docs/superpowers/specs/2026-08-04-goetia-chat-client-design.md`.
- Implementation plan: `docs/superpowers/plans/2026-08-04-goetia-v1.md`.
