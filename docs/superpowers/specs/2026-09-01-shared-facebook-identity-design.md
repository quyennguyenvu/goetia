# Shared Facebook identity — design

Date: 2026-09-01. Status: approved in brainstorm (user decisions, same day); live pass pending, and the feature is inert until it runs. Scope: let a Facebook session already established in the Messenger service satisfy another service's "Continue with Facebook" dialog, so a social login costs a consent click instead of a password and a 2FA code. Builds directly on `2026-08-31-social-login-design.md`, which made the popup work at all.

## Problem

Every service view runs in its own `persist:<id>` cookie jar, and the identity popup deliberately inherits its opener's partition (`views.ts`, the `overrideBrowserWindowOptions` branch) — that inheritance is what keeps `window.opener` alive for the callback's `postMessage`, which is the whole completion path.

Messenger's service URL is `https://www.facebook.com/messages/`. Its partition therefore holds a real `www.facebook.com` session by construction, not by coincidence. But the Facebook dialog opened from TikTok runs in `persist:tiktok`, which has never seen facebook.com, so it renders `login.php`. That is exactly what the 2026-08-31 live pass recorded: a full password entry plus `two_step_verification/two_factor` plus `two_factor/remember_browser`, per service, despite the user already being signed into Facebook one tile away.

## Decisions

- **Facebook only** (user decision). Facebook is the one provider proven to complete end to end inside Goetia (TikTok → Facebook, 2026-08-31). Google is blocked server-side by its secure-browser check regardless of what is spoofed, and Apple, X, LINE and Kakao are unexercised. The mechanism is built for one provider and grown from evidence, the way `IDENTITY_PROVIDERS` and `CALL_POPUPS` were.
- **The session lives in the service jar only while the popup is open** (user decision). Cookies are copied in when the popup is created and removed when it closes. Afterwards the service keeps only its own session cookie, which is today's isolation exactly. A permanent mirror was rejected: `persist:tiktok` holding a live Facebook session indefinitely, in a view that runs unsandboxed with the recipe preload, is a standing weakening rather than a bounded one.
- **`persist:messenger` is the source of truth** (user decision). Zero new persisted session state, and no new purge story — "Purge Messenger" already means "log out of Facebook everywhere". A partition outlives its view, so a banished or hibernated Messenger still serves as the source; only purging it empties the source. A dedicated `persist:facebook` vault and a scan-every-partition model were both rejected as more state and more write directions for no gain the user asked for.
- **A Settings toggle, default on** (user decision). The feature was asked for, so it works without hunting; the switch exists because it trades a documented boundary and someone should be able to say no. Off is today's behaviour byte for byte — no seeding, no removal, nothing touched.
- **Seeding is gated on a per-service Facebook app id** (user decision, after a security review — see below). Without a recorded app id for a service, nothing is ever seeded.
- **Seeding asks for local user verification** (user decision, 2026-09-02). Touch ID — else a native confirm, the same fallback the passkey prompt uses — before the session is lent, every time. This is deliberately **not** a passkey and not WebAuthn: it is the local verification step, reused, asked before a credential crosses partitions. It exists because `FB_APP_IDS` closes only half the escalation (see below). Remembering the answer per service was rejected: the one service an XSS would target is precisely the one already approved.
- **The popup partition is not changed.** Running the dialog in a shared `persist:facebook` would keep Facebook cookies out of every service jar and would be strictly better isolation, but Chromium ties a browsing-context group to one StoragePartition, so `window.opener` would almost certainly come back null and `postMessage` completion would die — the exact path the live pass proved works. Rejected.

## Security review

The user asked what this leaks before approving. The findings below are part of the design, not commentary on it.

### What does not leak

Cookie values never leave the main process: the copy is session-to-session, so nothing crosses IPC, nothing reaches the shell renderer, and nothing is written to a Goetia-managed file — unlike `pins.json` and `passkeys.json`, this feature persists no secret of its own. No network egress is added. Attributes are copied verbatim, so Facebook's own defences are neither added to nor removed: `document.cookie` stays origin-scoped and tiktok.com JS cannot read them, CORS still blocks reading any authenticated facebook.com response, and whatever `SameSite` Facebook set still governs cross-site subresource requests. The `enableCookieEncryption` fuse means even SQLite free-page residue after deletion is ciphertext. Debug output logs counts, never names or values.

### The escalation that matters

`isIdentityPopup` matches on host and path prefix; the query string is unconstrained. A malicious or XSS'd service page can therefore call `window.open('https://www.facebook.com/v18.0/dialog/oauth?client_id=<attacker app>&…')`. Today that opens a login form and the attack needs the user's Facebook password. With a seeded jar it opens a genuine, already-signed-in consent dialog, and one click hands the attacker's app an access token.

The obvious containment does not work, and the 2026-08-31 findings are why: the SDK returns its result by `postMessage` through the `staticxx.facebook.com` arbiter to the opener page, so there is no navigation to an attacker-controlled host for the popup guard to refuse. Validating the dialog's `redirect_uri` against the service's own hosts fails for the same reason — the legitimate `redirect_uri` and `channel_url` are both the arbiter on `staticxx.facebook.com`, which an attacker can name just as easily.

Scoped fairly: an unreviewed Facebook app receives `public_profile` and `email`. That is identity disclosure and cross-service linkage, not account takeover, and it requires the service's own page to be serving hostile JS. But defending against exactly that is what the per-service partitions are for, so it is mitigated rather than accepted.

**Mitigation 1: `FB_APP_IDS`.** Seeding requires the dialog's `client_id`/`app_id` to match a value recorded for that service. An attacker's own app id does not match, seeding is skipped, and the user gets today's password-required form. The failure mode is safe and silent in both directions: an unrecorded service simply never seeds, and a service that rotates its app id degrades to a full login rather than to an open door.

**What `FB_APP_IDS` does not cover** (2026-09-02): a compromised or XSS'd service page can open the service's **own** real dialog — `dialog/oauth?client_id=421039428061656` on shopee.vn — which passes the gate by construction, then read the SDK's result off the `postMessage` to its own opener. The app-id table refuses a stranger's app, not the site's own app turned against the user.

**Mitigation 2: local user verification.** `seed` asks Touch ID (else a native confirm) before lending, every time, and copies nothing if declined. It is asked only after rules 5 and 6 pass, so a popup that would not be seeded never puts a prompt on screen. This is what makes the residual move visible and refusable — the credential cannot cross partitions while the user is not looking. Friction is bounded by rule 6: seeding happens only on the first Facebook login per service, a handful of prompts in the life of an install.

### Smaller findings, carried into the design

- **The contained window shares the jar.** `tiktok`'s `ALLOWED_HOSTS` names no facebook host, so a top-level navigation to facebook.com is refused and re-opened by `openContainedWindow` in the same `persist:<id>` — it would inherit a seeded session. That window is isolated, sandboxed and preload-free, but the hostile page picks the URL. Bounded by the same popup lifetime; noted so it is not rediscovered as a surprise.
- **A crash leaves the cookies behind.** Unseed-on-close never runs if the app dies with a popup open. Handled by the marker file below; this is a correctness requirement, not a nicety.
- **Identity linkage.** Seeding pushes the Messenger account into every service by default. Recoverable through Facebook's own "Log in to another account", and rule 6 below makes a deliberate second-account login stick.

### Where it improves on today

Signing into Facebook through TikTok's own popup, as the status quo requires, parks that Facebook session in `persist:tiktok` permanently. Seed-and-remove is strictly shorter residency for anyone who uses social login at all.

## Design

### 1. `src/main/lib/identity-share.ts` — pure

```ts
/** Facebook app id per service, captured from a live sign-in. A service with
 *  no entry is never seeded. */
export const FB_APP_IDS: Partial<Record<ServiceId, string>>;

/** The service whose own URL is a facebook host — the session source. */
export const IDENTITY_SOURCE: ServiceId;

/** `client_id` or `app_id` from a dialog URL, or null. */
export function facebookAppId(url: string): string | null;

/** https, host matches `.facebook.com`, path is a dialog entry prefix. */
export function isFacebookDialog(url: string): boolean;

/** A cookie domain belonging to the Facebook session (leading dot tolerated). */
export function isFacebookCookieDomain(domain: string): boolean;

/** Does this cookie set carry a signed-in Facebook session? (`c_user`) */
export function hasFacebookSession(cookies: Cookie[]): boolean;

/** Electron's `Cookie` → the `CookiesSetDetails` that reproduces it. */
export function cookieSetDetails(cookie: Cookie): CookiesSetDetails;

/** Rules 1–4: everything decidable without reading a cookie jar. */
export function maySeed(input: { enabled: boolean; target: ServiceId; popupUrl: string }): boolean;

/** All six rules. `shouldSeed === maySeed && sourceHasSession && !targetHasSession`. */
export function shouldSeed(input: {
  enabled: boolean;
  target: ServiceId;
  popupUrl: string;
  sourceHasSession: boolean;
  targetHasSession: boolean;
}): boolean;
```

The split is not cosmetic — see §3. `maySeed` is what decides whether the popup's load is interrupted at all, and it has to answer synchronously, before any `await`.

`IDENTITY_SOURCE` is derived from `SERVICES` rather than spelled `'messenger'`, with a test pinning the derivation — Messenger is the source because its URL is a facebook host, and that is the property worth encoding.

`cookieSetDetails` is the fiddly one. `cookies.get` returns a `Cookie`; `cookies.set` wants a reconstructed `url` plus a `domain` **only** for domain cookies (a leading dot on `Cookie.domain`). Passing `domain` for a host-only cookie widens it; omitting it for a domain cookie narrows it. Either mistake silently drops the session, which is why this gets the heaviest unit test in the feature.

### 2. `src/main/identity-share.ts` — I/O

An `IdentityShare` unit owning the session reads and writes, the marker file and the grace timers. `views.ts` stays thin wiring, per the process boundaries.

- `seed(target)` — read `.facebook.com` cookies from `persist:<IDENTITY_SOURCE>`, write the marker, write them into `persist:<target>`. Returns whether anything was seeded.
- `unseed(target)` — remove Facebook cookies from `persist:<target>`, clear the marker.
- `sweepStale()` — at startup, unseed every service named in the marker file.

**The whole cookie set moves**, not a hand-picked `c_user`/`xs` pair. `datr` and `sb` are Facebook's browser-fingerprint cookies, and a known session arriving with an unknown fingerprint is precisely what triggers a new-device checkpoint — which would defeat the feature while looking like a bug.

### 3. Seeding the popup — `did-create-window` in `views.ts`

Timing is the hard part. `setWindowOpenHandler` is synchronous and the child begins fetching `dialog/oauth` immediately, but every Electron cookie API is async, so there is no window in which to seed before the first request leaves. In the `isIdentityPopup` branch of `did-create-window`:

```ts
// rules 1–4, synchronously: an unqualified popup is never interrupted
if (!this.identityShare.maySeed(id, url)) return;
child.webContents.stop();
await this.identityShare.seed(id); // rules 5–6, then the copy
if (child.isDestroyed()) return;
child.webContents.loadURL(url, { httpReferrer: wc.getURL() });
```

Stop, seed, re-navigate is deterministic — there is no race to lose — and re-navigating the same `WebContents` keeps `window.opener` intact, because opener is a property of the browsing context and not of the document.

The sync gate is load-bearing. Once `stop()` has run, the popup is blank until something re-navigates it, so the decision to interrupt must be made before the first `await` — which is why rules 1–4 are separated out and why the `loadURL` is unconditional after the stop. A popup that fails the sync gate (toggle off, no recorded app id, Messenger itself, not a Facebook dialog) is never touched and keeps today's code path exactly. A popup that passes the sync gate but fails rules 5 or 6 is still re-navigated to the same URL, unseeded — a wasted round trip in a rare case, which is the right trade against a blank sign-in window.

**Known risk, for the live pass.** The replayed load is browser-initiated, so `Sec-Fetch-Site` changes from `cross-site` to `none`. `httpReferrer` restores the `Referer`, and Facebook's dialog validates `app_id` and `redirect_uri` rather than fetch metadata, so it is expected to pass — but that is reasoning, not evidence. **Plan B if it fails:** inject the `Cookie` header for facebook hosts on the popup's `webContentsId` through the `onBeforeSendHeaders` hook already installed in `configureSession` for client hints. No jar write and no re-navigation, at the cost of a pure `cookieHeader()` builder that has to match Chromium's own serialisation exactly.

### 4. Guard rules

`shouldSeed` returns true only when all six hold:

1. `shareFacebookLogin` is on.
2. The popup URL is a Facebook dialog (`isFacebookDialog`).
3. Its `client_id`/`app_id` matches `FB_APP_IDS[target]`.
4. `target !== IDENTITY_SOURCE` — Messenger is never seeded from itself.
5. The source jar has a live session (`hasFacebookSession`).
6. The target jar has none.

Rule 6 carries more weight than its size suggests. It leaves Instagram's own Log-in-with-Facebook cookies untouched — `instagram` already lists `www.facebook.com` in `ALLOWED_HOSTS`, so its jar legitimately holds them — and it makes a deliberate second-account login in any service jar permanently sticky rather than clobbered on the next popup.

### 5. Lifetime and crash recovery

Unseed fires on the popup's `closed` event plus `IDENTITY_SEED_GRACE_MS`: the opener page may still be finishing its arbiter round-trip when the popup vanishes, and pulling the cookies out from under it would break the completion this feature exists to smooth. The value is **10s**, chosen for this feature rather than borrowed — the round trip is sub-second, and the constant is sized to survive a slow one, not to keep a surface alive. (`BANNER_GRACE_MS` is 120s and answers a different question: how long a peek view outlives its banner. Do not copy it here.)

Unseed also runs unconditionally on view destroy, on purge and on quit, and every path cancels any pending grace timer first — purge in particular closes the identity windows and then wipes the partition, so a timer that survived would fire against an already-empty jar and, worse, leave the marker file naming a service that no longer needs sweeping. The timer is cleared on `destroy()` and on quit, and the deferred callback is guarded against a destroyed view, per the reliability rules.

Crash recovery is a durable marker: `identity-seeds.json` in userData, holding `{ seeded: ServiceId[] }` and never a cookie value. It is written and awaited **before** the first `cookies.set`, cleared after unseeding, and swept at startup. A blanket "strip Facebook cookies from every service jar at boot" would be less code but would destroy exactly the deliberate second-account logins rule 6 protects.

### 6. Settings

`shareFacebookLogin: boolean` joins `Settings` and `DEFAULT_SETTINGS` in `shared/types.ts`, defaulting to `true`. The control is a `Row` in the Services pane of `SettingsView.tsx`, beside Light Sleep — it is about how services sign in, and composition stays on Home. Turning it off changes nothing already seeded; the next popup close cleans up as usual.

### 7. What is untouched

`ALLOWED_HOSTS`, `IDENTITY_PROVIDERS`, `ROAMING_HOSTS`, `permissionAllowed`, the identity popup's isolated + sandboxed + no-preload hardening, the client-hint injection, the passkey authenticator, `chatPaths` and `loginUrl`. No new IPC channel: seeding is a main-process reaction to a window event, and the renderer only ever writes the settings flag through the existing `settings:update`.

## Testing

`tests/unit/identity-share.test.ts`, against fake cookie values only — no test asserts on a real credential:

- `shouldSeed` across the truth table: each of the six conditions false in turn, and all six true.
- `maySeed` is exactly rules 1–4: it stays true when the source is logged out or the target already has a session, so a popup that will not be seeded is still re-navigated rather than left blank (§3).
- `facebookAppId` reads `client_id` and `app_id`, on versioned and unversioned dialog paths, and returns null for junk and for a dialog with neither.
- `isFacebookDialog` rejects lookalikes (`evilfacebook.com`, `facebook.com.evil.example`, `notfacebook.com`) and non-https, matching the suffix behaviour pinned in `navigation-policy.test.ts`.
- `isFacebookCookieDomain` accepts `.facebook.com`, `facebook.com` and `www.facebook.com`; rejects `notfacebook.com` and `facebook.com.evil.example`.
- `cookieSetDetails` round-trips `secure`, `httpOnly`, `sameSite`, `expirationDate` and `path`; builds an `https:` url for a secure cookie; sets `domain` for a domain cookie and omits it for a host-only one.
- `hasFacebookSession` keys on `c_user` and ignores `datr`-only jars.
- `IDENTITY_SOURCE` derives to `messenger` — the assertion is on the derived value, so removing or repointing Messenger's URL fails the test rather than silently changing the source.

Wiring — the `did-create-window` branch, the grace timer, the marker sweep — stays thin and is not unit-tested; an OAuth popup cannot be driven against a live Facebook.

## Live pass

The feature is inert until step 1, and cannot be called done without the rest. Findings get recorded in this document, as they were for `2026-08-31-social-login-design.md`.

1. Capture TikTok's and Shopee's Facebook `app_id` under `GOETIA_DEBUG_CALLS=1` and enter them in `FB_APP_IDS`. Until then nothing seeds.
2. With Messenger signed in and the toggle on, TikTok → Continue with Facebook reaches the consent screen ("Continue as …"), not `login.php`, and asks for no 2FA.
3. The `stop → loadURL` replay does not trip the `Sec-Fetch-Site` change — the dialog renders and no Facebook error page appears. If it does, switch to plan B in §3.
4. The popup completes, closes itself, and TikTok lands on `/messages`.
5. After the popup closes plus the grace, `persist:tiktok` holds no facebook.com cookies (DevTools → Application → Cookies on the view).
6. Repeat 2–5 for Shopee.
7. Toggle off: TikTok → Continue with Facebook renders `login.php` again and nothing is seeded.
8. Kill the app with a popup open, relaunch, and confirm the startup sweep left the jar clean.

### Findings

- **2026-09-02, step 1 complete.** A dev run (`GOETIA_DEBUG_CALLS=1`, dev and packaged share `~/Library/Application Support/Goetia`, so the real jars are in play) captured both app ids from the `window.open from <id>:` lines: **shopee `421039428061656`** (`v23.0/dialog/oauth`) and **tiktok `1862952583919182`** (`v18.0/dialog/oauth`). Both carry `client_id` identical to `app_id`, both strip cleanly through the version regex, and both logged `-> ALLOW identity`. `FB_APP_IDS` is now populated and the captured URLs are pinned in `identity-share.test.ts`, including the cross-wired cases that must fail.
- **The same run confirmed the inert state was real, not a bug.** No `identity popup replay on …` line appeared, so `maySeed` refused every popup — correct with an empty table. What looked like the feature working on TikTok and failing on Shopee was entirely pre-existing jar state: `persist:tiktok` still held the Facebook cookies from the 2026-08-31 end-to-end login, so `login.php` rendered as the last-login chooser; `persist:shopee` had none, so it rendered the full form. Purging TikTok emptied its jar and both then behaved identically. A useful reminder that `login.php` in the log says nothing about which of the two screens the user saw.
- **2026-09-02, steps 2-4, 6, 7 and 9 pass — Shopee and TikTok both complete.** Four popups, all `seeded=true`, zero guard refusals (`popup contained`/`popup denied` = 0). Every popup navigation stayed on `www.facebook.com` — 20 events, one host, no roaming. Decisively, **`login.php` never appears**: the path sequence is `dialog/oauth` → `privacy/consent` → `dialog/consent/complete/?is_success_response=1`, so the seeded session was accepted and the user was never asked to authenticate. Copying the whole cookie set (including the `datr`/`sb` fingerprint pair) was necessary and sufficient — no new-device checkpoint fired. Purge and re-login also work.
- **The §3 `Sec-Fetch-Site` risk is closed.** The `stop → seed → loadURL` replay with `httpReferrer` is accepted by Facebook's dialog; plan B (header injection) is not needed and stays unbuilt.
- **No credential material reaches the debug log.** A sweep for `access_token`, `signed_request`, `c_user`, `xs`, `fr` and `datr` values found nothing — the SDK returns its result by `postMessage`, never in a URL. The completion URL does carry Facebook's `encrypted_query_string` (~2.5 KB, opaque ciphertext to anyone but Facebook), logged in full by the pre-existing `debugCalls` on popup navigations. Not a credential, but the log lands world-readable in `/tmp`: treat a `GOETIA_DEBUG_CALLS` log as sensitive and delete it after a pass.
- **Defect found and fixed: `unseed` could strand a session silently.** It unmarked unconditionally, and Chromium's `cookies.remove` reports a url matching nothing by doing nothing — no throw. A wrong `removalUrl` would therefore leave a live Facebook session in a service jar *and* clear the marker that is the only way the next boot's sweep could catch it, defeating the "present only while the popup is open" promise without a trace. `unseed` now re-reads the jar and unmarks only when it is verifiably clean, keeping the marker and logging `[identity] … survived removal` otherwise. Three regression tests cover it (silent no-op removal, throwing removal, and the warning), each verified to fail against the old code. `seed`/`unseed` now log cookie **counts** under `GOETIA_DEBUG_CALLS` — without them the live pass cannot observe the security-critical half of the feature at all.
- **What the 2026-09-02 log could not prove.** The marker file ended `{"seeded": []}` and the second round of seeds returned `seeded=true` (so rule 6 saw clean jars), but a purge also happened in that session, so the log alone cannot separate "unseed removed the cookies" from "purge wiped them". The new `unseeded N cookie(s)` line settles it on the next run.
- Minor, not fixed: `unseed` removes every facebook.com cookie in the target jar, including a pre-existing non-credential `datr` that was never seeded. Worst case Facebook treats the next direct login there as a new browser. Snapshot-and-restore would fix it and is not worth the complexity.
- Still to exercise: step 8, the crash path (`kill -9` with a popup open, then confirm the boot sweep).

## Out of scope

Providers other than Facebook; harvesting a popup-completed session back to any jar; a dedicated identity vault partition; sharing anything other than cookies (localStorage, IndexedDB); per-service Facebook account selection inside Goetia; any change to the popup's partition or hardening.
