import { describe, expect, it } from 'vitest';
import { nextTarget, type UnreadTarget, unreadTargets } from '../../src/main/lib/unread-jump';
import type { Counts, ServiceId } from '../../src/shared/types';

const order: ServiceId[] = ['discord', 'zalo', 'slack', 'teams'];
const counts =
  (m: Partial<Record<ServiceId, number>>) =>
  (id: ServiceId): Counts => ({ direct: m[id] ?? 0, indirect: 0 });
// newest first, as ActivityLog.recent() hands them out
const rows = [
  { id: 9, serviceId: 'slack' as ServiceId },
  { id: 7, serviceId: 'discord' as ServiceId },
  { id: 4, serviceId: 'slack' as ServiceId },
  { id: 2, serviceId: 'zalo' as ServiceId },
];
const keys = (t: UnreadTarget[]) => t.map((x) => x.key);

describe('unreadTargets', () => {
  it('lists conversations of services with unread, newest first, then badge-only services', () => {
    // teams has a badge but never raised a banner this session; zalo is read
    const t = unreadTargets(rows, order, counts({ slack: 2, discord: 1, teams: 5 }));
    expect(keys(t)).toEqual(['e:9', 'e:7', 'e:4', 's:teams']);
    expect(t[0]).toEqual({ key: 'e:9', entryId: 9, serviceId: 'slack' });
    expect(t[3]).toEqual({ key: 's:teams', serviceId: 'teams' });
  });

  it('counts indirect unread and keeps badge-only services in rail order', () => {
    const unread = (id: ServiceId): Counts => ({
      direct: 0,
      indirect: id === 'teams' || id === 'discord' ? 1 : 0,
    });
    expect(keys(unreadTargets([], order, unread))).toEqual(['s:discord', 's:teams']);
  });

  it('is empty with nothing unread, whatever the log holds', () => {
    expect(unreadTargets(rows, order, counts({}))).toEqual([]);
  });

  it('ignores rows of services not on the rail', () => {
    expect(keys(unreadTargets(rows, ['zalo'], counts({ slack: 3, zalo: 1 })))).toEqual(['e:2']);
  });
});

describe('nextTarget', () => {
  const t = unreadTargets(rows, order, counts({ slack: 2, discord: 1, teams: 5 }));

  it('starts at the newest going forward and at the last going back', () => {
    expect(nextTarget(t, null, 1)?.key).toBe('e:9');
    expect(nextTarget(t, null, -1)?.key).toBe('s:teams');
  });

  it('steps from the cursor and wraps at both ends', () => {
    expect(nextTarget(t, 'e:9', 1)?.key).toBe('e:7');
    expect(nextTarget(t, 's:teams', 1)?.key).toBe('e:9');
    expect(nextTarget(t, 'e:9', -1)?.key).toBe('s:teams');
  });

  it('restarts when the cursor is no longer a target', () => {
    // the entry rotated out of the log, or its service was read
    expect(nextTarget(t, 'e:1', 1)?.key).toBe('e:9');
  });

  it('is null with no targets, and with only the cursor itself left', () => {
    expect(nextTarget([], null, 1)).toBeNull();
    const one = unreadTargets(rows, order, counts({ zalo: 1 }));
    expect(nextTarget(one, 'e:2', 1)).toBeNull();
    expect(nextTarget(one, null, 1)?.key).toBe('e:2');
  });
});
