# Reload guard, and Settings loses its reload button

Date: 2026-08-14. Status: accepted. Two changes to the same surface: user-initiated reload is rate-limited so it cannot interrupt a wake it started, and the per-service reload button leaves Settings ▸ Services.

## Problem

Every user-initiated reload funnels through `views.refresh(id)`, which unconditionally calls `loadURL(SERVICES[].url)`. Four paths reach it:

| Path | Site |
| --- | --- |
| `Go ▸ Reload Service` (⌘/Ctrl+R) | `menu.ts` |
| F5 while focus is on the shell | `index.ts` |
| F5 while focus is inside the view | `views.ts` |
| `service:reload` IPC | `ipc-handlers.ts` |

Nothing between the keypress and `loadURL` asks whether a load is already in flight. A service that is slow to wake — a cold Messenger, a logged-out Slack — invites exactly the reflex that keeps it slow: the user presses ⌘R again, the in-flight load is discarded, a fresh one starts, and the wake clock restarts (`waking.begin` re-arms on every main-frame navigation, see `waking.test.ts` "a reload mid-wake re-arms the timeout"). Held-down F5 is the pathological case: key auto-repeat fires roughly thirty `keyDown` events per second, each one a fresh navigation.

The second change is unrelated except in surface: Settings ▸ Services carries a per-service `reload` button that duplicates ⌘R for the active service and, for an inactive one, reloads a page the user cannot see.

## Reload guard

### Decision

A reload is dropped when the service is already waking, and again when a previous reload is younger than a one-second floor. Both arms are needed and neither is redundant:

- **Waking** is the semantically right signal — it is the same flag the overlay renders as "Waking X…", so the guard blocks exactly while the app is visibly busy.
- **The one-second floor** covers the race the waking flag cannot. `waking` turns true from `did-start-navigation`, which arrives asynchronously from the renderer; between `loadURL` and that event the flag still reads false, and auto-repeat at ~30 Hz lands several reloads inside that window.

A pure predicate holds both, per the repo rule that decision logic lives in a `lib/` helper with a unit test while `views.ts` stays wiring:

```ts
// src/main/lib/reload-guard.ts
export const RELOAD_MIN_INTERVAL_MS = 1_000;

/** A user reload is dropped while the service is still waking, and while the
 *  previous one is younger than the floor — held-down F5 auto-repeats faster
 *  than `waking` can round-trip back from did-start-navigation. */
export function reloadAllowed(o: {
  waking: boolean;
  lastReloadAt: number | undefined;
  now: number;
}): boolean {
  if (o.waking) return false;
  return o.lastReloadAt === undefined || o.now - o.lastReloadAt >= RELOAD_MIN_INTERVAL_MS;
}
```

### Wiring

`ServiceViewManager` gains a `waking: (id: ServiceId) => boolean` constructor callback — the same shape as the existing `railPosition` and `audioMuted` callbacks — and a private `lastRefreshAt: Map<ServiceId, number>`. `index.ts` supplies `(id) => state.runtime(id).waking`.

```ts
refresh(id: ServiceId): void {
  const view = this.views.get(id);
  if (!view) return;                       // hibernated/never-created
  const now = Date.now();
  if (!reloadAllowed({ waking: this.waking(id), lastReloadAt: this.lastRefreshAt.get(id), now })) return;
  this.lastRefreshAt.set(id, now);
  if (this.activeId === id) this.activate(id);
  view.webContents.loadURL(serviceById(id).url);
}
```

`destroy(id)` deletes the service's `lastRefreshAt` entry, so a view rebuilt after hibernation is not held off by a stamp from its previous life.

Guarding `refresh` covers all four paths at one choke point; no call site changes.

### What stays unguarded

`views.reload(id)` — the current-URL reload `ResilienceManager` uses for crash recovery — is untouched. It is not user-initiated, and it already has backoff and a five-reload cap; routing it through a floor meant for keystrokes would only fight its own schedule.

### Why this cannot trap the user

Two properties do the work, and a change that breaks either is a regression:

- **The wake is self-expiring.** `WAKE_TIMEOUT_MS` is 10s and fires `end(id, 'timeout')` regardless of what the page is doing, so a page that never finishes loading blocks reload for ten seconds, not forever.
- **Crash Retry is never blocked by the waking arm.** `onCrashed` calls `waking.end(id, 'crashed')` before the placeholder renders, so `waking` is already false when the Retry button appears. Only the floor applies, and all it does is swallow a double-click.

A dropped reload gets no new feedback. The loading overlay is on screen reading "Waking X…" for the whole blocked interval, which already answers "why did nothing happen"; a toast or a flash would be a second thing saying the same thing.

## Settings ▸ Services loses its reload button

The per-service `reload` button is deleted from the Services pane in `SettingsView.tsx`. Each row keeps `mute` and `never hibernate`.

The `service:reload` channel and its `SHELL_ONLY_CHANNELS` classification stay — the crashed-view placeholder's Retry is still a sender, and it is the one reload path that genuinely needs a shell surface on screen.

## Testing

`tests/unit/reload-guard.test.ts` covers the predicate: the first call is allowed; a call while waking is blocked; a call inside the floor is blocked; a call past the floor is allowed.

`views.ts` gets no test — it stays wiring, the same split as `waking.ts` against `waking-rules.ts`.

No e2e is added. The behaviour under test is the absence of a navigation inside a timing window, which an e2e can only assert by waiting, and the existing `loading.spec.ts` already pins the wake overlay and its timeout reveal.

## Documentation

`CLAUDE.md` records `service:reload` as backing "the crashed-view placeholder and Settings' per-service reload". Drop the Settings half, and record the guard next to it: user reload is dropped while a service is waking and inside `RELOAD_MIN_INTERVAL_MS`, the wake self-expires at `WAKE_TIMEOUT_MS`, and crash recovery's `views.reload` stays unguarded.
