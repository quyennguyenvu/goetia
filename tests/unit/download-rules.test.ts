import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ASK_URL_CAP,
  bannerFor,
  burstExceeded,
  DOWNLOAD_BURST_CAP,
  DOWNLOAD_BURST_WINDOW_MS,
  DOWNLOAD_DEDUP_MAX,
  DOWNLOAD_HISTORY_CAP,
  DOWNLOAD_NAME_MAX,
  type DownloadRecord,
  decideSave,
  downloadsSettingLines,
  historyEvict,
  historyViews,
  persistable,
  progressFraction,
  restoreRecords,
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

const rec = (over: Partial<DownloadRecord> & { id: number }): DownloadRecord => ({
  serviceId: 'zalo',
  filename: `f${over.id}.pdf`,
  path: `/dl/f${over.id}.pdf`,
  state: 'saved',
  received: 10,
  total: 10,
  at: over.id,
  ...over,
});

describe('historyViews', () => {
  it('puts in-flight rows first, then newest first, and never a path', () => {
    const rows = historyViews(
      [rec({ id: 1 }), rec({ id: 2, state: 'downloading' }), rec({ id: 3 })],
      () => true,
    );
    expect(rows.map((r) => r.id)).toEqual([2, 3, 1]);
    expect(rows.every((r) => !('path' in r))).toBe(true);
    expect(rows[1]).toEqual({
      id: 3,
      serviceId: 'zalo',
      filename: 'f3.pdf',
      state: 'saved',
      received: 10,
      total: 10,
      at: 3,
    });
  });

  it('breaks an equal start time by id, newest id first', () => {
    const rows = historyViews([rec({ id: 1, at: 5 }), rec({ id: 2, at: 5 })], () => true);
    expect(rows.map((r) => r.id)).toEqual([2, 1]);
  });

  it('reads a saved file that is gone as missing, and leaves failed alone', () => {
    const rows = historyViews(
      [rec({ id: 1 }), rec({ id: 2, state: 'failed' })],
      (p) => p !== '/dl/f1.pdf',
    );
    expect(rows.map((r) => r.state)).toEqual(['failed', 'missing']);
  });
});

describe('historyEvict', () => {
  it('is null under the cap', () => {
    expect(historyEvict([rec({ id: 1 })])).toBeNull();
  });

  it('drops the oldest ended row first, and the oldest in-flight only when all are', () => {
    const full = Array.from({ length: DOWNLOAD_HISTORY_CAP }, (_, i) =>
      rec({ id: i + 1, state: i === 0 ? 'downloading' : 'saved' }),
    );
    expect(historyEvict(full)).toBe(2); // id 1 is the oldest but still in flight
    const live = full.map((r) => ({ ...r, state: 'downloading' as const }));
    expect(historyEvict(live)).toBe(1);
  });
});

describe('DOWNLOAD_HISTORY_CAP', () => {
  it('is 200, Diagnostics parity', () => {
    expect(DOWNLOAD_HISTORY_CAP).toBe(200);
  });
});

const KNOWN: ReadonlySet<string> = new Set(['whatsapp', 'zalo']);
const saved = (id: number, at: number, over: Partial<DownloadRecord> = {}): DownloadRecord => ({
  id,
  serviceId: 'whatsapp',
  filename: `f${id}.txt`,
  path: `/tmp/dl/f${id}.txt`,
  state: 'saved',
  received: 10,
  total: 10,
  at,
  ...over,
});

describe('restoreRecords', () => {
  it('keeps saved and failed rows of the exact shape and drops the rest', () => {
    const raw = [
      saved(1, 100),
      saved(2, 200, { state: 'failed', path: '' }),
      saved(3, 300, { state: 'downloading' }),
      { ...saved(4, 400), serviceId: 'myspace' },
      { ...saved(5, 500), received: 'ten' },
      { ...saved(6, 600), at: Number.NaN },
      { ...saved(7, 700), filename: 42 },
      { ...saved(8, 800), id: 1.5 },
      'junk',
      null,
    ];
    expect(restoreRecords(raw, KNOWN).map((r) => r.id)).toEqual([2, 1]);
  });

  it('is empty for anything that is not an array', () => {
    expect(restoreRecords(undefined, KNOWN)).toEqual([]);
    expect(restoreRecords({ downloads: [] }, KNOWN)).toEqual([]);
    expect(restoreRecords('[]', KNOWN)).toEqual([]);
  });

  it('drops a repeated id, clips the name, and keeps the newest cap', () => {
    const raw = [saved(1, 100), saved(1, 101)];
    expect(restoreRecords(raw, KNOWN)).toHaveLength(1);
    const long = saved(2, 200, { filename: 'x'.repeat(DOWNLOAD_NAME_MAX + 20) });
    expect(restoreRecords([long], KNOWN)[0].filename).toHaveLength(DOWNLOAD_NAME_MAX);
    const many = Array.from({ length: DOWNLOAD_HISTORY_CAP + 5 }, (_, i) => saved(i + 1, i + 1));
    const kept = restoreRecords(many, KNOWN);
    expect(kept).toHaveLength(DOWNLOAD_HISTORY_CAP);
    expect(kept[0].id).toBe(DOWNLOAD_HISTORY_CAP + 5); // newest first
    expect(kept.at(-1)?.id).toBe(6); // the five oldest fell off
  });
});

describe('persistable', () => {
  it('holds ended rows only', () => {
    const rows = [
      saved(1, 1),
      saved(2, 2, { state: 'downloading' }),
      saved(3, 3, { state: 'failed' }),
    ];
    expect(persistable(rows).map((r) => r.id)).toEqual([1, 3]);
  });
});

describe('downloadsSettingLines', () => {
  it('names a folder change without the path, and a mode change', () => {
    expect(
      downloadsSettingLines({ ask: false, dir: null }, { ask: false, dir: '/Volumes/X' }),
    ).toEqual(['folder changed']);
    expect(
      downloadsSettingLines({ ask: false, dir: '/Volumes/X' }, { ask: false, dir: null }),
    ).toEqual(['folder reset to the OS default']);
    expect(downloadsSettingLines({ ask: false, dir: null }, { ask: true, dir: null })).toEqual([
      'mode: ask',
    ]);
    expect(downloadsSettingLines({ ask: true, dir: null }, { ask: false, dir: '/V' })).toEqual([
      'folder changed',
      'mode: save to folder',
    ]);
    expect(downloadsSettingLines({ ask: true, dir: '/V' }, { ask: true, dir: '/V' })).toEqual([]);
  });
});
