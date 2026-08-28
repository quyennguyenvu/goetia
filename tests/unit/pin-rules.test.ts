import { describe, expect, it } from 'vitest';
import {
  clampText,
  conversationFromTitle,
  isPermutation,
  type Pin,
  parsePins,
  pinViews,
} from '../../src/main/lib/pin-rules';
import { PIN_TEXT_MAX } from '../../src/shared/pins';

const KNOWN = new Set(['zalo', 'messenger']);

const pin = (over: Partial<Pin> = {}): Pin => ({
  id: 1,
  serviceId: 'zalo',
  text: 'hello',
  note: '',
  conversation: '',
  href: 'https://chat.zalo.me/',
  at: 5,
  ...over,
});

describe('conversationFromTitle', () => {
  it('strips unread markers and the brand tail', () => {
    expect(conversationFromTitle('(2) Mẹ | Microsoft Teams', 'Microsoft Teams')).toBe('Mẹ');
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
    const views = pinViews([pin({ conversation: 'Mẹ' })]);
    expect(views).toEqual([
      { id: 1, serviceId: 'zalo', text: 'hello', note: '', conversation: 'Mẹ', at: 5 },
    ]);
    expect('href' in views[0]).toBe(false);
  });
});
