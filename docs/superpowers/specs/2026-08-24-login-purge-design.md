# Login purge — rename sign-out, paint it red, add a Home-wide sweep — design

Date: 2026-08-24. Status: approved for planning.

## Problem

Two user complaints (2026-08-24), one root cause.

1. **"Sign out…" over-promises.** `confirmSignOut` (`src/main/signout.ts`) closes the service's call windows, clears its `persist:<id>` partition, and lands the view back on the chat URL — which is the login page. The *server* session is never revoked: the site keeps listing this device until the token expires on its own. The label reads as an account logout, so the button's name describes something it does not do.
2. **Unbound services are unreachable.** Settings → Services lists enabled services only (`.filter((svc) => !s.disabled[svc.id])`), and the 2026-08-24 tile-menu change moved sign-out off the rail entirely. So the *only* login a user can clear is one belonging to a currently-summoned service. A banished service's credentials stay on disk with no UI that can touch them.

## Decisions

- **The action is a *purge*, everywhere.** The word replaces "sign out" in copy, in the IPC channel, and in the module name at the same time, so the label and the code cannot drift the way they just did. Per-service: **Purge login…**. The new Home-wide sweep: **Purge all logins…** (user decision — "purge" over "forget"/"clear", goetic verb with a plain object, and the bulk button reads as the heavier sibling of the per-service one, which it is).
- **Purge and banish stay orthogonal, in both directions.** Banish clears the rail and keeps the login (existing invariant). Purge clears the login and never touches `disabled` or `order`. A purge-all leaves the board exactly as the user arranged it.
- **The bulk sweep covers every service in `order`** — summoned and unbound alike. That is the point: it is the only path to an unbound service's credentials. Settings keeps listing enabled services only (user decision: bulk-only coverage; no dimmed unbound group, no Home tile context menu).
- **The bulk sweep confirms with an acknowledgement checkbox** (user decision), which native dialogs cannot gate a button on — `showMessageBox` returns `checkboxChecked` only *after* a button press. So: confirm with the box unticked re-shows the same dialog once with a nudge line; unticked on the second pass cancels. Staying native keeps Home's confirm consistent with the per-service one in Settings and costs no new shell surface.
- **Completion is a self-dismissing toast** (user decision, and consistent with the app's existing toasts). For a purely unbound service nothing else on screen changes, so silence would leave the user unsure the sweep ran.

## Naming

| Surface | Before | After |
| --- | --- | --- |
| Settings → Services row button | `Sign out…` | `Purge login…` |
| Home hero footer | — | `Purge all logins…` |
| Renderer → main channel | `service:signOut` | `service:purgeLogin` |
| Renderer → main invoke | — | `services:purgeAll` |
| Module | `src/main/signout.ts` | `src/main/purge.ts` |
| Main entry points | `confirmSignOut` | `confirmPurgeLogin`, `confirmPurgeAll` |

The per-service button's `title` carries the caveat the old label buried: "Clears this service's saved login on this device. Your account stays active — nothing is signed out elsewhere." That sentence is the entire reason for the rename, so it must survive into the dialog copy too.

## Red

`--danger` is a new token in `tokens.css`, light `#d1293d` and dark `#ff5a6a`, exposed as `--color-danger` in the `@theme inline` block. Deliberately in `--badge`'s pink-red family rather than the ember accent's: a destructive control must not read as brand orange, and `--accent` at `#e8590c`/`#ff9e2c` is too close to warn-orange to carry "this deletes things".

The two existing reds are left alone. `--badge` (`#ff4d5e`) means *unread* and reusing it would conflate an unread count with a destructive action. `--accent-2` (`#c92a2a`/`#f04e3e`) is currently referenced by nothing in the renderer but is conceptually the end stop of the hero's summon gradient, whose dark value `#F04E3E` is hard-coded in `HomeHero`; repurposing it as "danger" would make that gradient read as a warning.

- Settings button: `border-danger/60 text-danger hover:border-danger hover:bg-danger/10` — same geometry as today, red instead of accent hover.
- Home footer: a quiet text button, `text-danger hover:underline`, no fill. It sits at the bottom of the hero column below the mnemonic block (user decision), separated by a hairline rule — as far from the Summon CTA as the column allows, and with no filled background to compete with it.

## IPC & main

- `service:signOut` is renamed `service:purgeLogin` in `RendererToMain`, `R2M_CHANNELS` and `SHELL_ONLY_CHANNELS`. Same shape (`{ serviceId: ServiceId }`), same shell-only classification — a service frame must never be able to wipe a partition, its own included.
- `services:purgeAll` is a new **invoke** channel (`RendererInvoke`, `INVOKE_CHANNELS`, `SHELL_ONLY_CHANNELS`) returning `{ purged: number }` — `{ purged: 0 }` when the user cancelled, which doubles as the `blocked` value a rejected sender receives. Invoke rather than send because the dialog is modal and the partition wipes are async: the renderer awaits the count and owns the toast in component state, so nothing is added to `ShellState` and no broadcast is needed for a one-shot acknowledgement.
- `registerInvoke` widens its handler type from `() => RendererInvoke[C]['result']` to `() => R | Promise<R>`. `ipcMain.handle` already awaits a returned promise; `blocked` stays synchronous. Without this, an async invoke handler cannot be registered through the gate at all — and registering outside the gate is not an option.

### What a purge does

`purgeService(ctx, id)` is the shared unit both entry points call:

1. `ctx.views.closeCallWindows(id)` — unconditional and before the wipe, because the dialog promises the call ends and a call window runs in the partition being cleared. Unchanged from today.
2. `await session.fromPartition('persist:' + id).clearStorageData()`.
3. `ctx.views.loadServiceUrl(id)` — already a no-op when the service has no view, which is what makes the same unit work for hibernated and unbound services.
4. `ctx.state.setRuntime(id, { unread: { direct: 0, indirect: 0 }, stale: false })`. A live view re-reports zero from its login page on its own, but a **hibernated** service keeps its last count — a badge for messages the user can no longer open. Zeroing unconditionally is both simpler and correct; a banished service is already at zero from `applyDisabledChange`.
5. `ctx.activity.clear(id)` — `ActivityLog` gains `clear(id?: ServiceId)` (all entries, or one service's). Recents rows are conversation titles from the session just wiped, so a ⌘K row would deep-link into a thread that now resolves to a login page. The log is in-memory only, so there is nothing to scrub from disk.

`confirmPurgeAll` iterates `ctx.settings.get().order`, awaits the wipes, then broadcasts once and returns the count. `confirmPurgeLogin` keeps today's single-service confirm (Cancel default, no checkbox — one service is not the heavy action) and broadcasts once.

## Dialog copy

`src/main/lib/purge-rules.ts` holds the copy as pure functions, per the `lib/` rule:

- `purgeLoginDialog(name)` → the existing single-service options, with `detail` extended to name the caveat: the login is cleared on this device, any call in progress ends, and the account stays active elsewhere.
- `purgeAllDialog(count, nudge)` → `message: 'Purge all N logins?'`, `checkboxLabel: 'Yes, wipe every service'`, `buttons: ['Cancel', 'Purge All']`, `defaultId: 0`, `cancelId: 0`; `detail` names summoned *and* unbound, the ended calls, and the "accounts stay active" caveat, prefixed with "Tick the box below to confirm." when `nudge` is true.

Both pluralize on `count`. Unit-tested for 1, N, and the nudge variant.

## Renderer

- `SettingsView` — the button's label, `title`, `data-testid` (`purge-<id>`) and classes change; the send target becomes `service:purgeLogin`. Nothing else in the pane moves.
- `HomeHero` gains an `onPurgeAll` prop and renders the footer link after the mnemonic block. `Welcome` owns the handler: `await window.goetia.invoke('services:purgeAll')`, and on a non-zero count sets the toast message.
- `toast-rules.ts` gains `purgeToastMessage(count)` → `'Purged 1 login.'` / `'Purged N logins.'`, null at zero so a cancel shows nothing.
- The toast itself is a new `PurgeToast` following `CapTrimToast`'s machinery exactly — `TOAST_MS`, timer dismissal, hover banks the remainder — mounted in `App` beside the other two toasts and driven by renderer-local store state, not by `ShellState`: `useShell` gains `purgeToast: string | null` and `setPurgeToast`, following the existing `homeDirty` / `homeDiscardTick` precedent for a signal that crosses components without ever leaving the renderer.
- **It takes the bottom-centre slot.** Both existing corners are claimed — `UpdateToast` is bottom-right, `CapTrimToast` bottom-left — and the two *can* overlap in principle (a startup cap-trim toast lives 8s, long enough for a click on the Home it opened onto). Bottom-centre needs no conditional offsets and no coupling between toasts.

## Testing

- **Unit:** `purge-rules.test.ts` for both copy builders (1 / N / nudge). `toast-rules.test.ts` gains `purgeToastMessage` (0 → null, 1, N). `ipc-sender-policy.test.ts`'s existing sign-out pair is renamed to `service:purgeLogin` and a matching pair is added for `services:purgeAll` — allowed from the shell frame, rejected from a service frame even for its own id.
- **E2E:** `banish.spec.ts:45` updates `'Sign out…'` → `'Purge login…'`. A new assertion covers the hero footer link's presence and that it resolves to `--danger`. Native dialogs are not Playwright-drivable, so the confirm-and-wipe path stays a manual check.
- **Manual:** purge one service and confirm it lands on its login page with the badge cleared and its recents rows gone; purge-all with the box unticked twice (cancels), then ticked (every service wiped, toast names the count, board membership and order unchanged); purge-all while a call window is open (the call closes); purge-all with a hibernated service that had a badge (badge clears without waking it).
- Definition of done per CLAUDE.md: `lint`, `typecheck`, `test`, `e2e` all green.

## Docs

- README "Handy to know" and `docs/FEATURES.md`: the sign-out bullet becomes the purge bullet, keeping the "on this device" caveat, and gains the Home-wide sweep.
- CLAUDE.md, under the product principle: one invariant — purge clears logins and never touches the rail; banish clears the rail and never touches logins. Plus the note that the bulk sweep is the only path to an unbound service's credentials, so narrowing it to enabled services would silently strand them.

## Rejected alternatives

- **"Forget login…" / "Clear session…"** — considered and rejected in favour of "purge" (user decision). "Forget" is the browser idiom and the most plainly accurate, but "purge" carries the destructive weight and pairs with the bulk sweep; "clear session" is precise and cold, and reads as jargon.
- **"Unbind…"** — never offered: `Unbound` already means *not summoned* on Home, so the word would name two unrelated things one screen apart.
- **A renderer-side confirm modal for the sweep** — the only way to truly disable "Purge All" until the box is ticked, but it costs a new shell surface plus its own tests and would make Home's confirm look unlike Settings' native one. The re-prompt loop buys the same friction for ~15 lines in main.
- **Listing unbound services in Settings, or a Home tile context menu** — both close the per-service gap properly, and both were declined in favour of bulk-only coverage.
- **A `ShellState` field for the toast** — would make a one-shot acknowledgement part of every subsequent broadcast, and needs a tick or timestamp to distinguish repeats. The invoke's return value is the natural carrier.
- **Purging as part of banish** — conflates the two axes the design keeps orthogonal, and would make the rail a destructive control.
