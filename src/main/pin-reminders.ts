import type { ServiceId } from '../shared/types';
import { announceVia } from './lib/download-rules';
import { redactBanner } from './lib/lock-rules';
import { dueReminders, nextReminder, reminderNotice } from './lib/pin-reminder-rules';
import type { Pin } from './lib/pin-rules';

/** Fire just past the time, never marginally before it. */
const FIRE_SLACK_MS = 250;
/** setTimeout's ceiling; a longer delay would fire at once. */
const MAX_TIMER_MS = 2 ** 31 - 1;
/** Floor between retries when an announce threw, so unmarked pins cannot spin. */
const ANNOUNCE_RETRY_MS = 60_000;

/** One timer for the earliest pin reminder, re-armed on every fire and on
 *  every change that can move it (the handlers call rearm). Nothing is stored
 *  here: the due set is recomputed from the board and the clock on each fire,
 *  so a late fire after sleep self-corrects, and start() announces what came
 *  due while the app was closed. MuteTimerController's shape. `announce` must
 *  mark the pins reminded — an unmarked one is due again on the next arm. A
 *  throw from `announce` is contained and noted, never escaping start() or
 *  the timer; it is retried, no sooner than ANNOUNCE_RETRY_MS, only if it
 *  left the pins unmarked. */
export class PinReminderController {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retryAt = 0;

  constructor(
    private readonly opts: {
      pins: () => readonly Pin[];
      announce: (due: Pin[]) => void;
      note: (line: string) => void;
    },
  ) {}

  start(): void {
    this.fireDue();
    this.rearm();
  }

  rearm(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const next = nextReminder(this.opts.pins());
    if (next === null) return;
    const delay = Math.min(
      Math.max(0, Math.max(next, this.retryAt) - Date.now()) + FIRE_SLACK_MS,
      MAX_TIMER_MS,
    );
    this.timer = setTimeout(() => {
      this.timer = null;
      this.fireDue();
      this.rearm();
    }, delay);
  }

  private fireDue(): void {
    const due = dueReminders(this.opts.pins(), Date.now());
    if (due.length === 0) return;
    try {
      this.opts.announce(due);
    } catch (err) {
      this.opts.note(`reminder announce failed: ${err}`);
      this.retryAt = Date.now() + ANNOUNCE_RETRY_MS;
    }
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

export interface ReminderBanner {
  title: string;
  body: string;
  silent: boolean;
  sound?: string;
  icon?: string;
  onClick(): void;
}

export interface ReminderToast {
  serviceId: ServiceId;
  small: string;
  main: string;
  action: string;
}

export interface ReminderAnnounceDeps {
  /** one write for the whole fire; must run first — see announceReminders */
  markReminded(ids: number[]): void;
  broadcast(): void;
  /** ends a timed mute already past its expiry, before `sound` reads it */
  endExpiredMutes(): void;
  serviceName(id: ServiceId): string;
  locked(): boolean;
  /** the shell window right now; all false once it is destroyed */
  inFront(): { visible: boolean; minimized: boolean; focused: boolean };
  /** silence takes the sound and never the announcement; null = a summary */
  sound(serviceId: ServiceId | null): { silent: boolean; sound?: string };
  icon(id: ServiceId): string | undefined;
  /** raises the native banner; the click runs `onClick` */
  notify(banner: ReminderBanner): void;
  /** the in-app toast above the service page; `unavailable` runs if the
   *  layer cannot show it, and is the banner */
  toast(card: ReminderToast, on: { action(): void; unavailable(): void }): void;
  showWindow(): void;
  openPin(id: number): void;
  openHome(): void;
}

export function announceReminders(deps: ReminderAnnounceDeps, due: Pin[]): void {
  // first: an unmarked reminder is due again on the next arm
  deps.markReminded(due.map((p) => p.id));
  deps.broadcast();
  // `Until tomorrow 08:00` and `Tomorrow 08:00` are two timers on one instant:
  // unmute first, or the reminder is silenced by a mute that has already run out
  deps.endExpiredMutes();
  const notice = reminderNotice(due, (id) => deps.serviceName(id));
  const { pin } = notice;
  const act = () => {
    deps.showWindow();
    // re-checked at click time: a banner clicked hours later must not
    // open a conversation past a lock that has since engaged
    if (deps.locked()) return;
    if (pin) deps.openPin(pin.id);
    else deps.openHome();
  };
  const banner = () => {
    // read here, not above: the toast's fallback can run after a lock engaged
    const shown = deps.locked()
      ? redactBanner(pin ? deps.serviceName(pin.serviceId) : 'Goetia')
      : notice;
    const icon = pin ? deps.icon(pin.serviceId) : undefined;
    deps.notify({
      title: shown.title,
      body: shown.body,
      ...deps.sound(pin ? pin.serviceId : null),
      ...(icon ? { icon } : {}),
      onClick: act,
    });
  };
  // a summary has no service chip for the card, so it is always the banner
  if (pin && announceVia({ ...deps.inFront(), locked: deps.locked() }) === 'toast') {
    deps.toast(
      { serviceId: pin.serviceId, small: notice.title, main: notice.body, action: 'Open' },
      { action: act, unavailable: banner },
    );
    return;
  }
  banner();
}
