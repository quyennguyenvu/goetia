# Goetia features & verification

A complete inventory of what Goetia does, where each feature lives, and how it is verified. Doubles as a regression checklist: after any change, everything here should still hold. "Verified" means an automated test asserts it; "Manual" means it needs a human/live check (no automated coverage).

## Verification at a glance

- `corepack pnpm test` — 147 unit tests (Vitest), 32 files.
- `corepack pnpm e2e` — 2 Playwright-Electron specs (launch + rail + badge + service switch; loading/waking overlay).
- `corepack pnpm typecheck` (tsc) and `corepack pnpm lint` (Biome) clean.
- Manual-only areas are listed under "Manual checks" at the bottom.

## Shell & navigation

- **One window, many services** — a `WebContentsView` per service, each on an isolated `persist:<id>` session. Impl: `src/main/views.ts`. Verified: e2e launch; `tests/unit/layout.test.ts` for bounds.
- **Service rail** (top / left / right) with per-service icons. Impl: `src/renderer/src/components/Rail.tsx`, `ServiceTile.tsx`, `lib/layout.ts`. Verified: e2e (rail visible, 2 enabled tiles); `layout.test.ts`.
- **Switch active service** — click a tile, `⌘/Ctrl+1…6`, or the quick switcher. Impl: `src/main/activate.ts`, `menu.ts`, `Rail.tsx`, `QuickSwitcher.tsx`. Verified: `tests/unit/activate.test.ts` (activation broadcasts) + e2e (clicking a tile moves `aria-current`). See "Regression fixed" below.
- **Quick switcher** (`⌘/Ctrl+K`) with fuzzy search over services and recent conversations (activity log, in-memory, 🌙 on silenced rows). Impl: `QuickSwitcher.tsx`, `components/switcher-results.ts`, `main/lib/activity-log.ts`. Verified: `fuzzy.test.ts`, `switcher-results.test.ts`, `activity-log.test.ts`.
- **Reorder services** by dragging tiles. Impl: `Rail.tsx` → `service:reorder`. Verified: Manual (drag); order round-trips via `settings.test.ts`.
- **Content placeholder** — shows "Waking…", or a crash/Retry state, for the active service. Impl: `ContentPlaceholder.tsx`. Verified: Manual.

## Unread counts & badges

- **Per-service unread** extracted by recipes every ~2s. Impl: `src/preload/recipes/*`, `runner.ts`. Verified: `tests/unit/recipes.test.ts` (fixtures are the oracle), `runner-*.test.ts`.
- **Rail tile badge** (direct count, capped `99+`) and a muted-indirect dot. Impl: `ServiceTile.tsx`, `shared/badges.ts`. Verified: `tests/unit/badges.test.ts`; e2e asserts a `3` badge propagates.
- **macOS dock badge** (count, or `•` for indirect-only). Impl: `src/main/badges.ts`. Verified: e2e (`getBadgeCount() === 3` on darwin).
- **Windows taskbar overlay** (canvas badge). Impl: `App.tsx`, `components/overlay-badge.ts`, `badges.ts`. Verified: Manual (Windows).
- **Mute never hides a count** — `aggregateBadges` knows nothing about mute, so a muted service still reaches the dock, tray tooltip and taskbar overlay, matching the rail. Impl: `shared/badges.ts`. Verified: `badges.test.ts`.
- **Tray tooltip** shows the unread total. Impl: `src/main/tray.ts`. Verified: Manual.
- **Stale indicator** — a grey dot when a recipe throws. Impl: `runner.ts`, `ServiceTile.tsx`. Verified: `tests/unit/runner-stale.test.ts` (reported once per transition, not per tick).

## Notifications

- **Native OS notifications** with per-service icons. Impl: `src/main/notifications.ts`, `lib/notification-icons.ts`. Verified: `notification-icons.test.ts`; actual banner is Manual.
- **Synthetic notifications** (e.g. Messenger, which never notifies in-page). Impl: recipe `synthNotification` + `runner.ts`. Verified: `messenger-synth.test.ts`, `runner-synth.test.ts`.
- **Notification shim** — the page's `Notification` API is rerouted to native. Impl: `src/preload/lib/notification-shim.ts`. Verified: `notification-shim.test.ts`.
- **Mute / Purge** per-service (right-click a tile to mute or banish; Settings → Services → `Purge login…` clears the `persist:<id>` partition locally after a confirm, and Home's `Purge all logins…` sweeps every service including unbound ones behind an acknowledgement checkbox that gates the confirm button — impl `src/main/purge.ts`, in-app confirm `PurgeConfirm.tsx`, copy in `shared/purge-copy.ts`, verified by `purge-copy.test.ts` and `purge.spec.ts`) and global mute (bell / tray / app menu / `⌘/Ctrl+⇧+M`). Mute is silence: no banner, and the page itself is muted (`setAudioMuted`) so the site's own ding stops — the view's other audio goes with it. Badges are never touched. Every path routes through `ctx.setGlobalMuted` so the pages, both menus' checkmarks and the shell stay in step. Impl: `audioMuted` in `lib/notification-rules.ts`, `views.applyAudioMute(All)`, `index.ts`. Verified: `notification-rules.test.ts`; audio is Manual.
- **Notification sound** — Goetia sounds only the banners the page couldn't make itself (synthetic ones), so a service that dings in-page is never doubled; the Settings → Notifications toggle silences even those. Impl: `soundOptions` in `lib/notification-rules.ts`, `synthetic` on `notification:fired`. Verified: `notification-rules.test.ts`.
- **Rate limit** — per-service floor so a page can't spam banners. Impl: `lib/notification-throttle.ts`. Verified: `notification-throttle.test.ts`.
- **Click a banner** → window shows and switches to that service. Impl: `notifications.ts`. Verified: Manual.

## Service lifecycle & resilience

- **Loading / waking overlay** — a cover shown while a service loads, revealed on ready / crash / timeout. Impl: `loading-overlay.ts`, `waking.ts`, `lib/waking-rules.ts`, `preload/recipes/ready.ts`. Verified: `waking-rules.test.ts`, `ready-poll.test.ts`; e2e `loading.spec.ts`.
- **Readiness poll** — bounded so a logged-out page can't poll forever. Impl: `ready.ts` (`READY_POLL_MAX_ATTEMPTS`). Verified: `ready-poll.test.ts`.
- **Crash resilience** — auto-reload with backoff, capped at 5, the count only forgotten after a stable-uptime dwell. Impl: `resilience.ts`, `lib/backoff.ts`. Verified: `resilience.test.ts`, `backoff.test.ts`.
- **Hibernation** — idle services can be freed (config-gated; off by default). Impl: `hibernation.ts`, `lib/hibernation-rules.ts`. Verified: `hibernation-rules.test.ts`.
- **Keep-alive** — trusted clicks keep Zalo/Shopee from unmounting; the deferred hide is guarded against a destroyed view. Impl: `views.ts` (`trustedClick`), `runner.ts`, recipe `keepAlive`. Verified: `runner-keepalive.test.ts`, `zalo-keepalive.test.ts`, `shopee-keepalive.test.ts`.
- **Visibility spoof** (Zalo) — pins `visibilityState=visible`. Impl: `preload/lib/visibility-spoof.ts`. Verified: `visibility-spoof.test.ts`.
- **Reload a service** (`⌘/Ctrl+R`, `F5`, or Retry). Impl: `views.refresh`, `menu.ts`, `index.ts`. Verified: Manual.

## Window & system integration

- **Close to tray / quit** — with close-to-tray on (default) the window hides; with it off, closing quits cleanly (no zombie process). Impl: `tray.ts`, `index.ts` (`broadcast` guarded by `win.isDestroyed()`). Verified: Manual.
- **Tray menu** — show/hide, mute all, quit. Impl: `tray.ts`. Verified: Manual.
- **Launch at login**. Impl: `ipc-handlers.ts` (`app.setLoginItemSettings`). Verified: Manual.
- **Theme** system / light / dark. Impl: settings + `nativeTheme`, `store.ts` applies `data-theme`. Verified: Manual.
- **App menu** — Go menu (`⌘1…6`, reload, quick switcher), Mute All (`⌘/Ctrl+⇧+M`, checkbox), Settings. The tray carries the same mute item without the accelerator, so one keypress can't fire the toggle twice. Impl: `menu.ts`, `tray.ts`. Verified: Manual.
- **Window resize** — view bounds are re-laid-out, coalesced to one pass per burst. Impl: `views.ts` (`scheduleLayout`). Verified: Manual.

## Settings & persistence

- **Persisted settings** — order, muted, disabled, neverHibernate, zoom, theme, railPosition, closeToTray, launchAtLogin, globalMuted. Impl: `src/main/settings.ts`. Verified: `settings.test.ts`.
- **New-service reconciliation** — a service added after a `settings.json` was written appears (disabled by default) without losing prefs. Impl: `settings.ts` (`normalize`). Verified: `settings.test.ts`.
- **Corrupt-file tolerance** — a malformed `settings.json` is coerced to defaults per field instead of bricking startup. Impl: `settings.ts`. Verified: `settings.test.ts`.
- **Update check** — GitHub Releases polled 10s after launch and every 24h, plus `Check for Updates…`. Announced by a self-dismissing toast (8s) and a dot on the settings gear; the download page opens via `shell.openExternal` behind `isSafeExternalUrl`, using a URL built from a validated version, not from the API payload. Automatic checks are silent on failure and skipped when unpackaged. Impl: `src/main/updates.ts`, `src/main/lib/update-check.ts`. Verified: `update-check.test.ts`, `updates.test.ts`, `toast-rules.test.ts`, `tests/e2e/updates.spec.ts`.

## Security hardening

- **Electron fuses** — no run-as-node / NODE_OPTIONS / CLI-inspect; cookie encryption + asar integrity + load-only-from-asar on. Impl: `electron-builder.yml`. Verified: packaged-build fuse read (see CLAUDE.md "Packaging").
- **Entitlements** — minimal hardened-runtime set, no dyld-env injection. Impl: `build/entitlements.mac.plist`. Verified: `codesign -d --entitlements`.
- **IPC sender policy** — shell-only vs service channels; a service frame can't send shell channels or spoof another service's id. Impl: `lib/ipc-sender-policy.ts`, `ipc-handlers.ts`, `shared/ipc.ts`. Verified: `ipc-sender-policy.test.ts` + e2e (legit shell + service IPC still works).
- **External-link allowlist** — only `http(s)` reach the OS browser. Impl: `lib/external-url.ts`, `views.ts`. Verified: `external-url.test.ts`.
- **Permission origin check** — camera/mic/notifications only for a service's own origin. Impl: `lib/permission-policy.ts`, `views.ts`. Verified: `permission-policy.test.ts`.
- **Renderer CSP** — `default-src 'self'` plus object/base/frame locks. Impl: `renderer/index.html`, `loading.html`. Verified: e2e (pages still render).
- **Navigation allowlist** — helper + tests exist but the `will-navigate` guard is NOT yet wired (needs a live-login pass per service). Impl: `lib/navigation-policy.ts`. Verified: `navigation-policy.test.ts` (helper only). See "Not yet wired".

## Per-service recipes

Each service has a recipe (`src/preload/recipes/<id>.ts`) with a `count()`, and some define `ready()`, `keepAlive()`, `synthNotification()`, and injected `css`. All are exercised by `recipes.test.ts` against `tests/fixtures/`.

- **WhatsApp** — unread from the page's `model-storage` IndexedDB.
- **Messenger** — DOM scan + synthetic notifications (single-pass detection).
- **Telegram**, **Discord** — DOM badge counts.
- **Zalo** — tab badge; `keepRendered` + visibility spoof + keep-alive.
- **Shopee** — mini-chat widget reshaped to fill the view; keep-alive pill.

## Not yet wired / known limits

- **Navigation containment** guard is not attached to service views yet — attach only after verifying each service's real login redirects (see `CLAUDE.md`).
- **Unsigned distribution** — a downloaded build is gated by macOS Gatekeeper / Windows SmartScreen; see the README for the one-time bypass.
- **Windows packaging** (`package:win`) needs a Windows machine.

## Manual checks (no automated coverage)

Run these by hand after touching the related area: close-to-tray on/off, tray menu, launch-at-login, theme switching, reorder-by-drag, actual notification banners (and click-to-activate), the Windows taskbar overlay, window resize with several services live, and each service's live login + unread badge.

## Regression fixed this session (2026-08-07)

**Switching services didn't update the UI until a reload.** The renderer learns the active service only from `shell:state` broadcasts. `activateService` set `state.activeId` then relied on its `setRuntime(id, { hibernated: false })` call to broadcast — but the new no-op guard in `setRuntime` skips the broadcast when nothing changes, and a non-hibernated service (the normal case) means no change. Fix: `activate.ts` now calls `ctx.state.touch()` explicitly after activating. Guarded by `tests/unit/activate.test.ts` and the switch assertion in `tests/e2e/smoke.spec.ts`.
