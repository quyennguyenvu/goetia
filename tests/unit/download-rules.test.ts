import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ASK_URL_CAP,
  bannerFor,
  burstExceeded,
  DOWNLOAD_BURST_CAP,
  DOWNLOAD_BURST_WINDOW_MS,
  DOWNLOAD_DEDUP_MAX,
  decideSave,
  progressFraction,
  safeFilename,
  uniquePath,
} from '../../src/main/lib/download-rules';

const DIR = '/tmp/dl';
const none = () => false;

describe('constants', () => {
  it('match the spec', () => {
    expect(DOWNLOAD_BURST_CAP).toBe(5);
    expect(DOWNLOAD_BURST_WINDOW_MS).toBe(30_000);
    expect(DOWNLOAD_DEDUP_MAX).toBe(99);
    expect(ASK_URL_CAP).toBe(16);
  });
});

describe('safeFilename', () => {
  it('keeps an ordinary name', () => {
    expect(safeFilename('photo.jpg')).toBe('photo.jpg');
  });
  it('substitutes an empty, dotfile or traversal name', () => {
    expect(safeFilename('')).toBe('download');
    expect(safeFilename('   ')).toBe('download');
    expect(safeFilename('.bashrc')).toBe('download');
    expect(safeFilename('..')).toBe('download');
  });
  it('drops any directory part Chromium let through', () => {
    expect(safeFilename('a/b/c.txt')).toBe('c.txt');
  });
});

describe('uniquePath', () => {
  it('uses the plain name when free', () => {
    expect(uniquePath(DIR, 'photo.jpg', none)).toBe(join(DIR, 'photo.jpg'));
  });
  it('counts up in the stem, keeping the extension', () => {
    const taken = new Set([join(DIR, 'photo.jpg'), join(DIR, 'photo (1).jpg')]);
    expect(uniquePath(DIR, 'photo.jpg', (p) => taken.has(p))).toBe(join(DIR, 'photo (2).jpg'));
  });
  it('handles a name with no extension', () => {
    const taken = new Set([join(DIR, 'README')]);
    expect(uniquePath(DIR, 'README', (p) => taken.has(p))).toBe(join(DIR, 'README (1)'));
  });
  it('gives up past the cap', () => {
    expect(uniquePath(DIR, 'a.txt', () => true)).toBeNull();
  });
  it('probes exactly cap + 1 names before giving up', () => {
    let probes = 0;
    uniquePath(DIR, 'a.txt', () => {
      probes++;
      return true;
    });
    expect(probes).toBe(DOWNLOAD_DEDUP_MAX + 1);
  });
});

describe('burstExceeded', () => {
  const now = 1_000_000;
  it('is false under the cap', () => {
    const starts = Array.from({ length: DOWNLOAD_BURST_CAP - 1 }, (_, i) => now - i * 1000);
    expect(burstExceeded(starts, now)).toBe(false);
  });
  it('is true once cap starts sit inside the window', () => {
    const starts = Array.from({ length: DOWNLOAD_BURST_CAP }, (_, i) => now - i * 1000);
    expect(burstExceeded(starts, now)).toBe(true);
  });
  it('ignores starts older than the window', () => {
    const old = Array.from(
      { length: DOWNLOAD_BURST_CAP },
      (_, i) => now - DOWNLOAD_BURST_WINDOW_MS - i,
    );
    expect(burstExceeded(old, now)).toBe(false);
  });
});

describe('decideSave', () => {
  const base = {
    filename: 'photo.jpg',
    ask: false,
    dir: DIR,
    userRequested: false,
    recentStarts: [] as number[],
    now: 5_000_000,
    exists: (p: string) => p === DIR, // the folder exists, no file does
  };

  it('saves silently into the folder by default', () => {
    expect(decideSave(base)).toEqual({ mode: 'save', path: join(DIR, 'photo.jpg') });
  });

  it('asks when the setting says so', () => {
    expect(decideSave({ ...base, ask: true })).toEqual({
      mode: 'ask',
      defaultPath: join(DIR, 'photo.jpg'),
      reason: 'setting',
    });
  });

  it('asks for a user request even in silent mode', () => {
    expect(decideSave({ ...base, userRequested: true })).toMatchObject({
      mode: 'ask',
      reason: 'user-request',
    });
  });

  it('asks when the folder is gone', () => {
    expect(decideSave({ ...base, exists: () => false })).toMatchObject({
      mode: 'ask',
      reason: 'missing-dir',
    });
  });

  it('asks past the burst cap', () => {
    const recentStarts = Array.from({ length: DOWNLOAD_BURST_CAP }, (_, i) => base.now - i);
    expect(decideSave({ ...base, recentStarts })).toMatchObject({ mode: 'ask', reason: 'burst' });
  });

  it('asks when every de-duplicated name is taken', () => {
    expect(decideSave({ ...base, exists: () => true })).toMatchObject({
      mode: 'ask',
      reason: 'exhausted',
    });
  });

  it('de-duplicates against files already there', () => {
    const exists = (p: string) => p === DIR || p === join(DIR, 'photo.jpg');
    expect(decideSave({ ...base, exists })).toEqual({
      mode: 'save',
      path: join(DIR, 'photo (1).jpg'),
    });
  });

  it('never builds a path from a hostile name', () => {
    expect(decideSave({ ...base, filename: '../.ssh/authorized_keys' })).toEqual({
      mode: 'save',
      path: join(DIR, 'authorized_keys'),
    });
    expect(decideSave({ ...base, filename: '.env' })).toEqual({
      mode: 'save',
      path: join(DIR, 'download'),
    });
  });
});

describe('bannerFor', () => {
  it('names the file and the service on success', () => {
    expect(bannerFor('completed', 'photo.jpg', 'WhatsApp')).toEqual({
      title: 'photo.jpg',
      body: 'Saved from WhatsApp',
    });
  });
  it('reports a failure', () => {
    expect(bannerFor('interrupted', 'photo.jpg', 'WhatsApp')).toEqual({
      title: 'Could not save photo.jpg',
      body: 'WhatsApp',
    });
  });
  it('is silent on cancel', () => {
    expect(bannerFor('cancelled', 'photo.jpg', 'WhatsApp')).toBeNull();
  });
});

describe('progressFraction', () => {
  it('clears when nothing is in flight', () => {
    expect(progressFraction([])).toBe(-1);
  });
  it('aggregates received over total', () => {
    expect(
      progressFraction([
        { received: 50, total: 100 },
        { received: 25, total: 100 },
      ]),
    ).toBeCloseTo(0.375);
  });
  it('is indeterminate when any total is unknown', () => {
    expect(
      progressFraction([
        { received: 50, total: 100 },
        { received: 10, total: 0 },
      ]),
    ).toBe(2);
  });
  it('never exceeds 1 on an over-reported item', () => {
    expect(progressFraction([{ received: 120, total: 100 }])).toBe(1);
  });
});
