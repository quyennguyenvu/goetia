# Goetia — Multi-Service Chat Client: Design Spec

**Date:** 2026-08-04 **Status:** Approved (brainstorming complete) **Author:** quyennv + Claude

## 1. Summary

Goetia is a personal desktop chat aggregator for macOS and Windows that embeds five messaging services — WhatsApp, Messenger, Telegram, Discord, and Zalo — in one window, with native desktop notifications and unread-count badges (Ferdium's core feature set, without Ferdium's server, accounts, or 100-service marketplace). Local-only, single user, no telemetry.

**Priorities:** fast, stable, clean modern design.

## 2. Decisions & alternatives considered

| Decision            | Chosen                                                                         | Rejected alternatives                                                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Service integration | **Webview wrapper** — embed each service's official web app                    | Native protocol clients (only Telegram has an official personal API; WhatsApp/Messenger/Discord reverse-engineered libs violate ToS and risk account bans; Zalo has nothing). Hybrid TDLib+webviews (complexity for marginal gain). |
| Desktop shell       | **Electron** (latest stable)                                                   | Tauri v2 (two webview engines to test — WKWebView/WebView2; weaker multi-webview session isolation; some chat web apps degrade on non-Chrome engines). CEF (too much plumbing).                                                     |
| Codebase            | **Fresh build**, port recipe scripts from ferdium-recipes (Apache-2.0)         | Fork-and-strip Ferdium (large legacy codebase: MobX, account server, 100+ services). Configure Ferdium as-is (no custom design, nothing to build).                                                                                  |
| Visual direction    | **Graphite minimal** — dark-first neutral surfaces, one accent, slim icon rail | Native platform materials (vibrancy/Mica — finicky in Electron, two styling targets). Expressive/colorful (clashes with embedded services' own UIs).                                                                                |

### Service feasibility (verified 2026-08-04)

`ferdium-recipes` contains working recipes for all five targets: `whatsapp`, `messenger`, `telegram`, `discord`, `zalo`.

**Viber is excluded**: it has no web client at all (its desktop app is a native QR-paired client with nothing embeddable), and correspondingly no recipe exists.

## 3. Architecture

Local-only Electron app. No server, no accounts, no sync, no telemetry.

### 3.1 Main process (TypeScript)

Owns all stateful concerns:

- **Service views:** one `WebContentsView` per service (modern replacement for the deprecated `<webview>` tag / `BrowserView`), attached to a single `BrowserWindow`. Views are shown/hidden on service switch; bounds track the area beside the icon rail.
- **Session isolation:** each service gets a persistent partition (`persist:whatsapp`, `persist:zalo`, …) so cookies/logins/storage never bleed across services.
- **User-agent override:** per-session UA with the `Electron/x.y` token stripped (present a current Chrome UA). Required — WhatsApp Web and Google-family login flows block unknown UAs.
- **Badge aggregator:** folds per-service `{direct, indirect}` counts into rail badges, macOS dock badge, Windows taskbar overlay, tray tooltip.
- **Notification router:** receives intercepted notifications from preloads, shows native `Notification` with service name/icon, focuses the app and activates the source service on click. Honors per-service and global mute.
- **Hibernation controller:** destroys the webContents of background services idle > N minutes (configurable, default 30), leaves a lightweight placeholder, recreates on activation. Per-service "never hibernate" override (hibernated services cannot count unread or notify — WhatsApp/Zalo should default to never-hibernate).
- **Tray & lifecycle:** close-to-tray (window close hides, app keeps running and notifying), launch-at-login via `app.setLoginItemSettings()`, tray menu (show/hide, global mute, quit).
- **Global shortcuts:** ⌘/Ctrl+1..9 service jump, ⌘/Ctrl+K quick switcher.
- **Settings:** `electron-store` (plain local JSON in userData).

### 3.2 Per-service preload

Runs unisolated in the page context (`contextIsolation: false`, `sandbox: false`, `nodeIntegration: false`) — Ferdium's proven model for these exact services; a context-isolated preload cannot wrap `window.Notification`. The shell renderer keeps full context isolation.

- Wraps `window.Notification` to intercept notifications the web app fires and forward `{title, body, serviceId}` to main over IPC (page-side permission always reports granted).
- Runs the **recipe**: a small per-service script adapted from ferdium-recipes that extracts unread counts from the page (DOM badge elements, falling back to document-title parsing) on an interval, and reports `unread:update {serviceId, direct, indirect}`.

### 3.3 Shell renderer (React)

Chrome only — icon rail, quick switcher overlay, settings, toasts. Services render in WebContentsViews layered beside it. State: zustand store hydrated from main over typed IPC.

### 3.4 Data flow

```text
recipe/preload ──IPC unread:update──▶ main aggregator ──▶ rail badge (renderer)
                                            ├──▶ macOS app.setBadgeCount(total)
                                            ├──▶ Windows setOverlayIcon(canvas count)
                                            └──▶ tray tooltip
page Notification ──preload wrap──IPC──▶ main ──▶ native Notification
                                              └─click──▶ focus window + activate service
```

### 3.5 Error handling

- **Renderer crash** (`render-process-gone`): auto-reload the service with exponential backoff; toast + amber dot on the rail tile after repeated failures.
- **Load failure / offline:** in-place retry banner on the service view.
- **Recipe breakage** (service ships a redesign): fall back to title parsing; if that also fails, show a neutral "count may be stale" dot instead of a wrong number; log to a local file for recipe fixing.
- **Login expiry:** no special handling — the embedded web app shows its own QR/login page.

## 4. Tech stack

| Layer       | Choice                                        | Notes                                                    |
| ----------- | --------------------------------------------- | -------------------------------------------------------- |
| Shell       | Electron (latest stable), TypeScript `strict` | bundled Chromium = identical rendering on mac/win        |
| Build       | electron-vite                                 | HMR for shell UI; separate main/preload bundles          |
| Shell UI    | React 19 + Tailwind CSS v4                    | tokens as Tailwind theme values                          |
| State       | zustand                                       | shell-side only                                          |
| IPC         | typed channel wrapper                         | compile-time-checked event names/payloads                |
| Persistence | electron-store + session partitions           | settings JSON + per-service login state                  |
| Packaging   | electron-builder                              | dmg (mac universal), nsis (win x64), via GitHub Releases |
| Testing     | Vitest + Playwright-Electron                  | see §7                                                   |
| Lint/format | Biome                                         | single fast tool                                         |

## 5. Design system — "Graphite minimal"

The shell stays neutral and quiet; embedded services keep their own look.

### 5.1 Foundations

- **Typography:** system stack (SF Pro on macOS, Segoe UI Variable on Windows). Sizes: 11 / 12 / 13 (base) / 15 / 20. Badges use tabular numerals.
- **Spacing:** 4px grid — 4 / 8 / 12 / 16 / 24 / 32.
- **Radii:** 6 (controls), 10 (service tiles, cards), 14 (palette, modals).
- **Elevation:** 1px `border` hairlines over shadows; modals only get `0 8px 32px rgba(0,0,0,.4)`.
- **Motion:** 120ms ease-out (hover), 180ms `cubic-bezier(0.2,0,0,1)` (switcher open, service cross-fade). Honors `prefers-reduced-motion`.
- **Icons:** Lucide, 20px, 1.5px stroke. Service tiles use official brand logos bundled locally.
- **Theme:** follows OS light/dark, manual override in settings.

### 5.2 Color tokens

| Token    | Dark      | Light     | Use                               |
| -------- | --------- | --------- | --------------------------------- |
| `bg-0`   | `#0F1115` | `#F7F8FA` | app chrome background             |
| `bg-1`   | `#161A20` | `#FFFFFF` | rail, panels                      |
| `bg-2`   | `#1E232B` | `#F0F2F5` | hover, modals, palette            |
| `border` | `#2A303A` | `#E4E7EC` | hairlines                         |
| `text-1` | `#E7EAEF` | `#1A1E26` | primary text                      |
| `text-2` | `#9AA3AF` | `#5A6472` | secondary text                    |
| `accent` | `#4C8DFF` | `#2F6FE4` | active state, focus, links        |
| `badge`  | `#FF4D5E` | `#FF4D5E` | unread pills (white tabular text) |
| `warn`   | `#F5A623` | `#F5A623` | crashed-service dot               |
| `ok`     | `#34C77B` | `#34C77B` | connected indicator               |

All text-on-surface pairs meet WCAG AA (≥4.5:1).

### 5.3 Components

- **Icon rail (68px, `bg-1`):** 44px service tiles, radius 10. Active tile = 3px accent bar on the left edge + `bg-2` pill. Hover shows tooltip with service name + unread count. Drag to reorder. Bottom cluster: global-mute toggle, settings gear.
  - Tile states: default · hover · active · **unread** (badge pill top-right, min-width 16px) · **muted** (bell-slash mini-glyph, icon at 60%) · **hibernated** (icon at 50%) · **crashed** (amber dot).
- **Quick switcher (⌘/Ctrl+K):** 560px centered palette on `bg-2`, fuzzy match, rows = icon + name + unread count; Enter activates, ⌘/Ctrl+1..9 direct-jump without the palette.
- **Settings window:** left section nav — General / Services / Notifications / Shortcuts / About. Same tokens.
- **Toasts:** bottom-right, `bg-2`, 4s, app-level events only (service crashed, update available).
- **Accessibility:** 2px accent focus rings; rail is keyboard-navigable (arrow keys + Enter); spellcheck via Electron's built-in Chromium spellchecker with `en` and `vi` dictionaries.

## 6. v1 scope

**In:**

1. Five services: WhatsApp, Messenger, Telegram, Discord, Zalo (fixed set, reorderable).
2. Native desktop notifications with per-service mute + global mute.
3. Unread badges: rail tiles, macOS dock count, Windows taskbar overlay, tray tooltip.
4. Close-to-tray + launch-at-login.
5. Service hibernation (default 30 min idle) with per-service opt-out.
6. Quick switcher (⌘/Ctrl+K) + ⌘/Ctrl+1..9 shortcuts.
7. Light/dark theme following the OS.

**Out (explicit non-goals):**

- Viber — no web client exists.
- Multi-account per service.
- Any server component, account system, sync, or telemetry.
- Service marketplace / user-installable recipes (recipes ship in-repo).
- Cross-service message search; any message-level features.
- Linux packaging (nothing precludes it later; not built or tested in v1).
- UI translations (English-only shell).

## 7. Testing

- **Vitest units:** each recipe's count-parser against saved DOM/title fixtures (so a service redesign shows up as a red test, not a silent wrong badge); badge aggregator (per-service → dock/taskbar totals, mute logic).
- **Playwright-Electron smoke e2e:** launch → rail renders → a service view loads → inject fake `unread:update` → dock/taskbar badge reflects it.
- **Manual QA checklist:** real login flow per service (QR pairing for WhatsApp/Zalo can't be automated), notification round-trip, tray behavior on both OSes.

## 8. Risks

| Risk                             | Mitigation                                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| Service redesigns break recipes  | Fixture-backed parser tests; title-parse fallback; "stale count" dot instead of wrong numbers |
| Service blocks embedded browsers | Chrome UA per session (known-working approach in Ferdium for all five services)               |
| RAM growth with 5 web apps       | Hibernation; per-service opt-out for the ones that must stay live                             |
| Electron major-version churn     | Pin per release; upgrade deliberately, not automatically                                      |
