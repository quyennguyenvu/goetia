# Pin reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pin on Home can carry one reminder time; when it comes due Goetia announces it once and marks the pin due, on its row and in the rail's tally, until the user acts.

**Architecture:** `remindAt` and `reminded` ride each `Pin` in the sealed `pins.json`. Pure rules (`lib/pin-reminder-rules.ts`, `shared/pins.ts`) decide the menu, the next fire, the due set, the announcement's words and its sound. `PinReminderController` (one timer, `MuteTimerController`'s shape) fires them, and one tail in `index.ts` marks the pins reminded and raises the toast or the banner. The renderer only asks for the menu (`pins:remindMenu { id }`) and labels what main broadcasts.

**Tech Stack:** TypeScript, Electron 43 (`Notification`, `Menu`), React + Tailwind (shell renderer), vitest (fake timers), Playwright-Electron, biome.

**Spec:** `docs/superpowers/specs/2026-11-14-pin-reminders-design.md`

## Global Constraints

- Definition of done: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` all green, plus `corepack pnpm e2e` (this touches main wiring, the boot path and the renderer).
- Run heavy toolchain commands (typecheck, test suites, e2e, builds) one at a time from the main thread, never in parallel subagents and never while another is running.
- E2E commands need `ELECTRON_RUN_AS_NODE` unset: prefix them with `env -u ELECTRON_RUN_AS_NODE`. Run one spec with `npx playwright test <spec>` after `corepack pnpm exec electron-vite build`; `pnpm e2e -- <spec>` runs the whole suite.
- No `git commit` from the plan. There are no per-task commit steps; the last task stops and asks the user to run `/grimoire:seal`.
- **One new IPC channel, `pins:remindMenu { id }`, shell-only.** It carries a pin id and nothing else. Main builds the menu and computes the time with `muteExpiry`; no timestamp crosses IPC.
- **Not `NotificationRouter`'s.** No activity log, no throttle, no `BannerRegistry`, no badge. `aggregateBadges`, `shouldNotify`, `audioMuted` and the quiet-hours rules are not edited.
- **Silence takes the sound, never the announcement.** `shouldNotify` is consulted for `silent` alone.
- **One announcement per reminder and one per fire.** The announce tail marks pins reminded before anything else.
- **Due is derived, never stored:** `0 < remindAt <= now`.
- The tally's due mark is a clock in place of the pin glyph: no count circle, no dot, no pulse.
- Copy, verbatim: `In 1 hour`, `Tomorrow 08:00`, `Clear reminder`, `Remind me`, `Reminder · <conversation or service>`, `<n> pinned reminders are due`, `Open Home to see them`, toast action `Open`.
- No Diagnostics line for a reminder set, cleared or announced — a success is not evidence. A banner's `failed` event notes `[notifications] reminder banner: <err>`.
- `src/shared/**` stays process-agnostic: no `electron`, no DOM imports.
- Pure decisions live in `lib/` helpers with vitest tests; `ipc-handlers.ts`, `activate.ts` and `index.ts` stay thin wiring.
- Every timer added is cleared on re-arm, on `dispose()` and on quit.
- Comments explain why, concisely, matching the surrounding file's density.
- Any edited Markdown passes `npx markdownlint-cli2 <file>`; never hard-wrap prose (MD013 is off in this repo).
- If `corepack pnpm lint` reports only formatting, import order or an unused import in files this plan touched, fix with `corepack pnpm exec biome check --write <those files>`.

## File structure

| File | Responsibility |
| --- | --- |
| `src/shared/mute.ts` (modify) | exports `hhmm`, `sameDay`, `MONTHS` for the label rules |
| `src/shared/calls-off.ts` (modify) | imports `hhmm` and `MONTHS` instead of its own copies |
| `src/shared/pins.ts` (modify) | `isDue`, `reminderLabel` — what the renderer needs |
| `src/shared/types.ts` (modify) | `PinView.remindAt` |
| `src/main/lib/pin-rules.ts` (modify) | `Pin.remindAt`, `Pin.reminded`, tolerant parse, view |
| `src/main/lib/pin-reminder-rules.ts` (create) | menu, next fire, due set, notice, sound |
| `src/main/pins.ts` (modify) | `setReminder`, `markReminded` |
| `src/main/pin-reminders.ts` (create) | `PinReminderController`, the one timer |
| `src/shared/ipc.ts` (modify) | the `pins:remindMenu` channel, shell-only |
| `src/main/activate.ts` (modify) | `openPin`, shared by Home, the toast and the banner |
| `src/main/ipc-handlers.ts` (modify) | `AppContext.reminders`, the menu handler, re-arms |
| `src/main/index.ts` (modify) | the announce tail, start, dispose |
| `src/renderer/src/components/ClockIcon.tsx` (create) | the clock glyph, shared by the row and the tally |
| `src/renderer/src/components/welcome/PinnedBand.tsx` (modify) | the clock button and its label |
| `src/renderer/src/components/Rail.tsx` (modify) | the tally's clock while a pin is due |

---

### Task 1: Data model, labels and pure rules

**Files:**

- Modify: `src/shared/mute.ts`, `src/shared/calls-off.ts`, `src/shared/pins.ts`, `src/shared/types.ts`, `src/main/lib/pin-rules.ts`, `src/main/pins.ts`
- Create: `src/main/lib/pin-reminder-rules.ts`
- Test: `tests/unit/pin-rules.test.ts`, `tests/unit/lock-state.test.ts`, create `tests/unit/pin-reminder-rules.test.ts`

**Interfaces:**

- Consumes: `muteExpiry`, `MuteFor`, `TOMORROW_AT` (`shared/mute.ts`); `shouldNotify`, `soundOptions` (`lib/notification-rules.ts`).
- Produces: `Pin.remindAt: number`, `Pin.reminded: boolean`, `PinView.remindAt: number`; `isDue(remindAt: number, now: number): boolean`; `reminderLabel(remindAt: number, now: Date): string`; `REMIND_CHOICES`; `RemindKind`; `ReminderMenuItem`; `reminderMenu(pin): ReminderMenuItem[]`; `nextReminder(pins): number | null`; `dueReminders(pins, now): Pin[]`; `ReminderNotice { title; body; pin: Pin | null }`; `reminderNotice(due, serviceName): ReminderNotice`; `reminderSound(o): { silent: boolean; sound?: string }`.

- [ ] **Step 1: Update the pin fixtures and write the failing tests**

In `tests/unit/pin-rules.test.ts`, change the shared-pins import and the `pin` helper, and replace the `pinViews` expectation:

```ts
import { isDue, PIN_TEXT_MAX, pinCopyText, reminderLabel } from '../../src/shared/pins';
```

```ts
const pin = (over: Partial<Pin> = {}): Pin => ({
  id: 1,
  serviceId: 'zalo',
  text: 'hello',
  note: '',
  conversation: '',
  href: 'https://chat.zalo.me/',
  at: 5,
  remindAt: 0,
  reminded: false,
  ...over,
});
```

```ts
describe('pinViews', () => {
  it('never exposes hrefs to the renderer', () => {
    const views = pinViews([pin({ conversation: 'Mẹ', remindAt: 9_000, reminded: true })]);
    expect(views).toEqual([
      {
        id: 1,
        serviceId: 'zalo',
        text: 'hello',
        note: '',
        conversation: 'Mẹ',
        at: 5,
        remindAt: 9_000,
      },
    ]);
    expect('href' in views[0]).toBe(false);
    // reminded gates the announcement in main; the renderer derives "due"
    expect('reminded' in views[0]).toBe(false);
  });
});
```

Add inside `describe('parsePins', …)`:

```ts
  it('reads a reminder, and defaults a missing or malformed one to none', () => {
    const base = { id: 1, serviceId: 'zalo', text: 'x', href: 'https://chat.zalo.me/', at: 5 };
    expect(parsePins([{ ...base, remindAt: 9_000, reminded: true }], KNOWN)).toEqual([
      pin({ text: 'x', remindAt: 9_000, reminded: true }),
    ]);
    for (const bad of [undefined, 'soon', -1, Number.NaN]) {
      expect(parsePins([{ ...base, remindAt: bad, reminded: true }], KNOWN)).toEqual([
        pin({ text: 'x' }),
      ]);
    }
  });
```

Add at the end of the file:

```ts
describe('isDue', () => {
  it('is due from the instant it passes, and never with no reminder', () => {
    expect(isDue(0, 5_000)).toBe(false);
    expect(isDue(5_001, 5_000)).toBe(false);
    expect(isDue(5_000, 5_000)).toBe(true);
    expect(isDue(1, 5_000)).toBe(true);
  });
});

describe('reminderLabel', () => {
  const now = new Date(2026, 10, 14, 15, 0); // 14 Nov 2026, 15:00 local
  const at = (d: number, h: number, m: number) => new Date(2026, 10, d, h, m).getTime();

  it('is empty with no reminder', () => {
    expect(reminderLabel(0, now)).toBe('');
  });

  it('names the time while scheduled', () => {
    expect(reminderLabel(at(14, 16, 0), now)).toBe('16:00');
    expect(reminderLabel(at(15, 8, 0), now)).toBe('tomorrow 08:00');
  });

  it('reads due from the minute it passes, dated once the day has turned', () => {
    expect(reminderLabel(now.getTime(), now)).toBe('due 15:00');
    expect(reminderLabel(at(14, 14, 30), now)).toBe('due 14:30');
    expect(reminderLabel(at(13, 14, 30), now)).toBe('due 13 Nov');
  });
});
```

In `tests/unit/lock-state.test.ts`, add the field to the `pin` helper:

```ts
const pin = (id: number): PinView => ({
  id,
  serviceId: 'whatsapp',
  text: 'the rent is due friday',
  note: '',
  conversation: 'Landlord',
  at: 1,
  remindAt: 0,
});
```

Create `tests/unit/pin-reminder-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  dueReminders,
  nextReminder,
  REMIND_CHOICES,
  reminderMenu,
  reminderNotice,
  reminderSound,
} from '../../src/main/lib/pin-reminder-rules';
import type { Pin } from '../../src/main/lib/pin-rules';
import type { ServiceId } from '../../src/shared/types';

const pin = (over: Partial<Pin> = {}): Pin => ({
  id: 1,
  serviceId: 'zalo',
  text: 'Gửi lại báo giá',
  note: '',
  conversation: '',
  href: 'https://chat.zalo.me/',
  at: 5,
  remindAt: 0,
  reminded: false,
  ...over,
});

const name = (id: ServiceId) => (id === 'zalo' ? 'Zalo' : 'Messenger');

describe('REMIND_CHOICES', () => {
  it('offers the mute menu’s two times, worded for a reminder', () => {
    expect(REMIND_CHOICES.map((c) => [c.kind, c.label])).toEqual([
      ['hour', 'In 1 hour'],
      ['tomorrow', 'Tomorrow 08:00'],
    ]);
  });
});

describe('reminderMenu', () => {
  it('is the two choices while nothing is set', () => {
    expect(reminderMenu(pin()).map((i) => i.type)).toEqual(['choice', 'choice']);
  });

  it('adds Clear once a reminder is set, scheduled or due', () => {
    const items = reminderMenu(pin({ remindAt: 9_000 }));
    expect(items.map((i) => i.type)).toEqual(['choice', 'choice', 'separator', 'clear']);
    expect(items[3]).toEqual({ type: 'clear', label: 'Clear reminder' });
  });
});

describe('nextReminder', () => {
  it('is the earliest reminder not yet announced', () => {
    const pins = [
      pin({ id: 1, remindAt: 9_000 }),
      pin({ id: 2, remindAt: 4_000 }),
      pin({ id: 3, remindAt: 1_000, reminded: true }),
      pin({ id: 4 }),
    ];
    expect(nextReminder(pins)).toBe(4_000);
  });

  it('is null with nothing to announce', () => {
    expect(nextReminder([pin(), pin({ id: 2, remindAt: 1_000, reminded: true })])).toBeNull();
  });
});

describe('dueReminders', () => {
  it('takes what has come due and was not announced, in board order', () => {
    const pins = [
      pin({ id: 1, remindAt: 5_000 }),
      pin({ id: 2, remindAt: 5_001 }),
      pin({ id: 3, remindAt: 2_000, reminded: true }),
      pin({ id: 4, remindAt: 1_000 }),
      pin({ id: 5 }),
    ];
    expect(dueReminders(pins, 5_000).map((p) => p.id)).toEqual([1, 4]);
  });
});

describe('reminderNotice', () => {
  it('names the conversation and leads with the note', () => {
    const due = [pin({ conversation: 'Nhóm Sale Q7', note: 'after lunch' })];
    expect(reminderNotice(due, name)).toEqual({
      title: 'Reminder · Nhóm Sale Q7',
      body: 'after lunch — Gửi lại báo giá',
      pin: due[0],
    });
  });

  it('falls back to the service name and the message alone', () => {
    const due = [pin({ serviceId: 'messenger' })];
    expect(reminderNotice(due, name)).toMatchObject({
      title: 'Reminder · Messenger',
      body: 'Gửi lại báo giá',
    });
  });

  it('is one summary when several came due together', () => {
    expect(reminderNotice([pin(), pin({ id: 2 }), pin({ id: 3 })], name)).toEqual({
      title: '3 pinned reminders are due',
      body: 'Open Home to see them',
      pin: null,
    });
  });
});

describe('reminderSound', () => {
  const loud = { enabled: true, serviceMuted: false, globalMuted: false, quietNow: false };

  it('sounds when nothing is silenced', () => {
    expect(reminderSound(loud)).toEqual({ silent: false, sound: 'default' });
  });

  it('is silent under any mute, quiet hours or the sound setting', () => {
    for (const quiet of [
      { serviceMuted: true },
      { globalMuted: true },
      { quietNow: true },
      { enabled: false },
    ]) {
      expect(reminderSound({ ...loud, ...quiet })).toEqual({ silent: true });
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `corepack pnpm exec vitest run tests/unit/pin-rules.test.ts tests/unit/pin-reminder-rules.test.ts`

Expected: FAIL — `pin-reminder-rules.test.ts` cannot resolve `../../src/main/lib/pin-reminder-rules`, and `pin-rules.test.ts` fails with `isDue is not a function`, `reminderLabel is not a function` and the `parsePins` / `pinViews` expectations.

- [ ] **Step 3: Export the label helpers**

In `src/shared/mute.ts`, replace the private `hhmm` and `sameDay` consts with exported ones and add `MONTHS`:

```ts
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const hhmm = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();
```

In `src/shared/calls-off.ts`, delete its own `MONTHS` and `hhmm` consts and import them instead, directly under the file's leading comment:

```ts
import { hhmm, MONTHS } from './mute';
```

- [ ] **Step 4: Add `isDue` and `reminderLabel`**

In `src/shared/pins.ts`, add the import at the top and the two functions at the end:

```ts
import { hhmm, MONTHS, sameDay } from './mute';
```

```ts
/** A reminder that has come due stays due until the user acts on the pin. */
export function isDue(remindAt: number, now: number): boolean {
  return remindAt > 0 && remindAt <= now;
}

/** The words beside a pin's clock: '' with no reminder, `16:00` or
 *  `tomorrow 08:00` while scheduled, `due 14:30` once due — `due 13 Nov` when
 *  the day has turned since. */
export function reminderLabel(remindAt: number, now: Date): string {
  if (remindAt <= 0) return '';
  const at = new Date(remindAt);
  const today = sameDay(at, now);
  if (remindAt <= now.getTime()) {
    return today ? `due ${hhmm(at)}` : `due ${at.getDate()} ${MONTHS[at.getMonth()]}`;
  }
  // shortcut: any later day reads "tomorrow" — the menu offers nothing further out; date it when a custom time lands
  return today ? hhmm(at) : `tomorrow ${hhmm(at)}`;
}
```

- [ ] **Step 5: Extend `Pin`, the parser and the view**

In `src/shared/types.ts`, add to `PinView` after `at: number;`:

```ts
  /** when the pin reminds, epoch ms; 0 = none. Due once it is past — see
   *  isDue in shared/pins.ts */
  remindAt: number;
```

In `src/main/lib/pin-rules.ts`, add to the `Pin` interface after `at: number;`:

```ts
  /** when to remind, epoch ms; 0 = none */
  remindAt: number;
  /** announced already; false again whenever remindAt is set */
  reminded: boolean;
```

Add above `parsePins`:

```ts
const reminderTime = (raw: unknown): number =>
  typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 0;
```

In `parsePins`, extend the pushed object after the `at:` line:

```ts
      at: typeof r.at === 'number' && Number.isFinite(r.at) ? r.at : 0,
      remindAt: reminderTime(r.remindAt),
      reminded: r.reminded === true && reminderTime(r.remindAt) > 0,
```

Replace `pinViews`:

```ts
/** Renderer rows: display fields and the opaque id — never the href. */
export function pinViews(pins: readonly Pin[]): PinView[] {
  return pins.map(({ id, serviceId, text, note, conversation, at, remindAt }) => ({
    id,
    serviceId,
    text,
    note,
    conversation,
    at,
    remindAt,
  }));
}
```

In `src/main/pins.ts`, extend the literal `pin()` builds after `at: input.at,`:

```ts
      at: input.at,
      remindAt: 0,
      reminded: false,
```

- [ ] **Step 6: Create the rules**

Create `src/main/lib/pin-reminder-rules.ts`:

```ts
import { type MuteFor, TOMORROW_AT } from '../../shared/mute';
import { isDue } from '../../shared/pins';
import type { ServiceId } from '../../shared/types';
import { shouldNotify, soundOptions } from './notification-rules';
import type { Pin } from './pin-rules';

export type RemindKind = Exclude<MuteFor, 'indefinite'>;

/** The times a pin offers — the mute menu's two, worded for a reminder. The
 *  time itself is muteExpiry(kind, now), so the after-midnight rule comes
 *  with it. */
export const REMIND_CHOICES: { kind: RemindKind; label: string }[] = [
  { kind: 'hour', label: 'In 1 hour' },
  { kind: 'tomorrow', label: `${TOMORROW_AT[0].toUpperCase()}${TOMORROW_AT.slice(1)}` },
];

export type ReminderMenuItem =
  | { type: 'choice'; kind: RemindKind; label: string }
  | { type: 'separator' }
  | { type: 'clear'; label: string };

/** The clock's menu on a pin row: the choices, and Clear once one is set. */
export function reminderMenu(pin: Pick<Pin, 'remindAt'>): ReminderMenuItem[] {
  const choices = REMIND_CHOICES.map((c): ReminderMenuItem => ({ type: 'choice', ...c }));
  if (pin.remindAt <= 0) return choices;
  return [...choices, { type: 'separator' }, { type: 'clear', label: 'Clear reminder' }];
}

/** The earliest reminder not yet announced, or null. It may already be past:
 *  the controller then fires at once. */
export function nextReminder(pins: readonly Pin[]): number | null {
  let next: number | null = null;
  for (const p of pins) {
    if (p.remindAt > 0 && !p.reminded && (next === null || p.remindAt < next)) next = p.remindAt;
  }
  return next;
}

/** What one fire announces, in board order. */
export function dueReminders(pins: readonly Pin[], now: number): Pin[] {
  return pins.filter((p) => !p.reminded && isDue(p.remindAt, now));
}

export interface ReminderNotice {
  title: string;
  body: string;
  /** the pin a click opens; null for a summary, whose click is Home */
  pin: Pin | null;
}

/** One announcement per fire: the pin itself when one came due, a count when
 *  several did — two pins set to "Tomorrow" share an instant. `due` is never
 *  empty: the controller announces only what dueReminders returned. */
export function reminderNotice(
  due: readonly Pin[],
  serviceName: (id: ServiceId) => string,
): ReminderNotice {
  if (due.length !== 1) {
    return {
      title: `${due.length} pinned reminders are due`,
      body: 'Open Home to see them',
      pin: null,
    };
  }
  const [pin] = due;
  return {
    title: `Reminder · ${pin.conversation || serviceName(pin.serviceId)}`,
    body: pin.note ? `${pin.note} — ${pin.text}` : pin.text,
    pin,
  };
}

/** Silence takes a reminder's sound and never the reminder: the user chose
 *  the time, so mute and quiet hours decide `silent` here and nothing else. */
export function reminderSound(o: {
  enabled: boolean;
  serviceMuted: boolean;
  globalMuted: boolean;
  quietNow: boolean;
}): { silent: boolean; sound?: string } {
  return soundOptions({ enabled: o.enabled && shouldNotify(o), synthetic: true });
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `corepack pnpm exec vitest run tests/unit/pin-rules.test.ts tests/unit/pin-reminder-rules.test.ts tests/unit/lock-state.test.ts tests/unit/calls-off.test.ts tests/unit/mute-rules.test.ts tests/unit/pins.test.ts`

Expected: PASS, every file.

- [ ] **Step 8: Typecheck**

Run: `corepack pnpm typecheck`

Expected: no output after `tsc --noEmit`. The renderer does not read `remindAt` yet, so nothing else changes.

---

### Task 2: The store's reminder methods

**Files:**

- Modify: `src/main/pins.ts`
- Test: `tests/unit/pins.test.ts`

**Interfaces:**

- Consumes: `Pin.remindAt`, `Pin.reminded` (Task 1).
- Produces: `PinStore.setReminder(id: number, remindAt: number): boolean`; `PinStore.markReminded(ids: readonly number[]): void`.

- [ ] **Step 1: Write the failing tests**

Add inside `describe('PinStore', …)` in `tests/unit/pins.test.ts`, before the closing `});`:

```ts
  it('sets, replaces and clears a reminder, and persists each', () => {
    const store = new PinStore(dir, codec);
    store.pin(input('call back'));
    expect(store.setReminder(1, 5_000)).toBe(true);
    expect(store.setReminder(1, 5_000)).toBe(false); // nothing changed
    expect(new PinStore(dir, codec).views()[0].remindAt).toBe(5_000);
    expect(store.setReminder(1, 9_000)).toBe(true);
    expect(store.setReminder(1, 0)).toBe(true);
    expect(store.setReminder(1, 0)).toBe(false); // already clear
    expect(new PinStore(dir, codec).views()[0].remindAt).toBe(0);
  });

  it('refuses a reminder for an unknown pin or a malformed time', () => {
    const store = new PinStore(dir, codec);
    store.pin(input('call back'));
    expect(store.setReminder(99, 5_000)).toBe(false);
    expect(store.setReminder(1, Number.NaN)).toBe(false);
    expect(store.setReminder(1, -1)).toBe(false);
    expect(store.views()[0].remindAt).toBe(0);
  });

  it('marks a fire reminded in one write, and a new time is a new reminder', () => {
    const store = new PinStore(dir, codec);
    store.pin(input('a'));
    store.pin(input('b'));
    store.setReminder(1, 1_000);
    store.setReminder(2, 2_000);
    store.markReminded([1]);
    expect(new PinStore(dir, codec).all().map((p) => p.reminded)).toEqual([true, false]);
    expect(store.setReminder(1, 9_000)).toBe(true);
    expect(store.get(1)?.reminded).toBe(false);
  });

  it('Undo brings a pin back with its reminder', () => {
    const store = new PinStore(dir, codec);
    store.pin(input('a'));
    store.setReminder(1, 5_000);
    store.unpin(1);
    expect(store.restore(1)).toBe(true);
    expect(store.get(1)?.remindAt).toBe(5_000);
  });

  it('refuses a reminder while the file is unreadable', () => {
    writeFileSync(
      join(dir, 'pins.json'),
      JSON.stringify({ sealed: codec.encrypt(JSON.stringify({ pins: [legacyPin] })) }),
    );
    const store = new PinStore(dir, denied);
    expect(store.isUnreadable()).toBe(true);
    expect(store.setReminder(1, 5_000)).toBe(false);
    store.markReminded([1]); // a no-op, never a write over the kept file
    expect(new PinStore(dir, codec).all()[0]?.reminded ?? false).toBe(false);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `corepack pnpm exec vitest run tests/unit/pins.test.ts`

Expected: FAIL with `store.setReminder is not a function`.

- [ ] **Step 3: Add the methods**

In `src/main/pins.ts`, add after `setNote`:

```ts
  /** 0 clears. A new time is a new reminder, so it has not been announced. */
  setReminder(id: number, remindAt: number): boolean {
    if (this.file.unreadable || !Number.isFinite(remindAt) || remindAt < 0) return false;
    const pin = this.get(id);
    if (!pin || (pin.remindAt === remindAt && !pin.reminded)) return false;
    this.pins = this.pins.map((p) => (p.id === id ? { ...p, remindAt, reminded: false } : p));
    this.save();
    return true;
  }

  /** One write for a whole fire. */
  markReminded(ids: readonly number[]): void {
    if (this.file.unreadable || ids.length === 0) return;
    const fired = new Set(ids);
    this.pins = this.pins.map((p) => (fired.has(p.id) ? { ...p, reminded: true } : p));
    this.save();
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `corepack pnpm exec vitest run tests/unit/pins.test.ts`

Expected: PASS.

---

### Task 3: The controller

**Files:**

- Create: `src/main/pin-reminders.ts`
- Test: create `tests/unit/pin-reminders.test.ts`

**Interfaces:**

- Consumes: `nextReminder(pins): number | null`, `dueReminders(pins, now): Pin[]` (Task 1).
- Produces: `class PinReminderController { constructor(opts: { pins: () => readonly Pin[]; announce: (due: Pin[]) => void }); start(): void; rearm(): void; dispose(): void }`. `announce` MUST mark the pins reminded, or the next arm fires them again.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/pin-reminders.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Pin } from '../../src/main/lib/pin-rules';
import { PinReminderController } from '../../src/main/pin-reminders';

const pin = (id: number, remindAt: number, reminded = false): Pin => ({
  id,
  serviceId: 'zalo',
  text: `pin ${id}`,
  note: '',
  conversation: '',
  href: 'https://chat.zalo.me/',
  at: 1,
  remindAt,
  reminded,
});

function harness(seed: Pin[]) {
  const board = { pins: seed };
  const fired: number[][] = [];
  const ctl = new PinReminderController({
    pins: () => board.pins,
    announce: (due) => {
      fired.push(due.map((p) => p.id));
      // the real tail marks them first; an unmarked reminder would fire again
      const ids = new Set(due.map((p) => p.id));
      board.pins = board.pins.map((p) => (ids.has(p.id) ? { ...p, reminded: true } : p));
    },
  });
  return { ctl, board, fired };
}

afterEach(() => vi.useRealTimers());

describe('PinReminderController', () => {
  it('fires once when the reminder comes due, then has nothing left to arm', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const { ctl, fired } = harness([pin(1, 70_000)]);
    ctl.start();
    vi.advanceTimersByTime(59_000);
    expect(fired).toEqual([]);
    vi.advanceTimersByTime(2_000);
    expect(fired).toEqual([[1]]);
    vi.advanceTimersByTime(3_600_000);
    expect(fired).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('announces pins that share an instant together, and later ones in order', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { ctl, fired } = harness([pin(1, 30_000), pin(2, 10_000), pin(3, 10_000)]);
    ctl.start();
    vi.advanceTimersByTime(11_000);
    expect(fired).toEqual([[2, 3]]);
    vi.advanceTimersByTime(20_000);
    expect(fired).toEqual([[2, 3], [1]]);
  });

  it('announces at start what came due while the app was closed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const { ctl, fired } = harness([pin(1, 40_000), pin(2, 50_000, true), pin(3, 0)]);
    ctl.start();
    expect(fired).toEqual([[1]]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('re-arms for a reminder set after start', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { ctl, board, fired } = harness([pin(1, 0)]);
    ctl.start();
    expect(vi.getTimerCount()).toBe(0);
    board.pins = [pin(1, 5_000)];
    ctl.rearm();
    vi.advanceTimersByTime(6_000);
    expect(fired).toEqual([[1]]);
  });

  it('waits out a time past setTimeout’s ceiling instead of firing early', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const far = 2 ** 31 + 60_000;
    const { ctl, fired } = harness([pin(1, far)]);
    ctl.start();
    vi.advanceTimersByTime(2 ** 31);
    expect(fired).toEqual([]);
    expect(vi.getTimerCount()).toBe(1); // re-armed for the remainder
    vi.advanceTimersByTime(61_000);
    expect(fired).toEqual([[1]]);
  });

  it('fires nothing after dispose', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { ctl, fired } = harness([pin(1, 5_000)]);
    ctl.start();
    ctl.dispose();
    vi.advanceTimersByTime(60_000);
    expect(fired).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm exec vitest run tests/unit/pin-reminders.test.ts`

Expected: FAIL — cannot resolve `../../src/main/pin-reminders`.

- [ ] **Step 3: Write the controller**

Create `src/main/pin-reminders.ts`:

```ts
import { dueReminders, nextReminder } from './lib/pin-reminder-rules';
import type { Pin } from './lib/pin-rules';

/** Fire just past the time, never marginally before it. */
const FIRE_SLACK_MS = 250;
/** setTimeout's ceiling; a longer delay would fire at once. */
const MAX_TIMER_MS = 2 ** 31 - 1;

/** One timer for the earliest pin reminder, re-armed on every fire and on
 *  every change that can move it (the handlers call rearm). Nothing is stored
 *  here: the due set is recomputed from the board and the clock on each fire,
 *  so a late fire after sleep self-corrects, and start() announces what came
 *  due while the app was closed. MuteTimerController's shape. `announce` must
 *  mark the pins reminded — an unmarked one is due again on the next arm. */
export class PinReminderController {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private opts: {
      pins: () => readonly Pin[];
      announce: (due: Pin[]) => void;
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
    const delay = Math.min(Math.max(0, next - Date.now()) + FIRE_SLACK_MS, MAX_TIMER_MS);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.fireDue();
      this.rearm();
    }, delay);
  }

  private fireDue(): void {
    const due = dueReminders(this.opts.pins(), Date.now());
    if (due.length > 0) this.opts.announce(due);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `corepack pnpm exec vitest run tests/unit/pin-reminders.test.ts`

Expected: PASS, 6 tests.

---

### Task 4: The channel and main's wiring

**Files:**

- Modify: `src/shared/ipc.ts`, `src/main/activate.ts`, `src/main/ipc-handlers.ts`, `src/main/index.ts`
- Test: `tests/unit/ipc-sender-policy.test.ts`, `tests/unit/lock-ipc-policy.test.ts`

**Interfaces:**

- Consumes: `PinStore.setReminder`, `PinStore.markReminded` (Task 2); `PinReminderController` (Task 3); `reminderMenu`, `reminderNotice`, `reminderSound` (Task 1); `isDue` (Task 1); existing `muteExpiry`, `announceVia`, `redactBanner`, `BannerShelf`, `toastLayer.show(card, handlers)`, `runShellCommand(ctx, { kind: 'home' })`, `performBannerAction`, `resolveBannerClick`.
- Produces: channel `'pins:remindMenu': { id: number }`; `AppContext.reminders: PinReminderController`; `openPin(ctx: AppContext, id: number): void` exported from `src/main/activate.ts`.

- [ ] **Step 1: Write the failing policy tests**

In `tests/unit/ipc-sender-policy.test.ts`, add the channel to the list in `keeps every pins:* channel shell-only`:

```ts
    const channels = [
      'pins:reorder',
      'pins:unpin',
      'pins:restore',
      'pins:setNote',
      'pins:open',
      'pins:remindMenu',
    ] as const;
```

In `tests/unit/lock-ipc-policy.test.ts`, add it to the list in `refuses every channel that serves conversation content`:

```ts
      'pins:restore',
      'pins:setNote',
      'pins:remindMenu',
    ] as const) {
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `corepack pnpm exec vitest run tests/unit/lock-ipc-policy.test.ts tests/unit/ipc-sender-policy.test.ts`

Expected: FAIL in `lock-ipc-policy.test.ts` — `expected true to be false` for `pins:remindMenu`, which is not yet shell-only.

- [ ] **Step 3: Declare the channel**

In `src/shared/ipc.ts`, three edits. In `RendererToMain`, after `'pins:open': { id: number };`:

```ts
  /** pop a pin's reminder menu; main builds it and computes the time, so no
   *  timestamp ever crosses IPC */
  'pins:remindMenu': { id: number };
```

In `R2M_CHANNELS` and again in `SHELL_ONLY_CHANNELS`, after each `'pins:open',`:

```ts
  'pins:remindMenu',
```

- [ ] **Step 4: Run the policy tests to verify they pass**

Run: `corepack pnpm exec vitest run tests/unit/lock-ipc-policy.test.ts tests/unit/ipc-sender-policy.test.ts`

Expected: PASS.

- [ ] **Step 5: Add `openPin`**

In `src/main/activate.ts`, add the import and the function after `openActivityEntry`:

```ts
import { isDue } from '../shared/pins';
```

```ts
/** A pin's open — its row on Home, a reminder's toast or its banner. The
 *  recents path, verbatim: the href is validated now, not at pin time.
 *  Opening a due pin acknowledges its reminder; one still ahead stays. */
export function openPin(ctx: AppContext, id: number): void {
  const pin = ctx.pins.get(id);
  if (!pin) return; // removed since the row or the banner was drawn
  if (isDue(pin.remindAt, Date.now()) && ctx.pins.setReminder(id, 0)) {
    ctx.reminders.rearm();
    ctx.broadcast();
  }
  const meta = serviceById(pin.serviceId);
  const action = resolveBannerClick({
    disabled: ctx.settings.get().disabled[pin.serviceId],
    hasView: ctx.views.has(pin.serviceId),
    href: pin.href,
    conversation: pin.conversation || undefined,
    serviceUrl: meta.url,
    chatPaths: meta.chatPaths,
  });
  void performBannerAction(ctx, pin.serviceId, action);
}
```

- [ ] **Step 6: Wire the handlers**

In `src/main/ipc-handlers.ts`:

Add the type import beside the other controller imports, and the rules import beside the other `./lib/` imports:

```ts
import { reminderMenu } from './lib/pin-reminder-rules';
import type { PinReminderController } from './pin-reminders';
```

Add `openPin` to the existing `./activate` import block (the one that lists `performBannerAction`).

Add to `AppContext`, after `muteTimer: MuteTimerController;`:

```ts
  /** announces a pin's reminder when it comes due; re-armed by every change
   *  that can move the earliest one */
  reminders: PinReminderController;
```

Replace the `pins:unpin`, `pins:restore` and `pins:open` handlers and add the new one:

```ts
  on('pins:unpin', ({ id }) => {
    if (!ctx.pins.unpin(id)) return;
    ctx.reminders.rearm();
    ctx.broadcast();
  });
  on('pins:restore', ({ id }) => {
    if (!ctx.pins.restore(id)) return;
    ctx.reminders.rearm();
    ctx.broadcast();
  });
  on('pins:setNote', ({ id, note }) => {
    if (ctx.pins.setNote(id, note)) ctx.broadcast();
  });
  on('pins:open', ({ id }) => openPin(ctx, id));
  on('pins:remindMenu', ({ id }) => {
    const pin = ctx.pins.get(id);
    if (!pin) return; // removed since Home rendered the row
    const set = (remindAt: number) => {
      if (!ctx.pins.setReminder(id, remindAt)) return;
      ctx.reminders.rearm();
      ctx.broadcast();
    };
    // the channel is refused while locked, so the popup needs no guard of its own
    Menu.buildFromTemplate(
      reminderMenu(pin).map((item) =>
        item.type === 'separator'
          ? { type: 'separator' as const }
          : {
              label: item.label,
              // the time is main's: nothing page-shaped reaches the store
              click: () => set(item.type === 'clear' ? 0 : muteExpiry(item.kind, new Date())),
            },
      ),
    ).popup({ window: ctx.win });
  });
```

Then run `corepack pnpm exec biome check --write src/main/ipc-handlers.ts src/main/activate.ts`. It removes the imports this left unused in `ipc-handlers.ts` (`resolveBannerClick`, `performBannerAction`, and `serviceById` only if nothing else there uses it) and sorts the new ones.

- [ ] **Step 7: Wire `index.ts`**

In `src/main/index.ts`:

Imports — change the `./activate` line and add four:

```ts
import { applyLocked, openPin } from './activate';
import { announceVia } from './lib/download-rules';
import { redactBanner } from './lib/lock-rules';
import { reminderNotice, reminderSound } from './lib/pin-reminder-rules';
import { PinReminderController } from './pin-reminders';
```

Share two closures the download announcement already had inline. Directly above `const downloads = new DownloadManager({`, add:

```ts
    const serviceIcons = resolveIcons(
      ICON_DIR,
      SERVICES.map((s) => s.id),
      process.platform,
      existsSync,
    );
    // the shell window right now; all false once it is destroyed
    const inFront = () => {
      if (win.isDestroyed()) return { visible: false, minimized: false, focused: false };
      if (e2eInFront) return { visible: true, minimized: false, focused: true };
      return { visible: win.isVisible(), minimized: win.isMinimized(), focused: win.isFocused() };
    };
```

Inside the `DownloadManager` deps, replace the whole `icons: resolveIcons(…),` entry with `icons: serviceIcons,` and the whole `inFront: () => { … },` entry with `inFront,`.

Directly after the `const muteTimer = new MuteTimerController({ … });` statement, add:

```ts
    const reminderBanners = new BannerShelf();
    // ctx is assembled below; the timer first fires from start(), after it
    const reminders = new PinReminderController({
      pins: () => pins.all(),
      announce: (due) => {
        // first: an unmarked reminder is due again on the next arm
        pins.markReminded(due.map((p) => p.id));
        broadcast();
        const notice = reminderNotice(due, (id) => serviceById(id).name);
        const { pin } = notice;
        const act = () => {
          if (win.isDestroyed()) return;
          win.show();
          // re-checked at click time: a banner clicked hours later must not
          // open a conversation past a lock that has since engaged
          if (lock.locked) return;
          if (pin) openPin(ctx, pin.id);
          else runShellCommand(ctx, { kind: 'home' });
        };
        const banner = () => {
          const s = settings.get();
          // read here, not above: the toast's fallback can run after a lock engaged
          const shown = lock.locked
            ? redactBanner(pin ? serviceById(pin.serviceId).name : 'Goetia')
            : notice;
          const icon = pin ? serviceIcons.get(pin.serviceId) : undefined;
          const n = new Notification({
            title: shown.title,
            body: shown.body,
            ...reminderSound({
              enabled: s.notificationSound,
              serviceMuted: pin ? s.muted[pin.serviceId] : false,
              globalMuted: s.globalMuted,
              quietNow: quiet.quietNow(),
            }),
            ...(icon ? { icon } : {}),
          });
          n.on('click', () => {
            reminderBanners.release(n);
            act();
          });
          n.on('failed', (_e, err) => {
            reminderBanners.release(n);
            diag.note('notifications', `reminder banner: ${err}`);
          });
          // held: an unreferenced Notification can be collected, and then its
          // click opens nothing
          reminderBanners.hold(n);
          n.show();
        };
        // a summary has no service chip for the card, so it is always the banner
        if (pin && announceVia({ ...inFront(), locked: lock.locked }) === 'toast') {
          toastLayer.show(
            { serviceId: pin.serviceId, small: notice.title, main: notice.body, action: 'Open' },
            { action: act, unavailable: banner },
          );
          return;
        }
        banner();
      },
    });
```

In the `ctx` object, after `muteTimer,`:

```ts
      reminders,
```

After the launch lock — directly below `lock.lock();` and `applyLocked(ctx, lock.locked);`, never beside `muteTimer.start()`, which runs before them (the first draft of this plan put it there, and a reminder that came due while the app was closed was announced unredacted before the lock engaged):

```ts
    // after the launch lock: start() announces what came due while closed,
    // and that announcement must already see the app locked
    reminders.start();
```

In the `before-quit` handler, after `muteTimer.dispose();` and after `downloadBanners.closeAll();` respectively:

```ts
      reminders.dispose();
```

```ts
      reminderBanners.closeAll();
```

Then run `corepack pnpm exec biome check --write src/main/index.ts`.

- [ ] **Step 8: Verify**

Run, one at a time:

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
```

Expected: `biome check` reports no fixes needed, `tsc --noEmit` prints nothing, and every unit test file passes.

---

### Task 5: The renderer, driven by an e2e spec

**Files:**

- Create: `src/renderer/src/components/ClockIcon.tsx`, `tests/e2e/pin-reminders.spec.ts`
- Modify: `src/renderer/src/components/welcome/PinnedBand.tsx`, `src/renderer/src/components/Rail.tsx`

**Interfaces:**

- Consumes: `PinView.remindAt`, `isDue`, `reminderLabel` (Task 1); the `pins:remindMenu` channel and the announce tail (Task 4).
- Produces: a button per pin row named `Remind me`, `Reminder 16:00, change` or `Reminder due 14:30, change`; the tally's `title` reading `2 pinned · 1 due — open Home` while a pin is due.

- [ ] **Step 1: Write the failing e2e spec**

Create `tests/e2e/pin-reminders.spec.ts`:

```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, type Page, test } from '@playwright/test';

const isToast = (p: Page) => p.url().includes('toast.html');
// the toast layer is a file:// page too, and a reminder due at launch raises it early
const isShell = (p: Page) =>
  p.url().startsWith('file://') && !p.url().includes('loading.html') && !isToast(p);

/** messenger + zalo summoned, two pins: zalo in progress, messenger queued.
 *  A native menu cannot be driven, so reminders are seeded by pin id. */
function seedProfile(remindAt: Record<number, number>): string {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-reminders-'));
  writeFileSync(
    join(profile, 'settings.json'),
    JSON.stringify({
      disabled: {
        whatsapp: true,
        messenger: false,
        telegram: true,
        discord: true,
        zalo: false,
        tiktok: true,
        shopee: true,
        instagram: true,
        slack: true,
        teams: true,
      },
    }),
  );
  writeFileSync(
    join(profile, 'pins.json'),
    JSON.stringify({
      pins: [
        {
          id: 1,
          serviceId: 'zalo',
          text: 'Gửi lại báo giá cho khách bên Q7',
          note: '',
          conversation: 'Nhóm Sale Q7',
          href: 'https://chat.zalo.me/',
          at: 1,
          remindAt: remindAt[1] ?? 0,
        },
        {
          id: 2,
          serviceId: 'messenger',
          text: 'review the release checklist',
          note: 'after lunch',
          conversation: '',
          href: 'https://www.facebook.com/messages/',
          at: 2,
          remindAt: remindAt[2] ?? 0,
        },
      ],
    }),
  );
  return profile;
}

/** In front always: focus cannot be relied on under Playwright, and the toast
 *  keeps a test run from posting real banners on this machine. */
async function launch(profile: string) {
  const app = await electron.launch({
    args: ['out/main/index.js', '--goetia-e2e', `--goetia-user-data=${profile}`],
    env: { ...(process.env as Record<string, string>), GOETIA_E2E_IN_FRONT: '1' },
  });
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
  await win.waitForLoadState('domcontentloaded');
  return { app, win };
}

test('pin reminders: a scheduled one turns due on its own and raises the toast', async () => {
  const { app, win } = await launch(seedProfile({ 2: Date.now() + 10_000 }));
  await win.locator('[data-testid="home-btn"]').click();
  const row = win.locator('[data-testid="pin-row"]');
  const tally = win.locator('[data-testid="pin-tally"]');

  await expect(
    row.getByRole('button', { name: /^Reminder (tomorrow )?\d\d:\d\d, change$/ }),
  ).toBeVisible();
  await expect(tally).toHaveAttribute('title', '2 pinned — open Home');
  // the pin with no reminder offers one
  await expect(
    win.locator('[data-testid="pin-altar"]').getByRole('button', { name: 'Remind me' }),
  ).toBeVisible();

  // nothing is clicked: the fire's own broadcast re-renders the row and the tally
  await expect(row.getByRole('button', { name: /^Reminder due \d\d:\d\d, change$/ })).toBeVisible({
    timeout: 30_000,
  });
  await expect(tally).toHaveAttribute('title', '2 pinned · 1 due — open Home');

  await expect.poll(() => app.windows().some(isToast), { timeout: 15_000 }).toBe(true);
  const toast = app.windows().find(isToast) as Page;
  const card = toast.getByTestId('download-toast');
  await expect(card).toContainText('Reminder · Messenger');
  await expect(card).toContainText('after lunch — review the release checklist');
  await expect(toast.getByTestId('download-toast-action')).toHaveText('Open');
  await app.close();
});

test('pin reminders: one that came due while closed is due at launch, and opening the pin clears it', async () => {
  const { app, win } = await launch(seedProfile({ 1: Date.now() - 60_000 }));
  const tally = win.locator('[data-testid="pin-tally"]');
  await expect(tally).toHaveAttribute('title', '2 pinned · 1 due — open Home');

  await win.locator('[data-testid="home-btn"]').click();
  const altar = win.locator('[data-testid="pin-altar"]');
  await expect(altar.getByRole('button', { name: /^Reminder due .+, change$/ })).toBeVisible();

  // opening the pin is the acknowledgement
  await altar.getByRole('button', { name: 'Gửi lại báo giá cho khách bên Q7' }).click();
  await expect(win.locator('[data-testid="welcome"]')).toHaveCount(0);
  await expect(tally).toHaveAttribute('title', '2 pinned — open Home');

  await win.locator('[data-testid="home-btn"]').click();
  await expect(altar.getByRole('button', { name: 'Remind me' })).toBeVisible();
  await app.close();
});
```

- [ ] **Step 2: Build and run the spec to verify it fails**

Run:

```bash
corepack pnpm exec electron-vite build
env -u ELECTRON_RUN_AS_NODE npx playwright test tests/e2e/pin-reminders.spec.ts --reporter=line
```

Expected: both tests FAIL — the first on the missing `Reminder …, change` button, the second on the tally's `title` still reading `2 pinned — open Home`.

- [ ] **Step 3: Add the clock glyph**

Create `src/renderer/src/components/ClockIcon.tsx`:

```tsx
/** A pin's reminder, drawn. Shared by the pin row and the rail's tally, so
 *  "due" reads the same in both. */
export default function ClockIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="5.75" />
      <path d="M8 5v3.2l2 1.3" />
    </svg>
  );
}
```

- [ ] **Step 4: Add the clock to the pin rows**

In `src/renderer/src/components/welcome/PinnedBand.tsx`:

Change the shared-pins import and add the icon import:

```tsx
import { isDue, PIN_NOTE_MAX, pinCopyText, reminderLabel } from '../../../../shared/pins';
```

```tsx
import ClockIcon from '../ClockIcon';
```

In `PinnedBand`, after the `copy` function:

```tsx
  // main builds the menu and computes the time; the row only asks
  const remind = (id: number) => window.goetia.send('pins:remindMenu', { id });
```

Pass it to `PinRow`, after `onCopy={() => copy(id)}`:

```tsx
                onRemind={() => remind(id)}
```

In `RowProps`, after `onCopy(): void;`:

```tsx
  onRemind(): void;
```

In `PinRow`'s parameter list, after `onCopy,`:

```tsx
  onRemind,
```

In `PinRow`, directly above the `copy` button's comment:

```tsx
  // read at render: main's broadcast at fire time is what re-renders the row
  const now = new Date();
  const when = reminderLabel(pin.remindAt, now);
  const due = isDue(pin.remindAt, now.getTime());
  const remindLabel = when ? `Reminder ${when}, change` : 'Remind me';
  const remind = (
    <button
      type="button"
      aria-label={remindLabel}
      title={remindLabel}
      onClick={onRemind}
      className={`tabular flex flex-none items-center gap-1 px-1 text-[11px] transition-colors duration-120 ${
        due ? 'font-semibold text-accent' : 'text-text-2 hover:text-text-1'
      }`}
    >
      <ClockIcon />
      {when}
    </button>
  );
```

Render it left of the copy button in both layouts. In the In progress card's right cluster:

```tsx
            <span className="ml-auto flex items-center gap-2">
              {remind}
              {copy}
              {done}
              {unpin}
            </span>
```

In the queue row:

```tsx
          {text}
          {note}
          {remind}
          {copy}
          {done}
          {unpin}
```

- [ ] **Step 5: Swap the tally's glyph while a pin is due**

In `src/renderer/src/components/Rail.tsx`:

Add the imports:

```tsx
import { isDue } from '../../../shared/pins';
import ClockIcon from './ClockIcon';
```

Directly after `const pins = state?.pins ?? NO_PINS;`:

```tsx
  // read at render: main's broadcast at fire time is what re-renders the rail
  const renderedAt = Date.now();
  const dueCount = pins.filter((p) => isDue(p.remindAt, renderedAt)).length;
```

In the tally button, replace the `title` and the `<PinIcon />` line:

```tsx
            title={`${pins.length} pinned${dueCount > 0 ? ` · ${dueCount} due` : ''} — open Home`}
```

```tsx
            {/* a due reminder swaps the glyph: never a count circle or a dot,
                which are the unread language */}
            {dueCount > 0 ? <ClockIcon size={10} /> : <PinIcon />}
```

- [ ] **Step 6: Build and run the spec to verify it passes**

Run:

```bash
corepack pnpm exec electron-vite build
env -u ELECTRON_RUN_AS_NODE npx playwright test tests/e2e/pin-reminders.spec.ts tests/e2e/pins.spec.ts --reporter=line
```

Expected: 9 passed — the two new tests and all seven in `pins.spec.ts` (its long-pin test proves the extra button did not widen a row).

- [ ] **Step 7: Lint and typecheck**

Run, one at a time:

```bash
corepack pnpm lint
corepack pnpm typecheck
```

Expected: both clean.

---

### Task 6: Docs, the full suite and the hand-off

**Files:**

- Modify: `docs/FEATURES.md`, `CLAUDE.md`

- [ ] **Step 1: Document the feature**

In `docs/FEATURES.md`, in the **Pinned messages** entry, add after the sentence that ends `and nothing leaves the renderer for it.`:

```markdown
A clock on each row sets a reminder from a native menu main builds (`pins:remindMenu`): `In 1 hour` or `Tomorrow 08:00`, and `Clear reminder` once one is set. The row shows the time while scheduled and `due 14:30` in accent once due, and the rail's tally swaps its pin for a clock while any pin is due. A reminder is announced once — a toast with **Open** while Goetia is in front, otherwise a banner; several due together are one banner that opens Home — silently while muted or in quiet hours, redacted while locked. The due mark stays until the pin is opened, Done, re-timed or cleared.
```

In the same entry's `Impl:` list add `lib/pin-reminder-rules.ts`, `src/main/pin-reminders.ts` and `renderer/src/components/ClockIcon.tsx`; in its `Verified:` list add `pin-reminder-rules.test.ts`, `pin-reminders.test.ts` and e2e `pin-reminders.spec.ts` (a seeded reminder turning due on its own with the toast; one due at launch cleared by opening the pin).

In the manual-checks paragraph at the bottom of the file, add: `a pin's reminder menu and its banner with another app in front (and that it is silent while muted)`.

- [ ] **Step 2: Record the invariants**

In `CLAUDE.md`, under `## Product principle: chat ONLY`, add a new bullet directly after the **Pins are the user's todo list, on Home** bullet:

```markdown
- **A pin can carry one reminder** (2026-11-14, user decisions; spec `docs/superpowers/specs/2026-11-14-pin-reminders-design.md`). `remindAt` rides the pin in the sealed `pins.json` (0 = none) and **main computes it**: the clock on a pin row sends `pins:remindMenu { id }` (shell-only) and nothing page-shaped reaches the store — the two choices are the mute menu's (`muteExpiry`), and `TOMORROW_AT` (`shared/mute.ts`) writes the hour for both menus. Due is **derived** (`isDue`: `0 < remindAt <= now`), never stored; `reminded` gates the announcement and nothing else, so a due pin stays marked — on its row and as the clock that replaces the tally's pin glyph, never a count circle or a dot — until it is opened, Done, re-timed or cleared, and a reminder still ahead survives an open. `PinReminderController` (`src/main/pin-reminders.ts`, `MuteTimerController`'s shape) announces **once per reminder and once per fire**: the tail in `index.ts` marks the pins reminded **first** (an unmarked one is due again on the next arm), then raises the toast for one pin in front (`announceVia`, the download rule) or a banner held on its own `BannerShelf`; several due together are one summary whose click opens Home. **Silence takes the sound, never the announcement** — `reminderSound` consults `shouldNotify` for `silent` alone. It is not `NotificationRouter`'s (no activity log, no throttle, no badge), and while locked the banner is `redactBanner`'d and its click, re-checked at click time, only shows the window. Every change that can move the earliest reminder — the menu, unpin, restore, an open that clears — calls `ctx.reminders.rearm()`.
```

- [ ] **Step 3: Lint the docs**

Run: `npx markdownlint-cli2 docs/FEATURES.md CLAUDE.md`

Expected: `Summary: 0 issues in 0 files`.

- [ ] **Step 4: Run the full definition of done**

Run, one at a time:

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e --reporter=line
```

Expected: all green; the e2e summary reads `67 passed`. The drag specs (`reorder`, `restart`) can flake under load — rerun a failing one alone with `npx playwright test <spec>` before treating it as real.

- [ ] **Step 5: Check by hand what Playwright cannot drive**

With `corepack pnpm dev`, on Home: click a pin's clock and confirm the native menu reads `In 1 hour`, `Tomorrow 08:00`, and gains `Clear reminder` once one is set; set `In 1 hour` and confirm the row shows the time. Report in the hand-off that the banner path (another app in front, muted, locked) was not exercised unless it was.

- [ ] **Step 6: Stop for the commit**

Do not run `git commit`. Report what changed and ask the user to run `/grimoire:seal`.
