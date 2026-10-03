# Messenger calls-off notice — design

Date: 2026-10-03. Status: approved 2026-10-03 (user decision). Scope: Goetia notices when facebook's own setting has turned incoming calls off for the signed-in account, shows it on the Messenger tile, and turns calls back on from the tile menu when the user asks. Messenger only. Builds on `2026-08-16-calls-and-screen-share-design.md` (calls) and `2026-09-26-diagnostics-unusual-only-design.md` (what the ring records).

## Problem

A Messenger call rang the user's phone and never reached Goetia (2026-09-30). The diagnosis, run live in the Messenger view's DevTools, showed the call did reach the page — facebook's ring SDK emitted `incomingRing` — and that facebook's page dropped it on purpose: `viewer.call_blocked_until` was `-1`.

That field is facebook's **"Incoming call sounds"** switch (`RTWebCallBlockedSettingMenuItem.react`). Despite the label it is not a sound toggle: switching it off asks for a duration and writes `call_blocked_until` (`-1` = until turned back on, an epoch time = until then, `0` = calls allowed). While it is non-zero, `RTWebCallBlockSettingHooks.useCallBlockSetting` calls `ZenonCallInviteModel.startListening({ callsBlocked: true })`, which never subscribes to rings — no Accept/Decline dialog, no ringtone, no "Incoming call" `Notification` for Goetia's shim to turn into a banner. The setting is account-level and server-side, so it survives reinstalls and purges and applies in every browser.

Goetia makes it worse in two ways. The switch is rendered in exactly two places — the Messenger jewel's Options menu inside facebook's top bar, which the recipe hides (`[role="banner"] { display: none }`, chat-only), and the Contacts panel of the facebook.com home feed, which Goetia never shows. So inside Goetia nothing says calls are off and nothing can turn them on; the user needed a Console script.

## Threat model

- **The write is the user's, and only the user's.** Turning calls on runs facebook's own mutation (`MWCallBlockedUntilSettingMutation`, `{ call_blocked_until: 0 }`) in the user's own session, and only from a click on a main-built native menu item. No timer, no page message and no other code path can reach it. It grants the page nothing it lacks: the page *is* facebook and can run that mutation itself.
- **No new channel from the page.** Main pulls the state through the frozen `window.__goetia` object with `executeJavaScript`, exactly as Pin Selection reads the open conversation. A hostile page cannot push a state, spam Diagnostics or trigger the write; the most it can do is answer main's question falsely, which yields a wrong mark at worst.
- **Everything the page returns is data.** Main accepts only `-1`, `0` or a finite future epoch time; anything else reads as "unknown".
- **Fragility, not exposure, is the real risk.** The hooks lean on facebook's internal module names (`RTWebCallBlockSettingHooksQuery.graphql`, `MWCallBlockedUntilSettingMutation`, `CometRelay`, `CometRelayEnvironment`) through the page's global `require`. Facebook can rename them at any time, so every failure must **fail closed**: no mark, never a false "calls are off", and one Diagnostics line as evidence.

## Decision

1. **Detection: main asks the page on a timer.** Chosen over a page-side report (a new incoming service channel to secure and mirror) and over noticing only a missed ring (the user learns after the first missed call — the failure being fixed).
2. **Notice: a mark on the Messenger tile.** Chosen over menu-and-tooltip only and over a Home band, because it is the only option visible before a call is missed (user decision).
3. **Action: Turn On Incoming Calls in the tile menu**, immediate, no confirm — it is the user's own click and the safe direction.
4. **Not built:** a Turn Off item (Goetia does not become facebook's settings screen), any automatic unblocking (it would overwrite a deliberate choice on the account), and Instagram (whether it shares the switch is unverified; the hooks are generic, so it can join later).

## Design

### Recipe hooks

`Recipe` gains a pair, declared together (`recipes.test.ts` enforces the pair and the `ServiceMeta` mirror below):

- `callsBlocked?(doc: Document): Promise<number | null>` — reads `call_blocked_until` through `CometRelay.fetchQuery(CometRelayEnvironment, RTWebCallBlockSettingHooksQuery.graphql, {}, { fetchPolicy: 'store-or-network' })`. Facebook keeps that store record current through its own subscription, so a store hit is the normal case. Returns the value as a number (a numeric string is converted), or `null` when a module is missing, anything throws, or `CALLS_HOOK_TIMEOUT_MS` (4 s) passes. Never throws, never hangs.
- `allowCalls?(doc: Document): Promise<number | null>` — commits `MWCallBlockedUntilSettingMutation` with `{ call_blocked_until: 0 }`, then returns a fresh `callsBlocked` read (`network-only`). Same bounds. **The mutation is not loaded on `/messages`** (amended 2026-10-03 after the first packaged build's Turn On failed every time): facebook ships it with its chat-settings menu, which hangs off the hidden top bar, so the page's `require` answers `undefined`. The hook first asks facebook's own lazy loader for that menu — `JSResource('CometHomeChatSettings.react').load()` — which brings the mutation with it (verified live: `before -1`, loaded, `after 0`).

Messenger's recipe implements both. The page's `require` is reached through `doc.defaultView` and unwrapped as `m.default ?? m` (facebook's interop). The preload adds both to the frozen `window.__goetia` (`callsBlocked: () => recipe?.callsBlocked?.(document) ?? null`, likewise `allowCalls`).

`ServiceMeta` gains `callsSetting?: true`, set for messenger only, so main knows which services to watch without loading recipes.

### Main: `CallsSettingWatcher`

`src/main/calls-setting.ts`, one instance on `AppContext`.

- **Start** on `service:ready` for a `callsSetting` service. A repeated ready (a reload, or a page sending it at will) re-checks only when no call is in flight and the last check is at least `CALLS_READY_RECHECK_FLOOR_MS` (60 s) old. The check runs only once the chat surface is ready, so a login, checkpoint or captcha page is never touched.
- **Check:** `executeJavaScript('globalThis.__goetia?.callsBlocked?.() ?? null', true)` raced against `CALLS_CHECK_TIMEOUT_MS` (5 s). One call per view in flight at a time. The result goes through `parseCallsBlocked` and `applyCallsState`.
- **Cadence:** the first check at ready, then every `CALLS_CHECK_INTERVAL_MS` (10 min); while calls are off until a time, the next check is due just after that time if sooner (`nextCheckDelay`), so the mark clears on time.
- **Turn On:** queued behind any check in flight, then `executeJavaScript('globalThis.__goetia?.allowCalls?.() ?? null', true)` under `CALLS_TURN_ON_TIMEOUT_MS` (15 s — up to three 4 s page steps: load, commit, re-read); its re-read result goes through the same `applyCallsState`.
- **Stop** when the view is destroyed (hibernation, banish, purge, quit): the timer is cleared, and `callsOffUntil` resets to `0`. A sleeping page cannot ring anyway, and the next ready starts again.
- A rejected `executeJavaScript` (page mid-navigation) is a skipped round: no state change, no Diagnostics line.

### Rules

Pure, unit-tested.

- `src/main/lib/calls-setting-rules.ts`: `parseCallsBlocked(raw, now)` → `-1`, `0` (also for a past epoch time — that block has expired), a future epoch ms, or `null` for anything else (unknown); `nextCheckDelay(until, now)`; `callsTransition(prev, next)` → which Diagnostics line, if any.
- `src/shared/calls-off.ts` (renderer-importable): `isCallsOff(until, now)`, `callsOffLabel(until, now)` (`until 14:30`, `until tomorrow 08:00`, `until 10 Oct 09:05` — its own, because `muteLabel` assumes an end no later than tomorrow and facebook's blocks can outlast that) and `callsOffTooltip(until, now)`.

### State

`ServiceRuntime` gains `callsOffUntil: number` — `0` = not known to be off (calls on, or unknown), `-1` = off indefinitely, `> 0` = off until that epoch ms. It rides the existing `setRuntime` broadcast, which already skips no-op patches. Whether the last read succeeded is the watcher's private state, used only for Diagnostics transitions.

### Tile

`ServiceTile` draws a crossed-out phone in the free **top-left** corner while `callsOffUntil` is non-zero — the mute mark's neutral disc (`border-border bg-bg-2 text-text-2`), 12px, set just **inside** the corner rather than hanging off it, because off the corner it lands about 2px from the previous tile's unread badge in the top rail (caught on the mock, 2026-10-03); the glyph is a filled handset with a cut-out slash, since a stroked phone at that size reads as "%". `data-testid="calls-off-mark"`, titled with `callsOffTooltip`: "Incoming calls are off on Facebook — right-click to turn on", or "… off on Facebook until 14:00 — …" for a timed block. Corners stay one meaning each: unread top-right, crashed/stale bottom-right, mute bottom-left, calls-off top-left. Per the owner's standing preference, the variants were mocked in the real tokens beside the rail (`https://claude.ai/artifact/ARgtWizrdnTaKyaDafvvBo`) and the owner picks before the mark is implemented.

### Tile menu

`TileMenuAction` gains `allow-calls`. `tileMenuItems` adds **Turn On Incoming Calls** after Mute only while calls are off and the view is live; its click calls the watcher's Turn On.

### Diagnostics

Tag `recipe`, transitions only, never a cadence and never a success:

- `messenger: incoming calls are off in Facebook's chat settings` — on the change into off.
- `messenger: can't read Facebook's call setting` — on the change into unreadable (the first failed read included); the evidence that facebook renamed something.
- `messenger: turning incoming calls on failed` — Turn On ran and the re-read still shows off or unknown.

## Failure handling

| Situation | Result |
| --- | --- |
| Modules renamed, query errors or never settles | Hook returns `null`; main's 5 s race also ends it. No mark; one `can't read` line on the change. |
| Page mid-navigation | Skipped round; retried at the next check. |
| View hibernated or destroyed | Watcher stops, mark clears; restarts at the next ready. |
| Calls off until a time | Tooltip names the time; next check just after it, so the mark clears on time. |
| Turn On refused, or re-read still off | Mark stays; `turning incoming calls on failed`. |
| Turn On while a check is in flight | Waits for it, then runs; one call per view at a time. |
| Logged out | Ready never fires on a login page, so nothing runs. |

## Testing

- **Unit, rules:** `parseCallsBlocked` (`-1`, `0` and a future time pass through, a past time becomes `0`, anything else is `null`), `isCallsOff`, `nextCheckDelay`, `callsOffTooltip`, `callsTransition`.
- **Unit, tile menu:** Turn On appears only when calls are off and the view is live.
- **Unit, recipe:** against a fake `window.require` — returns `-1`, `0`, a time; `null` when a module is missing, throws or never settles; `allowCalls` commits exactly `{ call_blocked_until: 0 }` and returns the re-read. `recipes.test.ts`: the hook pair and `ServiceMeta.callsSetting` stay in sync.
- **Unit, watcher:** fake timers and a fake executor — starts at ready, honours the cadence and the timed-block delay, stops on destroy, never two calls in flight, Diagnostics only on transitions.
- **E2E:** the `--goetia-e2e` hook seeds messenger's `callsOffUntil: -1`; with messenger summoned, the tile shows `calls-off-mark` with its tooltip. The e2e messenger page is logged out, so ready never fires and the watcher cannot overwrite the seed.
- **Live (owner):** set calls off from the Console (`call_blocked_until: -1`), reload Messenger, the mark appears; right-click → Turn On Incoming Calls, the mark clears; the probe reads `0`.

## Documentation

`CLAUDE.md` gains a bullet under Notifications & mute: Messenger's calls-off state is read through the recipe's `callsBlocked`/`allowCalls` hooks on `window.__goetia` by `CallsSettingWatcher`; the write runs only from the tile menu click; failures fail closed; no Turn Off and never automatic; facebook's "Incoming call sounds" switch is `call_blocked_until`, and while it is non-zero the web page ignores every ring.
