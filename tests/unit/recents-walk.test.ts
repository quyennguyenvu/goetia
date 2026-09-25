import { describe, expect, it } from 'vitest';
import { conversationKey, type RecentEntry } from '../../src/main/lib/recents-rules';
import {
  beginWalk,
  nextTarget,
  stepWalk,
  WALK_TIMEOUT_MS,
  walkActive,
  walkTargets,
} from '../../src/main/lib/recents-walk';

const row = (
  id: number,
  label: string,
  serviceId: RecentEntry['serviceId'] = 'whatsapp',
): RecentEntry => ({
  id,
  serviceId,
  label,
  url: 'https://web.whatsapp.com/',
  at: 100 - id,
});
// newest first, as the store hands them out
const rows = [row(1, 'A'), row(2, 'B', 'discord'), row(3, 'C')];
const [A, B, C] = rows.map(conversationKey);
const T = 1_760_000_000_000;

describe('walkTargets', () => {
  it('keeps ⌘K order and skips disabled services', () => {
    expect(walkTargets(rows, () => true)).toEqual([A, B, C]);
    expect(walkTargets(rows, (id) => id !== 'discord')).toEqual([A, C]);
  });
});

describe('beginWalk', () => {
  it('anchors on the on-screen row when it is listed, else starts off any row', () => {
    expect(beginWalk([A, B, C], B, T)).toEqual({
      keys: [A, B, C],
      cursor: B,
      deadline: T + WALK_TIMEOUT_MS,
    });
    expect(beginWalk([A, B, C], null, T).cursor).toBeNull();
    // an on-screen conversation the store has not recorded yet is not listed
    expect(beginWalk([A, B, C], 'zalo\nX', T).cursor).toBeNull();
  });
});

describe('nextTarget', () => {
  it('starts at the newest going down and at the oldest going up', () => {
    expect(nextTarget([A, B, C], null, 1)).toBe(A);
    expect(nextTarget([A, B, C], null, -1)).toBe(C);
  });

  it('steps from the cursor and wraps at both ends', () => {
    expect(nextTarget([A, B, C], A, 1)).toBe(B);
    expect(nextTarget([A, B, C], C, 1)).toBe(A);
    expect(nextTarget([A, B, C], A, -1)).toBe(C);
  });

  it('restarts when the cursor is no longer a target', () => {
    expect(nextTarget([A, B, C], 'gone', 1)).toBe(A);
  });

  it('is null with no targets, and with only the cursor itself left', () => {
    expect(nextTarget([], null, 1)).toBeNull();
    expect(nextTarget([A], A, 1)).toBeNull();
    expect(nextTarget([A], null, 1)).toBe(A);
  });
});

describe('stepWalk', () => {
  it('walks the snapshot, not the live order: A → B → C → A, and back', () => {
    let w = beginWalk([A, B, C], A, T);
    let s = stepWalk(w, 1, T + 100);
    expect(s.target).toBe(B);
    w = s.walk;
    // B moved to the top meanwhile; the snapshot still says C is next
    s = stepWalk(w, 1, T + 200);
    expect(s.target).toBe(C);
    w = s.walk;
    s = stepWalk(w, 1, T + 300);
    expect(s.target).toBe(A);
    s = stepWalk(s.walk, -1, T + 400);
    expect(s.target).toBe(C);
  });

  it('re-arms the deadline on every press and moves the cursor to the target', () => {
    const s = stepWalk(beginWalk([A, B], A, T), 1, T + 3_000);
    expect(s.walk.cursor).toBe(B);
    expect(s.walk.deadline).toBe(T + 3_000 + WALK_TIMEOUT_MS);
  });

  it('from Home opens the newest row going down and the oldest going up', () => {
    expect(stepWalk(beginWalk([A, B, C], null, T), 1, T).target).toBe(A);
    expect(stepWalk(beginWalk([A, B, C], null, T), -1, T).target).toBe(C);
  });

  it('has nowhere to go with one row that is the one on screen, and keeps the cursor', () => {
    const s = stepWalk(beginWalk([A], A, T), 1, T);
    expect(s.target).toBeNull();
    expect(s.walk.cursor).toBe(A);
  });
});

describe('walkActive', () => {
  it('is true until the deadline, and false for no walk', () => {
    const w = beginWalk([A], null, T);
    expect(walkActive(w, T + WALK_TIMEOUT_MS - 1)).toBe(true);
    expect(walkActive(w, T + WALK_TIMEOUT_MS)).toBe(false);
    expect(walkActive(null, T)).toBe(false);
  });
});
