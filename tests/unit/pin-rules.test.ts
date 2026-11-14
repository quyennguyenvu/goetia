import { describe, expect, it } from 'vitest';
import {
  clampText,
  conversationFromTitle,
  isPermutation,
  type Pin,
  parsePins,
  pinViews,
} from '../../src/main/lib/pin-rules';
import { isDue, PIN_TEXT_MAX, pinCopyText, reminderLabel } from '../../src/shared/pins';

const KNOWN = new Set(['zalo', 'messenger']);

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

describe('conversationFromTitle', () => {
  it('strips unread markers and the brand tail', () => {
    expect(conversationFromTitle('(2) Mẹ | Microsoft Teams', 'Microsoft Teams')).toBe('Mẹ');
    // Teams leads with the app section; the chat is the middle segment
    expect(
      conversationFromTitle('Chat | Anh Em Công Nhân | Microsoft Teams', 'Microsoft Teams'),
    ).toBe('Anh Em Công Nhân');
    expect(conversationFromTitle('(3) Chat | Microsoft Teams', 'Microsoft Teams')).toBe('');
    expect(conversationFromTitle('• #release | Ticketbox - Discord', 'Discord')).toBe(
      '#release | Ticketbox',
    );
    expect(conversationFromTitle('* An Nguyen (DM) - Ticketbox - Slack', 'Slack')).toBe(
      'An Nguyen (DM)',
    );
  });

  it('yields nothing when the title is only the site', () => {
    for (const [title, name] of [
      ['WhatsApp', 'WhatsApp'],
      ['(3) Telegram', 'Telegram'],
      ['Telegram Web', 'Telegram'],
      ['Messenger', 'Messenger'],
      ['Messages | TikTok', 'TikTok'],
      ['', 'Zalo'],
    ]) {
      expect(conversationFromTitle(title, name)).toBe('');
    }
  });

  it('peels the brand from the head too, and clamps what is left', () => {
    expect(conversationFromTitle('Zalo - Nhóm Sale Q7', 'Zalo')).toBe('Nhóm Sale Q7');
    expect(conversationFromTitle('Nhóm Sale Q7 • Zalo - Zalo', 'Zalo')).toBe('Nhóm Sale Q7');
    expect(conversationFromTitle(`${'x'.repeat(100)} - Slack`, 'Slack')).toHaveLength(80);
  });
});

describe('clampText', () => {
  it('collapses whitespace and trims — a pin row has one line', () => {
    expect(clampText('  a\n\n  b\t c  ', 300)).toBe('a b c');
  });

  it('caps with an ellipsis at max', () => {
    const out = clampText('x'.repeat(400), PIN_TEXT_MAX);
    expect(out).toHaveLength(PIN_TEXT_MAX);
    expect(out.endsWith('…')).toBe(true);
  });

  it('leaves short text alone', () => {
    expect(clampText('short', 10)).toBe('short');
  });
});

describe('pinCopyText', () => {
  it('drops the ellipsis a clamped pin ends in — a pasted search must match the message', () => {
    // 13 chars a word: the cut lands on a space, which goes with the ellipsis
    const clamped = clampText('conversation '.repeat(40), PIN_TEXT_MAX);
    expect(clamped.endsWith(' …')).toBe(true);
    expect(pinCopyText(clamped)).toBe('conversation '.repeat(23).trimEnd());
  });

  it('keeps an ellipsis the message itself ended in', () => {
    expect(pinCopyText('để em xem lại…')).toBe('để em xem lại…');
  });
});

describe('isPermutation', () => {
  it('accepts the same ids in another order', () => {
    expect(isPermutation([3, 1, 2], [1, 2, 3])).toBe(true);
  });

  it('rejects a drop, a duplicate and a stranger', () => {
    expect(isPermutation([1, 2], [1, 2, 3])).toBe(false);
    expect(isPermutation([1, 1, 3], [1, 2, 3])).toBe(false);
    expect(isPermutation([1, 2, 9], [1, 2, 3])).toBe(false);
  });
});

describe('parsePins', () => {
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

  it('returns [] for anything that is not an array', () => {
    for (const raw of [undefined, null, 'x', 42, {}]) expect(parsePins(raw, KNOWN)).toEqual([]);
  });

  it('keeps well-formed pins and clamps their text', () => {
    const out = parsePins([pin({ text: '  hi   there ' })], KNOWN);
    expect(out).toEqual([pin({ text: 'hi there' })]);
  });

  it('drops malformed entries, unknown services, empty text and duplicate ids', () => {
    const out = parsePins(
      [
        null,
        'junk',
        pin({ id: 1 }),
        pin({ id: 1, text: 'dup' }),
        pin({ id: 2, serviceId: 'gone' as Pin['serviceId'] }),
        pin({ id: 3, text: '   ' }),
        { ...pin({ id: 4 }), href: 7 },
        pin({ id: 5, serviceId: 'messenger' }),
      ],
      KNOWN,
    );
    expect(out.map((p) => p.id)).toEqual([1, 5]);
  });

  it('defaults a missing note, conversation and a bad timestamp', () => {
    const raw = { id: 1, serviceId: 'zalo', text: 'x', href: 'https://chat.zalo.me/', at: 'no' };
    expect(parsePins([raw], KNOWN)).toEqual([pin({ text: 'x', at: 0 })]);
  });
});

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
