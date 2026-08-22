import { describe, expect, it } from 'vitest';
import {
  MAX_RECENTS,
  msUntilLabelChange,
  nextLabelChange,
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

// S3: relativeTime was evaluated at render only, so "3 m" froze for as long as
// the switcher stayed open. Ticking on the boundary beats an arbitrary interval.
describe('msUntilLabelChange', () => {
  const T = 1_760_000_000_000;

  it('counts down to the minute a fresh entry stops being "now"', () => {
    expect(relativeTime(T, T + 10_000)).toBe('now');
    expect(msUntilLabelChange(T, T + 10_000)).toBe(50_000);
    expect(relativeTime(T, T + 60_000)).toBe('1 m');
  });

  it('lands on the next minute boundary while minutes are shown', () => {
    expect(msUntilLabelChange(T, T + 90_000)).toBe(30_000);
    expect(relativeTime(T, T + 90_000)).toBe('1 m');
    expect(relativeTime(T, T + 120_000)).toBe('2 m');
  });

  it('steps by the hour once hours are shown', () => {
    const d = 3_600_000 + 600_000; // 1h10m
    expect(relativeTime(T, T + d)).toBe('1 h');
    expect(msUntilLabelChange(T, T + d)).toBe(3_600_000 - 600_000);
  });

  it('steps by the day once days are shown', () => {
    const d = 86_400_000 + 3_600_000;
    expect(relativeTime(T, T + d)).toBe('1 d');
    expect(msUntilLabelChange(T, T + d)).toBe(86_400_000 - 3_600_000);
  });

  it('never returns a value tight enough to spin', () => {
    // one millisecond short of a boundary, and a clock that has gone backwards
    expect(msUntilLabelChange(T, T + 59_999)).toBe(1_000);
    expect(msUntilLabelChange(T, T - 5_000)).toBeGreaterThanOrEqual(1_000);
  });
});

describe('nextLabelChange', () => {
  const T = 1_760_000_000_000;

  it('is null with nothing to tick, so the switcher schedules no timer', () => {
    expect(nextLabelChange([], T)).toBeNull();
  });

  it('takes the soonest change across the rows', () => {
    // a 10s-old row changes in 50s; a 90s-old row changes in 30s
    expect(nextLabelChange([T - 10_000, T - 90_000], T)).toBe(30_000);
  });
});
