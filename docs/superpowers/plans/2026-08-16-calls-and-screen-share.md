# Calls and Screen Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Voice/video calls (in and out) and screen sharing work in every service whose web client supports them: call popups open as hardened in-app windows, device permissions reach call surfaces, the packaged macOS app can access mic/camera, and `getDisplayMedia` gets the native picker.

**Architecture:** Per-service popup patterns and call origins in `src/main/lib/call-policy.ts`; a narrow `action: 'allow'` branch plus `did-create-window` hardening in `views.ts`; `permissionAllowed` extended with call origins and `display-capture`; `setDisplayMediaRequestHandler(fallback, { useSystemPicker: true })` per session; entitlements + Info.plist keys for packaging. Spec: `docs/superpowers/specs/2026-08-16-calls-and-screen-share-design.md`.

**Tech Stack:** TypeScript, Electron (`setWindowOpenHandler`, `desktopCapturer`, session handlers), vitest.

## Global Constraints

- **Never run `git commit`** — user-run `/grimoire-core:commit` only; commit asks batched to the run's end.
- Corepack for all scripts; `env -u ELECTRON_RUN_AS_NODE` for e2e/dev; `npx biome check --write <paths>` after each source edit.
- Deny stays the default for `window.open`: only `isCallPopup(id, url)` URLs may return `action: 'allow'`, and child windows get their own deny-all handler plus `isNavigationAllowed` confinement.
- Call windows override to `contextIsolation: true, sandbox: true` — harder than the service view, never softer; rely on Electron's default `outlivesOpener: false` for lifetime.
- `notifications` permission never extends beyond the service origin; only `media` and `display-capture` may use `CALL_ORIGINS`.
- The entitlements file gains exactly `com.apple.security.device.audio-input` and `com.apple.security.device.camera` — `allow-dyld-environment-variables` stays banned.
- Markdown edits pass `npx markdownlint-cli2 <file>`; prose never hard-wrapped.

---

### Task 1: Call policy

**Files:**

- Create: `src/main/lib/call-policy.ts`
- Test: `tests/unit/call-policy.test.ts`

**Interfaces:**

- Consumes: `ServiceId` from shared types.
- Produces: `CallPopupRule`, `CALL_POPUPS: Record<ServiceId, CallPopupRule[]>`, `CALL_ORIGINS: Record<ServiceId, string[]>`, `isCallPopup(id: ServiceId, url: string): boolean` — Tasks 2–3 import them.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/call-policy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CALL_ORIGINS, CALL_POPUPS, isCallPopup } from '../../src/main/lib/call-policy';
import { SERVICES } from '../../src/shared/services';

describe('isCallPopup', () => {
  it('accepts the seeded messenger call popups', () => {
    expect(isCallPopup('messenger', 'https://www.messenger.com/videocall/?id=1')).toBe(true);
    expect(isCallPopup('messenger', 'https://www.messenger.com/groupcall/room/x')).toBe(true);
    expect(isCallPopup('messenger', 'https://www.facebook.com/groupcall/room/x')).toBe(true);
  });

  it('requires https', () => {
    expect(isCallPopup('messenger', 'http://www.messenger.com/videocall/')).toBe(false);
    expect(isCallPopup('messenger', 'file:///videocall')).toBe(false);
  });

  it('matches by exact host and path prefix only', () => {
    expect(isCallPopup('messenger', 'https://evil.messenger.com/videocall/')).toBe(false);
    expect(isCallPopup('messenger', 'https://www.messenger.com/marketplace')).toBe(false);
  });

  it('rejects junk without throwing', () => {
    expect(isCallPopup('messenger', 'not a url')).toBe(false);
    expect(isCallPopup('messenger', '')).toBe(false);
  });

  it('returns false for everything on services with no call popups', () => {
    expect(isCallPopup('whatsapp', 'https://web.whatsapp.com/call')).toBe(false);
    expect(isCallPopup('shopee', 'https://shopee.vn/anything')).toBe(false);
  });

  it('declares both maps for every service in the catalog', () => {
    for (const { id } of SERVICES) {
      expect(Array.isArray(CALL_POPUPS[id])).toBe(true);
      expect(Array.isArray(CALL_ORIGINS[id])).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `corepack pnpm test tests/unit/call-policy.test.ts` — expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

Create `src/main/lib/call-policy.ts`:

```ts
import type { ServiceId } from '../../shared/types';

export interface CallPopupRule {
  host: string;
  pathPrefix: string;
}

/** Popup URLs that ARE a service's call surface — the only window.open
 *  targets allowed to open as in-app call windows. Seeded from known web
 *  client behavior; VERIFY LIVE per service before trusting a pattern.
 *  Empty list = the service calls in-page or not at all. */
export const CALL_POPUPS: Record<ServiceId, CallPopupRule[]> = {
  messenger: [
    { host: 'www.messenger.com', pathPrefix: '/videocall' },
    { host: 'www.messenger.com', pathPrefix: '/groupcall' },
    { host: 'www.facebook.com', pathPrefix: '/groupcall' },
  ],
  whatsapp: [],
  instagram: [],
  telegram: [],
  discord: [],
  // zalo and teams may pop call/meeting windows — characterize during the
  // live pass and fill these in
  zalo: [],
  teams: [],
  tiktok: [],
  shopee: [],
  slack: [],
};

/** Sibling origins whose getUserMedia/getDisplayMedia is the service's call
 *  surface (media and display-capture only, never notifications).
 *  VERIFY LIVE. */
export const CALL_ORIGINS: Record<ServiceId, string[]> = {
  messenger: ['https://www.facebook.com'],
  whatsapp: [],
  instagram: [],
  telegram: [],
  discord: [],
  zalo: [],
  teams: ['https://teams.live.com', 'https://teams.microsoft.com'],
  tiktok: [],
  shopee: [],
  slack: [],
};

export function isCallPopup(id: ServiceId, url: string): boolean {
  try {
    const { protocol, host, pathname } = new URL(url);
    if (protocol !== 'https:') return false;
    return CALL_POPUPS[id].some((r) => r.host === host && pathname.startsWith(r.pathPrefix));
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Gates**

Run: `npx biome check --write src/main/lib/call-policy.ts tests/unit/call-policy.test.ts`, then `corepack pnpm test tests/unit/call-policy.test.ts` (expected: 6 passed), then `corepack pnpm test && corepack pnpm typecheck && corepack pnpm lint` — all green.

Suggested commit: `feat(calls): add per-service call popup and origin policy`.

---

### Task 2: Permissions reach call surfaces

**Files:**

- Modify: `src/main/lib/permission-policy.ts`
- Modify: `src/main/views.ts` (`configureSession` passes `callOrigins`)
- Test: `tests/unit/permission-policy.test.ts` (extend)

**Interfaces:**

- Consumes: `CALL_ORIGINS` from Task 1.
- Produces: `permissionAllowed(opts: { permission; requestingUrl; serviceUrl; callOrigins?: readonly string[] })`.

- [ ] **Step 1: Extend the tests**

Append inside `describe('permissionAllowed', …)` in `tests/unit/permission-policy.test.ts`:

```ts
  it('grants media and display-capture on a declared call origin', () => {
    for (const permission of ['media', 'display-capture']) {
      expect(
        permissionAllowed({
          permission,
          requestingUrl: 'https://teams.live.com/call/x',
          serviceUrl: 'https://teams.microsoft.com/',
          callOrigins: ['https://teams.live.com'],
        }),
      ).toBe(true);
    }
  });

  it('never extends notifications to a call origin', () => {
    expect(
      permissionAllowed({
        permission: 'notifications',
        requestingUrl: 'https://teams.live.com/call/x',
        serviceUrl: 'https://teams.microsoft.com/',
        callOrigins: ['https://teams.live.com'],
      }),
    ).toBe(false);
  });

  it('denies a foreign origin even with call origins declared', () => {
    expect(
      permissionAllowed({
        permission: 'media',
        requestingUrl: 'https://evil.example/x',
        serviceUrl: svc,
        callOrigins: ['https://teams.live.com'],
      }),
    ).toBe(false);
  });

  it('grants display-capture on the service origin itself', () => {
    expect(
      permissionAllowed({ permission: 'display-capture', requestingUrl: svc, serviceUrl: svc }),
    ).toBe(true);
  });
```

Run: `corepack pnpm test tests/unit/permission-policy.test.ts` — expected: the call-origin and display-capture cases FAIL.

- [ ] **Step 2: Implement**

Replace the body of `src/main/lib/permission-policy.ts`:

```ts
const GRANTED = new Set(['notifications', 'media', 'display-capture']);
/** Device/screen access may also come from a service's declared call
 *  surface (call-policy CALL_ORIGINS). Notifications never do. */
const CALL_SURFACE_OK = new Set(['media', 'display-capture']);

/** Grant only the permissions a chat service needs, and only to its own
 *  origin — plus, for calls, the service's declared call origins. A page
 *  navigated/redirected elsewhere gets nothing. */
export function permissionAllowed(opts: {
  permission: string;
  requestingUrl: string;
  serviceUrl: string;
  callOrigins?: readonly string[];
}): boolean {
  if (!GRANTED.has(opts.permission)) return false;
  try {
    const origin = new URL(opts.requestingUrl).origin;
    if (origin === new URL(opts.serviceUrl).origin) return true;
    return CALL_SURFACE_OK.has(opts.permission) && (opts.callOrigins ?? []).includes(origin);
  } catch {
    return false;
  }
}
```

In `src/main/views.ts`, add to the imports (biome sorts):

```ts
import { CALL_ORIGINS, isCallPopup } from './lib/call-policy';
import { isNavigationAllowed } from './lib/navigation-policy';
```

and in `configureSession`, both handlers gain the field — the request handler becomes:

```ts
    ses.setPermissionRequestHandler((_wc, permission, cb, details) =>
      cb(
        permissionAllowed({
          permission,
          requestingUrl: details.requestingUrl ?? '',
          serviceUrl,
          callOrigins: CALL_ORIGINS[id],
        }),
      ),
    );
    ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) =>
      permissionAllowed({
        permission,
        requestingUrl: requestingOrigin,
        serviceUrl,
        callOrigins: CALL_ORIGINS[id],
      }),
    );
```

(`isCallPopup`/`isNavigationAllowed` become used in Task 3; if lint flags them as unused at this point, add the imports in Task 3 instead.)

- [ ] **Step 3: Gates**

`npx biome check --write src/main/lib/permission-policy.ts src/main/views.ts tests/unit/permission-policy.test.ts`, then full `corepack pnpm test && corepack pnpm typecheck && corepack pnpm lint` — all green.

Suggested commit: `feat(calls): extend media permissions to call surfaces`.

---

### Task 3: Call popups open as hardened in-app windows

**Files:**

- Modify: `src/main/views.ts` (`setWindowOpenHandler` branch + `did-create-window`)
- Modify: `src/preload/service.ts` (opener guard)

**Interfaces:**

- Consumes: `isCallPopup`, `isNavigationAllowed` (imported in Task 2).
- Produces: runtime behavior only.

- [ ] **Step 1: The allow branch and child hardening**

In `create(id)` in `src/main/views.ts`, replace the window-open handler with:

```ts
    wc.setWindowOpenHandler(({ url }) => {
      // a call is chat: the service's declared call popups open as hardened
      // in-app windows (same session, isolation ON, lifetime tied to opener)
      if (isCallPopup(id, url)) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 1080,
            height: 720,
            backgroundColor: '#0F1115',
            webPreferences: { contextIsolation: true, sandbox: true },
          },
        };
      }
      // external links open in the OS browser, never inside Goetia; only
      // web schemes — a hostile page must not reach file:/smb:/custom
      if (isSafeExternalUrl(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    wc.on('did-create-window', (child) => {
      // a call window is not a browser: no further popups, and navigation
      // stays inside the service's allowed hosts (no login flow runs here)
      child.webContents.setWindowOpenHandler(({ url }) => {
        if (isSafeExternalUrl(url)) shell.openExternal(url);
        return { action: 'deny' };
      });
      child.webContents.on('will-navigate', (e, url) => {
        if (!isNavigationAllowed(id, url)) e.preventDefault();
      });
    });
```

- [ ] **Step 2: Preload bails in call popups**

Read `src/preload/service.ts` in full first. After the `const recipe = recipes[serviceId];` line, insert:

```ts
/** A call popup (window.open allowed by call-policy) can inherit this preload.
 *  The popup IS the call surface: no recipes, shims, or keep-alive belong here. */
const inCallPopup = window.opener !== null;
```

then wrap every statement below it (from the `keepRendered` visibility-spoof line through the end of the file) in `if (!inCallPopup) { … }`, reindenting the block one level. No statement is removed or reordered.

- [ ] **Step 3: Gates**

`npx biome check --write src/main/views.ts src/preload/service.ts`, then `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test` — all green (recipes tests run the preload pieces directly; `window.opener` is null under happy-dom, so nothing changes).

Suggested commit: `feat(calls): open declared call popups as hardened in-app windows`.

---

### Task 4: Screen share

**Files:**

- Modify: `src/main/views.ts` (`configureSession` + `desktopCapturer` import)

**Interfaces:**

- Consumes: nothing new.
- Produces: runtime behavior only (session-level, so call popups are covered).

- [ ] **Step 1: Register the display-media handler**

Add `desktopCapturer` to the electron import in `src/main/views.ts`. In `configureSession`, after the permission handlers, add:

```ts
    ses.setDisplayMediaRequestHandler(
      (_request, callback) => {
        // fallback when the native picker is unavailable (Windows/Linux,
        // older macOS) or fails: share the primary screen, don't fail the call
        desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
          callback(sources[0] ? { video: sources[0] } : {});
        });
      },
      { useSystemPicker: true },
    );
```

- [ ] **Step 2: Gates**

`npx biome check --write src/main/views.ts`, then `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test` — all green.

Suggested commit: `feat(calls): native screen-share picker with primary-screen fallback`.

---

### Task 5: Packaging, docs, gates, manual matrix

**Files:**

- Modify: `build/entitlements.mac.plist`, `electron-builder.yml`
- Modify: `CLAUDE.md` (entitlements bullet, external-links bullet, add-a-service checklist), `README.md` (calls bullet)
- Modify: `tests/e2e` — none (WebRTC is not e2e-able)

- [ ] **Step 1: Entitlements**

In `build/entitlements.mac.plist`, before the closing `</dict>`, add:

```xml
    <!-- Calls are chat: WebRTC needs mic and camera under the hardened
         runtime; without these the OS denies getUserMedia in the packaged app. -->
    <key>com.apple.security.device.audio-input</key>
    <true/>
    <key>com.apple.security.device.camera</key>
    <true/>
```

- [ ] **Step 2: Info.plist usage strings**

In `electron-builder.yml` under `mac:`, after the `entitlementsInherit` line, add:

```yaml
  # macOS refuses mic/camera access without usage descriptions in Info.plist
  extendInfo:
    NSMicrophoneUsageDescription: Goetia uses the microphone for voice and video calls in your chat services.
    NSCameraUsageDescription: Goetia uses the camera for video calls in your chat services.
```

- [ ] **Step 3: CLAUDE.md and README**

CLAUDE.md — three edits, keeping each bullet one unwrapped line:

1. The Entitlements bullet's grant list becomes: `` grants only `allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation`, and the call-media pair `device.audio-input` + `device.camera` (2026-08-16 — calls are chat). `` The `allow-dyld-environment-variables` sentence is untouched.
2. The External links bullet gains: `` Sole exception: a `window.open` URL passing `isCallPopup` (`lib/call-policy.ts`) opens as an in-app call window hardened above the service view (isolation+sandbox ON, same session, nav confined by `isNavigationAllowed`, closed with its opener; the service preload bails on `window.opener`). ``
3. Add-a-service checklist item 4 gains: `` Declare its call popups and sibling call origins in `lib/call-policy.ts` (empty lists if it has no calls). ``

README — after the right-click bullet in "Handy to know", add:

```markdown
- **Calls work like in the browser**: voice and video calls, and screen sharing, work wherever the service's web app supports them (macOS asks once each for microphone, camera, and screen recording). Services that open calls in a pop-up get their own Goetia call window.
```

- [ ] **Step 4: All gates**

`npx markdownlint-cli2 README.md CLAUDE.md docs/superpowers/specs/2026-08-16-calls-and-screen-share-design.md docs/superpowers/plans/2026-08-16-calls-and-screen-share.md` — 0 issues. `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test` — green. `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e` — all specs pass (no call surface is exercised, the suite guards regressions).

- [ ] **Step 5: Hand the live matrix to the user**

Per service, logged in (dev for iteration, then a real `package:mac` build for the entitlements/TCC check): place a voice call, a video call, receive both, share the screen. Messenger specifically: the call button must open a Goetia call window (not the browser); characterize Zalo and Teams (popup vs in-page; fill `CALL_POPUPS`/`CALL_ORIGINS`); confirm macOS prompts once each for mic/camera/screen and calls carry audio+video in the packaged app.

Suggested commit: `feat(calls): unblock packaged mic/camera and document call support`.
