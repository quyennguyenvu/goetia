# Developing Goetia

Everything needed to build, test, package, and release Goetia. User-facing install instructions live in the [README](../README.md).

## Build from source

pnpm may not be on PATH (Node via Homebrew); run it through corepack — the version is pinned in `package.json`'s `packageManager` field:

```sh
cd ~/workspace/gh_leo/goetia
corepack pnpm install   # first time only
corepack pnpm dev       # start with hot reload
```

Sessions persist across restarts in `~/Library/Application Support/Goetia` (one isolated `persist:<id>` session per service).

To use plain `pnpm` instead of the `corepack pnpm` prefix, add the corepack shims to your shell (`~/.zshrc`):

```sh
export PATH="$HOME/.local/corepack-bin:$PATH"
```

(Shims were created with `corepack enable --install-directory ~/.local/corepack-bin`. Tools that spawn pnpm themselves — e.g. electron-builder — also need this.)

### Package the installers

```sh
corepack pnpm package:mac   # → dist/Goetia-<version>-arm64.dmg
corepack pnpm package:win   # run on a Windows machine
```

A locally built app is **not** quarantined, so it opens with no warning on the machine that built it. The Gatekeeper prompt only affects copies that were **downloaded** (a downloaded file carries a quarantine flag) — see the install steps in the README for the one-time fix. To reproduce what a downloader sees, quarantine a copy by hand:

```sh
flag="0081;$(printf %x "$(date +%s)");Safari;$(uuidgen)"
xattr -w com.apple.quarantine "$flag" /Applications/Goetia.app
spctl -a -vvv -t exec /Applications/Goetia.app   # expect: rejected
```

Every build gets a fresh ad-hoc signature, whose designated requirement is the binary's own cdhash, so macOS sees a brand-new app identity each time. The first launch after installing a rebuild therefore prompts for keychain access to **Goetia Safe Storage** — the cookie-encryption key that the `enableCookieEncryption` fuse makes Chromium store there. Click **Always Allow**; it only covers that build. `security delete-generic-password -s "Goetia Safe Storage"` silences the prompt but discards every saved session. The permanent fix is a stable signing identity — see `docs/superpowers/plans/2026-08-07-code-signing-and-notarization.md`.

Releases are cut by pushing a version tag (`git tag v0.1.0 && git push origin v0.1.0`); the tag must match `package.json`'s `version`.

## Develop

```sh
corepack pnpm dev          # run with HMR
corepack pnpm test         # unit tests (Vitest)
corepack pnpm e2e          # smoke test (Playwright-Electron)
corepack pnpm lint         # Biome
corepack pnpm typecheck    # tsc --noEmit
corepack pnpm media        # regenerate the README screenshots
```

`pnpm media` relaunches the app against a throwaway profile and rewrites `docs/media/*.png`. See `scripts/capture-media.mjs`.

## Notes

- Unread counts come from small per-service "recipes" (`src/preload/recipes/`), adapted from [ferdium-recipes](https://github.com/ferdium/ferdium-recipes) (Apache-2.0). If a service redesigns and its count breaks, the tile shows a "stale" dot — fix the selector + fixture pair together in `tests/fixtures/`; `pnpm test` locks them to each other.
- Viber is intentionally absent: it has no web client to embed.
- `ERROR:base/process/process_mac.cc … task_policy_set TASK_SUPPRESSION_POLICY: (os/kern) invalid argument (4)` on startup is harmless: Chromium failing to put a child process under macOS App Nap. Not ours, and nothing breaks.
- Branding: the icon is "Ember Portal" — a summoning circle as pure energy, matching the app's ember accent (dark `#FF9E2C`, light `#E8590C`). SVG sources live in `resources/` (`icon.svg`, `tray/*.svg`); regenerate PNGs with `rsvg-convert` (e.g. `rsvg-convert -w 1024 -h 1024 resources/icon.svg -o resources/icon.png`).
- Design spec: `docs/superpowers/specs/2026-08-04-goetia-chat-client-design.md`.
- Implementation plan: `docs/superpowers/plans/2026-08-04-goetia-v1.md`.
- Engineering guardrails: `../CLAUDE.md`.
- Feature inventory and verification status: `FEATURES.md`.
