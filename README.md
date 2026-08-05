# Goetia

Personal multi-service chat client — WhatsApp, Messenger, Telegram, Discord, Zalo
in one window, with native notifications and unread badges. macOS + Windows.

Built with Electron + TypeScript + React. Local-only: no server, no accounts, no telemetry.

## Download

Prebuilt installers are on the [Releases page](https://github.com/quyennguyenvu/goetia/releases):

- **macOS**: `Goetia-<version>-arm64.dmg` (Apple Silicon) or `Goetia-<version>-x64.dmg`
  (Intel). The app is unsigned — on first launch, right-click the app → **Open**.
- **Windows**: `Goetia Setup <version>.exe`. SmartScreen warns on unsigned installers —
  click **More info → Run anyway**.

Releases are cut by pushing a version tag (`git tag v0.1.0 && git push origin v0.1.0`);
the tag must match `package.json`'s `version`.

## Run

pnpm may not be on PATH (Node via Homebrew); run it through corepack — the
version is pinned in `package.json`'s `packageManager` field:

    cd ~/workspace/gh_leo/goetia
    corepack pnpm install   # first time only
    corepack pnpm dev       # start with hot reload

The window opens with the service rail on the left. Click each service and
scan its QR / log in once — sessions persist across restarts in
`~/Library/Application Support/Goetia` (one isolated `persist:<id>` session
per service).

To use plain `pnpm` instead of the `corepack pnpm` prefix, add the corepack
shims to your shell (`~/.zshrc`):

    export PATH="$HOME/.local/corepack-bin:$PATH"

(Shims were created with `corepack enable --install-directory ~/.local/corepack-bin`.
Tools that spawn pnpm themselves — e.g. electron-builder — also need this.)

### Install the packaged app

    corepack pnpm package:mac   # → dist/Goetia-<version>-arm64.dmg
    corepack pnpm package:win   # run on a Windows machine

Open the dmg, drag Goetia to Applications, then **right-click → Open** on
first launch — the app is unsigned, so a plain double-click is blocked by
Gatekeeper.

### Daily-use notes

- **Close-to-tray is on by default**: closing the window keeps Goetia in the
  menu bar receiving notifications. Quit via the tray menu or ⌘Q.
- **Menu position**: the service icons live in a top bar by default (the
  embedded chat apps have their own left column, so a left rail doubles up);
  switch to Left or Right in Settings → General.
- Shortcuts: ⌘/Ctrl+1…5 jump to a service, ⌘/Ctrl+K quick switcher,
  ⌘/Ctrl+R or F5 reload the current service, right-click a tile to mute it,
  drag tiles to reorder.
- After first login, watch the rail badges: if a service shows unread in its
  own UI but no badge (or a small grey "stale" dot), that recipe's DOM
  selector needs updating — see Notes below.

## Develop

    corepack pnpm dev          # run with HMR
    corepack pnpm test         # unit tests (Vitest)
    corepack pnpm e2e          # smoke test (Playwright-Electron)
    corepack pnpm lint         # Biome
    corepack pnpm typecheck    # tsc --noEmit

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
