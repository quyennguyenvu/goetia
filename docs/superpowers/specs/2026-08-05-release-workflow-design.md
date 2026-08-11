# Release workflow design

**Date:** 2026-08-05 **Goal:** Users can download Goetia installers (macOS dmg, Windows exe) directly from GitHub Releases.

## Context

- Electron app packaged with electron-builder (`electron-builder.yml`: mac → dmg+zip, win → nsis, `publish: null`).
- pnpm 11.20.0 pinned via `packageManager`; build scripts allowlisted in `pnpm-workspace.yaml` (`allowBuilds`: electron, electron-winstaller, esbuild).
- Remote: `quyennguyenvu/goetia` on GitHub (SSH alias `gh_leo`). No `.github/` directory yet.
- Repo convention (from nova): release on `v*` tag push.
- Decisions: **unsigned builds** (no certs), **arm64 + x64 mac dmgs** as separate downloads.

## Chosen approach

Tag-push → matrix build → GitHub Release. electron-builder keeps `publish: null` (local packaging never publishes); the workflow attaches installers explicitly with `softprops/action-gh-release`.

Rejected alternatives:

- electron-builder built-in GitHub publishing (`--publish always`): requires `publish: github` in `electron-builder.yml`, which leaks publish behavior into local builds and produces draft releases with less control.
- Build-only artifacts without a release: users would have to dig into Actions runs — fails the "download directly" requirement.

## Deliverables

### 1. `.github/workflows/release.yml`

### Triggers

- `push` on tags `v*` → build + create GitHub Release.
- `workflow_dispatch` → dry run: build + upload run artifacts, skip release.

### Job: build (matrix)

- `macos-latest`: `pnpm build` then `pnpm exec electron-builder --mac --arm64 --x64` → `Goetia-<ver>-arm64.dmg`, `Goetia-<ver>-x64.dmg`.
- `windows-latest`: `pnpm build` then `pnpm exec electron-builder --win` → `Goetia Setup <ver>.exe`.
- Common steps: checkout → `pnpm/action-setup@v4` (reads pinned `packageManager`; more robust than `corepack enable` on Windows runners) → `actions/setup-node@v4` (Node 22, `cache: pnpm`) → `pnpm install --frozen-lockfile`.
- Env: `CSC_IDENTITY_AUTO_DISCOVERY: false` (skip mac signing cleanly).
- Guard step (tag runs only): fail if tag ≠ `v` + `package.json` version.
- Upload installers via `actions/upload-artifact` (dmg/exe only — no zip, no `.blockmap`).

### Job: release

- Condition: tag push only; `needs: build` (both matrix legs succeeded).
- `runs-on: ubuntu-latest`; `permissions: contents: write` (workflow-level).
- `actions/download-artifact` → `softprops/action-gh-release@v2` with `generate_release_notes: true`, files: `*.dmg`, `*.exe`.

### 2. `electron-builder.yml` changes

- mac `target: [dmg, zip]` → `target: dmg` (zip only serves auto-update; halves mac CI time).
- Add mac `artifactName: ${productName}-${version}-${arch}.${ext}` so the x64 dmg carries an explicit arch suffix (default naming omits it).

### 3. `README.md` addition

Short **Download** section: link to Releases, pick dmg by Mac chip, plus unsigned-app first-launch notes (macOS: right-click → Open; Windows: SmartScreen → More info → Run anyway).

## Error handling

- Matrix `fail-fast`: if one OS build fails, the other cancels and no release is created.
- Version/tag mismatch fails the build before packaging.
- Release job runs only when both builds succeed.

## Out of scope

- Code signing / notarization (no certs; revisit if distribution widens).
- Auto-update (would need zip target + blockmaps + `electron-updater`).
- Linux builds.
- CI test/lint pipeline (separate concern from releasing).

## Prerequisites & testing

1. Repo must exist and be pushed to GitHub at `quyennguyenvu/goetia`.
2. Push workflow → run `workflow_dispatch` dry run → verify three installers appear as run artifacts.
3. Push tag `v0.1.0` → verify release appears with `Goetia-0.1.0-arm64.dmg`, `Goetia-0.1.0-x64.dmg`, `Goetia Setup 0.1.0.exe`.
4. Download on a real machine: mac dmg opens after right-click → Open; exe installs after SmartScreen bypass.
