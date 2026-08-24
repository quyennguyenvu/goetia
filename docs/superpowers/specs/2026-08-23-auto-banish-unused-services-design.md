# Auto-banish unused services and Services-pane settings — design

Date: 2026-08-23. Status: approved for planning.

## Problem

Two changes to how sleeping services are managed:

1. The "Hibernate idle services after (minutes)" setting lives in the General pane, away from the per-service hibernation controls in the Services pane.
2. A service the user has stopped using entirely still occupies a rail tile, gets peeked by Light Sleep, and keeps its badge counting forever. There is no way to have Goetia trim it automatically.

"Banish" here means what Home's board means by it: the service is disabled (`settings.disabled[id] = true`), its tile leaves the rail, its view is destroyed, and it sits in Home's banished section with its login partition intact. Fully recoverable.

## Decisions (from brainstorming, 2026-08-23)

- **Unused time is wall-clock and persisted.** A per-service `lastUsedAt` timestamp is stored in settings, stamped on activation. Time while Goetia is closed counts as unused: after a week away, unused services banish shortly after relaunch. A runtime-only clock was rejected because a daily app restart would mean the threshold never fires.
- **Opt-in.** Auto-banish ships off by default, as a checkbox plus an hours input preset to 24. Auto-disabling services is consequential enough that the user opts in; hibernation stays always-on as today.
- **The Services pane gains the sleep settings.** "Hibernate idle services after (minutes)", "Light Sleep", and "Battery saver for Light Sleep" all move from General to Services — they are all about sleeping services and read oddly split across two panes. The new banish rows sit directly under the hibernate row. General keeps close-to-tray, launch-at-login, and the summoning hotkey.
- **Banish is silent.** No toast, no banner — consistent with hibernation. The tile leaves the rail; Home's banished section is the record.

## Settings model

Two additions to `Settings` in `src/shared/types.ts`, with `DEFAULT_SETTINGS` entries:

- `autoBanish: { enabled: boolean; hours: number }` — default `{ enabled: false, hours: 24 }`.
- `lastUsedAt: Record<ServiceId, number>` — epoch ms of the service's last activation; 0 = never stamped. Default 0 for every id.

`normalize()` in `src/main/settings.ts` gets fill helpers in the existing style: a number-record fill for `lastUsedAt` (missing/corrupt keys → 0, like `fillZoom`) and a field-by-field fill for `autoBanish` (like `fillSummonHotkey`: `enabled` must be boolean else default; `hours` must be a finite number clamped to [1, 720] else 24).

**Stamping.** `activateService` (`src/main/activate.ts`) stamps `lastUsedAt[id] = now`, folded into the settings write `rememberSurface` already makes on every activation — no new write cadence. Stamping happens whether or not auto-banish is enabled, so a user who enables the feature later starts with real usage history. Only activation counts as use: banners, badges, unread reports, and Light Sleep peeks never touch the clock.

## Decision rule

New `src/main/lib/banish-rules.ts` with a pure function, mirroring `shouldHibernate`:

```ts
shouldBanish(candidate, now, banishMs): boolean
```

A service is banishable only when **all** hold:

- not disabled, and not the active service;
- not `neverHibernate` — a kept-awake service is one the user has pinned, never trimmed;
- not the in-flight Light Sleep peek;
- `lastUsedAt > 0` and `now - lastUsedAt >= banishMs` — an unstamped service can never be banished.

An earlier draft required the runtime `hibernated` flag instead of the explicit `neverHibernate` exemption. Dropped: a service that boots asleep has no view and never gets the flag until a peek tears one down, so with Light Sleep off the feature would silently never fire.

Unit-tested in `tests/unit/banish-rules.test.ts` (vitest), per the pure-logic-in-lib guardrail.

## Sweep behavior

Auto-banish runs as a step in the existing `HibernationController.sweep()` (`src/main/hibernation.ts`), after the hibernate step, only when `s.autoBanish.enabled`:

1. **Seed missing clocks.** Any enabled service with `lastUsedAt === 0` is stamped `now` (the existing "never-visited services start their clock at the first sweep" pattern). One batched `settings.update` if anything was seeded. This uniformly handles migration, newly-enabled services, and toggling the feature on — each grants a full fresh window — and seeding costs zero settings writes while the feature is off.
2. **Collect and banish.** All services passing `shouldBanish` are disabled in **one** settings patch, applied through the same side-effects tail the `patch.disabled` branch of `settings:update` runs today (destroy views, reset runtime, `resolveActivation`, `rememberSurface`, `buildAppMenu`, broadcast). That tail is extracted into an exported `applyDisabledChange(ctx, before)` in `src/main/ipc-handlers.ts` — it calls `buildAppMenu`, which imports electron, so it cannot live in `activate.ts` without poisoning the electron-free import graph the unit tests rely on. The sweep reaches it through a late-bound `ctx.banishServices(ids)` on `AppContext` (implemented in `index.ts`, the established pattern that keeps `hibernation.ts` free of electron). The sweep skips peek scheduling on a sweep that banished — its settings snapshot is stale — and views are only resolved-hidden per the overlay guardrail, exactly as the existing tail already does.

If every service ends up banished, the existing all-disabled derivation shows the welcome screen — no special case.

**No timing override needed for e2e.** The threshold is `hours * 3_600_000` ms; e2e pre-seeds an ancient `lastUsedAt` in the profile's settings.json (which also exercises the persistence claim) and compresses only the sweep via the existing `GOETIA_SWEEP_MS`.

## Settings UI

In `SettingsView.tsx`, the Services pane becomes, in order: the per-service mute / never-hibernate rows (unchanged); "Hibernate idle services after (minutes)" (moved verbatim from General); "Banish unused services" — checkbox, hint "An unused service leaves the rail and returns to Home. Sign-in is kept."; "After (hours)" — number input preset 24, min 1, max 720, disabled while the checkbox is off (the Summoning hotkey → Combo pattern), coerced like the hibernate input (`Math.max(1, Number(v) || 24)`); "Light Sleep" and "Battery saver for Light Sleep" (moved verbatim); the existing "Manage services…" row last.

Test ids: `auto-banish-enabled` and `auto-banish-hours`. Any existing e2e that reaches `light-sleep-enabled` / `peek-saver-enabled` through the General pane is updated to click the Services nav item first.

## Testing

- **Unit:** `banish-rules.test.ts` covers every exemption (disabled, active, `neverHibernate`, in-flight peek, unstamped clock, under threshold) and the firing case. `hibernation.test.ts` covers the sweep step: seeding, batching one `banishServices` call, active/`neverHibernate` exemptions, and enabled-off inertness. Settings normalization tests cover the two new fills.
- **E2E:** with `GOETIA_SWEEP_MS` compressed and an ancient `lastUsedAt` pre-seeded in the profile: the stale service's tile leaves the rail and it appears in Home's banished (unbound) section while the active service survives. Settings UI: the moved rows render in Services, the hours input disables with the checkbox, General no longer shows them.
- **Definition of done** per CLAUDE.md: lint, typecheck, unit tests, e2e all green.

## Follow-through

- CLAUDE.md's "Adding a service" step 1 lists the per-service `DEFAULT_SETTINGS` records — `lastUsedAt` joins that list.

## Rejected alternatives

- **Separate `BanishController`:** duplicates the sweep timer, boot delay, disposal, and peek-awareness for a check that shares all of hibernation's inputs.
- **Runtime-only idle clock:** dies on every restart; a 24 h threshold would effectively never fire.
- **Pause the clock while Goetia is closed:** avoids the post-vacation banish wave but needs accumulated-idle bookkeeping; not worth the state for an opt-in, fully recoverable action.
- **On by default:** existing users would watch rarely-used services vanish from the rail within a day of updating.
- **Toast on banish:** adds a renderer surface and a broadcast for something silent, recoverable, and visible on Home.
