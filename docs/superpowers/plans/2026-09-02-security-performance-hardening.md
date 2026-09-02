# Security & Performance Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 2026-09-02 audit's security holes (screen capture, main-process crash class, Facebook identity-share bypasses, subframe IPC, shell nav, passkey prompt abuse) and the top performance costs (unfiltered webRequest, WhatsApp per-tick IDB getAll, Instagram forced layout, runner promise leak, settings double-read) without changing any user-visible feature.

**Architecture:** Every fix hardens an existing seam — no new subsystems. Pure decision logic lands in `src/main/lib/` or recipe modules with vitest coverage; `views.ts`, `index.ts`, `ipc-handlers.ts` stay thin wiring, per CLAUDE.md.

**Tech Stack:** Electron 43, TypeScript, vitest (+ happy-dom fixtures), Playwright e2e.

## Global Constraints

- Definition of done: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` all green, and `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e` green.
- **No `git commit` at any step** — the user commits via `/grimoire-core:commit` after review (user's global CLAUDE.md overrides this skill's commit steps).
- Never weaken the invariants in CLAUDE.md (process boundaries, IPC classification, chat-only, one-sound-per-message).
- Service views keep `contextIsolation: false` + `sandbox: false`; all hardening is around them.
- Comments: concise, why-only, match file style.

---

### Task 1: IPC handler crash-proofing + notification payload sanitizing

An XSS'd page can kill main with `new Notification(null)` (title forwarded unchecked → `raw.trim()` TypeError, no try/catch in `register()`, no `uncaughtException` handler). Close the class, then the instances, and clamp unbounded strings (audit S4 + M8).

**Files:**

- Modify: `src/main/ipc-handlers.ts` (register/registerInvoke, invokeOrigin)
- Modify: `src/main/lib/notification-rules.ts` (add `sanitizeBanner`)
- Modify: `src/main/notifications.ts` (use it)
- Modify: `src/preload/lib/notification-shim.ts` (coerce title)
- Test: `tests/unit/notification-rules.test.ts`

**Interfaces:**

- Produces: `sanitizeBanner(title: unknown, body: unknown): { title: string; body: string }` in notification-rules — clamped via `clampText`, non-strings become `''`.

- [ ] **Step 1: Failing test** — in `notification-rules.test.ts`:

```ts
import { sanitizeBanner } from '../../src/main/lib/notification-rules';

describe('sanitizeBanner', () => {
  it('coerces non-string title/body to empty strings', () => {
    expect(sanitizeBanner(null, undefined)).toEqual({ title: '', body: '' });
    expect(sanitizeBanner(5 as unknown, {} as unknown)).toEqual({ title: '', body: '' });
  });
  it('clamps oversized page strings', () => {
    const { title, body } = sanitizeBanner('t'.repeat(10_000), 'b'.repeat(10_000));
    expect(title.length).toBeLessThanOrEqual(200);
    expect(body.length).toBeLessThanOrEqual(500);
  });
});
```

- [ ] **Step 2: Implement** in `notification-rules.ts` (import `clampText` from `./pin-rules`):

```ts
/** Banner text is page-controlled and typed only by convention: a shim can be
 *  bypassed by the page, so main re-coerces and clamps before any use. */
export const BANNER_TITLE_MAX = 200;
export const BANNER_BODY_MAX = 500;
export function sanitizeBanner(title: unknown, body: unknown): { title: string; body: string } {
  return {
    title: typeof title === 'string' ? clampText(title, BANNER_TITLE_MAX) : '',
    body: typeof body === 'string' ? clampText(body, BANNER_BODY_MAX) : '',
  };
}
```

In `notifications.ts` `handle()`, first line: `const { title, body } = sanitizeBanner(raw.title, raw.body);` (rename destructured params) and use these throughout (activity append + Notification).

- [ ] **Step 3: Crash-proof the wrappers** in `ipc-handlers.ts` — a page-shaped payload must never throw out of an ipcMain listener:

```ts
ipcMain.on(channel, (e, payload) => {
  try {
    const p = payload as { serviceId?: ServiceId };
    if (!senderAllowed(ctx, channel, e.sender.id, p?.serviceId)) return;
    fn(payload as RendererToMain[C]);
  } catch (err) {
    console.error(`[ipc] ${channel} handler failed:`, err);
  }
});
```

Same shape for `registerInvoke` (return `blocked` in the catch). Also move the `e.senderFrame` reads in `invokeOrigin` inside the `try` (a disposed frame throws on property access).

- [ ] **Step 4: Shim-side coercion** in `notification-shim.ts` constructor: `forward(typeof title === 'string' ? title : '', …)` (defence-in-depth; main no longer trusts it either).
- [ ] **Step 5: Run** `corepack pnpm test` — expect green; no commit (user commits later).

---

### Task 2: Display-media fallback must confirm, never auto-share (audit S1)

**Files:**

- Modify: `src/main/views.ts:179-188`

The fallback (Windows/Linux/macOS<15) hands `sources[0]` — the whole primary screen — to the page with zero interaction. Replace with a native confirm naming the service; deny on cancel or error.

- [ ] **Step 1: Implement** (import `dialog` from electron):

```ts
ses.setDisplayMediaRequestHandler(
  (_request, callback) => {
    // fallback when the native picker is unavailable (Windows/Linux, older
    // macOS): never hand the screen over silently — a compromised page calling
    // getDisplayMedia() must cost a visible, named confirm.
    void (async () => {
      const { response } = await dialog.showMessageBox(this.win, {
        type: 'question',
        message: `Share your screen with ${serviceById(id).name}?`,
        detail: 'The page asked to capture your screen (usually for a call). Your entire primary screen will be visible to it.',
        buttons: ['Share Screen', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
      });
      if (response !== 0) return callback({});
      const sources = await desktopCapturer.getSources({ types: ['screen'] });
      callback(sources[0] ? { video: sources[0] } : {});
    })().catch(() => callback({}));
  },
  { useSystemPicker: true },
);
```

Note `configureSession` runs on every `create()` but the handler is a single-slot setter — no leak. `this.win` is available.

- [ ] **Step 2: Verify** `corepack pnpm typecheck` green. (macOS 15+ keeps the system picker — behaviour unchanged on the dev machine; e2e unaffected.)

---

### Task 3: Facebook identity-share — param pollution, seedable paths, seed/close race (audit S2 + S3)

**Files:**

- Modify: `src/main/lib/identity-share.ts` (`facebookAppId`, new `isSeedableFacebookDialog`, `maySeed`)
- Modify: `src/main/identity-share.ts` (in-flight tracking, pending unseed, liveness)
- Modify: `src/main/views.ts` (`seedIdentityPopup` passes liveness; `guardIdentityWindow` unchanged)
- Test: `tests/unit/identity-share.test.ts`, `tests/unit/identity-share-store.test.ts`

**Interfaces:**

- `facebookAppId(url)` now returns null unless **exactly one** app-id param exists across `client_id`/`app_id`.
- `isSeedableFacebookDialog(url)`: https + `.facebook.com` host + versionless path starting `/dialog/oauth` + a `redirect_uri` param. `/login` stays open-able as a popup but is never seedable.
- `IdentityShare.seed(target, isLive?: () => boolean)` — aborts before marking/writing when the popup died; `unseedSoon` during an in-flight seed defers and fires when the seed lands.

- [ ] **Step 1: Failing tests** in `identity-share.test.ts`:

```ts
it('refuses duplicate app-id params (HTTP parameter pollution)', () => {
  const url = 'https://www.facebook.com/dialog/oauth?client_id=421039428061656&client_id=666&redirect_uri=https%3A%2F%2Fshopee.vn%2F';
  expect(facebookAppId(url)).toBeNull();
  expect(maySeed({ enabled: true, target: 'shopee', popupUrl: url })).toBe(false);
});
it('never seeds a /login entry, even with the right client_id', () => {
  const url = 'https://www.facebook.com/login.php?client_id=421039428061656&next=x';
  expect(maySeed({ enabled: true, target: 'shopee', popupUrl: url })).toBe(false);
});
it('requires redirect_uri on the dialog', () => {
  const url = 'https://www.facebook.com/v19.0/dialog/oauth?client_id=421039428061656';
  expect(maySeed({ enabled: true, target: 'shopee', popupUrl: url })).toBe(false);
});
```

And in `identity-share-store.test.ts` (fake jars already exist there):

```ts
it('a popup closed before the confirm resolves still gets unseeded', async () => {
  // arrange jars so seeding would succeed; confirmShare resolves after unseedSoon
  let resolveConfirm!: (v: boolean) => void;
  const share = makeShare({ confirm: () => new Promise((r) => { resolveConfirm = r; }) });
  const seeding = share.seed('shopee', () => true);
  share.unseedSoon('shopee'); // popup closed mid-prompt: nothing marked yet
  resolveConfirm(true);
  await seeding;
  vi.advanceTimersByTime(IDENTITY_SEED_GRACE_MS + 1);
  await vi.waitFor(() => expect(targetJar.cookies).toHaveLength(0));
});
it('seed aborts without writing when the popup is already dead', async () => {
  const share = makeShare({ confirm: async () => true });
  expect(await share.seed('shopee', () => false)).toBe(false);
  expect(targetJar.cookies).toHaveLength(0);
});
```

- [ ] **Step 2: Implement lib changes** in `lib/identity-share.ts`:

```ts
export function facebookAppId(url: string): string | null {
  try {
    const q = new URL(url).searchParams;
    // exactly one id, whatever the param name: Facebook's backend reads the
    // LAST duplicate while get() reads the first — polluted URLs seed one app
    // and render another, so any duplication is refused outright
    const all = [...q.getAll('client_id'), ...q.getAll('app_id')];
    return all.length === 1 ? all[0] : null;
  } catch {
    return null;
  }
}

/** Seeding-eligible: the OAuth dialog itself, nothing else. /login stays an
 *  identity-popup ENTRY path (isIdentityPopup) but must never be seedable —
 *  its `next=` redirect can walk a lent session onto an attacker's dialog. */
export function isSeedableFacebookDialog(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    if (!hostMatches(u.host, FACEBOOK_COOKIE_DOMAIN)) return false;
    const path = u.pathname.replace(/^\/v\d+(\.\d+)?(?=\/)/, '');
    return path.startsWith('/dialog/oauth') && u.searchParams.has('redirect_uri');
  } catch {
    return false;
  }
}
```

`maySeed` swaps `isFacebookDialog(popupUrl)` for `isSeedableFacebookDialog(popupUrl)`. Keep `isFacebookDialog` exported (still used? if nothing else references it, delete it and its tests).

- [ ] **Step 3: Implement store changes** in `identity-share.ts`:

```ts
private inFlight = new Set<ServiceId>();
private pendingUnseed = new Set<ServiceId>();

async seed(target: ServiceId, isLive: () => boolean = () => true): Promise<boolean> {
  if (IDENTITY_SOURCE === null || target === IDENTITY_SOURCE) return false;
  this.inFlight.add(target);
  try {
    // …existing body…
    // after confirmShare resolves, before mark():
    if (!isLive()) {
      debugIdentity(`popup for ${target} died before seeding; nothing written`);
      return false;
    }
    // …mark + cookie writes as today…
  } finally {
    this.inFlight.delete(target);
    // the popup closed while we were seeding: its 'closed' unseed request
    // parked here because nothing was marked yet — honour it now
    if (this.pendingUnseed.delete(target) && this.conf.store.seeded.includes(target)) {
      this.unseedSoon(target);
    }
  }
}

unseedSoon(target: ServiceId): void {
  if (this.inFlight.has(target)) {
    this.pendingUnseed.add(target);
    return;
  }
  if (!this.conf.store.seeded.includes(target)) return;
  // …rest unchanged…
}
```

- [ ] **Step 4: Wire liveness** in `views.ts` `seedIdentityPopup`: `const seeded = await this.identityShare.seed(id, () => !popup.isDestroyed());` and after it, replace the early return with cleanup: `if (popup.isDestroyed()) return;` stays (pendingUnseed covers the marker).
- [ ] **Step 5: Run** `corepack pnpm test` — identity suites green.

---

### Task 4: Subframe lockout + main-frame IPC + shell window navigation guard (audit M1 + M2)

**Files:**

- Modify: `src/preload/service.ts` (top-frame gate)
- Modify: `src/main/ipc-handlers.ts` (main-frame check in both wrappers)
- Modify: `src/main/index.ts` (shell `will-navigate` + `setWindowOpenHandler`)

- [ ] **Step 1: Preload gate** — in `service.ts` replace the popup gate:

```ts
/** A popup the view was allowed to open can inherit this preload, and so can
 *  any subframe a chat site embeds. Both are their own surface: no recipes,
 *  shims, keep-alive or IPC belong anywhere but the view's own top document. */
const inPopup = window.opener !== null || window !== window.top;
```

- [ ] **Step 2: Main-frame check** — in both `register()` and `registerInvoke()`, inside the new `try`, before `senderAllowed`:

```ts
// service preloads run main-frame only, and the shell has no subframes: an
// IPC message from any other frame is spoofed by construction
if (e.senderFrame && e.senderFrame !== e.sender.mainFrame) return; // (or `return blocked`)
```

- [ ] **Step 3: Shell guard** — in `index.ts` `createWindow()` before the load:

```ts
// the shell renderer never navigates and never opens windows: a drag-dropped
// file or URL would otherwise replace the document while keeping the shell's
// webContents id — and with it every SHELL_ONLY channel
win.webContents.on('will-navigate', (e) => e.preventDefault());
win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
```

(dev-server HMR uses in-place reloads, not `will-navigate`; `loadURL`/`loadFile` calls from main don't emit `will-navigate` for the initial load — verify dev still boots.)

- [ ] **Step 4: Verify** `corepack pnpm test` + `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e` (e2e exercises real shell + service IPC).

---

### Task 5: Contained-window scheme gate, identity title, purge closes it (audit M3 + M4)

**Files:**

- Modify: `src/main/views.ts` (`containNavigation`, `openContainedWindow`, `closeContainedWindow` visibility)
- Modify: `src/main/purge.ts`

- [ ] **Step 1:** In `containNavigation`, after the audit note and `preventDefault`: only open the window for web schemes:

```ts
e.preventDefault();
// only web URLs earn a contained window: file:/smb:/custom schemes are
// dropped outright — nothing legitimate reaches them from a chat page
if (isSafeExternalUrl(url)) this.openContainedWindow(id, url);
```

- [ ] **Step 2:** In `openContainedWindow`, brand the window so an attacker page in it cannot pass as a Goetia surface:

```ts
const win = this.hardenedWindow(id);
win.setTitle(`Sign-in for ${serviceById(id).name} — Goetia`);
win.webContents.on('page-title-updated', (e) => e.preventDefault());
```

- [ ] **Step 3:** Make `closeContainedWindow` public (drop `private`) and call it in `purgeService` (`purge.ts`) beside the other two closers: `ctx.views.closeContainedWindow(id);`
- [ ] **Step 4:** `corepack pnpm typecheck && corepack pnpm test`.

---

### Task 6: Passkey prompt cool-down, post-timeout side-effect guard, honest UV, per-call Touch ID (audit M6 + M7 + lows)

**Files:**

- Modify: `src/main/passkeys/authenticator.ts`
- Modify: `src/main/passkeys/prompt.ts`
- Modify: `src/main/lib/webauthn-rules.ts` (parse `userVerification`)
- Modify: `src/main/passkeys/store.ts` (corrupt-file backup instead of silent wipe)
- Modify: `src/main/views.ts` (`webAuthnEnabled` Linux basic_text)
- Test: `tests/unit/passkey-authenticator.test.ts`, `tests/unit/webauthn-rules.test.ts`, `tests/unit/passkey-store.test.ts`

**Interfaces:**

- `PasskeyPrompt.confirmCreate/confirmGet` now resolve `'verified' | 'presence' | false` (Touch ID success = `'verified'`; dialog OK / after-chooser = `'presence'`; cancel = `false`).
- `CreationRequest`/`AssertionRequest` gain `uv: 'required' | 'preferred' | 'discouraged'` (default `'preferred'`).
- `PasskeyAuthenticator` deps gain `cooldownMs` (default `PROMPT_COOLDOWN_MS = 5_000`).

- [ ] **Step 1: Failing tests**:

```ts
it('a cancelled ceremony starts a cool-down: the next one is refused silently', async () => {
  prompt.confirmGet.mockResolvedValueOnce(false);
  await auth.get(input); // cancelled
  prompt.confirmGet.mockClear();
  const r = await auth.get(input); // within cooldown
  expect(r).toEqual({ ok: false, error: 'NotAllowedError' });
  expect(prompt.confirmGet).not.toHaveBeenCalled();
  now += 6_000;
  await auth.get(input);
  expect(prompt.confirmGet).toHaveBeenCalled(); // cooldown expired
});
it('a confirm answered after the timeout mints nothing', async () => {
  let resolveConfirm!: (v: 'verified' | false) => void;
  prompt.confirmCreate.mockReturnValue(new Promise((r) => { resolveConfirm = r; }));
  const p = auth.create(input); // timeoutMs is tiny in deps
  await vi.advanceTimersByTimeAsync(TIMEOUT + 1);
  expect(await p).toEqual({ ok: false, error: 'NotAllowedError' });
  resolveConfirm('verified');
  await vi.runAllTimersAsync();
  expect(store.all()).toHaveLength(0);
});
it('sets UV only when verification was real', async () => {
  prompt.confirmGet.mockResolvedValue('presence');
  const r = await auth.get(input);
  // flags byte in authenticatorData: UP set, UV clear
});
it('refuses userVerification: required when only presence is available', async () => {
  prompt.confirmGet.mockResolvedValue('presence');
  const r = await auth.get({ ...input, options: { ...opts, userVerification: 'required' } });
  expect(r).toEqual({ ok: false, error: 'NotAllowedError' });
});
```

Store test:

```ts
it('backs up a corrupt passkeys.json instead of wiping it', () => {
  writeFileSync(join(cwd, 'passkeys.json'), '{corrupt');
  const store = new PasskeyStore(cwd, codec);
  expect(store.all()).toHaveLength(0);
  expect(readdirSync(cwd).some((f) => f.startsWith('passkeys.json.corrupt-'))).toBe(true);
});
```

- [ ] **Step 2: webauthn-rules** — parse `userVerification` from `raw.userVerification` (get) and `raw.authenticatorSelection?.userVerification` (create); values outside the union coerce to `'preferred'`.
- [ ] **Step 3: authenticator** — add to `run()`:

```ts
private lastDeniedAt = new Map<number, number>();
private current = new Map<number, symbol>();
// on entry, after the inFlight check:
const denied = this.lastDeniedAt.get(viewKey);
if (denied !== undefined && this.deps.now() - denied < this.deps.cooldownMs) {
  return { ok: false, error: 'NotAllowedError' }; // silent: no prompt inside the cool-down
}
const token = Symbol();
this.current.set(viewKey, token);
// pass isCurrent = () => this.current.get(viewKey) === token into work
// in catch: if the error is a user refusal (cancelled / no credential), stamp lastDeniedAt
// in finally: if (this.current.get(viewKey) === token) this.current.delete(viewKey)
```

`doCreate`/`doGet` take `isCurrent` and re-check it after every `await this.prompt.*` — a stale ceremony throws `NotAllowedError` before `store.add`, `signAssertion`, or `store.touch`. Timeout path: `run()`'s timeout handler replaces the token (`this.current.set(viewKey, Symbol())`) so late resolutions fail the check. Flags become:

```ts
const uvFlag = confirmed === 'verified' ? FLAG_UV : 0;
if (req.uv === 'required' && confirmed !== 'verified') {
  throw new WebAuthnError('NotAllowedError', 'user verification unavailable');
}
const authData = authenticatorData(req.rpId, FLAG_UP | uvFlag | FLAG_AT, …);
```

Also move the `excludeIds` check to **after** `confirmCreate` (spec §6.3.2: collect consent before revealing exclude state) — update the pinned test.

- [ ] **Step 4: prompt.ts** — return `'verified'`/`'presence'`/`false`; evaluate `hasTouchId()` **inside** each method (the launch-time snapshot silently downgraded ceremonies forever); quote page-controlled labels in `chooseAccount` buttons (`` `“${a.label}”` ``); `AUTO_ACCEPT` returns `'verified'`.
- [ ] **Step 5: store.ts** — replace `clearInvalidConfig: true`:

```ts
try {
  this.conf = new Conf<PasskeysFile>({ cwd, configName: 'passkeys', defaults: { credentials: [] } });
} catch {
  // a truncated file must not silently destroy login credentials: keep the
  // evidence and start empty
  const bad = join(cwd, 'passkeys.json');
  try { renameSync(bad, `${bad}.corrupt-${Date.now()}`); } catch { /* already gone */ }
  this.conf = new Conf<PasskeysFile>({ cwd, configName: 'passkeys', defaults: { credentials: [] } });
}
```

- [ ] **Step 6: views.ts** `webAuthnEnabled` — refuse Linux plaintext backend:

```ts
const webAuthnEnabled = (): boolean =>
  process.env.GOETIA_WEBAUTHN !== 'off' &&
  safeStorage.isEncryptionAvailable() &&
  (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text');
```

- [ ] **Step 7:** `corepack pnpm test` green; also run the passkeys e2e spec: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e -- passkeys` (AUTO_ACCEPT path returns `'verified'`, so it stays green).

---

### Task 7: trustedClick — validate, clamp, zoom-scale, respect overlays, symmetric teardown (audit S4b + M5 + M3-zoom + P8a)

**Files:**

- Create: `src/main/lib/click-point.ts`
- Modify: `src/main/views.ts` (`trustedClick`, constructor gains `overlayOpen`)
- Modify: `src/main/index.ts` (pass `() => anyOverlayOpen(state)`)
- Test: `tests/unit/click-point.test.ts`

**Interfaces:**

- `resolveClickPoint(x: unknown, y: unknown, zoomFactor: number, bounds: { width: number; height: number }): { x: number; y: number } | null` — null for non-finite input or a point outside the view.

- [ ] **Step 1: Failing test**:

```ts
import { resolveClickPoint } from '../../src/main/lib/click-point';

it('refuses non-finite coordinates', () => {
  expect(resolveClickPoint('a', 5, 1, { width: 800, height: 600 })).toBeNull();
  expect(resolveClickPoint(Number.NaN, 5, 1, { width: 800, height: 600 })).toBeNull();
});
it('scales CSS px to DIPs by the zoom factor', () => {
  expect(resolveClickPoint(100, 50, 1.2, { width: 800, height: 600 })).toEqual({ x: 120, y: 60 });
});
it('refuses a point outside the view', () => {
  expect(resolveClickPoint(900, 50, 1, { width: 800, height: 600 })).toBeNull();
});
```

- [ ] **Step 2: Implement**:

```ts
/** Recipes compute keep-alive points from getBoundingClientRect (CSS px in
 *  the zoomed page); sendInputEvent wants view DIPs. The page shares the
 *  preload's realm, so the numbers are attacker-reachable: non-finite or
 *  out-of-view points are refused, never clamped onto some other element. */
export function resolveClickPoint(
  x: unknown,
  y: unknown,
  zoomFactor: number,
  bounds: { width: number; height: number },
): { x: number; y: number } | null {
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const px = Math.round(x * zoomFactor);
  const py = Math.round(y * zoomFactor);
  if (px < 0 || py < 0 || px > bounds.width || py > bounds.height) return null;
  return { x: px, y: py };
}
```

- [ ] **Step 3: views.ts** — constructor gains `private overlayOpen: () => boolean = () => false` (after `identityShare`, before `overlay`); `trustedClick(id, x: unknown, y: unknown)`:

```ts
trustedClick(id: ServiceId, x: unknown, y: unknown): void {
  const view = this.views.get(id);
  if (!view) return;
  const wc = view.webContents;
  const b = view.getBounds();
  const pt = resolveClickPoint(x, y, wc.getZoomFactor(), { width: b.width, height: b.height });
  if (!pt) return;
  const hidden = id !== this.activeId;
  // a keep-alive flash must never cover an open shell surface — drop it, the
  // next one comes in 30s (KEEPALIVE_MIN_INTERVAL_MS lives in the page)
  if (hidden && this.overlayOpen()) return;
  …existing flash + sendInputEvent with pt.x / pt.y…
  // in the hide timer, after setVisible(false):
  if (id !== this.activeId) this.win.contentView.removeChildView(view);
}
```

`index.ts`: pass `() => state.switcherOpen || state.settingsOpen || state.homeOpen` (or `anyOverlayOpen(state)` from `lib/overlay-rules`). `ipc-handlers.ts` `service:trusted-click` stays as-is (unknowns flow through).

- [ ] **Step 4:** `corepack pnpm test && corepack pnpm typecheck`.

---

### Task 8: webRequest URL filter for client hints (audit P1)

**Files:**

- Modify: `src/main/lib/identity-policy.ts` (add `identityUrlPatterns`)
- Modify: `src/main/views.ts` (`configureSession`)
- Test: `tests/unit/identity-policy.test.ts`

- [ ] **Step 1: Failing test**:

```ts
it('builds webRequest patterns covering every provider and roaming host', () => {
  const p = identityUrlPatterns();
  expect(p).toContain('https://accounts.google.com/*');
  expect(p).toContain('https://*.facebook.com/*');
  expect(p).toContain('https://facebook.com/*');
});
```

- [ ] **Step 2: Implement** in `identity-policy.ts`:

```ts
/** webRequest match patterns for the hosts client hints are restored on.
 *  Without a filter Chromium suspends EVERY request in the session for a JS
 *  round-trip — the filter keeps the other 99.9% off main's event loop. */
export function identityUrlPatterns(): string[] {
  const hosts = [...IDENTITY_PROVIDERS.map((p) => p.host), ...ROAMING_HOSTS];
  return hosts.flatMap((h) =>
    h.startsWith('.') ? [`https://*${h}/*`, `https://${h.slice(1)}/*`] : [`https://${h}/*`],
  );
}
```

- [ ] **Step 3: views.ts**:

```ts
ses.webRequest.onBeforeSendHeaders({ urls: identityUrlPatterns() }, (details, cb) => {
  // the filter already narrowed this to provider hosts; the check stays as
  // defence-in-depth and now runs on a handful of requests, not all of them
  if (isIdentityHost(details.url)) Object.assign(details.requestHeaders, hints);
  cb({ requestHeaders: details.requestHeaders });
});
```

- [ ] **Step 4:** `corepack pnpm test`.

---

### Task 9: WhatsApp — recount gate + bounded DB probe (audit P2)

**Files:**

- Modify: `src/preload/recipes/whatsapp.ts`
- Test: `tests/unit/recipes.test.ts` (fixture oracle unchanged), `tests/unit/runner-*.test.ts` untouched

- [ ] **Step 1:** Add the watch hook so the runner's observer gate applies (today WhatsApp re-reads the whole `chat` store every 2s, forever):

```ts
// the chat-list pane: the DB the count reads backs exactly this list, so a
// quiet pane means a quiet store and the runner may skip the full getAll()
watch(doc) {
  return doc.querySelector('#pane-side');
},
```

- [ ] **Step 2:** Bound the logged-out probe — `openDb()` currently calls `indexedDB.databases()` every tick when no DB exists:

```ts
let lastProbeAt = 0;
const PROBE_MIN_INTERVAL_MS = 30_000;
// inside openDb(), before indexedDB.databases():
const now = Date.now();
if (now - lastProbeAt < PROBE_MIN_INTERVAL_MS) return resolve(null);
lastProbeAt = now;
```

(Not sticky: login creates the DB later in the same document; a 30s re-probe picks it up.)

- [ ] **Step 3:** `corepack pnpm test` — `recipes.test.ts` still green (blank.html count path unchanged; `watch` returning null on blank.html means count-every-tick, as before).

---

### Task 10: Instagram — memoize the rail reclaim (audit P3)

**Files:**

- Modify: `src/preload/recipes/instagram.ts`
- Test: `tests/unit/instagram-chrome.test.ts`

- [ ] **Step 1: Failing test** — second call with the same DOM must not re-read styles:

```ts
it('reclaims rail space once per (main, root) pair, not per tick', () => {
  const doc = fixtureDoc();
  const spy = vi.spyOn(doc.defaultView!, 'getComputedStyle');
  instagram.hideChrome!(doc);
  const first = spy.mock.calls.length;
  expect(first).toBeGreaterThan(0);
  instagram.hideChrome!(doc);
  expect(spy.mock.calls.length).toBe(first); // no new style reads
});
```

- [ ] **Step 2: Implement** — module-scope memo (one document per preload instance; SPA remounts swap the elements, which misses the memo and re-runs):

```ts
let reclaimed: { main: Element; root: Element } | null = null;
// in hideChrome, replace the direct call:
const root = el.parentElement;
if (!(reclaimed && reclaimed.main === main && reclaimed.root === root && doc.contains(main))) {
  reclaimRailSpace(doc, main, root);
  reclaimed = { main, root };
}
return [el];
```

- [ ] **Step 3:** `corepack pnpm test`.

---

### Task 11: Runner — clear the race timer, bound abandoned counts, narrow the Meta observer (audit P4 + P5)

**Files:**

- Modify: `src/preload/recipes/runner.ts`
- Test: `tests/unit/runner-timeout.test.ts` (new)

- [ ] **Step 1: Failing test** (fake timers; a count that never settles):

```ts
it('stops issuing new counts while two are already hung', async () => {
  let calls = 0;
  const recipe = { id: 'x', intervalMs: 100, count: () => { calls++; return new Promise<never>(() => {}); } };
  startRecipe(recipe as never, doc, report, reportStale, undefined, undefined, undefined, setInterval, Date.now, 1_000);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(calls).toBeLessThanOrEqual(2); // not one per tick
});
it('clears the timeout timer when the count settles first', async () => {
  // count resolves immediately; advance time; no unhandled rejection, and
  // vi.getTimerCount() returns to just the interval
});
```

- [ ] **Step 2: Implement** in the tick body:

```ts
let pendingCounts = 0; // module of startRecipe closure, beside `busy`
// …in the try:
if (pendingCounts >= 2) throw new Error('counts backed up'); // reported as stale, once
let timer: ReturnType<typeof setTimeout> | undefined;
pendingCounts++;
const counting = Promise.resolve(recipe.count(doc)).finally(() => {
  pendingCounts--;
});
try {
  const counts = await Promise.race([
    counting,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('count timeout')), countTimeoutMs);
    }),
  ]);
  …
} finally {
  clearTimeout(timer);
  busy = false;
}
```

(Keep the existing outer try/catch → stale shape; `counting` must attach a no-op `.catch(() => {})` so an abandoned rejection never surfaces as unhandled.)

- [ ] **Step 3: Narrow the observer** in `retarget()` — timestamps/presence churn set `dirty` every tick, defeating the gate:

```ts
observer.observe(target, {
  subtree: true,
  childList: true,
  // class + aria-label are where Meta's unread markers move; characterData
  // is relative-timestamp churn that defeated the gate entirely. The
  // FORCE_RECOUNT_TICKS floor still bounds any signal this misses to ~10s.
  attributes: true,
  attributeFilter: ['class', 'aria-label'],
});
```

- [ ] **Step 4:** `corepack pnpm test` — all `runner-*` suites green.

---

### Task 12: Settings — one write, zero re-reads (audit P6)

**Files:**

- Modify: `src/main/settings.ts`

- [ ] **Step 1:** Keep a raw mirror; `conf.store`'s getter re-reads and re-parses the file on every access, and `write()` pays it twice on every `rememberSurface`:

```ts
private raw: Record<string, unknown>;
// ctor: this.raw = { ...this.conf.store };  (one read, at boot)
// write():
const nextRaw = { ...this.raw, ...merged };
this.raw = nextRaw;
this.conf.store = nextRaw as unknown as Settings; // one atomic write, no reads
this.writeCount++;
this.cached = deepFreeze(normalize({ ...DEFAULT_SETTINGS, ...nextRaw } as Settings).settings);
```

Also seed `raw` after the boot-trim write path so both stay in sync (write() already updates it).

- [ ] **Step 2:** `corepack pnpm test` (cap/reorder suites assert `writeCount` behaviour) and `corepack pnpm typecheck`.

---

### Task 13: Hibernation — free a peek killed externally (audit P7)

**Files:**

- Modify: `src/main/hibernation.ts` (add `noteDestroyed`)
- Modify: `src/main/ipc-handlers.ts` (`AppContext.noteDestroyed`, call in `applyDisabledChange`), `src/main/index.ts` (late-bind), `src/main/purge.ts` (no view destroy there — not needed)
- Test: `tests/unit/hibernation.test.ts`

- [ ] **Step 1: Failing test**: begin a peek, call `noteDestroyed(id)`, assert `pickPeek` can select the next service immediately (peeking slot freed) and no streak was counted.
- [ ] **Step 2: Implement**:

```ts
/** The view died under the peek (banish, purge, crash-path destroy): free the
 *  slot now instead of stalling every other peek until the 90s timeout. */
noteDestroyed(id: ServiceId): void {
  if (this.peeking?.id === id) this.endPeek(false);
}
```

Wire: `AppContext` gains `noteDestroyed(id)` late-bound like `noteActivated`; `applyDisabledChange` calls `ctx.noteDestroyed(id)` right after `ctx.views.destroy(id)`.

- [ ] **Step 3:** `corepack pnpm test`.

---

### Task 14: Small hardenings batch

**Files:**

- Modify: `src/main/views.ts` (NAV_ENFORCE gate, guest `will-redirect`, popup openExternal throttle)
- Modify: `src/main/lib/navigation-policy.ts` (drop `http:`, export `ALLOWED_HOSTS`)
- Modify: `src/main/lib/navigation-audit.ts` (log once at cap)
- Modify: `src/preload/shell.ts` (error interpolation nit)
- Modify: `src/preload/lib/webauthn-shim.ts` (`withSignal` listener cleanup)
- Test: `tests/unit/navigation-policy.test.ts` (http + public-suffix guard), `tests/unit/navigation-audit.test.ts`

- [ ] **Step 1:** `NAV_ENFORCED` escape hatch dies in packaged builds (mirrors `AUTO_ACCEPT`): `const NAV_ENFORCED = app.isPackaged || process.env.GOETIA_NAV_ENFORCE !== 'off';`
- [ ] **Step 2:** navigation-policy: refuse `http:` (`protocol !== 'https:'` → false); every listed host is HTTPS, and a downgrade now lands in the hardened contained window instead of the unsandboxed view. Export `ALLOWED_HOSTS` (`export const`). Update/extend `navigation-policy.test.ts`:

```ts
it('refuses a downgrade to http', () => {
  expect(isNavigationAllowed('shopee', 'http://shopee.vn/')).toBe(false);
});
it('no allowed host sits under a multi-label public suffix (rpId assumption)', () => {
  const PSL2 = ['co.uk', 'com.au', 'com.br', 'com.vn', 'com.my', 'com.sg', 'co.jp', 'co.id', 'co.th', 'com.ph', 'github.io'];
  for (const hosts of Object.values(ALLOWED_HOSTS)) {
    for (const h of hosts) {
      const host = h.replace(/^\./, '');
      const tail2 = host.split('.').slice(-2).join('.');
      expect(host === tail2 || !PSL2.includes(tail2)).toBe(true);
    }
  }
});
```

- [ ] **Step 3:** Call guest gains `will-redirect` with the same body as its `will-navigate` (a 302 off the call URL currently commits in a window with the inherited unisolated preload). Extract the handler into a local const and attach to both events.
- [ ] **Step 4:** Denied-popup `shell.openExternal` throttle in the window-open handler: `private lastExternalAt = new Map<ServiceId, number>();` — allow at most one per second per service:

```ts
if (isSafeExternalUrl(url)) {
  const now = Date.now();
  if (now - (this.lastExternalAt.get(id) ?? 0) >= 1_000) {
    this.lastExternalAt.set(id, now);
    shell.openExternal(url);
  }
}
```

- [ ] **Step 5:** navigation-audit: when the cap is first reached, return one final record `"<key> (audit cap reached; further refusals unlogged)"`; test it.
- [ ] **Step 6:** shell.ts: `` new Error(`blocked channel: ${channel}`) ``. webauthn-shim `withSignal`: keep a `done` cleanup that `signal?.removeEventListener('abort', abort)` when work settles.
- [ ] **Step 7:** Full verification: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`.

---

## Explicitly deferred (decided, not forgotten)

- **Challenge minimum length (≥16 bytes)** — compat risk with a real RP for no user gain; the challenge is already alphabet-checked and JSON-escaped.
- **Banner title service attribution** — changes visible banner copy; the OS already names the app, and the click only activates the same service.
- **Per-service `NavigationAudit` caps** — the one-line cap notice (Task 14) covers the observability gap at a fraction of the churn.
- **Meta observer skip-rate debug counter** — measure only if badge staleness is ever reported.
- **`visibility-spoof` configurable descriptor** — reliability-only; pages restoring it only hurt themselves.

## Self-review notes

- Spec coverage: S1→T2, S2→T3, S3→T3, S4→T1+T7, M1→T4, M2→T4, M3→T5, M4→T5, M5→T7, M6→T6, M7→T6, M8→T1, P1→T8, P2→T9, P3→T10, P4/P5→T11, P6→T12, P7→T13, lows→T5/T6/T14. Gaps are in the deferred list.
- Type consistency: `resolveClickPoint` (T7) is the only new cross-file symbol besides `sanitizeBanner` (T1), `isSeedableFacebookDialog`/`identityUrlPatterns` (T3/T8), and `noteDestroyed` (T13); each is defined in the task that introduces it and consumed with the same signature.
