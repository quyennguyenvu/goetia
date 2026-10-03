/** facebook.com's "Incoming call sounds" switch, read and written through the
 *  page's own module registry — a global `require` that throws on a name it
 *  does not know. Not a sound toggle: while `call_blocked_until` is non-zero
 *  the page never subscribes to rings (RTWebCallBlockSettingHooks). facebook
 *  renames internals at will, so every path settles, none throws, and a
 *  missing module reads as unknown. */

export const CALLS_HOOK_TIMEOUT_MS = 4_000;

type FetchPolicy = 'store-or-network' | 'network-only';

interface Relay {
  fetchQuery(
    env: unknown,
    query: unknown,
    vars: object,
    opts: { fetchPolicy: FetchPolicy },
  ): { toPromise(): Promise<unknown> };
}

interface CallBlockMutation {
  commit(env: unknown, vars: { call_blocked_until: number }): Promise<unknown>;
}

function fbModule(win: Window, name: string): unknown {
  const req = (win as unknown as { require?: unknown }).require;
  if (typeof req !== 'function') return null;
  try {
    const m = (req as (n: string) => unknown)(name) as { default?: unknown } | null | undefined;
    return m?.default ?? m ?? null;
  } catch {
    return null;
  }
}

/** The promise's value, or null when it rejects or outlasts `ms`. */
function settle<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(null);
      },
    );
  });
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && /^-?\d+$/.test(v)) return Number(v);
  return null;
}

/** The `call_blocked_until` facebook stores (seconds; -1 = until turned back
 *  on, 0 = calls on), or null when it cannot be read. The store is normally
 *  fresh — facebook's own subscription writes it — so it is asked first. */
export async function readCallBlockedUntil(
  win: Window,
  opts: { policy?: FetchPolicy; timeoutMs?: number } = {},
): Promise<number | null> {
  const relay = fbModule(win, 'CometRelay') as Partial<Relay> | null;
  const env = fbModule(win, 'CometRelayEnvironment');
  const query = fbModule(win, 'RTWebCallBlockSettingHooksQuery.graphql');
  if (typeof relay?.fetchQuery !== 'function' || !env || !query) return null;
  try {
    const observable = relay.fetchQuery(
      env,
      query,
      {},
      {
        fetchPolicy: opts.policy ?? 'store-or-network',
      },
    );
    const result = await settle(
      Promise.resolve(observable.toPromise()),
      opts.timeoutMs ?? CALLS_HOOK_TIMEOUT_MS,
    );
    const viewer = (result as { viewer?: { call_blocked_until?: unknown } } | null)?.viewer;
    return toNumber(viewer?.call_blocked_until);
  } catch {
    return null;
  }
}

const MUTATION = 'MWCallBlockedUntilSettingMutation';
/** facebook ships the mutation only with its chat-settings menu, which never
 *  loads on /messages — it hangs off the top bar Goetia hides — so the
 *  registry answers undefined until facebook's own loader fetches that menu
 *  (live probe, 2026-10-03). */
const SETTINGS_MENU = 'CometHomeChatSettings.react';

async function loadMutation(
  win: Window,
  timeoutMs: number,
): Promise<Partial<CallBlockMutation> | null> {
  const loaded = fbModule(win, MUTATION) as Partial<CallBlockMutation> | null;
  if (typeof loaded?.commit === 'function') return loaded;
  const jsResource = fbModule(win, 'JSResource');
  if (typeof jsResource !== 'function') return null;
  try {
    const menu = (jsResource as (name: string) => { load?: unknown } | null)(SETTINGS_MENU);
    if (typeof menu?.load !== 'function') return null;
    const done = await settle(
      Promise.resolve((menu.load as () => unknown).call(menu)).then(() => true as const),
      timeoutMs,
    );
    if (done !== true) return null;
  } catch {
    return null;
  }
  return fbModule(win, MUTATION) as Partial<CallBlockMutation> | null;
}

/** Turns incoming calls on — what flipping the switch back does — and
 *  returns the server's answer afterwards, or null when the write failed. */
export async function allowFacebookCalls(
  win: Window,
  timeoutMs = CALLS_HOOK_TIMEOUT_MS,
): Promise<number | null> {
  const mutation = await loadMutation(win, timeoutMs);
  const env = fbModule(win, 'CometRelayEnvironment');
  if (typeof mutation?.commit !== 'function' || !env) return null;
  let committed: true | null;
  try {
    committed = await settle(
      Promise.resolve(mutation.commit(env, { call_blocked_until: 0 })).then(() => true as const),
      timeoutMs,
    );
  } catch {
    return null;
  }
  if (committed !== true) return null;
  // the store may still hold the old value until the subscription lands
  return readCallBlockedUntil(win, { policy: 'network-only', timeoutMs });
}
