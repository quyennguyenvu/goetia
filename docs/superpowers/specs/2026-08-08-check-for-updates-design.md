# Check for updates design

**Date:** 2026-08-08

**Goal:** Goetia tells the user when a newer version has been released, and
hands them the download page. It checks GitHub Releases on a timer and on
demand, announces the result with a toast that dismisses itself, and adds no
new privileges or unvalidated input paths.

## Context

- The app is **ad-hoc signed by design** (`electron-builder.yml`, `identity:
  '-'`). Squirrel.Mac — the engine behind `electron-updater` on macOS —
  refuses to apply an update to a bundle without a Developer ID signature,
  and the mac target is `dmg`, not the `zip` that auto-update requires. A
  real auto-updater is blocked until
  `docs/superpowers/plans/2026-08-07-code-signing-and-notarization.md` lands.
  **Goetia cannot install its own update, so every path ends at the download
  page in the user's browser.**
- `.github/workflows/release.yml` publishes a GitHub release per `v*` tag
  with `.dmg`, `.exe`, and `SHA256SUMS.txt` attached, and the tag is verified
  against `package.json` version. So the latest release tag is a trustworthy
  version oracle.
- `ShellState.version` already carries `app.getVersion()` to the renderer,
  and `SettingsView` already renders an About section with it.
- The shell renderer's CSP is `default-src 'self'`, so the renderer cannot
  fetch `api.github.com` — and should not. The request belongs in main.
- `MainState.setRuntime` skips the broadcast on a no-op patch; the update
  slice follows the same report-on-change discipline.
- Goetia is a tray app that outlives its window. A check can complete while
  the window is hidden, so anything transient must wait for a visible window.

## Decision: notifier, not auto-updater

Goetia **checks and links**. It does not download, verify, or install.

Rejected alternatives:

- **Full auto-update via `electron-updater`.** Requires paid signing and
  notarization on macOS, a `zip` target, and `--publish always` in the release
  workflow. Building it now would ship a Windows-only feature with a silently
  broken macOS path.
- **Download the installer and verify it against `SHA256SUMS.txt`.** Feasible
  — the checksums are already published — but it adds asset matching per
  platform and arch, download progress, and checksum plumbing, while the user
  still has to double-click the file and clear Gatekeeper/SmartScreen by
  hand. The saved effort is one click.

## Decision: announce with a self-dismissing toast

The announcement never asks for anything. A toast slides into the corner of
the chat area, holds for eight seconds, and leaves on its own. It has no close
button and no buttons of any kind; ignoring it is a valid response.

Clicking anywhere on it opens the release page — optional, not required.

Rejected alternatives:

- **A modal dialog.** Focus-stealing on top of a chat window, and it demands
  a decision the user did not ask to make.
- **A native OS notification.** Competes with real chat notifications, and
  `NotificationRouter` is deliberately service-only and rate-limited; a
  non-service sender muddies that guarantee.
- **A persistent dismissible banner.** Costs vertical space in the chat area
  and needs per-version dismissal state — the toast plus the gear dot covers
  the same ground without either cost.

## Architecture

```text
┌─ main process ───────────────────────────────────────────┐
│  UpdateChecker (src/main/updates.ts)                     │
│    ├─ timer: +10s after launch, then every 24h           │
│    ├─ fetch → api.github.com/repos/.../releases/latest   │
│    │     (10s AbortSignal, one in-flight max)            │
│    ├─ parse + compare via lib/update-check.ts  ← pure    │
│    └─ announce gate: hold while !win.isVisible()         │
│                        │                                 │
│                        ▼                                 │
│  MainState.setUpdate({status, latest, announce})         │
│    └─ no-op guard → no broadcast when nothing changed    │
└────────────────────────┼─────────────────────────────────┘
                         ▼  'shell:state'  (existing channel)
┌─ shell renderer ─────────────────────────────────────────┐
│  UpdateToast   → 8s self-dismiss, click = open download   │
│  Rail gear     → dot persists until the user updates      │
│  Settings      → Updates section: version, check, toggle  │
└──────────────────────────────────────────────────────────┘
           │ 'updates:check' / 'updates:openDownload'
           ▼  (both shell-only, both payload-free)
   main opens the release URL it constructed itself, via
   shell.openExternal gated by isSafeExternalUrl
```

### Pure layer: `src/main/lib/update-check.ts`

All decisions live here so `updates.ts` stays thin wiring, per the
`lib/`-helper guardrail:

```ts
export const REPO = 'quyennguyenvu/goetia';

/** tag_name → bare version, or null if it is not a plain semver tag. */
export function parseLatestRelease(json: unknown): string | null;

/** -1 / 0 / 1. A prerelease sorts below its release. */
export function compareVersions(a: string, b: string): number;

export function isNewer(current: string, latest: string): boolean;

/** https://github.com/<REPO>/releases/tag/v<version> */
export function releaseUrl(version: string): string;
```

`parseLatestRelease` reads **only** `tag_name`, strips one leading `v`, and
requires `/^\d+\.\d+\.\d+(-[\w.-]+)?$/`. Anything else — a missing field, a
non-object payload, `"latest"`, `"v1.2"`, `"v1.0.0/../evil"` — returns
`null`, which the caller treats as a failed check.

The release page carries both the notes and the installers, so one URL serves
the toast click and the Download button. There is no second link to build.

### Lifecycle: `src/main/updates.ts`

`UpdateChecker` owns state transitions and timers only.

- Constructed with an injected `fetchFn` (defaults to global `fetch`), a
  `() => boolean` reading `settings.checkForUpdates`, the current version,
  and the `MainState` to write into. The injection keeps every test offline.
- `check(reason: 'auto' | 'manual'): Promise<void>` — de-dups: a call while a
  request is in flight returns the same promise and issues no second fetch.
  Only a manual check sets `checking` up front; an automatic check writes
  nothing until it has a definitive result, which is what makes a silent
  auto-failure a no-op rather than a state to unwind.
- Request: `GET https://api.github.com/repos/<REPO>/releases/latest` with
  `Accept: application/vnd.github+json`, `X-GitHub-Api-Version:
  2022-11-28`, and a `Goetia/<version>` UA (GitHub rejects UA-less
  requests). Unauthenticated, no token. The 60 requests/hour anonymous limit
  is never approached at ~1/day.
- Timeout: `AbortSignal.timeout(10_000)`.
- `start()` schedules the first check at +10s (so it never competes with
  service view boot) and an interval at 24h. `dispose()` clears both and is
  wired to `before-quit`, matching `tray.ts` and the bounded-timers rule.
- **Automatic checks are skipped when `!app.isPackaged`.** Dev runs and the
  Playwright e2e suite therefore make zero network calls; the manual check
  still works.

### The announce gate

`latest` and `announce` are separate fields because they answer different
questions: `latest` is *what exists* and drives the durable surfaces (gear
dot, Updates section); `announce` is *what the shell should toast right now*.

`UpdateChecker` sets `announce` only when all three hold:

1. a newer version was found,
2. `win.isVisible()` — otherwise the toast would play to a hidden window and
   be lost; it is held and emitted on the next `show` event, and
3. `settings.lastNotifiedVersion !== latest` — a given version is announced
   once and never again.

On announce, `lastNotifiedVersion` is persisted so a restart does not re-toast
a version the user already saw. **Assumption worth challenging:** this makes
the toast strictly once-per-version-ever. The alternative — in-memory only,
so it re-toasts once per launch — is a mild recurring nag that some users
prefer. Persisting matches the "friendly, never demanding" stance, and the
gear dot remains the permanent reminder either way.

`announce` is never cleared by main; the renderer keeps a ref of the version
it last toasted and ignores repeats. This avoids a third IPC channel whose
only job would be an acknowledgement.

## State, IPC, and settings

`src/shared/types.ts`:

```ts
export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'current'
  | 'available'
  | 'error';

export interface UpdateState {
  status: UpdateStatus;
  /** newest release seen; drives the gear dot and Updates section */
  latest: string | null;
  /** version the shell should toast now; null until the window is visible */
  announce: string | null;
}
```

- `ShellState.update: UpdateState`.
- `Settings.checkForUpdates: boolean`, `true` in `DEFAULT_SETTINGS`.
- `Settings.lastNotifiedVersion: string | null`, `null` in
  `DEFAULT_SETTINGS`. Persisted state rather than a user preference — it has
  no UI — but the `conf` store is the only persistence layer the app has, so
  it lives there.
- `SettingsStore.get()` shallow-merges `DEFAULT_SETTINGS`, so an existing
  `settings.json` picks both fields up for free; `normalize()` needs no change
  because it only reconciles per-service records.
- `MainState` gains an `update` field and `setUpdate(patch)`, using the same
  no-op guard as `setRuntime` so an unchanged result never broadcasts.

Two new channels in `src/shared/ipc.ts`, both added to `R2M_CHANNELS` **and**
`SHELL_ONLY_CHANNELS` — they carry no `serviceId`, so `ipcSenderAllowed`
accepts them only from the shell frame:

- `updates:check` — `Record<string, never>`; runs a manual check.
- `updates:openDownload` — `Record<string, never>`; main opens the URL it
  derived from its own validated state.

The renderer never supplies a URL. A fully spoofed API response can at worst
display a wrong version number; it cannot get an arbitrary link opened.

## User-visible behavior

### The toast

`src/renderer/src/components/UpdateToast.tsx`, rendered inside the content
region (not the window) so it stays clear of the rail wherever the rail sits.

- Anchored bottom-right, `16px` inset, `340px` wide, `--radius-modal`, the
  same `0 8px 32px` shadow the Settings modal uses.
- Ember-gradient squircle icon (`#FFB43D → #FF8A2A → #F04E3E`) echoing the
  rail tiles, an up-arrow glyph.
- Copy: **"Goetia 0.3.0 is available"** over "You're on 0.2.0 — click to
  download".
- A 2px ember hairline drains left-to-right over 8s. Entry is a 240ms
  slide-and-fade; exit is 200ms.
- Hover or keyboard focus pauses the countdown, so it cannot vanish
  mid-sentence.
- Click anywhere sends `updates:openDownload` and dismisses. There is no
  close button.
- `role="status"`, `aria-live="polite"`.

**Dismissal is a `setTimeout`, and the drain bar is decoration.** The
tempting implementation drives dismissal off the drain's `animationend` and
gets hover-pause free via `animation-play-state` — but `tokens.css` sets
`animation: none !important` under `prefers-reduced-motion: reduce`, so that
event never fires for those users and the toast would stay up forever. One
timer is the only dismissal path; pausing banks the remaining time and
re-arms on leave. Reduced motion is then safe by construction rather than by
a second code path, and the bar simply doesn't animate.

### The gear dot

An accent dot sits on the rail's settings gear while `status === 'available'`,
and persists after the toast expires — the toast is the announcement, the dot
is the record. It clears when the running version is no longer behind.

Clicking the gear while the dot is showing opens Settings **and scrolls the
Updates section into view**, briefly highlighting it. This is renderer-local:
`Rail` sets a `focusSection: 'updates'` flag in the zustand store,
`SettingsView` consumes and clears it. No IPC involved.

### Settings → Updates

The current About section is replaced by an **Updates** section, laid out
after the Obsidian reference the user supplied:

- **Version row** — `Version 0.2.0` with a status sub-line, and a
  `Check for updates` button on the right. When an update exists the row reads
  `Version 0.3.0 available` and the button becomes `Download`.
  Sub-line by status: `idle` → the product tagline; `checking` →
  "Checking…"; `current` → "Goetia is up to date"; `available` → "You're on
  0.2.0"; `error` → "Couldn't reach GitHub. Try again."
- **Automatic updates row** — `checkForUpdates` checkbox with the description
  "Turn this off to stop Goetia checking for new versions." The timer keeps
  running either way; `check('auto')` returns early while the setting is off,
  so no request leaves the machine and there is no start/stop plumbing in the
  settings handler to get wrong. Toggling never fires an immediate check.

`SettingsView` also scrolls to Updates when it opens with status `checking`,
which is how the menu item lands the user in the right place.

### Menu

`Check for Updates…` sits after About in the macOS app menu, and next to
Settings in the Go menu on other platforms. It calls the existing
`openSettings(ctx)` and then `check('manual')`. No native dialogs are used.

## Failure handling

**Automatic failures are silent.** Offline, DNS failure, HTTP 5xx, rate
limit, malformed payload — a background check leaves `UpdateState` exactly as
it was. No toast, no error text. Only a manual check can move the status to
`error`, because only then did the user ask a question that deserves an
answer.

A manual check always ends in `current`, `available`, or `error`.

## Testing

`tests/unit/update-check.test.ts` — the pure layer, table-driven:

- `compareVersions` across newer / older / equal, `v` prefix, and prerelease
  ordering (`0.3.0-rc.1` < `0.3.0`).
- `parseLatestRelease` rejects: missing `tag_name`, non-object payload,
  `"latest"`, `"v1.2"`, `"v1.0.0/../evil"`, and a non-string tag.
- `releaseUrl` produces the expected `https://github.com/...` form and
  passes `isSafeExternalUrl`.

`tests/unit/updates.test.ts` — `UpdateChecker` with an injected fetch and
fake timers:

- 200 + newer tag → `available` with `latest` set; 200 + same tag →
  `current`.
- HTTP 500 → `error` on a manual check, state unchanged on an auto check.
- Timeout / rejected fetch → same split.
- Two concurrent `check()` calls issue one fetch.
- `checkForUpdates: false` → auto check no-ops, manual check still fetches.
- `dispose()` clears the interval; no fetch fires after it.
- Announce gate: hidden window holds `announce` and the next `show` emits it;
  a `latest` equal to `lastNotifiedVersion` never sets `announce`;
  announcing persists `lastNotifiedVersion`.

`tests/unit/toast-rules.test.ts` — the toast's one decision, kept pure:
`shouldToast(announce, lastToasted)` fires on a new version, not on a repeat,
and never on `null`.

The component itself is covered end-to-end rather than in a unit test.
`vitest.config.ts` runs `environment: 'node'` over `tests/unit/**/*.test.ts`
only, and no React testing library is installed — adding one to assert an
8-second timer is a poor trade when Playwright already drives the real
renderer.

`tests/e2e/updates.spec.ts` — using the existing `--goetia-e2e` hook in
`index.ts`, which already fabricates runtime state for e2e, extended to seed
an available update. Asserts: the toast appears, it disappears on its own
without any interaction, the gear dot survives it, and clicking the gear
opens Settings with the Updates section scrolled into view.

`tests/unit/state.test.ts` — a no-op `setUpdate` does not notify listeners.

The existing Playwright suites must stay green; they run unpackaged, so no
network call occurs during e2e.

## Non-goals and follow-ups

Out of scope here: downloading, checksum verification, install or relaunch,
a prerelease channel, "skip this version". Those belong with the signing and
notarization work.

**Follow-up (user-requested, separate spec):** break the Settings modal into
navigable sections — General, Appearance, Services, Shortcuts, Updates —
rather than one scrolling column, following the Obsidian settings pattern.
This design deliberately keeps the single-column layout so the two changes
stay independently reviewable; the Updates section is written to drop into a
tabbed shell unchanged.

## Files touched

New:

- `src/main/lib/update-check.ts`
- `src/main/updates.ts`
- `src/renderer/src/components/UpdateToast.tsx`
- `src/renderer/src/components/toast-rules.ts`
- `tests/unit/update-check.test.ts`
- `tests/unit/updates.test.ts`
- `tests/unit/toast-rules.test.ts`
- `tests/e2e/updates.spec.ts`

Edited:

- `src/shared/types.ts` — `UpdateStatus`, `UpdateState`, `ShellState.update`,
  `Settings.checkForUpdates`, `Settings.lastNotifiedVersion`,
  `DEFAULT_SETTINGS`
- `src/shared/ipc.ts` — two channels, both shell-only
- `src/main/state.ts` — `update` slice, `setUpdate`
- `src/main/ipc-handlers.ts` — two handlers, `updates` on `AppContext`
- `src/main/menu.ts` — `Check for Updates…`
- `src/main/index.ts` — construct, `start()`, `show` hook, `before-quit`
  dispose
- `src/renderer/src/App.tsx` — mount `UpdateToast`
- `src/renderer/src/store.ts` — `focusSection` flag
- `src/renderer/src/components/Rail.tsx` — gear dot, focus-section on click
- `src/renderer/src/components/SettingsView.tsx` — Updates section replaces
  About, scroll-into-view behavior
- `src/renderer/src/tokens.css` — `toast-in` and `toast-drain` keyframes,
  added above the existing reduced-motion override so it still disables them
- `README.md`, `docs/FEATURES.md`

## Definition of done

`corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, and
`corepack pnpm e2e` all green.
