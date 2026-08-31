# Social Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A service page's "Continue with Google / Facebook / Apple …" popup opens inside Goetia as a hardened window that keeps `window.opener`, so the sign-in completes; and a contained-window login that returns by redirect hands the callback to the service view before it commits.

**Architecture:** A new `lib/identity-policy.ts` holds a global provider table and two matchers (`isIdentityPopup` for the opening URL, `isIdentityHost` for roaming inside the popup). `views.ts` gains a second `window.open` exception beside `isCallPopup`: an allowed identity popup opens with an isolated + sandboxed webPreferences override in the service's partition, is guarded in `did-create-window` (main-frame navigations must be a provider host or an `isNavigationAllowed` host, else the popup closes), is tracked per service and closed on destroy/purge, and every refusal is recorded by the existing `NavigationAudit`. `openContainedWindow` additionally hands back on `will-redirect` before commit. Spec: `docs/superpowers/specs/2026-08-31-social-login-design.md`.

**Tech Stack:** TypeScript, Electron main process (`src/main/**`), Vitest unit tests (`tests/unit/**`), Biome for lint.

## Global Constraints

- **Commits are made only through `/commit`, after the user confirms the drafted message.** Every "Commit" step below means: stop, report the files changed, and ask the user to run `/commit`. Never run `git commit` yourself. Never add a Claude co-author trailer.
- Definition of done (CLAUDE.md): `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` green; `corepack pnpm e2e` green because `src/main/views.ts` and `src/preload/service.ts` (main/preload wiring) change. e2e must run with `ELECTRON_RUN_AS_NODE` unset: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`.
- Deny-by-default `window.open` stands. The identity popup is the only new exception; nothing else may return `action: 'allow'`.
- IdP hosts never enter `ALLOWED_HOSTS` (`navigation-policy.ts`). The service view runs unsandboxed with the recipe preload.
- The identity popup's webPreferences are exactly `{ partition: 'persist:<id>', contextIsolation: true, sandbox: true, nodeIntegration: false }` — the same set `hardenedWindow` uses.
- Every popup navigation guard is **main frame only** (the 2026-08-29 lesson: `will-redirect` also reports subframe redirects).
- The pre-commit hand-back in the contained window is on `will-redirect` **only** — never `will-navigate`, which may carry a POST body Electron does not expose (Sign in with Apple `form_post`).
- No new IPC channel, no `src/shared/**` change, no new env flag (`GOETIA_DEBUG_CALLS` covers popup diagnostics).
- Markdown edits must pass `npx --yes markdownlint-cli2 <file>` (repo config has MD013 off; never hard-wrap prose).
- Comments explain *why*, briefly; match the surrounding density. No section banners or "added X" notes.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/main/lib/host-match.ts` (create) | `hostMatches(host, entry)` — exact or `.suffix` match, shared by both policies |
| `src/main/lib/navigation-policy.ts` (modify) | drops its private `hostMatches` in favour of the shared one; otherwise unchanged |
| `src/main/lib/identity-policy.ts` (create) | `IDENTITY_PROVIDERS`, `isIdentityPopup(url)`, `isIdentityHost(url)` |
| `src/main/views.ts` (modify) | window-open branch, `did-create-window` branch, `guardIdentityWindow`, `identityWindows`, `closeIdentityWindows`, contained-window `will-redirect` hand-back |
| `src/main/purge.ts` (modify) | closes identity popups before the wipe, beside call windows |
| `src/preload/service.ts` (modify) | `inCallPopup` → `inPopup`; comment widened |
| `tests/unit/host-match.test.ts` (create) | matcher semantics |
| `tests/unit/identity-policy.test.ts` (create) | provider matchers |
| `tests/unit/navigation-audit.test.ts` (modify) | `:popup` key does not collide |
| `CLAUDE.md` (modify) | Security bullet: the second `window.open` exception |
| `docs/superpowers/specs/2026-08-31-social-login-design.md` (modify) | live-pass findings |

---

### Task 1: Shared `hostMatches`

**Files:**

- Create: `src/main/lib/host-match.ts`
- Modify: `src/main/lib/navigation-policy.ts:39-44`
- Test: `tests/unit/host-match.test.ts`

**Interfaces:**

- Produces: `hostMatches(host: string, entry: string): boolean` — Task 2 imports it.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/host-match.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hostMatches } from '../../src/main/lib/host-match';

describe('hostMatches', () => {
  it('matches an exact entry only exactly', () => {
    expect(hostMatches('accounts.google.com', 'accounts.google.com')).toBe(true);
    expect(hostMatches('www.accounts.google.com', 'accounts.google.com')).toBe(false);
    expect(hostMatches('google.com', 'accounts.google.com')).toBe(false);
  });

  it('matches a suffix entry against the bare domain and any subdomain', () => {
    expect(hostMatches('slack.com', '.slack.com')).toBe(true);
    expect(hostMatches('acme.slack.com', '.slack.com')).toBe(true);
    expect(hostMatches('a.b.slack.com', '.slack.com')).toBe(true);
  });

  it('never lets a suffix match a lookalike', () => {
    expect(hostMatches('evilslack.com', '.slack.com')).toBe(false);
    expect(hostMatches('slack.com.evil.example', '.slack.com')).toBe(false);
    expect(hostMatches('notslack.com', '.slack.com')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `corepack pnpm vitest run tests/unit/host-match.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/main/lib/host-match"`.

- [ ] **Step 3: Create the helper**

Create `src/main/lib/host-match.ts`:

```ts
/** Whether `host` matches an allowlist entry. An entry starting with `.` is
 *  a suffix: `.slack.com` matches `slack.com` and any subdomain of it — the
 *  only way to express per-workspace hosts — and never a lookalike, which a
 *  bare endsWith would admit (`evilslack.com`). */
export function hostMatches(host: string, entry: string): boolean {
  if (!entry.startsWith('.')) return host === entry;
  return host === entry.slice(1) || host.endsWith(entry);
}
```

- [ ] **Step 4: Point `navigation-policy.ts` at it**

In `src/main/lib/navigation-policy.ts`, add the import at the top (below the existing `import type`):

```ts
import { hostMatches } from './host-match';
```

and delete the local function (lines 39–44 in the current file):

```ts
function hostMatches(host: string, entry: string): boolean {
  if (!entry.startsWith('.')) return host === entry;
  // `.slack.com` covers slack.com itself and any subdomain, and nothing else:
  // endsWith alone would also match `evilslack.com`
  return host === entry.slice(1) || host.endsWith(entry);
}
```

Nothing else in the file changes.

- [ ] **Step 5: Run the tests**

Run: `corepack pnpm vitest run tests/unit/host-match.test.ts tests/unit/navigation-policy.test.ts`
Expected: both files PASS (the navigation-policy suffix tests are the regression check for the move).

- [ ] **Step 6: Lint and typecheck**

Run: `corepack pnpm lint && corepack pnpm typecheck`
Expected: no findings.

- [ ] **Step 7: Commit**

Stop and ask the user to run `/commit` for `src/main/lib/host-match.ts`, `src/main/lib/navigation-policy.ts`, `tests/unit/host-match.test.ts`. Suggested subject: `refactor(nav): share hostMatches between policies`.

---

### Task 2: `identity-policy.ts` and the audit key

**Files:**

- Create: `src/main/lib/identity-policy.ts`
- Test: `tests/unit/identity-policy.test.ts`
- Modify: `tests/unit/navigation-audit.test.ts` (append one test; no source change)

**Interfaces:**

- Consumes: `hostMatches` from Task 1.
- Produces: `isIdentityPopup(url: string): boolean`, `isIdentityHost(url: string): boolean`, `IDENTITY_PROVIDERS: IdentityProvider[]` — Task 3 imports the two functions.

- [ ] **Step 1: Write the failing matcher tests**

Create `tests/unit/identity-policy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  IDENTITY_PROVIDERS,
  isIdentityHost,
  isIdentityPopup,
} from '../../src/main/lib/identity-policy';

// The popup must OPEN on an auth dialog (host + entry path); once open it may
// roam the provider's host. Seeds are from known SDK behaviour and are
// confirmed or pruned by the live pass, never by memory.
describe('isIdentityPopup', () => {
  it('accepts the seeded provider entry URLs', () => {
    expect(isIdentityPopup('https://accounts.google.com/o/oauth2/v2/auth?client_id=x')).toBe(true);
    expect(isIdentityPopup('https://accounts.google.com/gsi/select?client_id=x')).toBe(true);
    expect(isIdentityPopup('https://accounts.google.com/signin/oauth?x=1')).toBe(true);
    expect(isIdentityPopup('https://www.facebook.com/dialog/oauth?client_id=x')).toBe(true);
    expect(isIdentityPopup('https://www.facebook.com/v19.0/dialog/oauth?client_id=x')).toBe(true);
    expect(isIdentityPopup('https://m.facebook.com/login.php?next=x')).toBe(true);
    expect(isIdentityPopup('https://appleid.apple.com/auth/authorize?client_id=x')).toBe(true);
    expect(
      isIdentityPopup('https://login.microsoftonline.com/common/oauth2/v2.0/authorize'),
    ).toBe(true);
    expect(isIdentityPopup('https://login.live.com/oauth20_authorize.srf')).toBe(true);
    expect(isIdentityPopup('https://x.com/i/oauth2/authorize?x=1')).toBe(true);
    expect(isIdentityPopup('https://api.twitter.com/oauth/authenticate?x=1')).toBe(true);
    expect(isIdentityPopup('https://access.line.me/oauth2/v2.1/authorize')).toBe(true);
    expect(isIdentityPopup('https://kauth.kakao.com/oauth/authorize')).toBe(true);
    expect(isIdentityPopup('https://accounts.kakao.com/login?continue=x')).toBe(true);
  });

  it('requires https', () => {
    expect(isIdentityPopup('http://accounts.google.com/o/oauth2/v2/auth')).toBe(false);
    expect(isIdentityPopup('file:///o/oauth2/v2/auth')).toBe(false);
  });

  it('rejects a provider host outside its entry paths', () => {
    expect(isIdentityPopup('https://www.facebook.com/marketplace')).toBe(false);
    // the version-segment strip must not turn /videos into a dialog
    expect(isIdentityPopup('https://www.facebook.com/videos/123')).toBe(false);
    expect(isIdentityPopup('https://accounts.google.com/ManageAccount')).toBe(false);
    expect(isIdentityPopup('https://x.com/home')).toBe(false);
  });

  it('rejects lookalike hosts', () => {
    expect(isIdentityPopup('https://accounts.google.com.evil.example/o/oauth2/v2/auth')).toBe(false);
    expect(isIdentityPopup('https://evilfacebook.com/dialog/oauth')).toBe(false);
    expect(isIdentityPopup('https://accounts-google.com/o/oauth2/v2/auth')).toBe(false);
  });

  it('rejects junk without throwing', () => {
    expect(isIdentityPopup('not a url')).toBe(false);
    expect(isIdentityPopup('')).toBe(false);
    expect(isIdentityPopup('about:blank')).toBe(false);
  });

  it('declares at least one entry path per provider', () => {
    for (const p of IDENTITY_PROVIDERS) expect(p.entryPaths.length).toBeGreaterThan(0);
  });
});

describe('isIdentityHost', () => {
  it('accepts any path on a provider host', () => {
    expect(isIdentityHost('https://accounts.google.com/signin/v2/challenge/pwd')).toBe(true);
    expect(isIdentityHost('https://accounts.google.com/ManageAccount')).toBe(true);
    expect(isIdentityHost('https://www.facebook.com/checkpoint/')).toBe(true);
    expect(isIdentityHost('https://appleid.apple.com/')).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isIdentityHost('https://www.tiktok.com/login/callback?code=x')).toBe(false);
    expect(isIdentityHost('https://evil.example/')).toBe(false);
    expect(isIdentityHost('http://accounts.google.com/')).toBe(false);
    expect(isIdentityHost('not a url')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `corepack pnpm vitest run tests/unit/identity-policy.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/main/lib/identity-policy"`.

- [ ] **Step 3: Create the policy**

Create `src/main/lib/identity-policy.ts`:

```ts
import { hostMatches } from './host-match';

export interface IdentityProvider {
  /** exact host, or `.suffix` as in navigation-policy */
  host: string;
  /** path prefixes a popup may OPEN on; once open it roams the whole host */
  entryPaths: string[];
}

/** Identity providers a service page may open a sign-in popup on. Global,
 *  not per service (user decision, 2026-08-31): the popup is hardened
 *  regardless of who opened it, so a per-recipe declaration would buy no
 *  safety. Entry paths gate only the opening URL — the popup has to begin as
 *  an auth dialog. `[nav] popup denied:` lines are the evidence for growing
 *  this; VERIFY LIVE before trusting an entry. */
export const IDENTITY_PROVIDERS: IdentityProvider[] = [
  { host: 'accounts.google.com', entryPaths: ['/o/oauth2/', '/gsi/', '/signin/'] },
  { host: 'www.facebook.com', entryPaths: ['/dialog/oauth', '/login'] },
  { host: 'm.facebook.com', entryPaths: ['/dialog/oauth', '/login'] },
  { host: 'appleid.apple.com', entryPaths: ['/auth/'] },
  { host: 'login.microsoftonline.com', entryPaths: ['/'] },
  { host: 'login.live.com', entryPaths: ['/'] },
  { host: 'x.com', entryPaths: ['/i/oauth2/', '/oauth/'] },
  { host: 'twitter.com', entryPaths: ['/i/oauth2/', '/oauth/'] },
  { host: 'api.twitter.com', entryPaths: ['/oauth/'] },
  { host: 'access.line.me', entryPaths: ['/oauth2/'] },
  { host: 'kauth.kakao.com', entryPaths: ['/oauth/'] },
  { host: 'accounts.kakao.com', entryPaths: ['/login'] },
];

/** Facebook versions its dialog path (`/v19.0/dialog/oauth`); the version
 *  segment is dropped so the table names the dialog once. */
const GRAPH_VERSION = /^\/v\d+(\.\d+)?(?=\/)/;

function parseHttps(url: string): URL | null {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

/** May a service view open this URL as an identity popup? */
export function isIdentityPopup(url: string): boolean {
  const u = parseHttps(url);
  if (!u) return false;
  const path = u.pathname.replace(GRAPH_VERSION, '');
  return IDENTITY_PROVIDERS.some(
    (p) => hostMatches(u.host, p.host) && p.entryPaths.some((prefix) => path.startsWith(prefix)),
  );
}

/** May an open identity popup navigate here? Any path on a provider host —
 *  the IdP roams its own pages (account picker, consent, 2FA). */
export function isIdentityHost(url: string): boolean {
  const u = parseHttps(url);
  if (!u) return false;
  return IDENTITY_PROVIDERS.some((p) => hostMatches(u.host, p.host));
}
```

- [ ] **Step 4: Run the matcher tests**

Run: `corepack pnpm vitest run tests/unit/identity-policy.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Add the audit-key test**

Append to the `describe('NavigationAudit', …)` block in `tests/unit/navigation-audit.test.ts`, after the `'records an unparseable url without throwing'` test:

```ts
  // popup refusals are keyed `<service>:popup` so an earlier contained
  // navigation on the same host cannot swallow them (social-login, 2026-08-31)
  it('keeps a popup refusal distinct from a contained navigation on the same host', () => {
    const audit = new NavigationAudit();
    expect(audit.note('tiktok', 'https://idp.example.com/auth')).toBe('tiktok idp.example.com');
    expect(audit.note('tiktok:popup', 'https://idp.example.com/auth')).toBe(
      'tiktok:popup idp.example.com',
    );
    expect(audit.note('tiktok:popup', 'https://idp.example.com/other')).toBeNull();
  });
```

- [ ] **Step 6: Run it**

Run: `corepack pnpm vitest run tests/unit/navigation-audit.test.ts`
Expected: PASS, 4 tests (no source change was needed — `note` already takes a string key; the test pins that contract).

- [ ] **Step 7: Lint and typecheck**

Run: `corepack pnpm lint && corepack pnpm typecheck`
Expected: no findings.

- [ ] **Step 8: Commit**

Stop and ask the user to run `/commit` for `src/main/lib/identity-policy.ts`, `tests/unit/identity-policy.test.ts`, `tests/unit/navigation-audit.test.ts`. Suggested subject: `feat(nav): identity-provider popup policy`.

---

### Task 3: Open, guard, track and close identity popups

**Files:**

- Modify: `src/main/views.ts` — imports (line 18–23), window maps (line 105–106), `setWindowOpenHandler` (lines 212–235), `did-create-window` (lines 236–257), `destroy` (line 659), after `closeCallWindows` (line 675)
- Modify: `src/main/purge.ts:15-18`
- Modify: `src/preload/service.ts:16-20`

**Interfaces:**

- Consumes: `isIdentityPopup`, `isIdentityHost` from Task 2; existing `isNavigationAllowed`, `isSafeExternalUrl`, `NavigationAudit.note`, `debugCalls`.
- Produces: `ServiceViewManager.closeIdentityWindows(id: ServiceId): void` (public, used by `purge.ts`).

No unit test: this is Electron wiring. Verification is typecheck + e2e (the existing suites drive `views.ts`) + the Task 6 live pass.

- [ ] **Step 1: Import the policy**

In `src/main/views.ts`, next to `import { CALL_ORIGINS, isBlankCallPopup, isCallPopup } from './lib/call-policy';` add:

```ts
import { isIdentityHost, isIdentityPopup } from './lib/identity-policy';
```

- [ ] **Step 2: Track identity popups**

Below `private callWindows = new Map<ServiceId, Set<BrowserWindow>>();` add:

```ts
  /** sign-in popups a service page opened — see lib/identity-policy.ts */
  private identityWindows = new Map<ServiceId, Set<BrowserWindow>>();
```

- [ ] **Step 3: Replace the `setWindowOpenHandler` block**

Replace the whole `wc.setWindowOpenHandler(({ url }) => { … });` (currently lines 212–235) with:

```ts
    wc.setWindowOpenHandler(({ url, disposition }) => {
      const call = isCallPopup(id, url) || isBlankCallPopup(id, url);
      const identity = !call && isIdentityPopup(url);
      debugCalls(
        `window.open from ${id}: "${url}" -> ${
          call ? 'ALLOW call' : identity ? 'ALLOW identity' : 'deny'
        }`,
      );
      // a call is chat: a call-declaring service may open its popup, but the
      // guest window is inert scaffolding — hidden, and never allowed to
      // commit a navigation. It exists so the page keeps a live same-process
      // handle it can script (Chrome parity; Messenger writes into the
      // about:blank popup it just opened, then navigates it). The real call
      // surface opens via adoption in did-create-window below. Guest
      // webPreferences are NOT overridden: about:blank popups ignore the
      // override entirely, and a same-process guest committing a navigation
      // crashes the shared renderer with the opener's Node env pending work
      // (electron#36858 class — reproduced 2026-08-16, SIGSEGV exit 11).
      if (call) {
        return { action: 'allow', overrideBrowserWindowOptions: { show: false } };
      }
      // a sign-in dialog is the other window a chat page may open. It opens
      // on a real https URL, so unlike the blank guest its webPreferences
      // override applies: isolated + sandboxed is a separate process, out of
      // reach of the crash above, and window.opener survives for the
      // callback page's postMessage. Guarded in did-create-window below.
      if (identity) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 520,
            height: 680,
            backgroundColor: '#0F1115',
            webPreferences: {
              partition: `persist:${id}`,
              contextIsolation: true,
              sandbox: true,
              nodeIntegration: false,
            },
          },
        };
      }
      // only a scripted window.open (features string → new-window) is
      // evidence for the provider table; a target=_blank link click arrives
      // as foreground-tab and is just a link
      if (disposition === 'new-window') {
        const record = this.navAudit.note(`${id}:popup`, url);
        if (record) console.warn(`[nav] popup denied: ${record} (${url})`);
      }
      // external links open in the OS browser, never inside Goetia; only
      // web schemes — a hostile page must not reach file:/smb:/custom
      if (isSafeExternalUrl(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
```

- [ ] **Step 4: Branch `did-create-window`**

Replace the whole `wc.on('did-create-window', (child) => { … });` (currently lines 236–257) with:

```ts
    wc.on('did-create-window', (child, { url }) => {
      child.excludedFromShownWindowsMenu = true;
      child.webContents.setWindowOpenHandler(({ url: popupUrl }) => {
        if (isSafeExternalUrl(popupUrl)) shell.openExternal(popupUrl);
        return { action: 'deny' };
      });
      if (isIdentityPopup(url)) {
        this.guardIdentityWindow(id, child);
        return;
      }
      // the call guest never navigates and never spawns: its first call-URL
      // navigation is adopted into a standalone call window, anything else
      // closes it. Closing an idle guest is safe — only an in-process
      // navigation commit races the opener's Node env (see above).
      child.webContents.on('will-navigate', (e, navUrl) => {
        debugCalls(`guest nav on ${id}: "${navUrl}"`);
        e.preventDefault();
        if (isCallPopup(id, navUrl)) {
          this.openCallWindow(id, navUrl);
          return;
        }
        if (isSafeExternalUrl(navUrl)) shell.openExternal(navUrl);
        if (!child.isDestroyed()) child.close();
      });
      if (DEBUG_CALLS) child.on('closed', () => debugCalls(`guest closed (${id})`));
    });
```

- [ ] **Step 5: Add the guard and the closer**

Directly after the `closeCallWindows(id: ServiceId): void { … }` method, add:

```ts
  /** A sign-in popup keeps its opener — the callback page finishes through
   *  postMessage — and is otherwise a contained window: it may roam the
   *  provider's hosts and land on the service's own, and anything else
   *  closes it. Main frame only: an IdP page's subframes are not its origin. */
  private guardIdentityWindow(id: ServiceId, popup: BrowserWindow): void {
    let open = this.identityWindows.get(id);
    if (!open) {
      open = new Set();
      this.identityWindows.set(id, open);
    }
    open.add(popup);
    popup.on('closed', () => {
      debugCalls(`identity popup closed (${id})`);
      this.identityWindows.get(id)?.delete(popup);
    });
    const guard = (e: { preventDefault(): void }, url: string, isMainFrame: boolean): void => {
      if (!isMainFrame || isIdentityHost(url) || isNavigationAllowed(id, url)) return;
      e.preventDefault();
      const record = this.navAudit.note(`${id}:popup`, url);
      if (record) console.warn(`[nav] popup contained: ${record} (${url})`);
      if (!popup.isDestroyed()) popup.close();
    };
    popup.webContents.on('will-navigate', (e, url, _inPlace, isMainFrame) =>
      guard(e, url, isMainFrame),
    );
    popup.webContents.on('will-redirect', (e, url, _inPlace, isMainFrame) =>
      guard(e, url, isMainFrame),
    );
  }

  /** A sign-in popup belongs to the view that opened it: it survives a
   *  service switch and dies with the service — and with a purge, since it
   *  runs in the partition being wiped. */
  closeIdentityWindows(id: ServiceId): void {
    for (const popup of this.identityWindows.get(id) ?? []) {
      if (!popup.isDestroyed()) popup.close();
    }
    this.identityWindows.delete(id);
  }
```

- [ ] **Step 6: Close on destroy**

In `destroy(id)`, directly after `this.closeCallWindows(id);` add:

```ts
    this.closeIdentityWindows(id);
```

- [ ] **Step 7: Close on purge**

In `src/main/purge.ts`, replace:

```ts
  // before the wipe, and unconditionally: the confirm promises the call ends,
  // and a call window runs in this very partition
  ctx.views.closeCallWindows(id);
```

with:

```ts
  // before the wipe, and unconditionally: the confirm promises the call ends,
  // and both a call window and a sign-in popup run in this very partition
  ctx.views.closeCallWindows(id);
  ctx.views.closeIdentityWindows(id);
```

- [ ] **Step 8: Widen the preload bail**

In `src/preload/service.ts`, replace:

```ts
/** A call popup (window.open allowed by call-policy) can inherit this preload.
 *  The popup IS the call surface: no recipes, shims, or keep-alive belong here. */
const inCallPopup = window.opener !== null;

if (!inCallPopup) {
```

with:

```ts
/** A popup the view was allowed to open (a call guest, a sign-in dialog) can
 *  inherit this preload. The popup is its own surface: no recipes, shims, or
 *  keep-alive belong here. */
const inPopup = window.opener !== null;

if (!inPopup) {
```

Check there is no other `inCallPopup` reference: `grep -n inCallPopup src/preload/service.ts` must print nothing.

- [ ] **Step 9: Lint, typecheck, unit tests**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: all green. (`did-create-window` is typed `(window: BrowserWindow, details: DidCreateWindowDetails)` with `details.url: string`, and `HandlerDetails.disposition` is the union that includes `'new-window'` — no casts.)

- [ ] **Step 10: e2e**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`
Expected: all specs pass (smoke, purge and passkeys drive `views.ts` and the preload).

- [ ] **Step 11: Commit**

Stop and ask the user to run `/commit` for `src/main/views.ts`, `src/main/purge.ts`, `src/preload/service.ts`. Suggested subject: `feat(views): open identity-provider sign-in popups as hardened windows`.

---

### Task 4: Contained window hands back before a redirect commits

**Files:**

- Modify: `src/main/views.ts` — `openContainedWindow`, after the `handBack` definition (currently lines 387–397)

**Interfaces:**

- Consumes: existing `handBack`, `isNavigationAllowed`.

No unit test: Electron wiring. Verified by e2e (no regression) and the Task 6 live pass on Slack → Google.

- [ ] **Step 1: Add the `will-redirect` hand-back**

In `openContainedWindow`, directly after:

```ts
    win.webContents.on('did-navigate', handBack);
    win.webContents.on('did-navigate-in-page', handBack);
```

add:

```ts
    // A redirect hop back onto an allowed host is handed over BEFORE it
    // commits: the callback then runs once, in the view, whose sessionStorage
    // still holds the state/PKCE the login page stashed. Redirects only — a
    // will-navigate may be a POST (Apple's form_post callback, SAML), and a
    // prevented POST re-issued as loadURL would arrive as an empty GET, so
    // plain navigations keep the post-commit hand-back above.
    win.webContents.on('will-redirect', (e, url, _inPlace, isMainFrame) => {
      if (!isMainFrame || !isNavigationAllowed(id, url)) return;
      e.preventDefault();
      handBack(e, url);
    });
```

`handBack` is typed `(_e: unknown, landedUrl: string)`, so passing the event is fine and needs no signature change.

- [ ] **Step 2: Lint, typecheck, e2e**

Run: `corepack pnpm lint && corepack pnpm typecheck && env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`
Expected: all green.

- [ ] **Step 3: Commit**

Stop and ask the user to run `/commit` for `src/main/views.ts`. Suggested subject: `fix(nav): hand a contained login back before its redirect commits`.

---

### Task 5: Guardrail documentation

**Files:**

- Modify: `CLAUDE.md` — the Security bullet beginning `- **External links**:`

- [ ] **Step 1: Amend the External links bullet**

In `CLAUDE.md`, the External links bullet currently opens its popup sentence with the words "Sole exception to deny-by-default" and ends with "and the service preload bails on" followed by the `window.opener` code span. Change "Sole exception" to "Two exceptions" and append this sentence to the end of that bullet:

```markdown
The second exception is a sign-in dialog: a URL passing `isIdentityPopup` (`lib/identity-policy.ts`, a **global** provider table — user decision 2026-08-31; spec `docs/superpowers/specs/2026-08-31-social-login-design.md`) opens as a **visible hardened popup** (isolated, sandboxed, same `persist:<id>`) that keeps `window.opener`, because the callback page finishes through `postMessage`; it may roam any provider host (`isIdentityHost`) or an `isNavigationAllowed` host, main frame only, and anything else closes it. Never adopt it into a fresh window (that severs the opener) and never add a provider host to `ALLOWED_HOSTS`. Refused scripted popups (`disposition === 'new-window'`) log `[nav] popup denied:` — the evidence for growing the table. Identity popups close with the service and on purge (`closeIdentityWindows`). The contained window hands a login back on `will-redirect` **before** the callback commits, and only there: `will-navigate` may carry a POST body Electron does not expose (Apple's `form_post`).
```

- [ ] **Step 2: Lint the markdown**

Run: `npx --yes markdownlint-cli2 CLAUDE.md`
Expected: `Summary: 0 issues`.

- [ ] **Step 3: Commit**

Stop and ask the user to run `/commit` for `CLAUDE.md`. Suggested subject: `docs: record the identity-popup window.open exception`.

---

### Task 6: Live pass (manual; the user drives the sign-ins)

**Files:**

- Modify: `docs/superpowers/specs/2026-08-31-social-login-design.md` — the `## Findings from the live pass` section
- Possibly modify: `src/main/lib/identity-policy.ts` (`IDENTITY_PROVIDERS`) and `tests/unit/identity-policy.test.ts`, from evidence

The feature is not done until this passes; see CLAUDE.md's definition of done for wiring changes and the spec's Testing section.

- [ ] **Step 1: Build**

Run: `corepack pnpm package:mac`
Expected: a DMG under `dist/`; the app launches (answer **Always Allow** on the `Goetia Safe Storage` keychain prompt — expected on every ad-hoc rebuild).

- [ ] **Step 2: Launch with popup diagnostics**

Run the packaged binary from a terminal so stderr is visible, e.g. `GOETIA_DEBUG_CALLS=1 dist/mac-arm64/Goetia.app/Contents/MacOS/Goetia 2>&1 | tee /tmp/goetia-live.log` (adjust the arch folder to what `dist/` contains).

- [ ] **Step 3: TikTok → Continue with Google, then Continue with Facebook**

Enable TikTok on Home (logged out, the view lands on `/login`). Click each button. Check, for each:

- the log shows `[calls-debug] window.open from tiktok: "https://…" -> ALLOW identity` — if it shows `-> deny` and a `[nav] popup denied: tiktok:popup <host>` line, that host/path is missing from `IDENTITY_PROVIDERS`: add it (with a test row) and rebuild;
- a separate Goetia window opens (not the OS browser) with the provider's sign-in form;
- Google does **not** show "This browser or app may not be secure" (`disallowed_useragent`) — if it does, record it as a finding; the UA spoof in `lib/ua.ts` is the lever;
- `View ▸ Toggle Developer Tools` is not available on the popup; instead confirm the opener from the log: after signing in, the popup closes on its own and the TikTok view proceeds to `/messages` without the user doing anything — that transition is only possible if `window.opener.postMessage` reached the page;
- no `[nav] popup contained:` line appears. If one does, the popup was closed on a host the flow needs — record the host and URL. A host the popup only ever reaches mid-flow (e.g. an `accounts.youtube.com` bounce) is not an entry: do not give it `entryPaths: ['/']`. Add a separate `ROAMING_HOSTS: string[]` in `identity-policy.ts` that `isIdentityHost` also consults, with a test in `identity-policy.test.ts` asserting the host passes `isIdentityHost` and fails `isIdentityPopup`.

- [ ] **Step 4: Slack → Sign in with Google**

Enable Slack, click Sign in with Google. Expected: the contained window opens on Google, and on the redirect back the **service view** loads `slack.com/openid/google/callback…` exactly once (the log's `[nav] contained: slack accounts.google.com` line appears once; no second load of the callback). Sign-in completes on the chat URL. If the view shows an "invalid code" page, the hand-back fired on the wrong hop — record the URLs.

- [ ] **Step 5: Purge while a popup is open**

Open TikTok → Continue with Google, leave the popup open, run Home → `Purge all logins…` and confirm. Expected: the popup closes with the wipe (`[calls-debug] identity popup closed (tiktok)`).

- [ ] **Step 6: Record findings**

Replace `None yet.` under `## Findings from the live pass` in the spec with dated bullets: what each button did (popup or redirect, opening URL host + path), whether Google accepted the UA, any table changes made and why, and anything left unresolved. Run `npx --yes markdownlint-cli2 docs/superpowers/specs/2026-08-31-social-login-design.md` → `Summary: 0 issues`.

- [ ] **Step 7: Full verification**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`
Expected: all green.

- [ ] **Step 8: Commit**

Stop and ask the user to run `/commit` for the spec and any policy/test changes the pass produced. Suggested subject: `docs(social-login): record the live pass` (or `feat(nav): …` if the table changed).
