# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden Goetia against local malware (threat A), hostile service pages (threat B), and a tampered supply chain (threat C), per the remediation design.

**Architecture:** Electron fuses lock down the packaged binary and encrypt session cookies at rest. Service-view creation gains a scheme allowlist for external opens, an origin-checked permission handler, and per-service navigation containment. The IPC layer gains a sender-origin policy and the notification router a per-service rate limit. The release workflow pins actions by SHA and attests build provenance. Pure decision logic lives in small helpers with unit tests; only thin wiring touches Electron objects.

**Tech Stack:** Electron 43, electron-builder 26, TypeScript, vitest (happy-dom), GitHub Actions.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-07-hardening-and-remediation-design.md`
- **No `git commit` anywhere** — the repo owner commits via `/commit`.
- Verify code tasks with: `pnpm lint`, `pnpm typecheck`, `pnpm test`; wiring tasks also with `pnpm e2e` (unset `ELECTRON_RUN_AS_NODE` first).
- Never weaken the shell window's `contextIsolation: true` / `sandbox: true`.
- Service views keep `contextIsolation: false` / `sandbox: false` (required by the recipe workarounds) — hardening works *around* that, not by flipping it.

---

### Task 1: Electron fuses

**Files:**

- Modify: `electron-builder.yml`

**Interfaces:**

- Produces: a packaged binary with run-as-node / node-options / cli-inspect disabled and cookie-encryption + asar-integrity + load-only-from-asar enabled.

- [ ] **Step 1: Add the fuses block**

Append to `electron-builder.yml` (top-level key, sibling of `mac:`):

```yaml
# Locks the packaged binary: no run-as-node / NODE_OPTIONS / --inspect
# code-exec paths, session cookies encrypted via OS keychain (not plaintext
# SQLite), and the asar is integrity-checked and the only load source.
electronFuses:
  runAsNode: false
  enableNodeOptionsEnvironmentVariable: false
  enableNodeCliInspectArguments: false
  enableCookieEncryption: true
  enableEmbeddedAsarIntegrityValidation: true
  onlyLoadAppFromAsar: true
  # flipping fuses invalidates the signature; re-apply the ad-hoc signature
  # (identity '-') macOS needs for Notification Center
  resetAdHocDarwinSignature: true
```

> **Note:** keys are validated against electron-builder's schema — `enableRunAsNode` is NOT valid (only `runAsNode`); including it fails the whole config with "configuration.electronFuses should be one of these: null". `resetAdHocDarwinSignature: true` keeps the binary ad-hoc signed after fuse-flipping, which this app's notifications depend on.

- [ ] **Step 2: Confirm the fuses dependency resolves**

Run: `pnpm why @electron/fuses` Expected: present (transitive via electron-builder). If absent, add it: `pnpm add -D @electron/fuses`.

- [ ] **Step 3: Build and read back the fuses**

Run:

```bash
pnpm package:mac
npx @electron/fuses read --app 'dist/mac-arm64/Goetia.app'
```

Expected: `RunAsNode` off, `EnableNodeOptionsEnvironmentVariable` off, `EnableNodeCliInspectArguments` off, `EnableCookieEncryption` on, `EnableEmbeddedAsarIntegrityValidation` on, `OnlyLoadAppFromAsar` on.

- [ ] **Step 4: Manual smoke — app still launches and notifies**

Launch the built app, confirm it opens and a service loads. Cookie encryption changes the at-rest format; existing dev `persist:` data is unaffected because dev is unpackaged. Note in the PR that the first packaged launch re-encrypts cookies.

---

### Task 2: `shell.openExternal` scheme allowlist

**Files:**

- Create: `src/main/lib/external-url.ts`
- Test: `tests/unit/external-url.test.ts`
- Modify: `src/main/views.ts:72-76`

**Interfaces:**

- Produces: `isSafeExternalUrl(url: string): boolean` — true only for `http:`/`https:`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/external-url.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isSafeExternalUrl } from '../../src/main/lib/external-url';

describe('isSafeExternalUrl', () => {
  it('allows http and https', () => {
    expect(isSafeExternalUrl('https://example.com')).toBe(true);
    expect(isSafeExternalUrl('http://example.com')).toBe(true);
  });
  it('rejects dangerous schemes', () => {
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeExternalUrl('smb://host/share')).toBe(false);
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
  });
  it('rejects malformed input', () => {
    expect(isSafeExternalUrl('not a url')).toBe(false);
    expect(isSafeExternalUrl('')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/external-url.test.ts` Expected: FAIL — cannot find module `external-url`.

- [ ] **Step 3: Implement the helper**

Create `src/main/lib/external-url.ts`:

```ts
/** Only web links may be handed to the OS; file:/smb:/custom schemes from a
 *  hostile page's window.open are dropped. */
export function isSafeExternalUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/external-url.test.ts` Expected: PASS.

- [ ] **Step 5: Wire it into the window-open handler**

In `src/main/views.ts`, add the import near the top:

```ts
import { isSafeExternalUrl } from './lib/external-url';
```

Replace the handler at `views.ts:72-76`:

```ts
    wc.setWindowOpenHandler(({ url }) => {
      // external links open in the OS browser, never inside Goetia; only
      // web schemes — a hostile page must not reach file:/smb:/custom
      if (isSafeExternalUrl(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
```

- [ ] **Step 6: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm test` Expected: PASS.

---

### Task 3: Origin-checked permission handler

**Files:**

- Create: `src/main/lib/permission-policy.ts`
- Test: `tests/unit/permission-policy.test.ts`
- Modify: `src/main/views.ts:38-48`

**Interfaces:**

- Consumes: `serviceById` from `src/shared/services.ts`, `ServiceId`.
- Produces: `permissionAllowed(opts): boolean` where `opts = { permission: string; requestingUrl: string; serviceUrl: string }` — grants only `notifications`/`media`, and only when the requesting origin equals the service's own origin.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/permission-policy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { permissionAllowed } from '../../src/main/lib/permission-policy';

const svc = 'https://www.facebook.com/messages/';

describe('permissionAllowed', () => {
  it('grants notifications on the service origin', () => {
    expect(
      permissionAllowed({
        permission: 'notifications',
        requestingUrl: 'https://www.facebook.com/messages/t/1',
        serviceUrl: svc,
      }),
    ).toBe(true);
  });
  it('denies a foreign origin even for a granted permission', () => {
    expect(
      permissionAllowed({
        permission: 'media',
        requestingUrl: 'https://evil.example/x',
        serviceUrl: svc,
      }),
    ).toBe(false);
  });
  it('denies permissions outside the allowlist', () => {
    expect(
      permissionAllowed({
        permission: 'geolocation',
        requestingUrl: svc,
        serviceUrl: svc,
      }),
    ).toBe(false);
  });
  it('denies malformed requesting urls', () => {
    expect(
      permissionAllowed({
        permission: 'notifications',
        requestingUrl: '',
        serviceUrl: svc,
      }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/permission-policy.test.ts` Expected: FAIL — cannot find module `permission-policy`.

- [ ] **Step 3: Implement the helper**

Create `src/main/lib/permission-policy.ts`:

```ts
const GRANTED = new Set(['notifications', 'media']);

/** Grant only the permissions a chat service needs, and only to its own
 *  origin — a page navigated/redirected elsewhere gets nothing. */
export function permissionAllowed(opts: {
  permission: string;
  requestingUrl: string;
  serviceUrl: string;
}): boolean {
  if (!GRANTED.has(opts.permission)) return false;
  try {
    return new URL(opts.requestingUrl).origin === new URL(opts.serviceUrl).origin;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/permission-policy.test.ts` Expected: PASS.

- [ ] **Step 5: Wire it into the session handlers**

In `src/main/views.ts`, add the import:

```ts
import { permissionAllowed } from './lib/permission-policy';
```

Replace `configureSession` (`views.ts:38-48`):

```ts
  private configureSession(id: ServiceId) {
    const ses = session.fromPartition(`persist:${id}`);
    const serviceUrl = serviceById(id).url;
    const wanted = ['en-US', 'vi'];
    ses.setSpellCheckerLanguages(
      wanted.filter((l) => ses.availableSpellCheckerLanguages.includes(l)),
    );
    ses.setPermissionRequestHandler((_wc, permission, cb, details) =>
      cb(
        permissionAllowed({
          permission,
          requestingUrl: details.requestingUrl ?? '',
          serviceUrl,
        }),
      ),
    );
    ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) =>
      permissionAllowed({
        permission,
        requestingUrl: requestingOrigin,
        serviceUrl,
      }),
    );
    return ses;
  }
```

- [ ] **Step 6: Verify (and manual media check)**

Run: `pnpm lint && pnpm typecheck && pnpm test` Expected: PASS. Manual: notifications still fire for an enabled service. Media is only exercised if a service starts a call; note in the PR that call-capable services (none by default) would need their permission kept.

---

### Task 4: IPC sender-origin policy

**Files:**

- Create: `src/main/lib/ipc-sender-policy.ts`
- Test: `tests/unit/ipc-sender-policy.test.ts`
- Modify: `src/main/views.ts` (add `serviceIdForFrame`), `src/shared/ipc.ts` (export channel classification), `src/main/ipc-handlers.ts:23-28`

**Interfaces:**

- Consumes: `R2M_CHANNELS`, `RendererToMain` from `src/shared/ipc.ts`.
- Produces:
  - `SHELL_ONLY_CHANNELS: ReadonlySet<keyof RendererToMain>` in `src/shared/ipc.ts`.
  - `ServiceViewManager.serviceIdForFrameUrl(url: string): ServiceId | null`.
  - `ipcSenderAllowed(opts): boolean` in `ipc-sender-policy.ts`.

- [ ] **Step 1: Classify channels in shared/ipc.ts**

Append to `src/shared/ipc.ts`:

```ts
/** Channels only the trusted shell renderer may send. Everything else is a
 *  service-preload channel carrying its own serviceId. */
export const SHELL_ONLY_CHANNELS = new Set<keyof RendererToMain>([
  'service:activate',
  'service:setMuted',
  'service:reorder',
  'service:reload',
  'global:setMuted',
  'switcher:setOpen',
  'settings:setOpen',
  'settings:update',
  'badge:overlay',
]);
```

- [ ] **Step 2: Write the failing test for the policy**

Create `tests/unit/ipc-sender-policy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ipcSenderAllowed } from '../../src/main/lib/ipc-sender-policy';

describe('ipcSenderAllowed', () => {
  it('allows a shell-only channel from the shell frame', () => {
    expect(
      ipcSenderAllowed({
        channel: 'settings:update',
        fromShell: true,
        senderServiceId: null,
        payloadServiceId: undefined,
      }),
    ).toBe(true);
  });
  it('rejects a shell-only channel from a service frame', () => {
    expect(
      ipcSenderAllowed({
        channel: 'settings:update',
        fromShell: false,
        senderServiceId: 'messenger',
        payloadServiceId: undefined,
      }),
    ).toBe(false);
  });
  it('allows a service channel when the sender matches the payload id', () => {
    expect(
      ipcSenderAllowed({
        channel: 'notification:fired',
        fromShell: false,
        senderServiceId: 'messenger',
        payloadServiceId: 'messenger',
      }),
    ).toBe(true);
  });
  it('rejects a service channel spoofing another service id', () => {
    expect(
      ipcSenderAllowed({
        channel: 'notification:fired',
        fromShell: false,
        senderServiceId: 'messenger',
        payloadServiceId: 'discord',
      }),
    ).toBe(false);
  });
  it('rejects a service channel from an unknown frame', () => {
    expect(
      ipcSenderAllowed({
        channel: 'unread:update',
        fromShell: false,
        senderServiceId: null,
        payloadServiceId: 'zalo',
      }),
    ).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/ipc-sender-policy.test.ts` Expected: FAIL — cannot find module `ipc-sender-policy`.

- [ ] **Step 4: Implement the policy**

Create `src/main/lib/ipc-sender-policy.ts`:

```ts
import { type RendererToMain, SHELL_ONLY_CHANNELS } from '../../shared/ipc';
import type { ServiceId } from '../../shared/types';

/** True when this sender is allowed to use this channel. Shell-only channels
 *  must come from the shell frame; service channels must come from the frame
 *  of the very service named in the payload. */
export function ipcSenderAllowed(opts: {
  channel: keyof RendererToMain;
  fromShell: boolean;
  senderServiceId: ServiceId | null;
  payloadServiceId: ServiceId | undefined;
}): boolean {
  if (SHELL_ONLY_CHANNELS.has(opts.channel)) return opts.fromShell;
  if (opts.senderServiceId === null) return false;
  return opts.senderServiceId === opts.payloadServiceId;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/ipc-sender-policy.test.ts` Expected: PASS.

- [ ] **Step 6: Add frame→service lookup on the view manager**

In `src/main/views.ts`, add a public method to `ServiceViewManager` (after `has`):

```ts
  /** The service whose view owns this webContents id, or null. */
  serviceIdForWebContentsId(wcId: number): ServiceId | null {
    for (const [id, view] of this.views) {
      if (view.webContents.id === wcId) return id;
    }
    return null;
  }
```

- [ ] **Step 7: Enforce the policy in the IPC dispatcher**

In `src/main/ipc-handlers.ts`, change the `on` wrapper (`ipc-handlers.ts:23`) to validate the sender. Replace lines 23-28:

```ts
function register(ctx: AppContext): <C extends keyof RendererToMain>(
  channel: C,
  fn: (payload: RendererToMain[C]) => void,
) => void {
  return (channel, fn) => {
    ipcMain.on(channel, (e, payload) => {
      const fromShell = e.sender.id === ctx.win.webContents.id;
      const senderServiceId = ctx.views.serviceIdForWebContentsId(e.sender.id);
      const p = payload as { serviceId?: import('../shared/types').ServiceId };
      if (
        !ipcSenderAllowed({
          channel,
          fromShell,
          senderServiceId,
          payloadServiceId: p?.serviceId,
        })
      ) {
        return; // drop spoofed / cross-service messages
      }
      fn(payload as RendererToMain[C]);
    });
  };
}
```

Add imports at the top of `ipc-handlers.ts`:

```ts
import { ipcSenderAllowed } from './lib/ipc-sender-policy';
```

Then in `registerIpcHandlers`, bind the closure once at the top and keep every existing `on(...)` call unchanged:

```ts
export function registerIpcHandlers(
  ctx: AppContext,
  router: NotificationRouter,
): void {
  const on = register(ctx);
  // …existing on('service:activate', …) etc. unchanged…
}
```

- [ ] **Step 8: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e` Expected: PASS. The e2e drives real service + shell frames, so a broken policy (dropping legitimate `unread:update` / `service:activate`) fails the smoke test.

---

### Task 5: Per-service notification rate limit

**Files:**

- Create: `src/main/lib/notification-throttle.ts`
- Test: `tests/unit/notification-throttle.test.ts`
- Modify: `src/main/notifications.ts`

**Interfaces:**

- Produces: `NotificationThrottle` class with `allow(id: ServiceId, now: number): boolean`, min interval 800 ms.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/notification-throttle.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { NotificationThrottle } from '../../src/main/lib/notification-throttle';

describe('NotificationThrottle', () => {
  it('allows the first banner and blocks a burst within the window', () => {
    const t = new NotificationThrottle(800);
    expect(t.allow('messenger', 0)).toBe(true);
    expect(t.allow('messenger', 500)).toBe(false);
    expect(t.allow('messenger', 900)).toBe(true);
  });
  it('tracks services independently', () => {
    const t = new NotificationThrottle(800);
    expect(t.allow('messenger', 0)).toBe(true);
    expect(t.allow('discord', 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/notification-throttle.test.ts` Expected: FAIL — cannot find module `notification-throttle`.

- [ ] **Step 3: Implement the throttle**

Create `src/main/lib/notification-throttle.ts`:

```ts
import type { ServiceId } from '../../shared/types';

/** Floor between native banners per service, so a hostile page (or a runaway
 *  recipe) using the Notification shim can't spam the OS notification centre. */
export class NotificationThrottle {
  private last = new Map<ServiceId, number>();

  constructor(private minIntervalMs = 800) {}

  allow(id: ServiceId, now: number): boolean {
    const prev = this.last.get(id);
    if (prev !== undefined && now - prev < this.minIntervalMs) return false;
    this.last.set(id, now);
    return true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/notification-throttle.test.ts` Expected: PASS.

- [ ] **Step 5: Wire it into the router**

In `src/main/notifications.ts`, add the import and a field, and gate `handle`. Add near the other imports:

```ts
import { NotificationThrottle } from './lib/notification-throttle';
```

Add the field beside `icons`:

```ts
  private throttle = new NotificationThrottle();
```

At the top of `handle`, after the `shouldNotify` guard:

```ts
    if (!this.throttle.allow(serviceId, Date.now())) return;
```

- [ ] **Step 6: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm test` Expected: PASS.

---

### Task 6: Per-service navigation containment

**Files:**

- Create: `src/main/lib/navigation-policy.ts`
- Test: `tests/unit/navigation-policy.test.ts`
- Modify: `src/main/views.ts` (add `will-navigate` / `will-redirect`)

**Interfaces:**

- Consumes: `ServiceId`.
- Produces: `isNavigationAllowed(id: ServiceId, url: string): boolean` — true when the destination host is in the service's allowlist.

> **Live-verification requirement:** the allowlist below is a starting set derived from each service's login flow. Before merging, log in to every enabled service and confirm sign-in completes with no blocked navigation (watch the main-process console for the `[nav] blocked` line added in Step 5). Add any missing auth host to `ALLOWED_HOSTS` and re-test. Do NOT ship this task until every service's login is verified live.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/navigation-policy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isNavigationAllowed } from '../../src/main/lib/navigation-policy';

describe('isNavigationAllowed', () => {
  it('allows the service host and known auth hosts', () => {
    expect(isNavigationAllowed('messenger', 'https://www.facebook.com/messages/')).toBe(true);
    expect(isNavigationAllowed('messenger', 'https://m.facebook.com/login')).toBe(true);
    expect(isNavigationAllowed('whatsapp', 'https://web.whatsapp.com/')).toBe(true);
  });
  it('blocks a foreign host', () => {
    expect(isNavigationAllowed('messenger', 'https://evil.example/phish')).toBe(false);
    expect(isNavigationAllowed('whatsapp', 'https://evil.example/')).toBe(false);
  });
  it('blocks non-web schemes and malformed urls', () => {
    expect(isNavigationAllowed('discord', 'file:///etc/passwd')).toBe(false);
    expect(isNavigationAllowed('discord', 'not a url')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/navigation-policy.test.ts` Expected: FAIL — cannot find module `navigation-policy`.

- [ ] **Step 3: Implement the allowlist**

Create `src/main/lib/navigation-policy.ts`:

```ts
import type { ServiceId } from '../../shared/types';

/** Hosts each service's top-level view may navigate to (its own domain plus
 *  the hosts its login flow bounces through). Anything else opens in the OS
 *  browser instead of loading inside the app with the recipe preload.
 *  VERIFY LIVE per service before shipping — auth hosts change. */
const ALLOWED_HOSTS: Record<ServiceId, string[]> = {
  messenger: ['www.facebook.com', 'm.facebook.com', 'facebook.com', 'messenger.com'],
  telegram: ['web.telegram.org'],
  zalo: ['chat.zalo.me', 'id.zalo.me', 'zalo.me'],
  whatsapp: ['web.whatsapp.com'],
  discord: ['discord.com', 'discordapp.com', 'canary.discord.com'],
  shopee: ['shopee.vn', 'accounts.shopee.vn'],
};

export function isNavigationAllowed(id: ServiceId, url: string): boolean {
  try {
    const { protocol, host } = new URL(url);
    if (protocol !== 'https:' && protocol !== 'http:') return false;
    return ALLOWED_HOSTS[id].includes(host);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/navigation-policy.test.ts` Expected: PASS.

- [ ] **Step 5: Wire the guard into view creation**

In `src/main/views.ts`, add the import:

```ts
import { isNavigationAllowed } from './lib/navigation-policy';
```

In `create()`, after the `setWindowOpenHandler` block (around `views.ts:76`), add:

```ts
    const navGuard = (e: Electron.Event, url: string) => {
      if (isNavigationAllowed(id, url)) return;
      e.preventDefault();
      console.warn(`[nav] blocked ${id} -> ${url}`);
      if (isSafeExternalUrl(url)) shell.openExternal(url);
    };
    wc.on('will-navigate', navGuard);
    wc.on('will-redirect', navGuard);
```

(`isSafeExternalUrl` is already imported from Task 2.)

- [ ] **Step 6: Verify unit + typecheck**

Run: `pnpm lint && pnpm typecheck && pnpm test` Expected: PASS.

- [ ] **Step 7: Live login verification (required)**

For each of messenger, telegram, zalo, whatsapp, discord, shopee: enable the service, complete a full login, and confirm no `[nav] blocked` line appears for a legitimate step. Add any missing host to `ALLOWED_HOSTS`, re-run `pnpm test`, and repeat until every login is clean.

---

### Task 7: Supply-chain — pin actions by SHA, attest provenance

**Files:**

- Modify: `.github/workflows/release.yml`

**Interfaces:**

- Produces: a release workflow with immutable action refs and a provenance attestation on the built installers.

- [ ] **Step 1: Resolve each action tag to a commit SHA**

Run (records the SHA behind each current major tag):

```bash
for a in "actions/checkout@v7" "pnpm/action-setup@v6" \
  "actions/setup-node@v7" "actions/upload-artifact@v7" \
  "actions/download-artifact@v8" "softprops/action-gh-release@v3" \
  "actions/attest-build-provenance@v1"; do
  gh api "repos/${a%@*}/commits/${a#*@}" --jq '.sha' 2>/dev/null \
    | xargs -I{} echo "$a -> {}"
done
```

Expected: one `owner/action@vX -> <40-char sha>` line each. Note the SHAs.

- [ ] **Step 2: Replace each `uses:` tag with `sha # vX`**

In `.github/workflows/release.yml`, rewrite every `uses:` to the pinned form, keeping the human-readable tag as a trailing comment, e.g.:

```yaml
      - uses: actions/checkout@<sha>  # v7
```

Apply to all of: `actions/checkout`, `pnpm/action-setup`, `actions/setup-node`, `actions/upload-artifact`, `actions/download-artifact`, `softprops/action-gh-release`.

- [ ] **Step 3: Add provenance attestation to the build job**

Grant the job the needed permissions (add under the existing top-level `permissions:`):

```yaml
permissions:
  contents: write
  id-token: write
  attestations: write
```

In the `build` job, after the "Build and package" step, add:

```yaml
      - uses: actions/attest-build-provenance@<sha>  # v1
        with:
          subject-path: |
            dist/*.dmg
            dist/*.exe
```

- [ ] **Step 4: Validate the workflow syntax**

Run: `gh workflow view Release` (after pushing the branch) or lint locally with `actionlint .github/workflows/release.yml` if available. Expected: no syntax errors; the next tag build emits an attestation.

---

### Task 8: Tighten renderer CSP

**Files:**

- Modify: `src/renderer/index.html`, `src/renderer/loading.html`

**Interfaces:**

- Produces: both privileged renderer pages deny plugins, base-tag hijack, and framing.

- [ ] **Step 1: Extend the CSP meta on both pages**

In `src/renderer/index.html` and `src/renderer/loading.html`, append to the existing `Content-Security-Policy` content string:

```text
; object-src 'none'; base-uri 'self'; frame-src 'none'
```

- [ ] **Step 2: Verify the app still renders**

Run: `pnpm e2e` Expected: PASS (the shell and loading pages load only first-party assets, so the tighter policy changes nothing functional).

---

## Self-review notes

- Every spec §2.1 security finding maps to a task: Critical→T1, openExternal→ T2, permission→T3, IPC sender→T4, notification spam→T5, navigation→T6, supply chain→T7, CSP→T8. `deleteAppDataOnUninstall` and the accepted residual risks are intentionally not tasks (documented in the spec).
- Helper names are consistent across tasks: `isSafeExternalUrl` (T2) is reused by T6's `navGuard`; `permissionAllowed` (T3), `ipcSenderAllowed` (T4), `isNavigationAllowed` (T6) are each defined once.
- T6 is explicitly gated on live login verification — the one task that must not ship on unit tests alone.
