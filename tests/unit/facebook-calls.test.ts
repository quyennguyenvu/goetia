import { describe, expect, it } from 'vitest';
import { allowFacebookCalls, readCallBlockedUntil } from '../../src/preload/recipes/facebook-calls';

/** facebook's registry: a global require that throws on a name it does not know */
function fakeWin(modules: Record<string, unknown>): Window {
  return {
    require: (name: string) => {
      if (!(name in modules)) throw new Error(`Requiring unknown module "${name}"`);
      return modules[name];
    },
  } as unknown as Window;
}

const ENV = { env: true };
const QUERY = { query: true };

function relayAnswering(value: unknown, calls: unknown[][] = []) {
  return {
    fetchQuery: (...args: unknown[]) => {
      calls.push(args);
      return { toPromise: () => Promise.resolve({ viewer: { call_blocked_until: value } }) };
    },
  };
}

function modulesWith(relay: unknown, extra: Record<string, unknown> = {}) {
  return {
    CometRelay: relay,
    // facebook's interop: a default export is unwrapped
    CometRelayEnvironment: { default: ENV },
    'RTWebCallBlockSettingHooksQuery.graphql': QUERY,
    ...extra,
  };
}

describe('readCallBlockedUntil', () => {
  it('reads call_blocked_until through facebook’s own query, from the store first', async () => {
    const calls: unknown[][] = [];
    expect(await readCallBlockedUntil(fakeWin(modulesWith(relayAnswering(-1, calls))))).toBe(-1);
    expect(calls[0]).toEqual([ENV, QUERY, {}, { fetchPolicy: 'store-or-network' }]);
  });

  it('takes a numeric string as the number it spells', async () => {
    expect(await readCallBlockedUntil(fakeWin(modulesWith(relayAnswering('1790000000'))))).toBe(
      1_790_000_000,
    );
  });

  it('is null when facebook renamed a module', async () => {
    const win = fakeWin({ CometRelay: relayAnswering(-1), CometRelayEnvironment: ENV });
    expect(await readCallBlockedUntil(win)).toBeNull();
  });

  it('is null with no registry at all', async () => {
    expect(await readCallBlockedUntil({} as Window)).toBeNull();
  });

  it('is null when the query throws or rejects', async () => {
    const throwing = {
      fetchQuery: () => {
        throw new Error('boom');
      },
    };
    expect(await readCallBlockedUntil(fakeWin(modulesWith(throwing)))).toBeNull();
    const rejecting = { fetchQuery: () => ({ toPromise: () => Promise.reject(new Error('net')) }) };
    expect(await readCallBlockedUntil(fakeWin(modulesWith(rejecting)))).toBeNull();
  });

  it('is null when the query never settles', async () => {
    const hanging = { fetchQuery: () => ({ toPromise: () => new Promise(() => {}) }) };
    expect(await readCallBlockedUntil(fakeWin(modulesWith(hanging)), { timeoutMs: 20 })).toBeNull();
  });

  it('is null for a value that is not a number', async () => {
    expect(await readCallBlockedUntil(fakeWin(modulesWith(relayAnswering({}))))).toBeNull();
  });
});

describe('allowFacebookCalls', () => {
  it('writes 0 through facebook’s own mutation, then asks the server again', async () => {
    const commits: unknown[][] = [];
    const calls: unknown[][] = [];
    const mutation = {
      commit: (...args: unknown[]) => {
        commits.push(args);
        return Promise.resolve({});
      },
    };
    const win = fakeWin(
      modulesWith(relayAnswering(0, calls), { MWCallBlockedUntilSettingMutation: mutation }),
    );
    expect(await allowFacebookCalls(win)).toBe(0);
    expect(commits).toEqual([[ENV, { call_blocked_until: 0 }]]);
    expect(calls[0]?.[3]).toEqual({ fetchPolicy: 'network-only' });
  });

  it('asks facebook’s loader for its chat-settings menu when the mutation is not loaded', async () => {
    const commits: unknown[][] = [];
    const loads: string[] = [];
    const mutation = {
      commit: (...args: unknown[]) => {
        commits.push(args);
        return Promise.resolve({});
      },
    };
    const modules: Record<string, unknown> = modulesWith(relayAnswering(0), {
      // the live /messages page: the registry knows the name, nothing is loaded
      MWCallBlockedUntilSettingMutation: undefined,
      JSResource: {
        default: (name: string) => ({
          load: () => {
            loads.push(name);
            modules.MWCallBlockedUntilSettingMutation = mutation;
            return Promise.resolve({});
          },
        }),
      },
    });
    expect(await allowFacebookCalls(fakeWin(modules))).toBe(0);
    expect(loads).toEqual(['CometHomeChatSettings.react']);
    expect(commits).toEqual([[ENV, { call_blocked_until: 0 }]]);
  });

  it('is null when facebook’s loader cannot bring the mutation', async () => {
    const hanging = modulesWith(relayAnswering(0), {
      MWCallBlockedUntilSettingMutation: undefined,
      JSResource: () => ({ load: () => new Promise(() => {}) }),
    });
    expect(await allowFacebookCalls(fakeWin(hanging), 20)).toBeNull();
    const empty = modulesWith(relayAnswering(0), {
      MWCallBlockedUntilSettingMutation: undefined,
      JSResource: () => ({ load: () => Promise.resolve({}) }),
    });
    expect(await allowFacebookCalls(fakeWin(empty))).toBeNull();
  });

  it('is null, and reads nothing, when the mutation is missing or rejected', async () => {
    const calls: unknown[][] = [];
    expect(await allowFacebookCalls(fakeWin(modulesWith(relayAnswering(0, calls))))).toBeNull();
    const rejecting = { commit: () => Promise.reject(new Error('denied')) };
    const win = fakeWin(
      modulesWith(relayAnswering(0, calls), { MWCallBlockedUntilSettingMutation: rejecting }),
    );
    expect(await allowFacebookCalls(win)).toBeNull();
    expect(calls).toEqual([]);
  });
});
