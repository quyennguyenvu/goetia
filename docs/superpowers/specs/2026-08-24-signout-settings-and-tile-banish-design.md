# Sign-out in Settings, banish on the tile menu — design

Date: 2026-08-24. Status: approved for planning.

## Problem

Sign Out… lives on the rail tile's right-click menu (2026-08-17 design). Two changes, both user decisions (2026-08-24):

1. Sign-out moves into Settings → Services as a per-service button — it is a destructive-rare action and belongs with the service's other controls, not one mis-click away on a tile.
2. The tile menu gets **Banish** in sign-out's place: a quick, no-confirm way to disable one service from the rail.

## Decisions

- **Tile menu = Mute/Unmute + separator + Banish.** Banish is quick and fully recoverable — the login partition is kept and the service sits in Home's banished section ready to re-summon — so it gets no confirm dialog. Sign-out, which wipes the partition, keeps its native confirm (Cancel default) unchanged.
- **Sign-out stays main-side and unchanged in behavior.** `confirmSignOut` (`src/main/signout.ts`) is untouched: native confirm parented to the main window (so it shows above the open Settings modal), call windows closed, `persist:<id>` storage cleared, view reloaded to the chat URL.
- **Banish reuses the auto-banish path.** The tile menu item calls `ctx.banishServices([id])` — the same one-patch disable through the shared `applyDisabledChange` tail (view destroyed, runtime reset, activation resolved, surface remembered, app menu rebuilt, broadcast). Banishing the active service lands on the next enabled service, or the welcome screen when it was the last one — both already handled by `resolveActivation` and the all-disabled derivation.

## IPC & main

- New `service:signOut: { serviceId: ServiceId }` in `RendererToMain`, added to `R2M_CHANNELS` and to `SHELL_ONLY_CHANNELS` — a service page must never be able to trigger a partition wipe, its own included. Handler: `on('service:signOut', ({ serviceId }) => void confirmSignOut(ctx, serviceId))`.
- The `service:tileMenu` handler's template becomes Mute/Unmute, separator, `Banish ${name}` (click → `ctx.banishServices([serviceId])`). The Sign Out… item is removed.

## Settings UI

In the Services pane, each enabled service's row gains a **Sign out…** button after the "never hibernate" checkbox, styled like the existing "Manage services…" button (border, hover accent), `data-testid="signout-<id>"`, sending `service:signOut`. Rows remain enabled-services-only — the same coverage the rail tiles had.

The Shortcuts pane line "Right-click a tile — mute/unmute service" becomes "Right-click a tile — mute or banish service".

## Testing

- **E2E:** the Services-pane test in `tests/e2e/banish.spec.ts` additionally asserts one Sign out… button per enabled service (two in its profile). Native menus and native dialogs are not Playwright-drivable, so the sign-out click-through and the tile-menu banish stay manual checks; banish-via-menu is `banishServices`, already covered by the hibernation unit tests and the disable-path e2e.
- **Unit:** `ipc-sender-policy.test.ts` tests representative channels by name (e.g. `service:tileMenu`), so `service:signOut` gets its own allow-from-shell / reject-from-service pair — a partition wipe is exactly the channel whose classification deserves a named test.
- Definition of done per CLAUDE.md: lint, typecheck, unit, e2e all green.

## Rejected alternatives

- **Renderer-side confirm modal for sign-out:** a new shell surface duplicating the native dialog that already guards the wipe.
- **Sign-out in both places:** the user explicitly wants the tile menu to stay light — mute and banish only.
- **Confirm dialog on tile banish:** banish is non-destructive and one click away from being undone on Home; a dialog would defeat "quick".
