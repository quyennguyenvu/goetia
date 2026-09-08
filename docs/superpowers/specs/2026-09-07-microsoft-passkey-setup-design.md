# Passkey setup page and the passkey-first dead end

**Date:** 2026-09-07 · **Status:** REJECTED after a live pass (2026-09-08, user decision) — only the Part 1 wording shipped; see Findings · **Builds on:** `2026-08-30-goetia-passkeys-design.md`

## Findings (2026-09-08 live pass)

Built to the plan and driven on the personal account. It worked: Settings → Passkeys → Set up… closed Settings, the cover read "Opening Microsoft Teams sign-in settings…", and Microsoft's account page rendered inside the Teams view with the sign-in methods list ("Text a code", "Use a passkey · Apple iCloud Keychain", "Add another way to sign in to your account"). No `[nav] contained:` line; `.live.com` covered the whole trip.

Rejected on principle at that screen: the user was now operating Microsoft's account-settings site inside a chat app, several clicks from a passkey, for a sign-in they do only occasionally. "It would be one step; it makes me go to the website and perform actions which are not only chat." The whole of Part 2 (setup URL, load kinds, channel, parked views, Settings rows, e2e) was removed before commit; Part 1's notice wording stayed, without the Settings pointer. Microsoft sign-ins remain Back → Other ways to sign in → password. Do not revive this as a Settings entry, a notice button, or a recipe hook; if Microsoft ever offers creation on its sign-in page again, the existing shim handles it with no Goetia change.

## Problem

Goetia's software authenticator can only mint a passkey when a site calls `navigator.credentials.create` inside a service view. Microsoft never does that for an account that already holds a passkey elsewhere: its post-sign-in "sign in faster with a passkey" offer is skipped, and the only place to add one is the account security page. Meanwhile the shim advertises a platform authenticator to every page, so Microsoft's sign-in goes passkey-first, Goetia finds nothing for `login.microsoft.com`, and the user lands on Microsoft's "Face, fingerprint, PIN, or security key" page with Back and a disabled Try again. The notice Goetia shows there ("Sign in with your password") names a path the page does not offer. Reported 2026-09-06 on a personal Microsoft account (`teams.live.com`, sign-in via `login.live.com`); `passkeys.json` was empty.

Two decisions taken in the brainstorm (2026-09-07):

- Keep advertising the authenticator everywhere. Answering "no authenticator" per site would send Microsoft straight to the password, but nearly every site gates its "create a passkey?" offer on the same check, so organic creation would stop for all nine services. Wording is the fix for the dead end.
- Give Microsoft a creation path: a Settings → Passkeys entry that loads Microsoft's own "Add a new way to sign in" page into the Teams view, where the shim can answer the creation ceremony, and returns to chat once the passkey exists. Personal accounts only for now.

## Non-goals

- Work and school accounts. Their page is `mysignins.microsoft.com`, not an allowed Teams host, and nobody has driven it live. A guessed host is how the unseen Teams selectors happened.
- Any shell banner while the view is parked on the setup page. Service views cover the shell; a banner would need the view resized. The cover captions carry the message.
- Passkey autofill (conditional mediation), the broader "land on a login page, Touch ID, you are in" flow. A separate design if wanted; it stacks on this one, since Microsoft still needs a passkey minted first.
- Per-site honesty in `isUserVerifyingPlatformAuthenticatorAvailable`. Rejected above.

## The chat-only exception

For the first time Goetia deliberately loads a service view onto a non-chat page. It is justified because the page manages the credential for the chat itself, it is reached only by a click in Settings, and the view comes back to the chat URL on its own (or by the existing reload rule). It is bounded: one URL per service, declared in code, never from a payload.

## Part 1: the dead end (wording)

- `noPasskey(rpId, canSetUp)` in `src/main/passkeys/prompt.ts`: message stays `No Goetia passkey for <rpId> on this <device> yet.`; detail becomes `Press Back, choose Other ways to sign in, and use your password. If the site offers to create a passkey, accept it.`, with a second sentence, `Or set one up from Settings → Passkeys.`, appended only when `canSetUp` is true. `doGet` passes `serviceById(serviceId).passkeySetupUrl !== undefined`, so Discord's notice never points at a row that does not exist.
- README "If something looks off" bullet and the CLAUDE.md passkeys paragraph say the same, and name the Settings row.
- `PasskeysPane` empty state gains the pointer to the section below it.

## Part 2: the setup page

### Data

- `ServiceMeta.passkeySetupUrl?: string` in `shared/services.ts`. Teams: `https://account.live.com/proofs/manage/additional`. `recipes.test.ts` asserts every declared URL is `https:` and passes `isNavigationAllowed` for its own service, so the load can never be one containment would have refused.
- `LoadKind` (`shared/types.ts`) gains `'setup'` and `'setup-return'`. `shared/wake-caption.ts`: `setup` → `Opening <Service> sign-in settings…`, `setup-return` → `Passkey saved · returning to <Service>…`.
- `shared/ipc.ts`: `passkeys:setup` with payload `{ serviceId }`, in `SHELL_ONLY_CHANNELS`. No URL crosses IPC; main looks it up in `SERVICES`.

### Pure rules (`src/main/lib/passkey-setup-rules.ts`, vitest)

- `setupTargets(services, disabled)` → the services declaring `passkeySetupUrl` whose `disabled` flag is false, in `SERVICES` order. Banished services are not listed, matching Settings → Services.
- `endsWake(event, meta, kind)` in `lib/waking-rules.ts`: `load-finished` ends a `setup` wake regardless of `waitForReady`, since Teams' `ready()` looks for the chat tree and it never mounts on the security page. `setup-return` lands on chat, where `ready()` is the honest signal again, so it keeps the normal rule. Every other rule unchanged. `WakingTracker.end` passes `runtime.wakeKind`.
- `SETUP_RETURN_DELAY_MS = 1500`: how long Microsoft's confirmation stays on screen after the mint before the return load.

### Main wiring

- `ServiceViewManager.openPasskeySetup(id)`: `ensure(id)`, then `load(id, wc, 'setup', url)`, and `setupParked.add(id)`. `load()` deletes the mark for any other kind (a reload, a purge, a restart all end the parking); destroy deletes it too.
- `ServiceViewManager.returnFromSetup(id)`: no-op unless parked; else `load(id, wc, 'setup-return', serviceById(id).url)`, which also clears the mark. Unguarded by `reloadAllowed`: this is main's load, not a user reload.
- `PasskeyAuthenticator` gets an `onCreated(serviceId)` dep beside `log`, called right after the store add. `index.ts` wires it: if `views.isSetupParked(id)`, start a `SETUP_RETURN_DELAY_MS` timer that calls `returnFromSetup(id)` guarded by `!wc.isDestroyed()`; one timer per service, cleared on destroy and on quit.
- `passkeys:setup` handler (`ipc-handlers.ts`, via `register()`): validate `serviceId` is a known, enabled service with a setup URL (else ignore); `views.openPasskeySetup(id)`; `activateService(ctx, id)` with the view hidden; close Settings through `setOverlayOpen(false)` so `presentSurface` shows the view. Startup and overlay rules unchanged: no code path shows a view while a surface is open.
- Containment while parked: Teams' `chatPaths` never matched `/v2/` on `teams.live.com`, and a main-issued cross-document load resets the runner's in-chat memory, so no snap-back fights the page. Off-chat link interception runs only while in chat, so Microsoft's own links keep working. Nothing new opens in the OS browser.
- Security summary: shell-only channel carrying an id; URL from code; host already in `ALLOWED_HOSTS`; the passkey store is keyed by rpId and the authenticator validates rpId against the frame origin main reads itself, so which view hosts the ceremony changes nothing about what is minted. `createdIn` records `teams`, as an organic creation would.

### Renderer (`PasskeysPane.tsx`)

Below the passkey list (and below the empty state), when `setupTargets` is non-empty: a `Set up a passkey` label, one hint line (`Some sites never offer one after sign-in. Goetia opens the site's own security page inside its view; accept the passkey there and Goetia brings you back to chat.`), and one row per target: service icon and name, a `personal account` sub-label for Teams, and a `Set up…` button (`data-testid="passkey-setup-<id>"`) that sends `passkeys:setup`. The rows come from `state.services` and the settings already in the store; no new fetch.

### Behaviour, end to end

1. Settings → Passkeys → `Set up…` on Microsoft Teams. Settings closes; the Teams view (created hidden if asleep) loads the security page under `Opening Microsoft Teams sign-in settings…`. The cover ends on load-finished.
2. Microsoft's flow, unchanged: sign in if asked, `Add a new way to sign in or verify` → `Face, fingerprint, PIN, or security key`. The page calls `create`; the existing Touch ID prompt confirms; Goetia mints and logs `[passkey] created rp=login.microsoft.com via=teams`.
3. About 1.5 s later the view reloads to the chat URL under `Passkey saved · returning to Microsoft Teams…`.
4. Next Microsoft sign-in: the passkey-first page now finds Goetia's passkey; Touch ID; signed in.

Edges: cancelling Touch ID or leaving the page mints nothing and no return fires, ⌘R returns to chat and clears the mark; store at cap hits the existing cap notice; Teams banished means no row; a second click while parked reloads the setup page (a fresh `setup` load, still parked).

## Testing

- Unit: `passkey-setup-rules.test.ts` (targets exclude disabled services and services without a URL; order); `waking-rules.test.ts` (load-finished ends `setup` and `setup-return` for a `waitForReady` service, still not `wake`); `wake-caption.test.ts` (the two captions); `recipes.test.ts` (declared setup URLs are https and allowed for their service); `passkey-authenticator.test.ts` (`onCreated` fires once per mint with the service id, not on a refused or superseded ceremony); `ipc` sender test for `passkeys:setup` being shell-only; `PasskeysPane` render test for the section and its click.
- e2e (`passkeys.spec.ts`): with Teams enabled and `GOETIA_WEBAUTHN_PROMPT=accept`, click `passkey-setup-teams`, assert Settings closed, the Teams view's URL is on a `.live.com` host (with no session Microsoft bounces the security page to `login.live.com`, which is fine: same allowlist, same shim), and the runtime `wakeKind` was `setup`; then drive `navigator.credentials.create` via `executeJavaScript` on whatever page is showing and assert the view lands back on the Teams chat URL within the delay plus load time. The live page's markup is not asserted, only the URL and the return.
- Live: one real pass on the personal account, recorded here as findings, including whether `account.live.com` redirects anywhere outside `.live.com` on the way (a `[nav] contained:` line would mean the allowlist needs a host).

## Definition of done

`corepack pnpm lint`, `typecheck`, `test`, and `e2e` green; the live pass above; README, CLAUDE.md (passkeys paragraph, wake-caption sentence, the chat-only principle's new exception) updated.
