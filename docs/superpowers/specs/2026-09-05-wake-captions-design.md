# Wake captions: the cover says what kind of load it covers

Date: 2026-09-05. Status: accepted (user decision). Two fixes to the same phrase. The waking cover names the load it covers instead of calling every load a wake, and the shell placeholder behind ⌘K and Settings stops claiming a live service is waking.

## Problem

"Waking {service}…" is rendered in two places, and both are wrong in their own way.

**The cover over-claims.** `LoadingOverlay` (`loading.html`) shows while `runtime.waking` is true. That flag is raised by `WakingTracker.begin` on every main-frame cross-document navigation that main itself requested, which since 2026-09-05 is exactly the set of `views.load` calls (`MainLoads` marks them; the next navigation claims the mark). Seven callers reach `views.load`:

| Caller | Site | What is really happening |
| --- | --- | --- |
| `create` | `views.ts` | cold create: first activation, startup restore, `neverHibernate` at boot or summon, Light Sleep peek |
| `create` via `activate` of a hibernated service | `views.ts` | hibernation wake |
| `openConversation` on a dead view | `activate.ts` | banner, ⌘K recent, or pin for a hibernated service; view created on the conversation URL |
| `refresh` | `commands.ts`, `index.ts` (F5), `ipc-handlers.ts` (`service:reload`, also the crash placeholder's Retry) | user reload back to the chat URL |
| `reload` | `resilience.ts` | crash auto-reload of the current URL |
| `loadServiceUrl` | `purge.ts` | post-purge return to the chat URL, now logged out |
| contained-window hand-back | `views.ts` `handBack` | a login that detoured through the hardened window landed on an allowed host |

Only the first three are a view coming back from nothing, which is what "waking" means in the app's Light Sleep vocabulary. A ⌘R on a live Discord, a crash restart, a purge, and a login hand-back all get the same caption, so the word tells the user nothing about what they are waiting for.

**The placeholder is keyed on the wrong flag.** When ⌘K or Settings opens, the active view is hidden and the shell's content area shows through with `ContentPlaceholder`. It prints "Waking {name}…" whenever `runtime.loading` is true. `loading` is `did-start-loading`, which fires for any subframe or page-initiated load, so a fully rendered Discord reads "Waking Discord…" behind the switcher the moment it fetches anything (reported 2026-09-05, screenshot of ⌘K over a live Discord). The cover itself never has this problem because it is keyed on `waking`.

## Decision

### Load kinds

Every `views.load` call names its kind. Five kinds cover the seven callers:

| Kind | Callers | Caption |
| --- | --- | --- |
| `wake` | cold create, hibernation wake, dead-view conversation open, peek | Waking {service}… |
| `reload` | ⌘R, F5, `Go ▸ Reload Service`, crash placeholder Retry | Reloading {service}… |
| `restart` | crash auto-reload (`ResilienceManager`) | Restarting {service}… |
| `purge` | post-purge return to the chat URL | Signing out of {service}… |
| `hand-back` | contained login window landing on an allowed host | Signing in to {service}… |

Any view creation is a `wake` (user decision, 2026-09-05): a hibernation wake and a dead-view open are the view being built from nothing, exactly like a cold create, and the app already calls Light Sleep's return a wake. The alternative, reserving the word for the first creation of the session and saying "Resuming" for a hibernation wake, was rejected as a distinction the user cannot see.

The Retry button on the crash placeholder is a `reload`, not a `restart`: it goes through `views.refresh` and lands on the chat URL, and the user pressed it. `restart` is reserved for the reload the app issued on its own after a crash.

### Mechanism

The kind rides the existing mark, so no new event or channel is needed.

- `MainLoads.mark(id, kind)` stores the kind; `claim(id)` returns `LoadKind | null` instead of a boolean. One mark per view still holds: a second mark before the navigation arrives replaces the kind, which is right because the later load is the one the navigation belongs to.
- `views.load(id, wc, url, kind)` requires the kind. Each of the seven callers passes its own; `create` and `openConversation` pass `wake`, `refresh` passes `reload`, `reload` passes `restart`, `loadServiceUrl` passes `purge`, `handBack` passes `hand-back`.
- `ViewHooks.onNavigate(id, kind: LoadKind | null)` replaces the boolean `wake` parameter. `null` still means a page-initiated navigation: `forgetReplay` runs, the cover stays down.
- `WakingTracker.begin(id, kind)` patches `{ waking: true, wakeKind: kind }`. `end` patches `{ waking: false }` and leaves `wakeKind` as it was; nothing reads it while `waking` is false.
- `ServiceRuntime` gains `wakeKind: LoadKind | null`, default `null`. The `waking` boolean stays, so the reload guard, the tile breathe, `syncOverlay`, and every test that reads it are untouched.
- A pure helper in `src/shared/wake-caption.ts` maps `(kind, serviceName)` to the caption string. It is the only place the words live. `src/shared/**` stays process-agnostic, so both main and the shell renderer import it.
- `loading:state` carries `caption` instead of `serviceName`. `syncOverlay` computes it with the helper from `runtime.wakeKind` and the service name; `loading.ts` sets the text verbatim. The `LoadingState` type in `shared/ipc.ts` changes accordingly.
- `ContentPlaceholder` keys its text on `runtime.waking && !runtime.crashed` instead of `runtime.loading` and renders the helper's caption. A live service that is merely fetching shows nothing behind ⌘K; a service genuinely waking behind ⌘K says exactly what the cover would say if the switcher were closed.

`wakeKind` may be `null` while `waking` is true only if a future `begin` caller forgets the kind; the helper treats `null` as `wake` so the cover never renders an empty caption.

### What does not change

- `endsWake` and the six `WakeEnd` events. What ends a wake is independent of what started it.
- The reload guard: it reads the boolean `waking`, and a `reload` cover blocks a spammed ⌘R exactly as before.
- The rail tile's breathe: boolean `waking`.
- `MainLoads` semantics: still one mark per view, still claimed by the first main-frame cross-document navigation, still forgotten on destroy. Page-initiated navigations still never raise the cover.
- `runtime.loading` keeps its meaning and its `did-start-loading` source. It simply stops driving user-facing text.

## Testing

- `tests/unit/wake-caption.test.ts`: one row per kind, plus `null` falls back to the wake caption.
- `tests/unit/main-loads.test.ts`: `claim` returns the marked kind once and `null` afterwards; a second mark replaces the kind; `forget` drops it.
- `tests/unit/waking.test.ts`: `begin` records `wakeKind`; `end` clears `waking` and leaves `wakeKind`; a re-armed wake with a different kind updates it.
- `tests/unit/state.test.ts`: `defaultRuntime` carries `wakeKind: null`.
- `tests/e2e/loading.spec.ts` gains three assertions on the real app: the cover's caption reads `Waking Messenger…` during the cold create; ⌘K emitted on the view's `before-input-event` (the `shortcuts.spec.ts` technique) shows the same caption in the shell placeholder while the wake is on; and once the wake ends the shell shows no `Waking` text at all, whatever the logged-out page is still loading.
- No renderer component test is added: the shell has no component test harness (happy-dom serves the preload recipe tests only), and the e2e assertion above covers the placeholder's keyed flag end to end.

## Documentation

`CLAUDE.md` gains one line under Notifications & mute, beside the waking-cover bullet: the cover names the kind of load it covers (`LoadKind` on `MainLoads`), the placeholder behind a shell surface is keyed on `waking` and never on `loading`, and the words live only in `shared/wake-caption.ts`.
