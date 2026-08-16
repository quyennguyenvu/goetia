# Calls and screen share

Date: 2026-08-16. Status: accepted. Voice and video calls — placing, receiving, and screen sharing — work in every service whose web client supports them. Final slice of the v0.8 daily-driver phase, expanded from "screen share" after calls were found broken end-to-end (2026-08-16).

## Problem

Three independent layers each break calls, so any fix short of all three leaves some services dead:

1. **Popup call flows are structurally impossible.** `setWindowOpenHandler` in `views.ts` denies every `window.open` and hands web URLs to the OS browser. Messenger's web client opens calls in a popup window, so a call either opens uselessly in the default browser or nowhere. Confirmed as the reported Messenger failure.
2. **The packaged macOS app blocks devices at the OS level.** `hardenedRuntime: true` with `build/entitlements.mac.plist` granting no `com.apple.security.device.audio-input`/`.camera`, and no `NSMicrophoneUsageDescription`/`NSCameraUsageDescription` in the Info.plist. `getUserMedia` fails in the packaged build even for in-page callers (WhatsApp, Discord). Dev appears to work only because the stock Electron binary ships its own usage descriptions.
3. **The media permission is origin-exact.** `permissionAllowed` grants `media` only to the exact `SERVICES[].url` origin, so services whose call surface lives on a sibling origin (Teams' `teams.live.com` vs `teams.microsoft.com`, Messenger group calls on `facebook.com`) are denied. And `display-capture` — the permission Chromium raises for `getDisplayMedia` — is not in the allowlist at all, so screen share is denied before any picker could run.

## Decision

**Call popups become in-app call windows, allowlisted per service.** `src/main/lib/call-policy.ts` declares each service's call-popup patterns (`host` + `pathPrefix`, https only) and its call-capable sibling origins. Both are seeded from known web-client behavior and carry the same VERIFY-LIVE caveat as `ALLOWED_HOSTS` — a live logged-in pass per service is the oracle. A `window.open` URL matching `isCallPopup(id, url)` returns `action: 'allow'`; every other URL keeps today's deny-and-open-external. This is a deliberate, narrow amendment to the external-links rule: a call is chat, and the window is confined (below).

**The call window is harder than the service view.** It shares the `persist:<id>` session (already signed in; session-level permission and display-media handlers apply), but its `webPreferences` override to `contextIsolation: true, sandbox: true`. Electron's default `outlivesOpener: false` ties its lifetime to the opening view, so banishing or destroying a service closes its call windows with no manual registry. A `did-create-window` hook hardens each child: its own deny-all window-open handler (safe URLs to the OS browser) and a `will-navigate` guard through the existing `isNavigationAllowed` — safe on popups, where no login flow runs. The child may inherit the service preload, so the preload bails out first thing when `window.opener` is non-null: a call window runs no recipes, no notification shim, no keep-alive — the page is the call surface.

**Media permissions gain call origins; notifications stay strict.** `permissionAllowed` grants `notifications` on the service origin only, and `media` + `display-capture` on the service origin or any of the service's `CALL_ORIGINS`. Malformed URLs and unlisted permissions stay denied.

**Screen share uses the native macOS picker.** `configureSession` registers `ses.setDisplayMediaRequestHandler(fallback, { useSystemPicker: true })`: on macOS 15+ the OS shows its own screen/window picker and Goetia draws nothing. The fallback (Windows/Linux, older macOS, or a picker failure) grants the primary screen via `desktopCapturer` rather than failing the request; a custom picker UI is explicitly deferred. Session-level registration covers call popups automatically. macOS additionally gates screen capture behind the one-time Screen Recording TCC prompt — expected, documented, no code.

**Packaging unblocks devices — a guardrail amendment.** `build/entitlements.mac.plist` gains `com.apple.security.device.audio-input` and `com.apple.security.device.camera`; `electron-builder.yml` gains `mac.extendInfo` with the two usage-description strings (macOS refuses device access without them). `CLAUDE.md`'s entitlements invariant is amended to the new five-entitlement list; the prohibition on `allow-dyld-environment-variables` is untouched. Approved by the owner 2026-08-16. Verification requires a real `package:mac` build placing a call.

**Interplay with existing invariants, unchanged by design:** muting a service (or quiet hours) still silences its call audio — documented behavior. Incoming calls ring because service pages run permanently (`neverHibernate` defaults, websocket exemption). Any service whose call navigates the main document rather than popping a window must carry that route in its recipe `chatPaths` — checked during the live pass, none known today.

## Call policy

```ts
export interface CallPopupRule {
  host: string;
  pathPrefix: string;
}

/** VERIFY LIVE per service. Empty list = calls run in-page or don't exist. */
export const CALL_POPUPS: Record<ServiceId, CallPopupRule[]>;
/** Sibling origins whose getUserMedia/getDisplayMedia is the service's call
 *  surface. VERIFY LIVE. */
export const CALL_ORIGINS: Record<ServiceId, string[]>;

export function isCallPopup(id: ServiceId, url: string): boolean;
```

Seeds: messenger popups on `www.messenger.com` `/videocall` + `/groupcall` and `www.facebook.com` `/groupcall`, with `https://www.facebook.com` as a call origin; teams call origins `https://teams.live.com` + `https://teams.microsoft.com`; zalo and teams popup lists start empty pending the live pass; instagram, tiktok, shopee have no call surface.

## Testing

`tests/unit/call-policy.test.ts`: matcher accepts seeded messenger URLs, requires https, matches by path prefix, rejects other hosts/paths/junk, and every no-call service returns false for everything. `permission-policy.test.ts` extends to the new signature: sibling call origin granted for `media` and `display-capture` but not `notifications`, foreign origins still denied, empty `callOrigins` behaves exactly as before. Wiring (popup branch, `did-create-window` hardening, display-media handler) stays thin and untested; WebRTC is not e2e-able.

**The truth pass is live and lands on the owner** — per service, logged in: place a voice call, a video call, receive both, share the screen. Expected support: WhatsApp, Discord, Slack huddles, Telegram in-page; Messenger popup; Teams and Zalo to be characterized; Instagram, TikTok, Shopee none. Findings feed back into `CALL_POPUPS`/`CALL_ORIGINS` (and `chatPaths` if a main-document call route appears). The packaged-app check (entitlements + TCC prompts + a real call) is part of the same pass.

## Documentation

`CLAUDE.md`: the entitlements bullet lists the five entitlements and keeps the allow-dyld prohibition; the external-links bullet gains the call-popup exception ("only ever `shell.openExternal` when `isSafeExternalUrl`, except URLs passing `isCallPopup`, which open as hardened in-app call windows"); the adding-a-service checklist gains "declare call popups/origins in `call-policy.ts`, or leave them empty". README gains a calls bullet (voice/video calls and screen sharing work where the service's web client supports them; macOS asks for mic/camera/screen permission once).

## Addendum: blank call popups (2026-08-16, post-live-diagnosis)

The live pass showed Messenger opens its call popup as `about:blank` and script-navigates it to the call URL, so an https-only matcher can never admit it — the packaged build had correct entitlements and usage descriptions, and the missing permission prompt was purely downstream of the popup never opening. `isBlankCallPopup(id, url)` admits an `about:blank`/empty-URL popup only for services whose `CALL_POPUPS` list is non-empty; the window opens with the same hardened override, and every main-frame navigation in any call window must then pass `isCallPopup` or `isNavigationAllowed` — anything else is prevented, handed to the OS browser when `isSafeExternalUrl`, and the window closes. The direct-URL patterns in `CALL_POPUPS` remain both the gate for URL-carrying popups and the marker that a service has calls at all.

## Addendum 2: guests never navigate — call URLs are adopted (2026-08-16, supersedes the first Addendum 2)

Two facts, established by Electron's own documentation and a local minimal repro (WebContentsView opener, `sandbox: false` + Node-active preload, goetia's Electron 43), invalidated both prior containment designs:

1. An `about:blank` popup's webPreferences **cannot be overridden** — Electron copies the opener's and documents that there is no way to change them (Chromium skips browser-side navigation for blank popups). The "hardened call window" override never applied; the popup was always same-process and fully scriptable.
2. A same-process guest that **commits a navigation** crashes the shared renderer whenever the opener's Node env has work pending (electron#36858 class — the 2023 upstream fix does not cover it; reproduced on demand with Node-immediate churn: navigation commit → SIGSEGV exit 11). The service view dies to the crash placeholder and the popup survives as a black zombie window. Because it is a race, identical configurations produced different live rounds — a clean page-initiated close one round, a renderer crash the next. A control preload using only web timers never crashes, and closing a never-navigated guest is safe: the navigation commit is the sole deadly teardown.

Design: the guest popup is **inert scaffolding**. It opens hidden (`show: false` — window options, unlike webPreferences, do apply to blank popups) and is excluded from the macOS Window menu; it keeps the page's synchronous `window.open` contract alive (scriptable same-process handle, `closed === false`); and it never commits any navigation — `will-navigate` is always prevented. A navigation to an `isCallPopup` URL is **adopted**: the URL opens in a standalone call window — `contextIsolation: true`, `sandbox: true`, no preload, no opener, same `persist:<id>` partition so the signed-in session and the session-level permission and display-media handlers apply — whose own navigations must pass `isCallPopup`/`isNavigationAllowed` or it closes, and whose popups are denied (safe URLs to the OS browser). Any other guest navigation closes the guest. Call windows are tracked per service and closed on service destroy; guests die with their opener view (`outlivesOpener` default). Switching services leaves a call running — a call outlives the surface that placed it. The `did-create-window` path applies only to call-declaring services, since every other `window.open` is denied before a window exists.

## Excluded on purpose

A custom screen-share picker (system picker covers macOS; primary-screen fallback elsewhere), call-related UI in the shell (no in-app ringer, mute-mic buttons — the page owns the call), `audio: 'loopback'` system-audio capture, and any relaxation of the deny-by-default window policy beyond `isCallPopup`.
