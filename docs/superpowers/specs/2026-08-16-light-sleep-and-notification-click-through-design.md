# Light Sleep and notification click-through — design

Date: 2026-08-16. Status: approved for planning.

## Goal

Make Goetia the client people leave running all day. The two triggers that push users back to native apps are its resident weight (nine live renderers, or blind hibernation) and small workflow gaps. This release ships one headline feature and one companion that the headline makes necessary.

Competitive context (researched 2026-08-16): Ferdium's hibernation logs services out on wake; Franz and Rambox hibernation goes blind; Beeper's protocol bridging breaks when platforms change. No aggregator offers hibernation that preserves both session and awareness. Goetia already preserves sessions (`persist:<id>` partitions); this design adds awareness.

## Feature 1 — Light Sleep (peek-while-hibernated)

Today `HibernationController.sweep()` destroys an idle service's view, and the service goes blind until the user activates it: the badge freezes and no notifications fire. `neverHibernate` is the only escape, at the cost of a permanently resident renderer.

### Behavior

A hibernated service is periodically peeked: its view is recreated hidden, the recipe reports the current unread count through the existing runner → `unread:update` → `setRuntime` path, any banner the page fires flows through the existing throttled `NotificationRouter`, and then the view is destroyed again. Between peeks the badge shows the last-known count — at most one peek interval stale instead of frozen forever.

### Scheduling

- Pure decision logic lives in `lib/peek-rules.ts` with vitest unit tests; `HibernationController` absorbs the peek cycle (same sweep, same idle bookkeeping, no cross-controller races) and stays thin wiring.
- `PEEK_INTERVAL_MS` = 10 minutes per service, measured from the end of its last peek — and a hibernation teardown counts as a peek end, since the count is fresh at the moment of destruction. Constant, not a setting (YAGNI); the controller reads env overrides (`GOETIA_SWEEP_MS`, `GOETIA_PEEK_INTERVAL_MS`, `GOETIA_PEEK_TIMEOUT_MS`) so e2e can compress time.
- At most one service peeks at a time. When a peek ends, the controller immediately looks for the next due service, so boot warm-up walks the sleeping roster sequentially instead of waiting a sweep per service; the first sweep runs shortly after startup (~5 s) so badges populate without waiting the first 60 s interval.
- Eligible: enabled, Light Sleep on, not `neverHibernate`, and **no live view** — this covers both a view destroyed by hibernation and a service never created since boot, and it naturally excludes the active service and any service whose live view is already reporting. A service never peeked before (or whose view was just torn down past its interval) is due immediately.
- Muted services still peek — mute means silence, never blindness, and `aggregateBadges` stays ignorant of mute. Quiet hours do not pause peeks — quiet silences banners via the existing `shouldNotify`/`audioMuted` pair; badges keep counting.

### Peek lifecycle

1. Start: `views.ensure(id)` — the same hidden-creation path never-hibernate services use at boot. The view is never shown; the overlay invariant (`anyOverlayOpen()`) holds trivially because a peek never calls `activate`.
2. A peek never touches the runtime `hibernated` flag mid-flight (`unread:update` does not write it, so the rail never flickers), and its teardown sets `hibernated: true` exactly like the hibernation sweep's — so a boot-peeked service's tile shows as sleeping, which it is. Only real user activation (`activate.ts`) clears the flag.
3. End on the first `unread:update` or `unread:stale` from that service — detected via a new late-bound `ctx.noteUnreadReport(id)` hook called from those two IPC handlers, mirroring `noteActivated`, because `MainState.setRuntime` deliberately no-ops on an unchanged count and cannot be the signal — or on `PEEK_TIMEOUT_MS` = 90 seconds for slow loaders. Either way the view is destroyed (`views.destroy` + `waking.end(id, 'destroyed')`), mirroring today's hibernation teardown.
4. Cancel: if the user activates the service mid-peek (`noteActivated`), the peek's teardown is cancelled and the view stays — it is already the wake they wanted; the normal activation path clears `hibernated` and resets the idle clock. The hibernate step of the sweep skips the currently-peeking service, so the idle clock can never tear down a peek in flight.
5. A peek view that crashes is destroyed at the timeout like any other peek; the peek timeout fires unconditionally unless the service became active. All peek and sweep timers are cleared in a new `dispose()` called from `before-quit`, and the teardown tolerates a view already destroyed (service disabled mid-peek).

### Settings and defaults

One new toggle: Light Sleep on/off (`lightSleep`), default on. Sleep onset keeps using the existing `hibernationMinutes`. Off restores today's behavior exactly (hibernate and go blind).

`neverHibernate` flips its default from all-`true` to all-`false`. The old default existed precisely because hibernation was blind — every service was kept permanently resident so badges would work (the boot `ensure` loop). With Light Sleep, sleeping is safe, so sleeping becomes the norm and Keep Awake becomes the per-service opt-out it was always meant to be. Consequences: fresh installs (and existing installs that never touched a Keep Awake toggle, since `conf` only persists written keys) get the low-RAM behavior on upgrade; installs that did write `neverHibernate` keep their choices; new services added to the catalog fill as `false` (flip the `settings.test.ts` fill assertions). The boot `ensure` loop in `index.ts` is unchanged — it now ensures only genuinely kept-awake services, and boot warm-up peeks populate everyone else's badges.

### Badge display

Last-known count, no new styling. The grey stale dot stays reserved for recipe breakage (`unread:stale`), not for sleep.

## Feature 2 — Notification click-through (correction: mostly shipped)

Planning-time code reading corrected the brainstorm's premise: a banner click already calls `win.show()` **and** `activateService(ctx, serviceId)` (`notifications.ts`), which wakes and focuses the originating service through the single activation entry point. The feature exists.

What remains is one gap from this spec's edge-case list: a banner clicked after its service was disabled (a stale banner sitting in Notification Center) calls `activateService` on a disabled service — no rail tile, no view, an unrestorable active id. Guard the click handler: activate only when the service is still enabled; otherwise just show the window. One line, main-process only, verified manually (native banners are not reachable from the e2e harness).

## Edge cases

- Service disabled mid-peek: the existing `settings:update` disable branch already destroys the view and resets runtime; the peek's cancel path must tolerate the view being gone.
- Window closed to tray: peeks continue (the app is alive); `broadcast()` is already guarded by `win.isDestroyed()`.
- Banner clicked after its service was disabled: the click handler checks `disabled` before activating and falls back to showing the window only (Feature 2).
- Login expired during sleep: the peek loads the login page, the recipe reports zero or goes stale, and the peek ends normally; nothing snaps or navigates (login pages never reach a chat path).

## Testing

- Unit: `peek-rules` scheduling table — due/not-due, one at a time, eligibility (disabled, never-hibernate, live view, never-peeked), rail-order stagger.
- Unit: `settings.test.ts` fill assertions flip with the `neverHibernate` default; `lightSleep` defaults on.
- E2E: with compressed timers, a sleeping enabled service's view is created hidden (a new "window" appears) and destroyed again after its first report, while the active service and rail highlight never change.
- Notification disabled-guard: manual verification (native banners are outside the e2e harness).
- Recipes and fixtures untouched — Light Sleep is generic over every service.

## Out of scope

- Configurable peek interval, battery-aware pausing, per-service peek opt-out beyond `neverHibernate`.
- Notification reply/mark-read actions and drag-drop sharing — candidate follow-ups once residency is won.
