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
