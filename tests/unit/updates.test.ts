import { afterEach, describe, expect, it, vi } from 'vitest';
import { MainState } from '../../src/main/state';
import { CHECK_INTERVAL_MS, FIRST_CHECK_MS, UpdateChecker } from '../../src/main/updates';

const release = (tag: string) =>
  ({ ok: true, status: 200, json: async () => ({ tag_name: tag }) }) as Response;

const httpError = (status: number) => ({ ok: false, status, json: async () => ({}) }) as Response;

function harness(
  opts: {
    fetchFn?: ReturnType<typeof vi.fn>;
    version?: string;
    visible?: boolean;
    autoEnabled?: boolean;
    lastNotified?: string | null;
  } = {},
) {
  const state = new MainState();
  const box = {
    visible: opts.visible ?? true,
    autoEnabled: opts.autoEnabled ?? true,
    lastNotified: opts.lastNotified ?? null,
  };
  const fetchFn = opts.fetchFn ?? vi.fn(async () => release('v0.3.0'));
  const checker = new UpdateChecker({
    version: opts.version ?? '0.2.0',
    state,
    autoEnabled: () => box.autoEnabled,
    lastNotified: () => box.lastNotified,
    setLastNotified: (v: string) => {
      box.lastNotified = v;
    },
    isVisible: () => box.visible,
    fetchFn: fetchFn as unknown as typeof fetch,
  });
  return { state, checker, fetchFn, box };
}

afterEach(() => vi.useRealTimers());

describe('UpdateChecker.check', () => {
  it('reports an available update and announces it once', async () => {
    const h = harness();
    await h.checker.check('manual');
    expect(h.state.update).toEqual({
      status: 'available',
      latest: '0.3.0',
      announce: '0.3.0',
    });
    expect(h.box.lastNotified).toBe('0.3.0');
  });

  it('sends the headers GitHub requires', async () => {
    const h = harness();
    await h.checker.check('manual');
    const init = h.fetchFn.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Accept).toBe('application/vnd.github+json');
    expect(headers['User-Agent']).toBe('Goetia/0.2.0');
  });

  it('reports up to date when the newest release is the running version', async () => {
    const h = harness({ fetchFn: vi.fn(async () => release('v0.2.0')) });
    await h.checker.check('manual');
    expect(h.state.update.status).toBe('current');
    expect(h.state.update.latest).toBeNull();
    expect(h.state.update.announce).toBeNull();
  });

  it('surfaces an HTTP failure only for a manual check', async () => {
    const manual = harness({ fetchFn: vi.fn(async () => httpError(500)) });
    await manual.checker.check('manual');
    expect(manual.state.update.status).toBe('error');

    const auto = harness({ fetchFn: vi.fn(async () => httpError(500)) });
    await auto.checker.check('auto');
    expect(auto.state.update.status).toBe('idle'); // silence, not an error
  });

  it('surfaces a network failure only for a manual check', async () => {
    const manual = harness({
      fetchFn: vi.fn(async () => {
        throw new Error('offline');
      }),
    });
    await manual.checker.check('manual');
    expect(manual.state.update.status).toBe('error');

    const auto = harness({
      fetchFn: vi.fn(async () => {
        throw new Error('offline');
      }),
    });
    await auto.checker.check('auto');
    expect(auto.state.update.status).toBe('idle');
  });

  it('treats an unrecognized payload as a failed check', async () => {
    const h = harness({
      fetchFn: vi.fn(
        async () =>
          ({ ok: true, status: 200, json: async () => ({ tag_name: 'nightly' }) }) as Response,
      ),
    });
    await h.checker.check('manual');
    expect(h.state.update.status).toBe('error');
  });

  // silence must not clobber: a known update survives a later failed check
  it('keeps an available update visible when a later automatic check fails', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(release('v0.3.0'))
      .mockRejectedValueOnce(new Error('offline'));
    const h = harness({ fetchFn });
    await h.checker.check('manual');
    expect(h.state.update.status).toBe('available');
    await h.checker.check('auto');
    expect(h.state.update.status).toBe('available');
    expect(h.state.update.latest).toBe('0.3.0');
  });

  it('runs one request for concurrent calls', async () => {
    const h = harness();
    await Promise.all([h.checker.check('manual'), h.checker.check('manual')]);
    expect(h.fetchFn).toHaveBeenCalledTimes(1);
  });

  it('skips an automatic check when the setting is off, but honors a manual one', async () => {
    const h = harness({ autoEnabled: false });
    await h.checker.check('auto');
    expect(h.fetchFn).not.toHaveBeenCalled();
    await h.checker.check('manual');
    expect(h.fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe('UpdateChecker announce gate', () => {
  it('holds the toast while the window is hidden, then releases it on show', async () => {
    const h = harness({ visible: false });
    await h.checker.check('auto');
    expect(h.state.update.status).toBe('available'); // the dot may show
    expect(h.state.update.announce).toBeNull(); // …but nothing was toasted
    expect(h.box.lastNotified).toBeNull();

    h.box.visible = true;
    h.checker.flushAnnounce();
    expect(h.state.update.announce).toBe('0.3.0');
    expect(h.box.lastNotified).toBe('0.3.0');
  });

  it('does not re-announce a version already announced', async () => {
    const h = harness({ lastNotified: '0.3.0' });
    await h.checker.check('auto');
    expect(h.state.update.status).toBe('available');
    expect(h.state.update.announce).toBeNull();
  });

  it('flushAnnounce is a no-op when nothing is pending', () => {
    const h = harness();
    h.checker.flushAnnounce();
    expect(h.state.update.announce).toBeNull();
  });
});

describe('UpdateChecker timers', () => {
  // the async variant flushes microtasks, so the first check settles and
  // releases the in-flight guard before the interval fires
  it('checks shortly after start and again on the interval', async () => {
    vi.useFakeTimers();
    const h = harness();
    h.checker.start();
    expect(h.fetchFn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(FIRST_CHECK_MS);
    expect(h.fetchFn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
    expect(h.fetchFn).toHaveBeenCalledTimes(2);
  });

  it('stops checking after dispose', () => {
    vi.useFakeTimers();
    const h = harness();
    h.checker.start();
    h.checker.dispose();
    vi.advanceTimersByTime(FIRST_CHECK_MS + CHECK_INTERVAL_MS * 3);
    expect(h.fetchFn).not.toHaveBeenCalled();
  });

  it('start is idempotent', () => {
    vi.useFakeTimers();
    const h = harness();
    h.checker.start();
    h.checker.start();
    vi.advanceTimersByTime(FIRST_CHECK_MS);
    expect(h.fetchFn).toHaveBeenCalledTimes(1);
  });
});
