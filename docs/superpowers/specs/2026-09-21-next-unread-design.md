# Jump to next unread — design

Date: 2026-09-21. Status: approved in brainstorm (user decision, same day); not implemented. Scope: one chord pair that walks the rail to the next or previous service with an unread badge, from the keyboard, inside a service page or on Home. No new state, no page injection.

## Problem

Getting to what came in means reading the rail for badges and then `⌘/Ctrl 1…9` or a click — a look-then-aim step every time a badge appears. Every tabbed client offers "next unread" for exactly this; Goetia's services are its tabs.

## Decisions

- **Chord**: `⌘/Ctrl ⇧ ]` next, `⌘/Ctrl ⇧ [` previous (user decision, option 1 of 3) — the browser next-tab convention, right-hand, clear of the OS-owned `⌘⇧Q/W/Z/X/C/V/T/R`. Rejected: a single forward-only `⌘⇧U`; `Ctrl Tab`, which users expect to cycle every service.
- **Order**: rail order from the active tile, wrapping (user decision, option 1 of 2). Predictable and the `⌘1…9` mental model; muted services take part because their badges still count (mute is silence, never blindness). Rejected: direct-first, which sends the cursor around the rail.
- **Nothing unread, or only the active service is**: a silent no-op (user decision, option 1 of 2). The rail already shows no badges, and a shell toast is invisible under the service page.
- **Held key does not repeat.** A held `⌘⇧]` jumps once, like Home; only zoom and reload repeat.
- **One implementation** (the `commands.ts` rule): the menu items under `Go`, the in-view `before-input-event` interceptor and the shell's own accelerator all run `{ kind: 'unread', step }`.

## Rule

`src/main/lib/unread-jump.ts`:

```ts
/** The next (step 1) or previous (step -1) service after `active` in rail
 *  order with any unread, wrapping; null when none, or when only `active`
 *  has unread. An `active` not in `order` (Home on a fresh profile) starts
 *  the walk before the first tile. */
export function nextUnread(
  order: ServiceId[],           // enabled services, rail order
  active: ServiceId,
  unread: (id: ServiceId) => Counts,
  step: 1 | -1,
): ServiceId | null;
```

Unread means `direct + indirect > 0`, read from `ctx.state.runtime(id).unread` — the same counts the badges draw.

## Wiring

- `shared/shortcuts.ts`: `nextUnread: 'CmdOrCtrl+Shift+]'`, `prevUnread: 'CmdOrCtrl+Shift+['`.
- `lib/shortcuts.ts`: `ShellCommand` gains `{ kind: 'unread'; step: 1 | -1 }`; `FIXED` maps both; `CODES` learns `]` → `BracketRight` and `[` → `BracketLeft`, because with Shift held a US layout reports the character as `}` and `{` — the physical-key fallback is what matches.
- `commands.ts`: `case 'unread'` computes the target from `settings.order` minus `disabled`, `state.activeId` and the runtime counts; a null target returns; otherwise `win.show()` + `activateService`, exactly the `service` case's tail (so Home and any overlay close, and the surface is remembered).
- `menu.ts`: `Go ▸ Next Unread` and `Previous Unread` after Quick Switcher.
- Settings → Shortcuts, Navigate group: `⌘⇧] / ⌘⇧[` — `next / previous service with unread`.

## Testing

- `tests/unit/unread-jump.test.ts`: next and previous from the middle; wrap at both ends; skips the active tile even when it has unread; null with nothing unread; null when only the active tile has unread; `active` not in order starts before the first tile (next) or after the last (previous); a single-service rail is always null.
- `tests/unit/shortcuts.test.ts`: `]`/`[` with `⌘⇧` on darwin and `Ctrl⇧` elsewhere map to `unread` ±1; the shifted characters `}`/`{` match through `BracketRight`/`BracketLeft`; the table pins the two accelerators.
- `tests/e2e/shortcuts.spec.ts`: a profile with telegram active and zalo enabled; the e2e boot hook already gives zalo three direct unread. `⌘/Ctrl ⇧ ]` emitted on the telegram view lands on zalo (`aria-current="page"` on its tile); a second press is a no-op (zalo is the only unread and is active).

## Out of scope

- Marking a service read, or clearing badges — the page owns that.
- Cycling every service (`Ctrl Tab`).

## Amendment (2026-09-21, same day): conversations, not services

The first cut landed on the service; the user wanted the chord to land in the conversation, the way a ⌘K row does (user decision). Main knows conversations only through the banner stream — the activity log the ⌘K rows read — so that is what the jump walks, and every open goes through `openActivityEntry`, the tail shared by banners, ⌘K rows and the lock's parked click. Nothing in that tail, in `resolveBannerClick`, in the lanes or in the log changes; the jump is one more caller.

- **Targets** (`unreadTargets` in `lib/unread-jump.ts`): the recents rows (`ActivityLog.recent()`, newest first, one per conversation) whose service is on the rail and currently has unread — a service with a clear badge has nothing unread to show, whatever it raised earlier — followed by badge-only services in rail order: a service with a badge but no row this session (messages arrived while Goetia was closed, or the log rotated). So a badge is always reachable: as its conversations when the log knows them, as the service otherwise.
- **Cursor**: `MainState.unreadCursor`, the key of the target the last jump opened (`e:<entryId>` or `s:<serviceId>`), in-memory and never broadcast. `⌘⇧]` opens the target after it, `⌘⇧[` the one before, wrapping; no cursor or a cursor no longer in the list starts at the newest (or the last, going back); a lone target that is the cursor itself is a no-op.
- **Open**: an entry target runs `openActivityEntry(ctx, entry)` with the entry as the log holds it now; a service target runs the old `activateService` tail. Both `win.show()` first.
- **The service-only jump is removed**; `nextUnread` goes with it.
- **e2e**: the boot hook under `--goetia-e2e` also appends one zalo activity row, so the shortcuts spec exercises the entry path (zalo has no view at that point, so the row resolves to plain activation — the tile still lands on zalo).
