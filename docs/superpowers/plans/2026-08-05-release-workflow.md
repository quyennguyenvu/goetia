# Release Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A GitHub Actions workflow that, on a `v*` tag push, builds unsigned macOS dmgs (arm64 + x64) and a Windows nsis exe and attaches them to a GitHub Release.

**Architecture:** One workflow, two phases: a `build` matrix job (macos-latest, windows-latest) packages installers with electron-builder and uploads them as run artifacts; a `release` job (tag pushes only) downloads them and attaches them via `softprops/action-gh-release`. `electron-builder.yml` keeps `publish: null` so local packaging never publishes.

**Tech Stack:** GitHub Actions, pnpm 11 (pinned via `packageManager`), electron-vite, electron-builder 26.

**Spec:** `docs/superpowers/specs/2026-08-05-release-workflow-design.md`

## Global Constraints

- **NEVER run `git commit`.** Per user's global CLAUDE.md, commits happen only via the user running `/grimoire-core:commit`. When a task reaches a commit point, STOP and ask the user to run `/commit`.
- Local pnpm is not on PATH: use `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm <cmd>` from `/Users/lap02445/workspace/gh_leo/goetia`. Tools that spawn pnpm (electron-builder) need `export PATH="$HOME/.local/corepack-bin:$PATH"` first.
- Builds are unsigned — no signing secrets exist; `CSC_IDENTITY_AUTO_DISCOVERY: "false"` in CI.
- `publish: null` in `electron-builder.yml` must stay; CI also passes `--publish never`.
- App version is `0.1.0` in `package.json`; release tags look like `v0.1.0`.

---

### Task 1: electron-builder.yml — mac dmg-only target with arch-suffixed names

**Files:**
- Modify: `electron-builder.yml` (mac section only)

**Interfaces:**
- Produces: mac artifacts named `Goetia-<version>-<arch>.dmg` (e.g. `Goetia-0.1.0-arm64.dmg`, `Goetia-0.1.0-x64.dmg`); no zip target. Task 2's workflow and Task 3's README rely on these exact names.

- [ ] **Step 1: Edit the mac section**

Replace the current `mac:` block:

```yaml
mac:
  target: [dmg, zip]
  category: public.app-category.social-networking
```

with:

```yaml
mac:
  target: dmg
  category: public.app-category.social-networking
  artifactName: ${productName}-${version}-${arch}.${ext}
```

(`${...}` are electron-builder macros — literal text in the YAML, do not quote or interpolate. The explicit `artifactName` gives the x64 dmg an arch suffix; the default omits it. All other keys in the file stay unchanged.)

- [ ] **Step 2: Verify with a local mac package build**

```bash
cd /Users/lap02445/workspace/gh_leo/goetia
export PATH="$HOME/.local/corepack-bin:$PATH"
rm -rf dist
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm package:mac
ls dist
```

Expected: `dist/Goetia-0.1.0-arm64.dmg` exists (host is Apple Silicon, so only arm64 builds locally); **no** `*.zip` or `*-mac.zip` in `dist/`. Takes a few minutes.

- [ ] **Step 3: Commit checkpoint**

Do NOT commit. Note the file as ready; the user commits all tasks together at Task 4.

---

### Task 2: .github/workflows/release.yml

**Files:**
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: artifact names from Task 1 (`dist/*.dmg` on mac, `dist/*.exe` on win — nsis default name is `Goetia Setup 0.1.0.exe`).
- Produces: a GitHub Release on `v*` tag push with the three installers attached; a `workflow_dispatch` dry run that only uploads run artifacts.

- [ ] **Step 1: Create the workflow file**

Create `.github/workflows/release.yml` with exactly:

```yaml
name: Release

on:
  push:
    tags:
      - "v*"
  workflow_dispatch:

permissions:
  contents: write

defaults:
  run:
    shell: bash

jobs:
  build:
    name: Build (${{ matrix.name }})
    strategy:
      matrix:
        include:
          - name: mac
            os: macos-latest
            args: --mac --arm64 --x64
          - name: win
            os: windows-latest
            args: --win
    runs-on: ${{ matrix.os }}
    env:
      CSC_IDENTITY_AUTO_DISCOVERY: "false"
    steps:
      - uses: actions/checkout@v4

      # pnpm version comes from package.json "packageManager"
      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Check tag matches package.json version
        if: startsWith(github.ref, 'refs/tags/v')
        run: |
          pkg="$(node -p "require('./package.json').version")"
          tag="${GITHUB_REF_NAME#v}"
          if [ "$pkg" != "$tag" ]; then
            echo "::error::tag $GITHUB_REF_NAME does not match package.json version $pkg"
            exit 1
          fi

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build and package
        run: |
          pnpm build
          pnpm exec electron-builder ${{ matrix.args }} --publish never

      - uses: actions/upload-artifact@v4
        with:
          name: installers-${{ matrix.name }}
          path: |
            dist/*.dmg
            dist/*.exe
          if-no-files-found: error

  release:
    name: Publish release
    if: startsWith(github.ref, 'refs/tags/v')
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          path: installers
          merge-multiple: true

      - uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
          files: |
            installers/*.dmg
            installers/*.exe
```

Why these choices (context for a zero-context implementer):
- `pnpm/action-setup@v4` with no `version` input reads the pinned `packageManager` field — more robust on Windows runners than `corepack enable`, and required before `setup-node`'s `cache: pnpm` works.
- `defaults.run.shell: bash` makes the multiline steps fail-fast on Windows too (default pwsh does not stop on intermediate command failure).
- `--publish never` is belt-and-braces: `publish: null` already disables publishing, but electron-builder can otherwise auto-publish on CI tag builds when a token is present.
- Matrix `fail-fast` is the default `true`: one failing OS cancels the other and no release is created.
- `if-no-files-found: error` catches a silent packaging failure (e.g. wrong glob) at the upload step.
- `merge-multiple: true` flattens both `installers-*` artifacts into one `installers/` directory.

- [ ] **Step 2: Validate YAML syntax**

```bash
cd /Users/lap02445/workspace/gh_leo/goetia
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml')); print('yaml ok')"
```

Expected: `yaml ok`

- [ ] **Step 3: Test the version-guard logic locally**

```bash
cd /Users/lap02445/workspace/gh_leo/goetia
GITHUB_REF_NAME=v0.1.0 bash -c 'pkg="$(node -p "require(\"./package.json\").version")"; tag="${GITHUB_REF_NAME#v}"; [ "$pkg" = "$tag" ] && echo MATCH || echo MISMATCH'
GITHUB_REF_NAME=v0.2.0 bash -c 'pkg="$(node -p "require(\"./package.json\").version")"; tag="${GITHUB_REF_NAME#v}"; [ "$pkg" = "$tag" ] && echo MATCH || echo MISMATCH'
```

Expected: first prints `MATCH`, second prints `MISMATCH`.

- [ ] **Step 4: Commit checkpoint**

Do NOT commit. The user commits all tasks together at Task 4.

---

### Task 3: README Download section

**Files:**
- Modify: `README.md` (insert a `## Download` section between the intro paragraph and `## Run`)

**Interfaces:**
- Consumes: artifact names from Task 1/2.

- [ ] **Step 1: Insert the Download section**

Immediately after the intro line `Built with Electron + TypeScript + React. Local-only: no server, no accounts, no telemetry.` and before `## Run`, insert:

```markdown
## Download

Prebuilt installers are on the [Releases page](https://github.com/quyennguyenvu/goetia/releases):

- **macOS**: `Goetia-<version>-arm64.dmg` (Apple Silicon) or `Goetia-<version>-x64.dmg`
  (Intel). The app is unsigned — on first launch, right-click the app → **Open**.
- **Windows**: `Goetia Setup <version>.exe`. SmartScreen warns on unsigned installers —
  click **More info → Run anyway**.

Releases are cut by pushing a version tag (`git tag v0.1.0 && git push origin v0.1.0`);
the tag must match `package.json`'s `version`.
```

- [ ] **Step 2: Proofread render**

Read the modified README top section; confirm heading order is `# Goetia` → `## Download` → `## Run` and the artifact names match Task 1's (`Goetia-<version>-arm64.dmg`, `Goetia-<version>-x64.dmg`, `Goetia Setup <version>.exe`).

---

### Task 4: Commit, push, and CI verification (user-gated)

**Files:** none (process task)

- [ ] **Step 1: Review the working tree**

```bash
cd /Users/lap02445/workspace/gh_leo/goetia && git status --short
```

Expected changes only: `electron-builder.yml`, `.github/workflows/release.yml` (new), `README.md`, plus the spec and this plan under `docs/superpowers/`.

- [ ] **Step 2: STOP — ask the user to run `/grimoire-core:commit`**

Do not run `git commit`. Ask the user to run `/commit` and confirm the message.

- [ ] **Step 3: Push main** (after the commit exists)

```bash
git push origin main
```

- [ ] **Step 4: Dry run on GitHub (user action — no `gh` CLI on this machine)**

Ask the user to open GitHub → Actions → "Release" → **Run workflow** (workflow_dispatch). Expected: both matrix legs succeed; run artifacts `installers-mac` (2 dmgs) and `installers-win` (1 exe); no release created.

- [ ] **Step 5: Real release**

```bash
git tag v0.1.0 && git push origin v0.1.0
```

Expected: workflow runs, and the release `v0.1.0` appears with `Goetia-0.1.0-arm64.dmg`, `Goetia-0.1.0-x64.dmg`, `Goetia Setup 0.1.0.exe` attached, with auto-generated notes.

- [ ] **Step 6: Download smoke test (user action)**

macOS: download dmg, drag to Applications, right-click → Open. Windows: download exe, SmartScreen → More info → Run anyway, app installs and launches.
