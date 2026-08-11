# Goetia — engineering guardrails

Invariants distilled from the 2026-08-07 review + security audit. Keep these true; a change that breaks one is a regression even if tests pass. Full rationale: `docs/superpowers/specs/2026-08-07-hardening-and-remediation-design.md` and the two `docs/superpowers/plans/2026-08-07-*` plans.

Definition of done for any change: `corepack pnpm lint`, `corepack pnpm typecheck`, and `corepack pnpm test` all green; `corepack pnpm e2e` for main/preload/renderer wiring; and for packaging changes a real `package:mac` build that launches (see Packaging below).

## Product principle: chat ONLY

Goetia shows each service's chat surface and nothing else — no feeds, shops, menus, or other site functions (user decision, 2026-08-07):

- Recipes hide the host site's chrome (nav menus, headers, get-app/download CTAs) via recipe `css`, gated on the chat surface being mounted so login and captcha pages stay untouched (the shopee lesson; `display: none` keeps `textContent` readable for `count()`). Off-chat in-page links (profile/avatar CTAs, shared posts) may additionally be inerted with `pointer-events: none` (messenger, instagram), and chrome with no stable selector (hash-classed rails, role=button icons) is hidden per-tick via the recipe's `hideChrome` hook (instagram's nav rail) — still cosmetic; `chatPaths` remains the containment, and `hideChrome` must never return the chat surface or an ancestor of it.
- User-initiated reload (Cmd/Ctrl+R, F5, tile context menu) returns the view to the service's chat URL via `views.refresh` — reload is the way back when a site's own links wander off chat. Crash auto-reload (`ResilienceManager`) keeps reloading the current URL.
- Sites that are more than chat (facebook, tiktok) declare `chatPaths` on their recipe: once a document has been on a chat path, SPA routing off all of them makes the runner navigate back to the service URL (`SNAPBACK_MIN_INTERVAL_MS` floor; login flows never snap because they never reach a chat path). CSS hiding is cosmetic; `chatPaths` is the containment.
- New services land on the chat URL directly (`SERVICES[].url`), not the site's home page.
- Enabling and disabling services lives on Home (the welcome screen), reachable from the rail sigil and `⌘/Ctrl 0`. Settings never gets an enable toggle back: composition behind a modal is what let a service view bury the modal it was toggled from.
- Fresh installs start with every service disabled: the shell shows the welcome screen whenever all services are disabled (derived from settings — no flag). Zero enabled services must mean zero service views; see `resolveActivation` and the startup guard.
- Launch restores the surface you left: the last active service, or Home if that is where you quit (`resolveStartupSurface`, recorded by `rememberSurface` on every change). A recorded service that is now disabled or gone opens Home rather than silently substituting another.

## Notifications & mute

- **One sound per message.** Most services ding in-page themselves, so Goetia sounds only banners the page could not have made: `notification:fired` carries `synthetic` (true only from a recipe's `synthNotification`, where the site delegates to push Electron can't receive), and `soundOptions` is the single place that decides. Setting `sound` without `silent` is a bug — macOS reads the name, Windows/Linux read the flag.
- **Mute means silence, never blindness.** Muting suppresses the banner _and_ the page's own audio (`views.applyAudioMute`, `audioMuted` = the inverse of `shouldNotify`), and leaves badges alone. `aggregateBadges` must stay ignorant of mute — the badge is how a muted service is still found.
- Every global-mute path (bell, tray, app menu, `⌘/Ctrl+⇧+M`) goes through `ctx.setGlobalMuted`, which persists, re-mutes the views and rebuilds both menus — their checkmarks are baked in at build time. Don't call `settings.update({ globalMuted })` directly.
- The accelerator is declared in the app menu only; the tray's copy of the item carries none, or one keypress fires the toggle twice.

## Process boundaries (never weaken)

- Shell window: `contextIsolation: true` + `sandbox: true`. Never turn off.
- Service views: `contextIsolation: false` + `sandbox: false` — required by the recipe workarounds. Harden _around_ this (see Security); never rely on it for isolation, and never add `nodeIntegration: true`.
- `src/shared/**` stays process-agnostic: no `electron` and no DOM imports, so it is safe to bundle into both main and the sandboxed preload.
- Pure decision logic goes in a `lib/` helper with a vitest unit test; keep `views.ts` / `index.ts` / `ipc-handlers.ts` as thin wiring.
- Service views are layered above the shell renderer, so a visible view covers any shell surface. No code path may make a view visible while `anyOverlayOpen()` is true (settings, quick switcher, home) — resolve activation with `views.activate(id, { show: false })` and let `showActive()` present it when the surface closes. Startup is a code path too: a restored-open Home must activate its view hidden.

## Security (every new service, IPC channel, or view must hold these)

- **Electron fuses** in `electron-builder.yml` stay set: `runAsNode`, `enableNodeOptionsEnvironmentVariable`, `enableNodeCliInspectArguments` off; `enableCookieEncryption`, `enableEmbeddedAsarIntegrityValidation`, `onlyLoadAppFromAsar` on; `resetAdHocDarwinSignature: true`. Valid keys are schema-checked — `enableRunAsNode` is NOT one; a bad key fails the whole config with "electronFuses should be one of these: null".
- **Entitlements**: `build/entitlements.mac.plist` grants only `allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation`. Never add `allow-dyld-environment-variables` — it reopens the injection path the fuses close.
- **IPC**: every channel is registered through the `register()` wrapper in `ipc-handlers.ts`, which enforces `ipcSenderAllowed`. A new channel MUST be classified: shell-only → add to `SHELL_ONLY_CHANNELS` in `shared/ipc.ts` (only the shell frame may send it); service channel → carry a `serviceId` field so it is validated against the sending frame. Never act on an attacker-controllable payload (persist settings, spawn, navigate) without that check.
- **External links**: only ever `shell.openExternal(url)` when `isSafeExternalUrl(url)` is true (web schemes only).
- **Permissions**: grant only via `permissionAllowed` (origin-checked; grants just `notifications` + `media`). Don't broaden the allowlist or drop the origin check.
- **Navigation containment**: `isNavigationAllowed` / `ALLOWED_HOSTS` in `navigation-policy.ts`. NOTE: the `will-navigate`/`will-redirect` guard is NOT yet wired into `views.ts` (pending a live-login pass per service). Before wiring it — or relying on it — add each service's real auth-redirect hosts to `ALLOWED_HOSTS` and confirm every login completes with no blocked navigation.
- **Notifications** flow through `NotificationRouter`, which is rate-limited per service (`NotificationThrottle`). Don't add a second, unthrottled path.
- **Renderer CSP**: `index.html` and `loading.html` keep `default-src 'self'` plus `object-src 'none'; base-uri 'self'; frame-src 'none'`. No remote scripts/styles/fonts, no `innerHTML`/`dangerouslySetInnerHTML` in the shell.

## Reliability & performance (recipes run forever, even hidden)

Recipe polling runs at the full `intervalMs` (~2s) even while a view is hidden (websockets exempt the page from Chromium throttling). So cost matters 24/7.

- `count(doc)` must be cheap and must always settle: no `getComputedStyle` / `getBoundingClientRect` sweeps over large lists (scope selectors, prefer aria/attribute signals); no `getAll()` over a whole IndexedDB store per tick. A `count()` that hangs is abandoned by the runner's `COUNT_TIMEOUT_MS` race — don't rely on that, but never return a promise that can never resolve/reject.
- Report on change only: the runner de-dups counts and only reports `stale` on the transition into stale; `MainState.setRuntime` skips the broadcast on a no-op patch. Don't reintroduce per-tick broadcasts.
- Bounded timers: any `setInterval`/`setTimeout` or `webContents`/`session` listener you add must be cleared on `destroy()` and on quit. Guard deferred callbacks with `!view.webContents.isDestroyed()`. `startReadyPoll` is capped at `READY_POLL_MAX_ATTEMPTS`; keep new polls bounded too.
- `ResilienceManager` forgets a service's crash count only after a `DWELL_MS` uptime — don't reset it on every `did-finish-load`, or the auto-reload cap stops working.
- Window resize is coalesced via `scheduleLayout()`; don't add per-event heavy work in the `resize` handler.
- Window lifecycle: the app assumes one long-lived window. With close-to-tray off the window is destroyed and the app quits; keep `broadcast()` and tray handlers guarded by `win.isDestroyed()`.

## Adding a service (do all of these)

1. Add the id to `ServiceId` and an entry to `SERVICES` (`shared/services.ts`); add it to every record in `DEFAULT_SETTINGS` (`order`, `muted`, `disabled`, `neverHibernate`) in `shared/types.ts`.
2. Write `src/preload/recipes/<id>.ts` honoring the cost rules above. Keep `ServiceMeta.waitForReady` in sync with whether the recipe defines `ready()` (`recipes.test.ts` enforces this).
3. Add a fixture in `tests/fixtures/` and a row in `recipes.test.ts` — the fixture is the oracle for the unread count; `count()` must return `{ direct: 0, indirect: 0 }` on `blank.html` and never throw.
4. Add the service's hosts (incl. auth-redirect hosts) to `ALLOWED_HOSTS` in `navigation-policy.ts`; verify a live login before trusting containment.
5. Add notification icons under `resources/notification-icons/`.
6. Don't grant it extra permissions or a new unvalidated IPC channel.

## Packaging

`corepack pnpm package:mac` produces an ad-hoc-signed DMG. Verify a real build launches and the fuses stuck: read them from the packaged app via `@electron/fuses` `getCurrentFuseWire` (byte `49`='1'/on, `48`='0'/off) — the CLI is not on PATH; require the module from `node_modules/.pnpm/node_modules/@electron/fuses`. `package:win` needs a Windows machine. Both apps are unsigned/ad-hoc: a _downloaded_ copy is gated. The ad-hoc signature is valid (`codesign --verify --deep --strict` passes) — what Gatekeeper rejects is the missing notarization ticket, so on macOS 15+ the dialog is "Apple could not verify … free of malware" (**not** "damaged", which means a _broken_ signature — a different bug) and its default button is Move to Trash. Right-click → Open was removed in macOS 15; the two working escapes are System Settings → Privacy & Security → Open Anyway, or `xattr -dr com.apple.quarantine`. Windows SmartScreen → Run anyway. Only paid signing + notarization removes the gate; locally built copies aren't quarantined. User-facing steps live in the README and `.github/release-body.md` (which is prepended to every release's notes — keep the two in sync). Ad-hoc signing also means each build's designated requirement is its own cdhash, so every rebuild re-prompts for the `Goetia Safe Storage` keychain item that `enableCookieEncryption` creates — expected, answer Always Allow, and never turn the fuse off to silence it. Fix + costs: `docs/superpowers/plans/2026-08-07-code-signing-and-notarization.md`.
