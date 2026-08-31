# Social login — design

Date: 2026-08-31. Status: approved in brainstorm (user decision, same day); live pass pending. Scope: let a service's "Continue with Google / Facebook / Apple …" buttons complete inside Goetia. Two pieces — an identity-popup allowlist beside the call-popup one, and an earlier hand-back from the contained window on redirect hops. TikTok is the first target.

## Problem

Third-party sign-in on the web takes two shapes, and Goetia's window policy treats them differently:

- **Redirect flow** — a top-level navigation: service → identity provider (IdP) → back to the service's callback URL. Slack (Google, Apple) and Instagram (Facebook) work this way. It already works in Goetia: `will-navigate` to the IdP host is refused by `isNavigationAllowed`, the URL opens in the hardened contained window, and the view takes the URL back when the window lands on an allowed host (`openContainedWindow`, `views.ts`).
- **Popup flow** — the page calls `window.open(idpUrl)`; the popup goes IdP → service callback page, which finishes through `window.opener.postMessage(...)` (or the opener polls `popup.closed`) and closes. Google Identity Services (the current "Sign in with Google" button), `FB.login()` and Sign in with Apple JS are all popups, and none has a redirect fallback. TikTok's login page — where `loginUrl` (`2026-08-30-logged-out-login-landing-design.md`) now lands a signed-out user — offers Google, Facebook, Apple, X, LINE and Kakao this way.

Today `setWindowOpenHandler` (`views.ts`) allows only `isCallPopup` / `isBlankCallPopup` and hands every other web URL to the OS browser. The system browser has a different cookie jar and no `window.opener`, so a popup sign-in can never complete: TikTok-via-Google is impossible.

The redirect path has a smaller defect. The contained window hands back on `did-navigate`, i.e. after the callback has committed there: the one-time `code` is consumed in the contained window, then the view loads the same URL and consumes it again. Cookies are shared, so the second load usually sees a session — but a strict verifier renders "invalid or expired code", and a PKCE verifier or `state` the login page stashed in `sessionStorage` is per-window, so it is missing where the callback actually runs.

## Decisions

- **Global provider list, not per-recipe** (user decision). The popup is hardened regardless of who opened it, so `IDENTITY_PROVIDERS` is one table any service may use; a per-service declaration would mean every login pass edits a recipe for no safety gain.
- **Deny-by-default `window.open` stands.** The identity popup is a second narrow exception with the same shape as `isCallPopup`: a matcher in `lib/`, a hardened window, a `did-create-window` guard, an audit line for every refusal.
- **IdP hosts never enter `ALLOWED_HOSTS`.** The service view runs unsandboxed with the recipe preload — the guard exists so an IdP page never runs there. Rejected approach.
- **No adoption for identity popups.** Calls adopt the guest's first navigation into a fresh window because a call popup is `about:blank` and its webPreferences cannot be overridden. An identity popup opens on a real `https:` URL, where the override applies, and keeping the popup itself is what preserves `window.opener` — sever it and `postMessage` completion dies. Routing popups through the contained window was rejected for that reason.
- **`about:blank` popups stay out of v1.** A site that opens blank then sets `location` would need the inert-guest path widened to every service. The live pass says whether any target does this; nothing is built for it until one does.

## Design

### 1. `src/main/lib/identity-policy.ts`

```ts
export interface IdentityProvider {
  /** exact host, or `.suffix` as in navigation-policy */
  host: string;
  /** path prefixes a popup may OPEN on; roaming inside the popup is host-level */
  entryPaths: string[];
}

export const IDENTITY_PROVIDERS: IdentityProvider[];

/** May a service view open this URL as an identity popup? https only; host
 *  must match a provider and the path one of its entry prefixes. */
export function isIdentityPopup(url: string): boolean;

/** May an open identity popup navigate here? https only; any path on a
 *  provider host — the IdP roams its own pages (consent, 2FA, account picker). */
export function isIdentityHost(url: string): boolean;
```

Seed (host → entry paths), to be pruned or extended from the live pass and audit lines, never from memory of what a provider used to do:

| Provider | Host | Entry paths |
| --- | --- | --- |
| Google | `accounts.google.com` | `/o/oauth2/`, `/gsi/`, `/signin/` |
| Facebook | `www.facebook.com`, `m.facebook.com` | `/dialog/oauth`, `/v` (versioned `/v19.0/dialog/oauth`), `/login` |
| Apple | `appleid.apple.com` | `/auth/` |
| Microsoft | `login.microsoftonline.com`, `login.live.com` | `/` |
| X | `x.com`, `twitter.com`, `api.twitter.com` | `/i/oauth2/`, `/oauth/` |
| LINE | `access.line.me` | `/oauth2/` |
| Kakao | `kauth.kakao.com`, `accounts.kakao.com` | `/oauth/`, `/login` |

Entry-path prefixes gate only the opening URL — the popup must begin as an auth dialog. Once open, the popup may roam any path on a provider host (`isIdentityHost`) or any host `isNavigationAllowed(id, url)` permits, because the flow ends on the service's own callback page. `hostMatches` moves out of `navigation-policy.ts` into a shared helper so both policies spell suffixes the same way.

### 2. Opening the popup — `setWindowOpenHandler` in `views.ts`

Order of checks: call popup (unchanged) → identity popup → external. An identity match returns:

```ts
{
  action: 'allow',
  overrideBrowserWindowOptions: {
    width: 520, height: 680,
    backgroundColor: '#0F1115',
    webPreferences: {
      partition: `persist:${id}`,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  },
}
```

Why this is safe where the call popup was not: the 2026-08-16 findings were that an `about:blank` popup ignores the webPreferences override and that a **same-process** guest committing a navigation crashes the shared renderer (electron#36858 class). An identity popup opens on an `https:` URL, so the override applies, and a sandboxed popup cannot share the unsandboxed view's process — it is out-of-process by construction. `window.opener` survives (Chromium keeps the cross-origin opener handle; only `noopener` drops it), so the callback page's `postMessage` and `close()` work exactly as in Chrome.

The popup may still inherit the service preload. `service.ts` already bails when `window.opener !== null` (`inCallPopup`); the constant is renamed `inPopup` and its comment widened — no recipe, shim, or keep-alive runs in any popup.

### 3. Guarding the popup — `did-create-window`

The existing handler branches on the child's initial URL: a call guest keeps today's inert treatment; an identity popup is tracked in `identityWindows: Map<ServiceId, Set<BrowserWindow>>` and gets:

- `setWindowOpenHandler`: deny; safe URLs to the OS browser. No popups from popups.
- `will-navigate` + `will-redirect`, **main frame only** (the 2026-08-29 lesson — an IdP page's subframes are not the popup's origin): allowed when `isIdentityHost(url) || isNavigationAllowed(id, url)`; otherwise `preventDefault`, audit, close the popup.
- `excludedFromShownWindowsMenu = true`.
- Lifetime: dies with its opener view (`outlivesOpener` default), and `closeIdentityWindows(id)` runs wherever `closeCallWindows(id)` does — service destroy and purge. A service switch leaves an in-flight popup open; it belongs to the view, not the surface.

Debug lines ride the existing `debugCalls` channel under `GOETIA_DEBUG_CALLS` — both are the popup story, and a second flag would be one more thing to remember on a live pass.

### 4. Audit

`NavigationAudit.note` already accepts a string key. A refused `window.open` whose `disposition` is `new-window` — a script call with a features string, which is how every sign-in SDK opens its dialog; a `target=_blank` link click arrives as `foreground-tab` and still goes to the OS browser unrecorded — records the key `<service>:popup` for the URL's host and logs it as `[nav] popup denied:`; a refused in-popup navigation logs `[nav] popup contained:` under the same key. The `:popup` suffix keeps a popup refusal from being swallowed by an earlier contained-navigation record of the same host. These lines are the evidence for growing `IDENTITY_PROVIDERS`, exactly as the `[nav] contained:` lines are for `ALLOWED_HOSTS`. Same cap.

### 5. Contained window: hand back before the callback commits

In `openContainedWindow`, add `will-redirect` (main frame only): when the redirect target passes `isNavigationAllowed(id, url)`, `preventDefault`, `loadURL` it in the service view, close the contained window. The callback then commits once, in the view, whose `sessionStorage` is intact because it never left the login page.

`did-navigate` / `did-navigate-in-page` hand-back stays for plain navigations. A `will-navigate` cannot be re-issued as `loadURL` — Electron's event carries no method or body, and Sign in with Apple posts its callback (`response_mode=form_post`), as do SAML SSO hosts, so a prevented POST would hand back an empty GET. Redirect hops are always GETs (a 307/308 preserving a POST is not something an IdP callback does), so the pre-commit path is limited to them. Google, Facebook and Slack's own OpenID bounce all return by 302, so the common case is covered; Apple keeps today's behaviour.

### 6. What is untouched

`ALLOWED_HOSTS`, `permissionAllowed` (an identity origin is granted nothing), `CALL_POPUPS`, the passkey authenticator (identity popups have no preload, so WebAuthn inside them is raw Chromium — the known limitation is that a passkey prompt on the IdP's own page does not work; password sign-in does), `chatPaths` and `loginUrl` (the view stays on the login page throughout a popup flow and only moves when the site's own JS navigates it afterward).

## Per-service expectation

| Service | Buttons | Shape | After this design |
| --- | --- | --- | --- |
| TikTok | Google, Facebook, Apple, X, LINE, Kakao | popup (verify live) | primary target |
| Slack | Google, Apple | redirect | already worked; §5 removes the double commit for Google |
| Shopee | Facebook, Google, Apple | unknown | verify live |
| Instagram | Facebook | redirect, hosts already allowed | unchanged |
| Teams | Microsoft | redirect, hosts allowed | unchanged |
| Discord, Telegram, WhatsApp, Zalo, Messenger | none | — | n/a |

## Testing

- `tests/unit/identity-policy.test.ts`: `isIdentityPopup` accepts each seeded entry URL, requires `https:`, matches path prefixes, rejects lookalike hosts (`accounts.google.com.evil.example`, `evilfacebook.com`), rejects a provider host on a non-entry path, and returns false for junk. `isIdentityHost` accepts any path on a provider host and nothing else. Suffix entries behave as in `navigation-policy.test.ts`.
- `navigation-policy.test.ts` gains nothing new beyond the shared `hostMatches` still passing.
- `navigation-audit.test.ts`: a `:popup`-keyed record does not collide with the plain key for the same host.
- Wiring (`setWindowOpenHandler` branch, `did-create-window` guard, `will-redirect` hand-back) stays thin and is not unit-tested; an OAuth popup cannot be e2e-driven against a live IdP.
- **Live pass, recorded here before the feature is called done:** a driven `package:mac` build, TikTok → Continue with Google and Continue with Facebook, Slack → Sign in with Google. For each: the popup opens as a separate window (not the OS browser), `window.opener` is non-null inside it (DevTools on the popup), the callback closes it and the view proceeds to chat, and the log shows no `[nav] popup contained:` line. Also confirm Google accepts the popup under `chromeUserAgent` — the `disallowed_useragent` refusal is the known failure for embedded browsers and only a live run proves the spoof suffices. Any refusal or unexpected host is a finding against the seed table.

## Findings from the live pass

- 2026-08-31, TikTok → Continue with Facebook (packaged build, `GOETIA_DEBUG_CALLS=1`): the button is a scripted `window.open` of `www.facebook.com/v18.0/dialog/oauth?…&display=popup&sdk=joey` — popup flow confirmed, the version-segment strip matched `/v18.0/`, and the popup opened in-app (`-> ALLOW identity`). Two attempts each ended in `identity popup closed` with **no** `[nav] popup contained:` line, so the guard did not close it — the dialog's own script or the user did. Decisive either way: the SDK's `redirect_uri` and `channel_url` are the xd_arbiter on `staticxx.facebook.com`, a host `isIdentityHost` refused, so the finishing hop could never commit. Fix: `ROAMING_HOSTS: ['.facebook.com']` — mid-flow hosts that are never an entry (`isIdentityPopup` still refuses them); `isIdentityHost` consults it. Popup loads and navigations now log under the debug flag for the re-run.
- 2026-08-31, second run (with `ROAMING_HOSTS` and popup diagnostics): TikTok → Facebook now renders `www.facebook.com/login.php` in the popup, and TikTok → Google renders `accounts.google.com/v3/signin/identifier` — **no `disallowed_useragent` refusal**, so the `chromeUserAgent` spoof passes Google's embedded-browser check. Google's dialog is GIS with `response_mode=form_post` and `redirect_uri=gis_transform`, i.e. the finishing hop stays on `accounts.google.com` before the `postMessage` to the opener. No navigation followed either form in this run (no credentials were submitted), so end-to-end completion — FB's hop to the `staticxx.facebook.com` arbiter, Google's consent hop, the popup self-closing, TikTok landing on `/messages` — is still unverified.
- 2026-08-31, **TikTok → Facebook completed end to end** (user drove a real sign-in). The popup ran the whole flow in-app with zero guard blocks (`grep -c 'popup contained' = 0`): `login.php` → `two_step_verification/two_factor` → `two_factor/remember_browser` → `v18.0/dialog/oauth` → `privacy/consent` → `dialog/consent/complete/?is_success_response=1`, then the popup closed itself and TikTok proceeded. `ROAMING_HOSTS: ['.facebook.com']` was necessary and sufficient — every `www.facebook.com`/`staticxx.facebook.com` hop was allowed. **Facebook popup login: verified working.**
- 2026-08-31, **Shopee → Google blocked by Google's secure-browser policy.** The popup opened, rendered `accounts.google.com/v3/signin/identifier`, then on submit bounced `identifier → /restart → /restart → /restart → identifier` and Google showed "Couldn't sign you in — This browser or app may not be secure." Not our guard (0 `popup contained` lines) — Google refused. Root cause is **not the UA string**: a probe confirms the packaged UA is a clean Chrome UA with no Electron/goetia token, and the `two_step_verification` proves Facebook is happy with it. The remaining embedded-browser tell is **client hints**: `navigator.userAgentData.brands` and the `Sec-CH-UA` header report `"Chromium";v="150"` with **no `"Google Chrome"` brand** (real Chrome sends both). Google's OAuth secure-browser check reads client hints, so Chromium-branded hints are the leading suspect. This is a known, deliberate Google block on embedded browsers; UA-string stripping is necessary but not always sufficient.
- Facebook popup on Shopee: rendered `login.php`; user did not complete (closed at the form). Mechanism confirmed, completion not exercised.
- Still to exercise: TikTok → Google completion, Slack → Google (contained-window `will-redirect`), purge with a popup open, Apple.

### Google's secure-browser block — client hints

A header probe settled it (2026-08-31): Electron sends **no `Sec-CH-UA` header at all** to `accounts.google.com` — only `User-Agent`. Real Chrome always sends the low-entropy client hints, so a Chrome UA string with *zero* hint headers is itself the embedded-browser tell. Fix: `lib/client-hints.ts` builds the three hints (`Sec-CH-UA` with a `"Google Chrome"` brand at the UA major version, `Sec-CH-UA-Mobile: ?0`, `Sec-CH-UA-Platform`), and `configureSession` injects them via `session.webRequest.onBeforeSendHeaders` for requests whose host `isIdentityHost` — the sign-in popup shares the service partition, so it inherits them. Scoped to identity hosts to leave every service's own site traffic untouched. No preload, no hardening cost, reversible. A wire probe confirmed the header leaves with the `Google Chrome` brand, but the **live pass (Shopee → Google, 2026-08-31) still hit the wall**: the same `identifier → /restart ×3 → signin/oauth → identifier → closed` bounce. So the header alone is insufficient — GIS reads `navigator.userAgentData.brands` **in-page (JS)**, which the request-header spoof cannot reach. The `navigator.userAgentData` preload was built, verified spoofing the brands in the page world — and **still did not clear the wall** (live pass 2026-08-31). Decisive detail from the inspector: the block appears **after the email is submitted**, i.e. server-side, not from anything the page reads at load. Google's OAuth secure-browser check therefore uses signals past the user agent (UA string, `Sec-CH-UA`, and `userAgentData` were all correct), which an embedded browser cannot spoof reliably. Reliable Google sign-in in desktop apps works because the app is itself the OAuth client and opens the flow in the **system browser**; Goetia cannot, because the service is the client (see above).

**Decision (user, 2026-08-31): revert the preload.** `contextIsolation: false` on a page talking to a real IdP is a real hardening cost, and it bought nothing, so the identity popup returns to isolated + sandboxed + no preload. The **client-hint headers stay** — they are correct Chrome behaviour and harmless. Google login is left to email/password or another provider (Facebook is verified working); this is Google's deliberate embedded-browser block, not a Goetia defect.

Why the "sign in via my everyday browser" model (Insomnia-style) does **not** apply: Insomnia is itself the OAuth client with its own `client_id` and a loopback/custom-scheme `redirect_uri` it controls. Here the OAuth client is the **service** (TikTok, Shopee); the login result is a `service`-origin session cookie plus a `postMessage` to the service's own page via `window.opener`, both of which must land in the partition that began the flow. A system browser cannot hand a `tiktok.com` cookie session back to Goetia without cross-browser cookie extraction, and the service's `redirect_uri` cannot be repointed at a loopback. Being pre-logged-into Google elsewhere does not help either — the block is on the embedded browser at the OAuth step, independent of login state.

### Why a popup preload was tried and reverted

The identity popup deliberately has **no preload** (raw Chromium hardening), so `navigator.userAgentData` cannot be overridden from JS the way the UA string is. Three candidate paths, none free:

1. **Spoof `Sec-CH-UA` on the request** (`session.webRequest.onBeforeSendHeaders` for the identity/shared session): rewrite the header brands to include `"Google Chrome"`. Cheap and reversible, but only fixes the HTTP header — GIS also reads `navigator.userAgentData` in JS, which stays `Chromium`. May be insufficient. VERIFY LIVE.
2. **Give the identity popup a tiny preload that overrides `navigator.userAgentData`** to match. Defeats "no preload" for the popup and widens attack surface on a page that talks to a real IdP — weighed against the fact that the popup is already same-origin-isolated and sandboxed.
3. **Accept the limitation.** Google OAuth in an embedded browser is blocked by Google; users sign in with email/password or another provider (Facebook works). No code, honest, but Google-login stays broken.

## Out of scope

`about:blank` identity popups; a passkey ceremony inside an identity popup; per-recipe provider declarations; adding new services; any relaxation of the deny-by-default window policy beyond `isIdentityPopup`.
