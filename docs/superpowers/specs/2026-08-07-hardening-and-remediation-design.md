# Hardening & remediation design

Date: 2026-08-07. Status: approved pending review.

## 1. Problem

Two full code reviews (system design, main-process performance, preload/renderer performance) plus a defensive security audit surfaced a set of correctness, resource, and security issues in the v1 build. This document records every accepted finding, the fix decision for each, and what is deliberately left as accepted residual risk, so the work can be executed as two focused plans.

The security half is scoped to the owner's stated threat model:

- **Threat A — local malware running as the same user.** Stealing the six `persist:` session cookies (full account takeover), abusing the signed binary as a code-execution vehicle, or tampering with app files.
- **Threat B — hostile web content inside a service view.** A service that gets XSSed or MITMed escaping the view, abusing the IPC surface, or navigating the view (with its preload attached) to an attacker origin.
- **Threat C — tampered app/update supply chain** reachable by a local attacker.

## 2. Findings and decisions

Severity uses the reviewers' scale. "Fix" items are planned; "Accept" items are documented residual risk with rationale.

### 2.1 Security (see plan: security-hardening)

- **[Critical] No Electron fuses configured** (`electron-builder.yml`). Insecure defaults ship: `runAsNode`, `NODE_OPTIONS`, and CLI `--inspect` are enabled (binary usable as a Node interpreter / debug target), cookie encryption is off (session tokens are plaintext SQLite in `userData`), and asar integrity is unvalidated (app files are tamperable). **Fix:** add an `electronFuses:` block disabling run-as-node / node-options / cli-inspect and enabling cookie encryption + embedded-asar integrity + load-only-from-asar. Single highest-payoff change for threat A.

- **[High] `shell.openExternal` with no scheme allowlist** (`views.ts:72`). A hostile page's `window.open` hands any scheme (`file:`, `smb:`, custom) to the OS. **Fix:** open only `http:`/`https:`; drop everything else.

- **[High] Permission handler grants camera/mic to every service, no origin check** (`views.ts:44`). **Fix:** validate the requesting origin against the service's own origin and only grant permissions a service actually needs.

- **[High] No navigation containment on service views** (`views.ts`, view creation). A hostile page can navigate the top-level view (preload rides along) to an attacker origin and persist as a phishing surface. **Fix:** `will-navigate`/`will-redirect` guard pinning each view to a per-service host allowlist; everything else opens in the OS browser. Allowlist must include each service's real auth-redirect hosts — verified by live login per service. Highest-effort item; sequenced last.

- **[Medium] IPC has no sender/origin validation** (`ipc-handlers.ts:23`). Page JS cannot currently reach the privileged channels (the preload's `ipcRenderer` is closure-bound, not on `window`) except the intentional Notification shim — but there is zero defense in depth. **Fix:** classify channels shell-only vs service, require shell-only channels come from the shell `webContents`, and require service channels' `serviceId` match the sending view.

- **[Medium] No rate limit on `notification:fired`** (`notifications.ts`, `runner.ts`). A hostile page using the Notification shim can spam native banners. **Fix:** per-service minimum interval in the router.

- **[Medium] Release supply chain** (`.github/workflows/release.yml`): actions pinned to mutable major tags, no build provenance. **Fix:** SHA-pin every action; add build-provenance attestation.

- **[Low] Renderer CSP can be tightened** (`index.html`, `loading.html`): add `object-src 'none'; base-uri 'self'; frame-src 'none'`. Defense in depth; the renderer is not attacker-controlled.

- **[Low, Accept] `deleteAppDataOnUninstall: false`** leaves `persist:` sessions on disk after uninstall. Intentional (session retention across reinstalls); documented trade-off, revisited only if it becomes a concern.

- **Accepted residual risk (not fixable at this layer).** Same-user malware on an unlocked machine can keylog, screen-capture rendered chats, and relaunch the app with `--remote-debugging-port` regardless of any fix here. The fuses close the *silent, no-relaunch* paths (flat-file cookie read, env-var injection, file tampering); they do not and cannot make the app safe on an already-compromised, unlocked session. Developer ID notarization ($99/yr) is a distribution-trust measure, not a local-tamper fix — out of scope for a personal app; the asar-integrity fuse covers local tampering more cheaply.

### 2.2 Reliability and performance (see plan: reliability-and-performance)

- **[High] "Close to tray" off bricks the app** (`tray.ts:58`, `index.ts:110`). With the setting off, the window is destroyed but the process keeps running; `broadcast()` and the tray handlers then throw on the destroyed window. **Fix:** when close-to-tray is off, actually quit; guard `broadcast()` and tray handlers with `isDestroyed()`.

- **[High] Crash-reload safety cap defeated** (`resilience.ts:27`). Any successful `did-finish-load` resets the attempt counter, so a page that loads then repeatedly dies reloads forever. **Fix:** only reset the counter after a minimum uptime dwell; a crash during the dwell keeps the count.

- **[High/Medium] Messenger `count()` style/layout sweep every 2s** (`messenger.ts:12`). Per read row it calls `getComputedStyle` twice over overlapping element sets. **Fix:** single traversal computing style once per element (behaviour-preserving; the fixture still yields 3). Deeper selector narrowing needs live DOM and is out of automated scope.

- **[Medium] `startReadyPoll` never stops on logged-out pages** (`ready.ts:31`). The 250 ms poll runs forever if `ready()` never turns true. **Fix:** bound the poll to roughly the wake timeout, then stop (a late reveal cannot re-cover the current load anyway).

- **[Medium] Stale reporting has no dedup → broadcast storm** (`runner.ts:47`, `state.ts:29`, `index.ts:110`). A persistently failing recipe fires a full `ShellState` broadcast + full React re-render every tick. **Fix:** only report stale on the transition into stale; make `setRuntime` skip the change notification on a genuine no-op patch.

- **[Medium] Window resize re-bounds every view per event** (`views.ts:31`). **Fix:** coalesce `layout()` to one trailing call per burst.

- **[Medium] Corrupt `settings.json` bricks startup** (`settings.ts:9`). `normalize` assumes `order` is an array; a bad file throws on every hot path. **Fix:** coerce each field, falling back to defaults per field.

- **[Low] `connectShell` drops the IPC unsubscribe** (`store.ts:14`, `App.tsx:13`). Under StrictMode two `shell:state` listeners register. **Fix:** return the unsubscribe and use it as the effect cleanup.

- **[Low] `trustedClick` deferred `setVisible` use-after-destroy** (`views.ts:116`). **Fix:** track the timer, clear it in `destroy()`, and guard with `isDestroyed()`.

- **[Low] Runner `busy` flag can wedge on a hung `count()`** (`runner.ts:19`). **Fix:** race `count()` against a timeout so a hung tick clears `busy` and reports stale.

- **[Low] Badge-label logic duplicated with divergent caps** (`badges.ts:19` caps `9+`, `ServiceTile.tsx` caps `99+`). **Fix:** one shared formatter, one threshold. Also remove the dead `isQuitting()` export in `tray.ts:10`.

- **[Low, Accept] Overlay shown via async `did-start-navigation`** (`views.ts:83`). A sub-frame window may show a blank view before the overlay covers it. Behaviourally minor; keep unless a flash is observed.

- **[Low, Accept] `neverHibernate` defaults to true for all services** (`types.ts:57`). Hibernation is effectively disabled, so all enabled services stay resident. Left as a product decision (a live count/notify for every enabled service is the intended behaviour); revisit if RAM is a problem. Not a correctness bug.

## 3. Out of scope

- The split `activeId` ownership refactor and moving `AppContext` out of the IPC module (structural cleanups, no user-visible defect) — deferred.
- Extracting `reconcileServices` from the `settings:update` handler for testability — deferred; noted for a future refactor.
- Developer ID signing / notarization (see accepted residual risk).

## 4. Testing strategy

- Pure logic goes into `lib/`-style helpers with vitest unit tests (`isSafeExternalUrl`, permission policy, IPC sender policy, navigation allowlist, resilience dwell, ready-poll bound, runner dedup/timeout, `setRuntime` no-op, `normalize` coercion, single-pass Messenger).
- Wiring in `views.ts`/`index.ts`/`ipc-handlers.ts` stays thin and is covered by the existing e2e smoke plus manual checks.
- Config changes (fuses, workflow pinning) verified out-of-band: `npx @electron/fuses read --app <built app>`; CI dry-run of the workflow.
- Navigation containment is verified by live login through each service, since the auth-redirect hosts cannot be unit-tested.

## 5. Verification commands

- `pnpm lint`, `pnpm typecheck`, `pnpm test` for every code task.
- `pnpm e2e` (unset `ELECTRON_RUN_AS_NODE`) for wiring changes.
- `pnpm package:mac` then `npx @electron/fuses read --app 'dist/mac-arm64/Goetia.app'` for fuses.
