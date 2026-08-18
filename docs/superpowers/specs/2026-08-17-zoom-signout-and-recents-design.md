# v0.9 — per-service zoom, sign-out, and quick-switcher recents

Date: 2026-08-17. Status: accepted. Product brainstorm outcome for the release after banner-to-conversation: three daily-convenience items chosen for a small-circle user base, shipped together as v0.9 (~6 dev-days). Cross-service share ("Share to ▸" in the context menu) was designed, then dropped by user decision — v0.8's Copy Image plus a service switch and paste already serves the job, so the submenu adds surface without enough delta. Spellcheck was found already shipped in v0.8 (session languages `en-US` + `vi`, suggestions in the context menu), shrinking the original scope.

## Problem

Three gaps a daily user feels:

- **Text size is fixed.** No zoom exists anywhere; a dense Slack and a sparse WhatsApp render at whatever the site chose, and the app menu has no View section at all.
- **There is no way out of a broken or shared login.** Chat-only CSS hides exactly the site chrome (account menus) where in-app logout buttons live, and a wedged session — corrupted storage, infinite loading — can make the page's own logout unreachable anyway. Nothing in Goetia can reset a service's login.
- **Badges say how many, never who.** After quiet hours or a muted stretch, the only way to find who pinged you is scanning ten badges and opening services one by one. The banner stream already knows the answer — service, conversation title, even a validated deep link for synthetic banners — but it evaporates the moment the banner closes.

## Decision

### 1. Per-service zoom

A new **View** menu in the app menu: Zoom In (`⌘/Ctrl +`), Zoom Out (`⌘/Ctrl −`), Actual Size (`⌘/Ctrl 0`). The items act on the **active service's view** via `setZoomLevel`, in steps of 0.5 on Chromium's `1.2^level` scale, clamped to `[-3.5, 3.5]` (≈53%–189%), reset 0. When no service view exists (Home on a fresh install), the handlers no-op. No toast and no indicator: text visibly changing is the feedback. Step/clamp/reset live in `src/main/lib/zoom-rules.ts`; `menu.ts` and `views.ts` stay wiring. No IPC — the menu is main-side.

The level persists per service as `zoom: Record<ServiceId, number>` in settings (default 0), reconciled by `normalize` like every other per-service record (missing or non-finite values coerce to 0, out-of-range values clamp). It is applied when a view is created and re-asserted on `did-finish-load`, so restarts, hibernation wake-ups, reloads, and sign-outs all keep the chosen size.

**Home's shortcut moves.** `⌘/Ctrl+0` currently opens Home and zoom convention rightfully claims it for Actual Size (user decision 2026-08-17). Home moves to `⌘/Ctrl+Shift+H` — Safari's own Home shortcut, so the mnemonic is established; plain `⌘H` is macOS system-wide Hide and untouchable. The Go-menu accelerator, README, and CLAUDE.md's product-principle line all update together.

### 2. Sign out

Right-clicking a rail tile today toggles mute directly; v0.9 turns that right-click into a native menu built in main — **Mute/Unmute** plus **Sign Out…** — matching the approved mockup (correction 2026-08-17: the spec originally assumed a tile menu already existed). Sign-out is destructive-rare, so it confirms once via a native `dialog.showMessageBox` — "Sign out of Telegram? This clears its login on this device. An active Telegram call would end." — with Cancel as the default button. On confirm, main clears the service's `persist:<id>` partition storage and, if a view exists, refreshes it back to the chat URL (`views.refresh`), which lands on the login page; a hibernated or disabled service just gets its storage cleared. The login-page `count()` reports zero on its own — no badge bookkeeping needed.

What this is and is not: a **local** wipe. The server never gets a goodbye, so the old session lingers in the service's linked-devices list until it expires or is revoked from another device — the dialog's "on this device" phrasing is deliberate, and the README says the same in one line. Goetia-side prefs (mute, zoom, order) and the per-session custom spellcheck dictionary survive; only site data goes.

Sign-out itself needs no IPC channel: the menu is built, confirmed, and acted on entirely in main. The one new channel is `service:tileMenu`, classified in `SHELL_ONLY_CHANNELS` — only the shell frame (the rail) may pop it, so a service frame can never mute or sign out a rival — and its `serviceId` resolves against `SERVICES` before any partition is touched.

### 3. Activity log + ⌘K recents

**Data layer (main).** Every `notification:fired` that passes `NotificationThrottle` is appended to an in-memory ring buffer of the last 50 entries — including banners that mute or quiet hours silenced, which is the whole catch-up story. An entry stores `serviceId`, `title`, the validated `href` when the banner was synthetic, a `silenced` flag (the `shouldNotify` outcome at fire time), and a timestamp. **No message bodies, ever, and nothing touches disk**: titles stay in main-process memory and clear on quit — a deliberate privacy stance, since `settings.json` is plaintext. Append/cap/dedupe logic is pure in `src/main/lib/activity-log.ts`; dedupe happens at read time per conversation key (`href`, falling back to `serviceId`+`title`), newest entry wins.

**Surface (quick switcher).** ⌘K gains a **Recent** section above the services list: up to 8 deduped conversations, newest first, each row showing the service icon, conversation title, relative time, and a 🌙 on silenced rows. With an empty query the cursor starts on the newest recent, so ⌘K‑Enter jumps to whoever pinged you last. Typing fuzzy-filters recents titles and service names together; the section hides entirely when it has nothing (no placeholder noise). The switcher fetches the list once each time it opens via a new invoke channel `activity:recent` — **no per-banner broadcast exists**, keeping the report-on-change guardrail intact.

**Opening a row.** The renderer sends `activity:open` with an **opaque entry id** — display fields cross IPC, hrefs never do. Main re-derives the route from the stored entry with the same decision the banner click uses (`resolveBannerClick` semantics): a synthetic entry with a validated href deep-routes (live view routes in-page, dead view gets the href as its wake load); every other entry — shim banners whose replay target has expired with its view, or entries with no href — falls back to plain service activation. Both new channels are `SHELL_ONLY_CHANNELS`.

**Honest limits, stated in the UI's favor:** only conversations that produced a banner appear (silent threads don't); old rows may open just the service rather than the exact chat; the list resets on restart. The full alternative — recipes scanning conversation lists per tick — was rejected for permanent steady-state cost.

## Performance

Nothing here adds per-tick work to the ~2s recipe loop. Zoom is a compositor setting persisted on user action; sign-out is a one-shot user action; the activity log moves only when a banner fires (already throttled) and costs ~50 small strings of memory; the switcher costs one IPC invoke per open. Steady-state impact of the release: zero.

## Security notes

Three new channels, all shell-only: `service:tileMenu`, `activity:recent`, `activity:open`. Each carries or resolves a `serviceId` that is validated against `SERVICES` before acting. Conversation hrefs never leave main: the renderer sees titles and opaque ids, and every deep-route re-validates against service origin + `chatPaths` at click time, exactly as banner clicks do. Sign-out can only ever clear the partition of a validated service id. Zoom adds no IPC at all.

## Testing

- `zoom-rules.test.ts` — step, clamp at both ends, reset, defaults.
- `settings.test.ts` — `zoom` record round-trip, corrupt coercion to 0, new-service reconciliation.
- `activity-log.test.ts` — cap at 50, read-time dedupe (href key, fallback key, newest wins), silenced flag preserved.
- Silenced-banner logging is pinned by `activity-log.test.ts` (the silenced flag survives dedupe) plus the manual matrix; the router itself stays un-unit-tested (Electron `Notification`-bound), as today.
- `ipc-sender-policy.test.ts` — the three new channels reject service-frame senders.
- Switcher merge/filter — pure function unit tests (recents + services, cursor spans both, cap 8).
- e2e — existing smoke must stay green; switcher assertions extend if a banner can be synthesized in-test, otherwise manual.
- Manual: zoom persists per service across restart and hibernation wake; live sign-out on each of the 10 services; recents after a simulated quiet-hours window (🌙 rows present, Enter lands in the conversation); `⌘⇧H` opens Home; `⌘0` resets zoom.
- Definition of done: `corepack pnpm lint`, `typecheck`, `test`, `e2e` all green.

## Documentation

README: the shortcuts list gains View-menu zoom and Home's new `⌘/Ctrl+Shift+H`; "Handy to know" gains one bullet each for sign-out (with the "on this device" caveat) and ⌘K recents (with the 🌙 meaning). CLAUDE.md: the product-principle line naming `⌘/Ctrl 0` updates to the new Home shortcut, and the Notifications section gains one invariant — the activity log is in-memory only, titles never persist to disk, and recents are fetched on switcher open, never broadcast per banner.
