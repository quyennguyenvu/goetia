import { describe, expect, it } from 'vitest';
import {
  MAX_RECENTS,
  relativeTime,
  switcherRows,
} from '../../src/renderer/src/components/switcher-results';
import type { ActivityEntryView } from '../../src/shared/types';

const recent = (
  id: number,
  title: string,
  over: Partial<ActivityEntryView> = {},
): ActivityEntryView => ({
  id,
  serviceId: 'telegram',
  title,
  silenced: false,
  at: id,
  ...over,
});

const services = [
  { id: 'whatsapp' as const, name: 'WhatsApp' },
  { id: 'telegram' as const, name: 'Telegram' },
];

describe('switcherRows', () => {
  it('empty query: caps recents at MAX_RECENTS and keeps service order', () => {
    const recents = Array.from({ length: 12 }, (_, i) => recent(i + 1, `chat ${i + 1}`));
    const rows = switcherRows({ query: '', recents, services });
    expect(rows.recents).toHaveLength(MAX_RECENTS);
    expect(rows.recents[0].title).toBe('chat 1'); // input order preserved (main sends newest-first)
    expect(rows.services.map((s) => s.id)).toEqual(['whatsapp', 'telegram']);
  });

  it('drops recents from services not in the enabled list', () => {
    const rows = switcherRows({
      query: '',
      recents: [recent(1, 'gone', { serviceId: 'discord' }), recent(2, 'kept')],
      services,
    });
    expect(rows.recents.map((r) => r.title)).toEqual(['kept']);
  });

  it('a query fuzzy-filters recents titles and service names together', () => {
    const rows = switcherRows({
      query: 'an',
      recents: [recent(1, 'Anh Tuấn'), recent(2, 'Design group')],
      services,
    });
    expect(rows.recents.map((r) => r.title)).toEqual(['Anh Tuấn']);
    expect(rows.services).toHaveLength(0); // neither service name matches "an"
  });

  it('ranks better fuzzy matches first within recents', () => {
    const rows = switcherRows({
      query: 'me',
      recents: [recent(1, 'some metal'), recent(2, 'Mẹ ơi me')],
      services: [{ id: 'telegram', name: 'Telegram' }],
    });
    expect(rows.recents[0].id).toBe(2); // leading-character bonus outscores a later streak
  });
});

describe('relativeTime', () => {
  it('buckets into now / minutes / hours / days', () => {
    expect(relativeTime(0, 59_000)).toBe('now');
    expect(relativeTime(0, 60_000)).toBe('1 m');
    expect(relativeTime(0, 3_599_000)).toBe('59 m');
    expect(relativeTime(0, 3_600_000)).toBe('1 h');
    expect(relativeTime(0, 86_400_000)).toBe('1 d');
  });
});
