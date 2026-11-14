# Pin reminders — design

Date: 2026-11-14. Status: approved in brainstorm 2026-11-14 (user decisions, same day); not implemented. Scope: a pin on Home can carry one reminder time; when it comes due Goetia announces it once and marks the pin due until the user acts. Extends `2026-08-25-pinned-messages-design.md`; capture, ordering, Done/unpin, sealing and `pins:open` are untouched.

## Problem

Pins are the user's todo list, but the list is passive. A pin is seen only when Home is open, and the rail's tally says how many pins exist, not that one of them matters now. "Come back to this after lunch" has nowhere to live, so the user either keeps Home open or forgets.

## Threat model

Small, and stated first because it adds a channel and a new place pinned text is shown.

- **One new shell-only channel, `pins:remindMenu { id }`.** It carries a pin id and nothing else: main builds the menu and computes the time, so no page-shaped timestamp ever reaches the store. A compromised shell renderer gains the ability to set or clear a reminder on an existing pin — less than `pins:unpin` already gives it. Shell-only, so refused while locked.
- **No service-side reach.** A service page cannot create, move or fire a reminder: there is no service channel, and the reminder is not `NotificationRouter`'s.
- **Pinned text reaches a banner.** The announcement shows the pin's note and message — content the user chose to keep, already sealed in `pins.json` — in a native banner, and so in Notification Center. Someone looking at the screen at that minute sees it, exactly as with a message banner. While locked the banner is `redactBanner`'d to the service name and its click only shows the window; the lock is re-checked at click time, as the download banner does.
- **Page-fed text.** The message was selected in a page at pin time and clamped to `PIN_TEXT_MAX`. It is shown through `Notification` (plain text) and the toast layer's `textContent`, the two sinks the download announcement already uses.
- **Bounded.** One announcement per fire and one per reminder, so the worst case is `PIN_CAP` announcements over the life of 50 pins, each set by a click.

Not a guarded action: setting a reminder harms nobody and is undone by the same menu.

## Decisions

- **Two times, the mute menu's** (user decision, option A of 3): `In 1 hour` and `Tomorrow 08:00`, computed by `muteExpiry` so the after-midnight rule comes with it. Rejected: adding `In 3 hours`, and a custom date-time picker — the only option needing new UI.
- **Both menus name the time** (user decision, on reviewing this spec): the reminder says `Tomorrow 08:00`, so the mute menus' `Until tomorrow` became `Until tomorrow 08:00` the same day — the words the Unmute label already printed after choosing it. Both are written from `TOMORROW_AT` (`shared/mute.ts`), so neither can drift from `TOMORROW_HOUR`.
- **A reminder always announces; silence only takes its sound** (user decision, option A of 3). The user picked the time, so mute and quiet hours never hold or drop it. They do make it silent. Rejected: holding it until the silence ends, and sounding regardless like an alarm.
- **A mute that ends on the reminder's instant ends first** (user decision, after the build): `Until tomorrow 08:00` and `Tomorrow 08:00` are the same instant on two timers that nothing orders, and after a sleep only the reminder re-arms on resume, so the reminder could be silenced by a mute that had already run out. The announcement ends expired mutes itself before it reads the sound.
- **The rail says "due" with a clock in the tally** (user decision, variant B of 3, reviewed as a mock in the app's tokens with the top rail). While any pin is due the tally's pin glyph becomes a clock; count, colour and shape are unchanged. Rejected: no rail change (a missed banner leaves nothing in view), and an accent dot on the tally (the gear's update mark, one tile away from the unread badges).
- **One announcement per reminder; the due mark is what persists.** The announcement is transient, the mark on the row and the tally is durable, and nothing re-announces at the next launch.
- **One announcement per fire.** Two pins set to `Tomorrow 08:00` come due in the same instant, so several due together raise one summary whose click opens Home.
- **In front it is the toast, otherwise the banner** — the 2026-11-10 download rule (`announceVia`), reused as is. This was not drawn in the mock, which showed banners only. It applies to a single due pin; a summary has no service chip for the card and stays a banner (named trade-off).
- **A reminder toast shares the download toast's single slot** (named trade-off): a download finishing within its 8 s replaces it unseen, and the due mark on the row and the tally is what remains.
- **The pin does not move** when it comes due. Position is the user's priority order and pin 0 is "in progress" by position alone.
- **Opening a due pin acknowledges it.** A reminder still in the future survives an open: the user looked early and may still want the nudge.

## Data model

`Pin` (`src/main/lib/pin-rules.ts`) gains two fields:

```ts
/** when to remind, epoch ms; 0 = none */
remindAt: number;
/** announced already; false again whenever remindAt is set */
reminded: boolean;
```

`parsePins` reads a missing or malformed `remindAt` as `0` and `reminded` as `false`, so today's sealed files load unchanged and nothing migrates. `PinView` gains `remindAt` only.

A pin is in one of three states, derived and never stored:

| State | Condition | Row | Tally |
| --- | --- | --- | --- |
| None | `remindAt === 0` | bare clock | pin glyph |
| Scheduled | `remindAt > now` | clock + `16:00` or `tomorrow 08:00` | pin glyph |
| Due | `0 < remindAt <= now` | clock + `due 14:30`, accent, semibold | clock glyph |

`reminded` gates the announcement and nothing else: a due pin stays due whether or not it has been announced.

## Rules

Pure, in `src/main/lib/pin-reminder-rules.ts`, unit-tested:

- `REMIND_CHOICES` — `{ kind: 'hour', label: 'In 1 hour' }`, `{ kind: 'tomorrow', label: 'Tomorrow 08:00' }`. Its own table because the labels differ from `MUTE_CHOICES`; the time is `muteExpiry(kind, now)` and the second label is `TOMORROW_AT` capitalised.
- `reminderMenu(pin)` — the two choices, plus a separator and `Clear reminder` when `remindAt > 0`.
- `nextReminder(pins)` — the earliest `remindAt` among pins with `remindAt > 0 && !reminded`, or `null`. It may be in the past; the controller then fires at once.
- `dueReminders(pins, now)` — pins with `!reminded && 0 < remindAt <= now`, in board order.
- `reminderNotice(due, serviceName)` — one pin: title `Reminder · <conversation, else service name>`, body `<note> — <text>`, or the text alone with no note. Several: title `<n> pinned reminders are due`, body `Open Home to see them`.

Process-agnostic, in `src/shared/pins.ts`, because the renderer labels rows:

- `isDue(remindAt, now)`.
- `reminderLabel(remindAt, now)` — `''`, `16:00`, `tomorrow 08:00`, `due 14:30`, or `due 13 Nov` when it came due on an earlier day. `hhmm` and `sameDay` are exported from `shared/mute.ts` rather than copied.

## Store

`PinStore` gains:

- `setReminder(id, remindAt)` — `0` clears. Sets `reminded: false`. Refused when the file is unreadable, the id is unknown or nothing changes; one write.
- `markReminded(ids)` — one write for the whole fire.

Done and unpin remove the pin and its reminder with it; Undo restores both. Purge and banish leave reminders alone, as they leave pins.

## Controller

`PinReminderController` (`src/main/pin-reminders.ts`), `MuteTimerController`'s shape: one timer for `nextReminder`, nothing stored, the due set recomputed from the store and the clock on every fire.

- `start()` fires whatever came due while Goetia was closed, then arms.
- `rearm()` runs after every change that can move the earliest reminder: a menu choice, unpin, restore, and an open that clears.
- A fire asks `dueReminders`; if any, it calls `announce(due)` and re-arms. A late fire after system sleep self-corrects for the same reason the mute timer's does.
- The delay is clamped to `setTimeout`'s 32-bit ceiling; a far-future time in a hand-edited file fires with nothing due and re-arms.
- A system resume re-arms, because a timer set before sleep can fire late.
- A throw while announcing is noted (`[notifications] reminder announce failed`) instead of escaping `start()` or the timer. It is retried, no sooner than a minute later, only if the pins were left unmarked; on the realistic failure — the store's write throwing after memory was marked — that reminder is not announced, and its due mark shows on the next broadcast.
- `dispose()` clears the timer at quit.

## Announcement

The tail is `announceReminders` in `src/main/pin-reminders.ts`, Electron-free with its dependencies injected by `index.ts`, over the rules:

1. `pins.markReminded(ids)`, then broadcast — the rows and the tally turn due in the same frame the announcement appears.
2. `endExpiredMutes()` — `MuteTimerController.expireDue()`, so a timed mute already past its expiry is gone before the sound is read. `muted` stays the only field the sound rule reads.
3. `reminderNotice(due, …)`.
4. One pin, and `announceVia({ ...inFront(), locked })` answers `toast`: `toastLayer.show` with the service chip, the notice's two lines and the action `Open`. The action opens the pin; `unavailable` falls back to the banner.
5. Otherwise a native banner, held on its own `BannerShelf` so the click cannot be collected, closed at quit like the download shelf.

| Situation | Announcement | Click |
| --- | --- | --- |
| One pin, window focused, unlocked | Toast, 8 s | `Open` opens the conversation |
| One pin, window hidden, minimized or behind another app | Banner with the service icon | Shows the window, opens the conversation |
| Several pins in one fire | One summary banner | Shows the window, opens Home |
| Locked | `redactBanner`: service name (`Goetia` for a summary), no body | Shows the window only |
| Muted or quiet hours | As above, silent | As above |

"Opens the conversation" is the `pins:open` handler's body, extracted to one function both callers share, so it stays `resolveBannerClick` verbatim. A banished pin's reminder still fires and its click is `show-only`, as its row's is.

Sound is decided by the existing pair and nothing new: the banner is `soundOptions({ enabled: notificationSound && shouldNotify({ serviceMuted, globalMuted, quietNow }), synthetic: true })`. `shouldNotify` is consulted for the sound alone and never gates the banner. The toast is silent, as the download toast is. A summary uses the global half only.

The reminder is not `NotificationRouter`'s: no activity log, no throttle, no banner registry, no dead-banner sweep. `aggregateBadges` and the dock badge never learn about it.

## IPC

`pins:remindMenu { id }`, added to `SHELL_ONLY_CHANNELS`. The handler looks the pin up, pops `reminderMenu` as a native menu on the shell window — the bell's `global:muteMenu` pattern — and each item runs `setReminder`, broadcasts and re-arms. A pin removed since Home rendered is a no-op.

`pins:open` additionally clears a due reminder before opening.

## Renderer

- **`PinnedBand`**: a clock button left of the copy button on every row and on the In progress card, `aria-label` from the state (`Remind me`, `Reminder 16:00, change`, `Reminder due 14:30, change`). Scheduled shows the label in `text-2`; due shows it in accent, semibold. Click sends `pins:remindMenu`. The row keeps its one line: the label is `flex-none`, the message still truncates.
- **`Rail`**: the tally renders a clock instead of `PinIcon` while `pins.some(isDue)`, and its tooltip reads `4 pinned · 1 due — open Home`. No count circle, no dot, no pulse: the pulse still means "a pin just landed".

Both read the clock at render; main's broadcast at fire time is what re-renders them, as the bell's timed-mute label already works.

## Testing

- `pin-reminder-rules.test.ts`: the menu with and without a reminder; `nextReminder` skipping reminded and unset pins; `dueReminders` at the boundary; both notice shapes, with and without a note and a conversation.
- `pin-rules.test.ts`: `parsePins` defaulting both fields; `pinViews` carrying `remindAt`; `reminderLabel` for each state and across midnight.
- `pins.test.ts`: `setReminder` persisting and resetting `reminded`; refused when unreadable; Undo restoring a reminder.
- `pin-reminders.test.ts`: fake timers — arms for the earliest, fires once, re-arms, announces at `start()` what came due while closed, nothing after `dispose()`. A mute and a reminder on one instant, the reminder's timer armed first, still sounds.
- `ipc-sender-policy.test.ts`, `lock-ipc-policy.test.ts`: the new channel is shell-only and refused while locked.
- e2e `pin-reminders.spec.ts`: a seeded reminder a moment ahead turns its row and the tally due without a click and, with `GOETIA_E2E_IN_FRONT=1`, raises the toast; a seeded past reminder is due at launch; opening the due pin clears the mark. The native menu and the banner cannot be driven by Playwright and stay manual.

## Docs

`docs/FEATURES.md` gains the reminder in the pins entry. `CLAUDE.md`'s pins paragraph gains the invariants: main computes the time; one announcement per reminder and per fire; the due mark is derived, not stored; silence takes the sound and never the announcement; the tally's clock is not a badge.

## Out of scope

Custom times and `In 3 hours`; repeating reminders; snoozing from the banner; a sound on the toast; a summary toast; a due count on the dock badge; reminders on Recent rows.
