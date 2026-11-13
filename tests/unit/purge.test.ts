import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../../src/main/ipc-handlers';
import type { ServiceId } from '../../src/shared/types';

const calls = vi.hoisted(() => [] as string[]);
vi.mock('electron', () => ({
  session: {
    fromPartition: (partition: string) => ({
      clearStorageData: async () => void calls.push(`wipe ${partition}`),
    }),
  },
}));

import { purgeService } from '../../src/main/purge';

function makeCtx(opts: { live: boolean; hibernated?: boolean; settingsOpen?: boolean }) {
  let live = opts.live;
  const ctx = {
    views: {
      has: () => live,
      destroy: (id: ServiceId) => {
        calls.push(`destroy ${id}`);
        live = false;
      },
      ensure: (id: ServiceId, kind: string) => calls.push(`ensure ${id} ${kind}`),
      activate: (id: ServiceId, o: { show: boolean; kind: string }) =>
        calls.push(`activate ${id} ${o.kind} show=${o.show}`),
    },
    state: {
      activeId: 'messenger' as ServiceId,
      settingsOpen: opts.settingsOpen ?? false,
      switcherOpen: false,
      homeOpen: false,
      locked: false,
      runtime: () => ({ hibernated: opts.hibernated ?? false }),
      setRuntime: vi.fn(),
    },
    settings: { get: () => ({ disabled: { discord: false, messenger: false } }) },
    waking: { end: vi.fn() },
    noteDestroyed: vi.fn(),
    identityShare: { forget: vi.fn() },
    activity: { clear: vi.fn() },
    recents: { clear: vi.fn() },
  } as unknown as AppContext;
  return ctx;
}

// 2026-11-13 audit: the wipe ran under a live page, which can write its login
// straight back (an unload handler, a token refresh landing late).
describe('purgeService', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('takes the page down before the wipe and brings it back after', async () => {
    await purgeService(makeCtx({ live: true }), 'discord');
    expect(calls).toEqual(['destroy discord', 'wipe persist:discord', 'ensure discord purge']);
  });

  it('puts the active service back on screen', async () => {
    await purgeService(makeCtx({ live: true }), 'messenger');
    expect(calls.at(-1)).toBe('activate messenger purge show=true');
  });

  it('keeps it under an open shell surface', async () => {
    await purgeService(makeCtx({ live: true, settingsOpen: true }), 'messenger');
    expect(calls.at(-1)).toBe('activate messenger purge show=false');
  });

  it('never wakes a service that was asleep or only peeking', async () => {
    await purgeService(makeCtx({ live: false }), 'discord');
    await purgeService(makeCtx({ live: true, hibernated: true }), 'discord');
    expect(calls).toEqual(['wipe persist:discord', 'destroy discord', 'wipe persist:discord']);
  });
});
