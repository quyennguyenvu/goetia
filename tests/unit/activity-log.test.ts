import { describe, expect, it } from 'vitest';
import { ACTIVITY_CAP, type ActivityEntry, ActivityLog } from '../../src/main/lib/activity-log';

const entry = (
  n: number,
  over: Partial<Omit<ActivityEntry, 'id'>> = {},
): Omit<ActivityEntry, 'id'> => ({
  serviceId: 'telegram',
  title: `chat ${n}`,
  synthetic: false,
  silenced: false,
  at: n,
  ...over,
});

describe('ActivityLog', () => {
  it('caps at ACTIVITY_CAP, dropping the oldest', () => {
    const log = new ActivityLog();
    for (let i = 1; i <= ACTIVITY_CAP + 5; i++) log.append(entry(i));
    const rows = log.recent();
    expect(rows).toHaveLength(ACTIVITY_CAP);
    expect(rows[0].title).toBe(`chat ${ACTIVITY_CAP + 5}`); // newest first
    expect(rows.at(-1)?.title).toBe('chat 6');
  });

  it('dedupes by href with the newest entry winning', () => {
    const log = new ActivityLog();
    log.append(entry(1, { href: '/t/1' }));
    log.append(entry(2, { title: 'renamed', href: '/t/1', silenced: true }));
    const rows = log.recent();
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('renamed');
    expect(rows[0].silenced).toBe(true);
  });

  it('falls back to service+title as the dedupe key', () => {
    const log = new ActivityLog();
    log.append(entry(1, { title: 'Mẹ' }));
    log.append(entry(2, { title: 'Mẹ' }));
    log.append(entry(3, { title: 'Mẹ', serviceId: 'whatsapp' }));
    expect(log.recent()).toHaveLength(2); // same title on two services stays two rows
  });

  it('never exposes hrefs to the renderer view', () => {
    const log = new ActivityLog();
    log.append(entry(1, { href: 'https://web.telegram.org/a/#123' }));
    expect('href' in log.recent()[0]).toBe(false);
  });

  it('resolves an id back to the full entry', () => {
    const log = new ActivityLog();
    log.append(entry(1, { href: '/x' }));
    const id = log.recent()[0].id;
    expect(log.get(id)?.href).toBe('/x');
    expect(log.get(999)).toBeUndefined();
  });
});
