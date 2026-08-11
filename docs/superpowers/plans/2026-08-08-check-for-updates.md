# Check for updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Goetia notices when a newer release exists on GitHub, announces it with a toast that dismisses itself, and links to the download page.

**Architecture:** A main-process `UpdateChecker` polls the GitHub Releases API on a timer, delegates every decision to a pure `lib/update-check.ts`, and writes a small `update` slice into `MainState`. That slice rides the existing `shell:state` broadcast to the renderer, which renders a self-expiring toast, a dot on the settings gear, and an Updates section in Settings. The renderer never handles a URL — main builds it from a version it validated itself.

**Tech Stack:** Electron 43 (Node 22 global `fetch`), TypeScript, React 19, zustand, Tailwind v4, vitest (node environment), Playwright.

**Spec:** `docs/superpowers/specs/2026-08-08-check-for-updates-design.md`

## Global Constraints

- **Never run `git commit`.** This repo's owner commits only via the `/grimoire-core:commit` command after reviewing the message. Where a task says "Checkpoint", stop and tell the user the task is ready to commit. Do not write `GRIMOIRE_COMMIT_MSG.txt`. Do not use `git commit --amend`.
- **Definition of done for every task:** `corepack pnpm lint`, `corepack pnpm typecheck`, and `corepack pnpm test` pass. Tasks 5–8 additionally require `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e` (VS Code shells export `ELECTRON_RUN_AS_NODE`, which breaks Playwright's Electron launch).
- **Repo constant:** `REPO = 'quyennguyenvu/goetia'`. Hardcoded — never read a URL out of an API payload.
- **Timings, exact:** first automatic check `10_000` ms after launch, interval `86_400_000` ms, request timeout `10_000` ms, toast lifetime `8_000` ms.
- **`src/shared/**` stays process-agnostic** — no `electron`, no DOM imports.
- **Every new IPC channel** is registered through the `register()` wrapper in `ipc-handlers.ts` and listed in both `R2M_CHANNELS` and `SHELL_ONLY_CHANNELS` in `src/shared/ipc.ts`.
- **Automatic failures are silent.** Only `check('manual')` may set `status: 'error'`.
- **`shell.openExternal` is only ever called behind `isSafeExternalUrl`.**
- **Biome formats at 100 columns**, single quotes, 2-space indent. Run `corepack pnpm exec biome check --write .` if `lint` complains about formatting.

---

## File Structure

**Created:**

- `src/main/lib/update-check.ts` — pure: validate a release payload, compare versions, build the release URL. No I/O, no electron.
- `src/main/updates.ts` — `UpdateChecker`: timers, one in-flight fetch, the announce gate. Dependencies injected as plain functions, no electron import.
- `src/renderer/src/components/toast-rules.ts` — `TOAST_MS` and the one-line dedup rule, kept pure so it can be unit tested.
- `src/renderer/src/components/UpdateToast.tsx` — the toast.
- `tests/unit/update-check.test.ts`, `tests/unit/updates.test.ts`, `tests/unit/toast-rules.test.ts`, `tests/e2e/updates.spec.ts`.

**Modified:**

- `src/shared/types.ts` — `UpdateStatus`, `UpdateState`, two `Settings` fields, `ShellState.update`.
- `src/shared/ipc.ts` — two shell-only channels.
- `src/main/state.ts` — the `update` slice with a no-op guard.
- `src/main/ipc-handlers.ts` — two handlers, `updates` on `AppContext`.
- `src/main/menu.ts` — `Check for Updates…`.
- `src/main/index.ts` — construct, `show` hook, `before-quit`, e2e seed.
- `src/renderer/src/store.ts` — `focusSection`.
- `src/renderer/src/components/Rail.tsx` — gear dot.
- `src/renderer/src/components/SettingsView.tsx` — Updates section.
- `src/renderer/src/tokens.css` — two keyframes for the toast.
- `README.md`, `docs/FEATURES.md`.

---

### Task 1: Pure version logic

**Files:**

- Create: `src/main/lib/update-check.ts`
- Test: `tests/unit/update-check.test.ts`

**Interfaces:**

- Consumes: `isSafeExternalUrl` from `src/main/lib/external-url.ts` (test only).
- Produces: `REPO`, `LATEST_RELEASE_API`, `parseLatestRelease(json: unknown): string | null`, `compareVersions(a: string, b: string): number`, `isNewer(current: string, latest: string): boolean`, `releaseUrl(version: string): string`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/update-check.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isSafeExternalUrl } from '../../src/main/lib/external-url';
import {
  compareVersions,
  isNewer,
  parseLatestRelease,
  releaseUrl,
} from '../../src/main/lib/update-check';

describe('parseLatestRelease', () => {
  it('accepts a v-prefixed semver tag', () => {
    expect(parseLatestRelease({ tag_name: 'v0.3.0' })).toBe('0.3.0');
  });

  it('accepts a bare semver tag', () => {
    expect(parseLatestRelease({ tag_name: '1.2.3' })).toBe('1.2.3');
  });

  it('accepts a prerelease tag', () => {
    expect(parseLatestRelease({ tag_name: 'v0.3.0-rc.1' })).toBe('0.3.0-rc.1');
  });

  // the payload is attacker-shaped input: anything that is not a plain
  // version must be refused, because a version string becomes a URL
  it.each([
    ['missing tag_name', {}],
    ['non-string tag', { tag_name: 42 }],
    ['null tag', { tag_name: null }],
    ['non-object payload', 'v0.3.0'],
    ['null payload', null],
    ['array payload', []],
    ['a word', { tag_name: 'latest' }],
    ['two-part version', { tag_name: 'v1.2' }],
    ['path traversal', { tag_name: 'v1.0.0/../../evil' }],
    ['embedded url', { tag_name: 'v1.0.0 https://evil.test' }],
    ['newline injection', { tag_name: 'v1.0.0\nv9.9.9' }],
  ])('rejects %s', (_label, payload) => {
    expect(parseLatestRelease(payload)).toBeNull();
  });
});

describe('compareVersions', () => {
  it.each([
    ['0.3.0', '0.2.0', 1],
    ['0.2.0', '0.3.0', -1],
    ['0.2.0', '0.2.0', 0],
    ['1.0.0', '0.99.99', 1],
    ['0.10.0', '0.9.0', 1], // numeric, not lexical
    ['0.3.0', '0.3.0-rc.1', 1], // a release beats its prerelease
    ['0.3.0-rc.1', '0.3.0', -1],
    ['0.3.0-rc.2', '0.3.0-rc.1', 1],
  ])('compare(%s, %s) === %i', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });

  it('refuses to order an unparsable version', () => {
    expect(compareVersions('99.0.0', 'not-a-version')).toBe(0);
  });
});

describe('isNewer', () => {
  it('is true only when latest is ahead', () => {
    expect(isNewer('0.2.0', '0.3.0')).toBe(true);
    expect(isNewer('0.3.0', '0.3.0')).toBe(false);
    expect(isNewer('0.3.0', '0.2.0')).toBe(false);
  });

  // a garbled running version must not manufacture a permanent update banner
  it('never reports an update when the running version is unparsable', () => {
    expect(isNewer('not-a-version', '99.0.0')).toBe(false);
  });
});

describe('releaseUrl', () => {
  it('points at the tag page and is safe to hand to the OS', () => {
    const url = releaseUrl('0.3.0');
    expect(url).toBe('https://github.com/quyennguyenvu/goetia/releases/tag/v0.3.0');
    expect(isSafeExternalUrl(url)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm exec vitest run tests/unit/update-check.test.ts`

Expected: FAIL — `Failed to resolve import "../../src/main/lib/update-check"`.

- [ ] **Step 3: Write the implementation**

Create `src/main/lib/update-check.ts`:

```ts
/** The repo that publishes Goetia releases. Hardcoded on purpose: the
 *  download URL must never be derived from an API payload. */
export const REPO = 'quyennguyenvu/goetia';

export const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;

const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function parts(v: string): { nums: number[]; pre: string | null } | null {
  if (!VERSION_RE.test(v)) return null;
  const dash = v.indexOf('-');
  const core = dash === -1 ? v : v.slice(0, dash);
  return { nums: core.split('.').map(Number), pre: dash === -1 ? null : v.slice(dash + 1) };
}

/** `tag_name` → bare version, or null when it is not a plain semver tag. */
export function parseLatestRelease(json: unknown): string | null {
  if (typeof json !== 'object' || json === null) return null;
  const tag = (json as { tag_name?: unknown }).tag_name;
  if (typeof tag !== 'string') return null;
  const version = tag.startsWith('v') ? tag.slice(1) : tag;
  return VERSION_RE.test(version) ? version : null;
}

/** -1 / 0 / 1. A prerelease sorts below the release it precedes; an
 *  unparsable input yields 0 so callers never act on a bogus ordering. */
export function compareVersions(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa.nums[i] !== pb.nums[i]) return pa.nums[i] < pb.nums[i] ? -1 : 1;
  }
  if (pa.pre === pb.pre) return 0;
  if (pa.pre === null) return 1;
  if (pb.pre === null) return -1;
  return pa.pre < pb.pre ? -1 : 1;
}

export function isNewer(current: string, latest: string): boolean {
  return compareVersions(latest, current) > 0;
}

/** Built from an already-validated version, never from the payload. */
export function releaseUrl(version: string): string {
  return `https://github.com/${REPO}/releases/tag/v${version}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `corepack pnpm exec vitest run tests/unit/update-check.test.ts`

Expected: PASS — 4 suites, all assertions green.

- [ ] **Step 5: Verify the whole gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`

Expected: all three exit 0.

- [ ] **Step 6: Checkpoint**

Stop. Tell the user Task 1 is ready and ask them to run `/grimoire-core:commit`. Do not commit.

---

### Task 2: Update state on the wire

**Files:**

- Modify: `src/shared/types.ts`
- Modify: `src/main/state.ts`
- Test: `tests/unit/state.test.ts` (append), `tests/unit/settings.test.ts` (append)

**Interfaces:**

- Consumes: nothing from Task 1.
- Produces: `UpdateStatus`, `UpdateState { status; latest; announce }`, `Settings.checkForUpdates: boolean`, `Settings.lastNotifiedVersion: string | null`, `ShellState.update: UpdateState`, `MainState.update` (getter) and `MainState.setUpdate(patch: Partial<UpdateState>): void`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/state.test.ts`, inside the existing `describe('MainState', ...)` block:

```ts
  it('does not notify when an update patch changes nothing', () => {
    const s = new MainState();
    s.setUpdate({ status: 'available', latest: '0.3.0' });
    const cb = vi.fn();
    s.onChange(cb);
    s.setUpdate({ status: 'available', latest: '0.3.0' }); // identical -> no notify
    expect(cb).not.toHaveBeenCalled();
    s.setUpdate({ announce: '0.3.0' }); // real change -> notify
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('snapshot carries the update slice', () => {
    const s = new MainState();
    s.setUpdate({ status: 'available', latest: '0.3.0', announce: '0.3.0' });
    const snap = s.snapshot(DEFAULT_SETTINGS, 'dark', '0.2.0');
    expect(snap.update).toEqual({ status: 'available', latest: '0.3.0', announce: '0.3.0' });
  });

  it('starts with no update known', () => {
    const s = new MainState();
    expect(s.update).toEqual({ status: 'idle', latest: null, announce: null });
  });
```

Append to `tests/unit/settings.test.ts`, inside `describe('SettingsStore', ...)`:

```ts
  it('defaults automatic update checks on, with nothing announced yet', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    const s = new SettingsStore(dir).get();
    expect(s.checkForUpdates).toBe(true);
    expect(s.lastNotifiedVersion).toBeNull();
  });

  it('adds the update fields to a settings.json written before they existed', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ globalMuted: true }));
    const s = new SettingsStore(dir).get();
    expect(s.checkForUpdates).toBe(true);
    expect(s.lastNotifiedVersion).toBeNull();
    expect(s.globalMuted).toBe(true); // existing pref survives
  });

  it('persists the last announced version', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    new SettingsStore(dir).update({ lastNotifiedVersion: '0.3.0' });
    expect(new SettingsStore(dir).get().lastNotifiedVersion).toBe('0.3.0');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `corepack pnpm exec vitest run tests/unit/state.test.ts tests/unit/settings.test.ts`

Expected: FAIL — `s.setUpdate is not a function`, and `Property 'checkForUpdates' does not exist`.

- [ ] **Step 3: Add the types**

In `src/shared/types.ts`, add after the `Counts` interface:

```ts
export type UpdateStatus = 'idle' | 'checking' | 'current' | 'available' | 'error';

export interface UpdateState {
  status: UpdateStatus;
  /** newest release seen; drives the gear dot and the Updates section */
  latest: string | null;
  /** version the shell should toast now; held back while the window is hidden */
  announce: string | null;
}
```

In the same file add two fields to `Settings`, after `railPosition`:

```ts
  checkForUpdates: boolean;
  /** the version already announced; persisted so a restart never re-toasts */
  lastNotifiedVersion: string | null;
```

Add the matching defaults to `DEFAULT_SETTINGS`, after `railPosition: 'top',`:

```ts
  checkForUpdates: true,
  lastNotifiedVersion: null,
```

Add one field to `ShellState`, after `version: string;`:

```ts
  update: UpdateState;
```

- [ ] **Step 4: Add the state slice**

In `src/main/state.ts`, extend the type import on line 2 to include `UpdateState`:

```ts
import type { ServiceId, ServiceRuntime, Settings, ShellState, UpdateState } from '../shared/types';
```

Add below `defaultRuntime`:

```ts
const defaultUpdate = (): UpdateState => ({ status: 'idle', latest: null, announce: null });
```

Inside `class MainState`, add the field and accessors next to `runtimes`:

```ts
  private updateState: UpdateState = defaultUpdate();

  get update(): UpdateState {
    return this.updateState;
  }

  /** Same report-on-change discipline as setRuntime: an identical patch must
   *  not cost a broadcast. */
  setUpdate(patch: Partial<UpdateState>): void {
    const entries = Object.entries(patch) as [keyof UpdateState, string | null][];
    if (entries.every(([k, v]) => this.updateState[k] === v)) return;
    Object.assign(this.updateState, patch);
    this.touch();
  }
```

In `snapshot()`, add to the returned object after `version,`:

```ts
      update: { ...this.updateState },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `corepack pnpm exec vitest run tests/unit/state.test.ts tests/unit/settings.test.ts`

Expected: PASS.

- [ ] **Step 6: Verify the whole gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`

Expected: all three exit 0. `typecheck` will flag nothing yet because `ShellState.update` is only read in later tasks.

- [ ] **Step 7: Checkpoint**

Stop and ask the user to run `/grimoire-core:commit`.

---

### Task 3: The update checker

**Files:**

- Create: `src/main/updates.ts`
- Test: `tests/unit/updates.test.ts`

**Interfaces:**

- Consumes: `LATEST_RELEASE_API`, `parseLatestRelease`, `isNewer` (Task 1); `MainState.setUpdate` (Task 2).
- Produces: `FIRST_CHECK_MS`, `CHECK_INTERVAL_MS`, `REQUEST_TIMEOUT_MS`, `UpdateCheckerDeps`, and `class UpdateChecker` with `check(reason: 'auto' | 'manual'): Promise<void>`, `start(): void`, `dispose(): void`, `flushAnnounce(): void`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/updates.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MainState } from '../../src/main/state';
import { CHECK_INTERVAL_MS, FIRST_CHECK_MS, UpdateChecker } from '../../src/main/updates';

const release = (tag: string) =>
  ({ ok: true, status: 200, json: async () => ({ tag_name: tag }) }) as Response;

const httpError = (status: number) =>
  ({ ok: false, status, json: async () => ({}) }) as Response;

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
    const boom = vi.fn(async () => {
      throw new Error('offline');
    });
    const manual = harness({ fetchFn: boom });
    await manual.checker.check('manual');
    expect(manual.state.update.status).toBe('error');

    const auto = harness({ fetchFn: vi.fn(async () => { throw new Error('offline'); }) });
    await auto.checker.check('auto');
    expect(auto.state.update.status).toBe('idle');
  });

  it('treats an unrecognized payload as a failed check', async () => {
    const h = harness({
      fetchFn: vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tag_name: 'nightly' }) }) as Response),
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
  it('checks shortly after start and again on the interval', async () => {
    vi.useFakeTimers();
    const h = harness();
    h.checker.start();
    expect(h.fetchFn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(FIRST_CHECK_MS);
    expect(h.fetchFn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(CHECK_INTERVAL_MS);
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm exec vitest run tests/unit/updates.test.ts`

Expected: FAIL — `Failed to resolve import "../../src/main/updates"`.

- [ ] **Step 3: Write the implementation**

Create `src/main/updates.ts`:

```ts
import { isNewer, LATEST_RELEASE_API, parseLatestRelease } from './lib/update-check';
import type { MainState } from './state';

/** Late enough that it never competes with service view boot. */
export const FIRST_CHECK_MS = 10_000;
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const REQUEST_TIMEOUT_MS = 10_000;

export interface UpdateCheckerDeps {
  /** the running app version, i.e. app.getVersion() */
  version: string;
  state: MainState;
  /** settings.checkForUpdates */
  autoEnabled(): boolean;
  /** settings.lastNotifiedVersion */
  lastNotified(): string | null;
  setLastNotified(version: string): void;
  /** a hidden window must not be toasted at */
  isVisible(): boolean;
  fetchFn?: typeof fetch;
}

/** Polls GitHub Releases and writes the result into MainState. Owns no
 *  electron objects: everything it needs arrives as a function. */
export class UpdateChecker {
  private inFlight: Promise<void> | null = null;
  private pending: string | null = null;
  private first: NodeJS.Timeout | null = null;
  private interval: NodeJS.Timeout | null = null;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly deps: UpdateCheckerDeps) {
    this.fetchFn = deps.fetchFn ?? fetch;
  }

  start(): void {
    if (this.interval) return;
    this.first = setTimeout(() => void this.check('auto'), FIRST_CHECK_MS);
    this.interval = setInterval(() => void this.check('auto'), CHECK_INTERVAL_MS);
  }

  dispose(): void {
    if (this.first) clearTimeout(this.first);
    if (this.interval) clearInterval(this.interval);
    this.first = null;
    this.interval = null;
  }

  check(reason: 'auto' | 'manual'): Promise<void> {
    if (reason === 'auto' && !this.deps.autoEnabled()) return Promise.resolve();
    if (this.inFlight) return this.inFlight;
    if (reason === 'manual') this.deps.state.setUpdate({ status: 'checking' });
    this.inFlight = this.run(reason).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  /** Wire to the window's `show` event. */
  flushAnnounce(): void {
    const version = this.pending;
    if (!version) return;
    this.pending = null;
    this.announce(version);
  }

  private async run(reason: 'auto' | 'manual'): Promise<void> {
    try {
      const res = await this.fetchFn(LATEST_RELEASE_API, {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': `Goetia/${this.deps.version}`,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const latest = parseLatestRelease(await res.json());
      if (!latest) throw new Error('unrecognized release payload');
      this.apply(latest);
    } catch {
      // being offline is not news: only a check the user asked for reports back
      if (reason === 'manual') this.deps.state.setUpdate({ status: 'error' });
    }
  }

  private apply(latest: string): void {
    if (!isNewer(this.deps.version, latest)) {
      this.deps.state.setUpdate({ status: 'current', latest: null });
      return;
    }
    this.deps.state.setUpdate({ status: 'available', latest });
    this.announce(latest);
  }

  /** Toast once per version, and never at a window nobody can see. */
  private announce(version: string): void {
    if (this.deps.lastNotified() === version) return;
    if (!this.deps.isVisible()) {
      this.pending = version;
      return;
    }
    this.deps.setLastNotified(version);
    this.deps.state.setUpdate({ announce: version });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `corepack pnpm exec vitest run tests/unit/updates.test.ts`

Expected: PASS — 3 suites, 16 tests.

- [ ] **Step 5: Verify the whole gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`

Expected: all three exit 0.

- [ ] **Step 6: Checkpoint**

Stop and ask the user to run `/grimoire-core:commit`.

---

### Task 4: Wire it into main

**Files:**

- Modify: `src/shared/ipc.ts`
- Modify: `src/main/ipc-handlers.ts`
- Modify: `src/main/menu.ts`
- Modify: `src/main/index.ts`

**Interfaces:**

- Consumes: `UpdateChecker` and its constructor deps (Task 3), `releaseUrl` (Task 1), `MainState.update` (Task 2).
- Produces: IPC channels `updates:check` and `updates:openDownload`; `AppContext.updates: UpdateChecker`; the `--goetia-e2e-update` launch flag that Task 8 drives.

- [ ] **Step 1: Add the channels**

In `src/shared/ipc.ts`, add to the `RendererToMain` interface, after `'service:ready'`:

```ts
  'updates:check': Record<string, never>;
  'updates:openDownload': Record<string, never>;
```

Add both to `R2M_CHANNELS`, after `'service:ready',`:

```ts
  'updates:check',
  'updates:openDownload',
```

Add both to `SHELL_ONLY_CHANNELS`, after `'badge:overlay',` — they carry no `serviceId`, so only the shell frame may send them:

```ts
  'updates:check',
  'updates:openDownload',
```

- [ ] **Step 2: Add the handlers**

In `src/main/ipc-handlers.ts`, extend the electron import on line 1:

```ts
import { app, type BrowserWindow, ipcMain, shell } from 'electron';
```

Add two imports below the existing `./lib/...` imports:

```ts
import { isSafeExternalUrl } from './lib/external-url';
import { releaseUrl } from './lib/update-check';
```

Add to the `AppContext` interface, after `waking: WakingTracker;`:

```ts
  updates: UpdateChecker;
```

Add the type import for it near the other type imports:

```ts
import type { UpdateChecker } from './updates';
```

Register the two handlers at the end of `registerIpcHandlers`, after the `service:keepalive-click` line:

```ts
  on('updates:check', () => void ctx.updates.check('manual'));
  on('updates:openDownload', () => {
    // the URL is built here from a version main validated — the renderer
    // never supplies one
    const version = ctx.state.update.latest;
    if (!version) return;
    const url = releaseUrl(version);
    if (isSafeExternalUrl(url)) shell.openExternal(url);
  });
```

- [ ] **Step 3: Add the menu item**

In `src/main/menu.ts`, add below the `settingsItem` declaration inside `buildAppMenu`:

```ts
  const checkUpdatesItem: Electron.MenuItemConstructorOptions = {
    label: 'Check for Updates…',
    click: () => {
      openSettings(ctx); // land the answer where the user is now looking
      void ctx.updates.check('manual');
    },
  };
```

In the darwin submenu, replace `{ role: 'about' as const },` with:

```ts
              { role: 'about' as const },
              checkUpdatesItem,
```

In the non-darwin tail of the `Go` submenu, replace

```ts
        ...(process.platform !== 'darwin' ? [{ type: 'separator' as const }, settingsItem] : []),
```

with:

```ts
        ...(process.platform !== 'darwin'
          ? [{ type: 'separator' as const }, checkUpdatesItem, settingsItem]
          : []),
```

- [ ] **Step 4: Construct and wire it in index.ts**

In `src/main/index.ts`, add the import next to the other `./` imports:

```ts
import { UpdateChecker } from './updates';
```

Insert after the `const views = new ServiceViewManager(...)` block and before `const syncOverlay = ...`:

```ts
    const updates = new UpdateChecker({
      version: app.getVersion(),
      state,
      autoEnabled: () => settings.get().checkForUpdates,
      lastNotified: () => settings.get().lastNotifiedVersion,
      setLastNotified: (v) => {
        settings.update({ lastNotifiedVersion: v });
      },
      isVisible: () => !win.isDestroyed() && win.isVisible(),
    });
```

Add `updates,` to the `ctx` object literal, after `waking,`:

```ts
      waking,
      updates,
```

Add below the existing `win.on('focus', ...)` handler:

```ts
    // a check can land while the app sits in the tray; the toast waits
    win.on('show', () => updates.flushAnnounce());
```

Add after `buildAppMenu(ctx);`:

```ts
    // dev and e2e runs must not touch the network; a manual check still works
    if (app.isPackaged) updates.start();
    app.on('before-quit', () => updates.dispose());
```

Finally, add the e2e seed below the existing `--goetia-e2e` block. It is a separate flag so the existing specs are untouched by a toast:

```ts
    if (process.argv.includes('--goetia-e2e-update')) {
      setTimeout(() => {
        state.setUpdate({ status: 'available', latest: '99.0.0', announce: '99.0.0' });
      }, 800);
    }
```

- [ ] **Step 5: Verify the whole gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`

Expected: all three exit 0. `typecheck` proves every `AppContext` construction site now supplies `updates`.

- [ ] **Step 6: Verify the app still launches**

Run: `corepack pnpm dev`

Expected: the window opens as before. Open the menu and confirm **Check for Updates…** is present (macOS: under Goetia, right after About). Clicking it opens Settings; the Updates section does not exist yet, so nothing else changes. Quit with Cmd/Ctrl+Q.

- [ ] **Step 7: Checkpoint**

Stop and ask the user to run `/grimoire-core:commit`.

---

### Task 5: The gear dot

**Files:**

- Modify: `src/renderer/src/store.ts`
- Modify: `src/renderer/src/components/Rail.tsx`

**Interfaces:**

- Consumes: `ShellState.update` (Task 2).
- Produces: `useShell` gains `focusSection: 'updates' | null` and `setFocusSection(s: 'updates' | null): void`; the DOM gains `[data-testid="gear-dot"]`, which Task 8 asserts on.

- [ ] **Step 1: Add the store flag**

Replace the whole of `src/renderer/src/store.ts` with:

```ts
import { create } from 'zustand';
import type { ShellState } from '../../shared/types';

interface ShellStore {
  state: ShellState | null;
  setState(s: ShellState): void;
  /** set when the user opens Settings expecting to land on Updates */
  focusSection: 'updates' | null;
  setFocusSection(s: 'updates' | null): void;
}

export const useShell = create<ShellStore>((set) => ({
  state: null,
  setState: (s) => set({ state: s }),
  focusSection: null,
  setFocusSection: (focusSection) => set({ focusSection }),
}));

export function connectShell(): () => void {
  return window.goetia.onState((s) => {
    document.documentElement.dataset.theme = s.theme;
    useShell.getState().setState(s);
  });
}
```

- [ ] **Step 2: Add the dot to the gear**

In `src/renderer/src/components/Rail.tsx`, add below the `const visible = ...` line:

```ts
  const updateReady = state.update.status === 'available';
```

Replace the whole settings `<button>` element with:

```tsx
        <button
          type="button"
          title={updateReady ? 'Settings — update available (⌘,)' : 'Settings (⌘,)'}
          data-testid="settings-btn"
          onClick={() => {
            if (updateReady) useShell.getState().setFocusSection('updates');
            window.goetia.send('settings:setOpen', { open: !state.settingsOpen });
          }}
          className={`group relative flex h-7 w-7 items-center justify-center rounded-ctl transition-colors duration-120 ${
            state.settingsOpen
              ? 'bg-bg-2 text-accent'
              : 'text-text-2 hover:bg-bg-2 hover:text-text-1'
          }`}
        >
          <span className="transition-transform duration-120 group-hover:rotate-45">
            <GearIcon />
          </span>
          {updateReady && (
            <span
              data-testid="gear-dot"
              aria-hidden="true"
              className="absolute right-0.5 top-0.5 h-[7px] w-[7px] rounded-full bg-accent ring-2 ring-bg-1"
            />
          )}
        </button>
```

Note the added `relative` in the class list — the dot is positioned against this button.

- [ ] **Step 3: Verify the whole gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`

Expected: all three exit 0.

- [ ] **Step 4: See the dot**

Run: `corepack pnpm dev`

Expected: no dot (nothing has reported an update). In the running app open DevTools for the shell window and confirm the gear renders without a dot; Task 8's e2e run is what proves the dot appears. Quit.

- [ ] **Step 5: Checkpoint**

Stop and ask the user to run `/grimoire-core:commit`.

---

### Task 6: The toast

**Files:**

- Create: `src/renderer/src/components/toast-rules.ts`
- Create: `src/renderer/src/components/UpdateToast.tsx`
- Modify: `src/renderer/src/tokens.css`
- Modify: `src/renderer/src/App.tsx`
- Test: `tests/unit/toast-rules.test.ts`

**Interfaces:**

- Consumes: `ShellState.update.announce` (Task 2), the `updates:openDownload` channel (Task 4).
- Produces: `TOAST_MS = 8000`, `shouldToast(announce: string | null, lastToasted: string | null): boolean`, default export `UpdateToast`, and `[data-testid="update-toast"]` in the DOM.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/toast-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { shouldToast, TOAST_MS } from '../../src/renderer/src/components/toast-rules';

describe('shouldToast', () => {
  it('announces a version the shell has not shown yet', () => {
    expect(shouldToast('0.3.0', null)).toBe(true);
    expect(shouldToast('0.3.1', '0.3.0')).toBe(true);
  });

  // shell:state is re-broadcast on every unrelated change; a repeat of the
  // same announce value must not re-toast
  it('ignores a repeat of the version it already showed', () => {
    expect(shouldToast('0.3.0', '0.3.0')).toBe(false);
  });

  it('never toasts when nothing is announced', () => {
    expect(shouldToast(null, null)).toBe(false);
    expect(shouldToast(null, '0.3.0')).toBe(false);
  });
});

describe('TOAST_MS', () => {
  it('is the eight seconds the design specifies', () => {
    expect(TOAST_MS).toBe(8000);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm exec vitest run tests/unit/toast-rules.test.ts`

Expected: FAIL — cannot resolve `.../components/toast-rules`.

- [ ] **Step 3: Write the rules**

Create `src/renderer/src/components/toast-rules.ts`:

```ts
export const TOAST_MS = 8000;

/** Announce a version once. `lastToasted` is the shell's own memory, so a
 *  re-broadcast of unchanged state is a no-op. */
export function shouldToast(announce: string | null, lastToasted: string | null): boolean {
  return announce !== null && announce !== lastToasted;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `corepack pnpm exec vitest run tests/unit/toast-rules.test.ts`

Expected: PASS — 4 tests.

- [ ] **Step 5: Add the keyframes**

In `src/renderer/src/tokens.css`, add after the `.tile-breathe` block and **before** the `@media (prefers-reduced-motion: reduce)` block, so the existing override still disables them:

```css
.toast-in {
  animation: toast-in 240ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
/* purely decorative: dismissal is a setTimeout, so reduced motion killing
   this animation changes nothing about when the toast leaves */
.toast-drain {
  animation: toast-drain linear forwards;
  transform-origin: left;
}
@keyframes toast-drain {
  from {
    transform: scaleX(1);
  }
  to {
    transform: scaleX(0);
  }
}
```

- [ ] **Step 6: Write the component**

Create `src/renderer/src/components/UpdateToast.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { useShell } from '../store';
import { shouldToast, TOAST_MS } from './toast-rules';

function ArrowUpIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </svg>
  );
}

/** Announces a new release and then leaves. No close button, nothing the
 *  user must click: dismissal is a timer, and hovering banks the remainder. */
export default function UpdateToast() {
  const announce = useShell((s) => s.state?.update.announce ?? null);
  const current = useShell((s) => s.state?.version ?? '');
  const [showing, setShowing] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const lastToasted = useRef<string | null>(null);
  const remaining = useRef(TOAST_MS);

  useEffect(() => {
    if (!shouldToast(announce, lastToasted.current)) return;
    lastToasted.current = announce;
    remaining.current = TOAST_MS;
    setPaused(false);
    setShowing(announce);
  }, [announce]);

  useEffect(() => {
    if (!showing || paused) return;
    const startedAt = Date.now();
    const id = setTimeout(() => setShowing(null), remaining.current);
    return () => {
      clearTimeout(id);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
    };
  }, [showing, paused]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-x-4 bottom-4 z-10 flex justify-end"
    >
      {showing && (
        <button
          type="button"
          data-testid="update-toast"
          onClick={() => {
            window.goetia.send('updates:openDownload', {});
            setShowing(null);
          }}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          className="toast-in pointer-events-auto relative flex w-[340px] max-w-full items-start gap-3 overflow-hidden rounded-modal border border-border bg-bg-1 p-3.5 text-left shadow-[0_8px_32px_rgba(0,0,0,.4)] transition-colors duration-120 hover:border-accent"
        >
          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-tile bg-gradient-to-br from-[#FFB43D] via-[#FF8A2A] to-[#F04E3E] text-[#2A1403]">
            <ArrowUpIcon />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="font-semibold text-text-1">Goetia {showing} is available</span>
            <span className="text-text-2">You're on {current} — click to download</span>
          </span>
          <span
            aria-hidden="true"
            style={{
              animationDuration: `${TOAST_MS}ms`,
              animationPlayState: paused ? 'paused' : 'running',
            }}
            className="toast-drain absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-[#FFB43D] via-[#FF8A2A] to-[#F04E3E]"
          />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Mount it**

In `src/renderer/src/App.tsx`, add the import next to the other component imports:

```tsx
import UpdateToast from './components/UpdateToast';
```

Replace the content region so the toast is positioned inside it — the rail may sit on any edge, and the toast must stay clear of it:

```tsx
      <div className="relative flex min-h-0 min-w-0 flex-1">
        {allDisabled ? <Welcome /> : <ContentPlaceholder />}
        <UpdateToast />
      </div>
```

- [ ] **Step 8: Verify the whole gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`

Expected: all three exit 0.

- [ ] **Step 9: Checkpoint**

Stop and ask the user to run `/grimoire-core:commit`.

---

### Task 7: The Updates section in Settings

**Files:**

- Modify: `src/renderer/src/components/SettingsView.tsx`

**Interfaces:**

- Consumes: `ShellState.update` (Task 2), `updates:check` and `updates:openDownload` (Task 4), `useShell().focusSection` (Task 5).
- Produces: `[data-testid="update-action"]` in the DOM, which Task 8 asserts on.

- [ ] **Step 1: Add the imports and the status helper**

In `src/renderer/src/components/SettingsView.tsx`, replace the first three import lines with:

```tsx
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import type { RailPosition, Settings, ThemePref, UpdateState } from '../../../shared/types';
import { useShell } from '../store';
```

Add below the `Section` component:

```tsx
function updateStatusLine(u: UpdateState, current: string): string {
  switch (u.status) {
    case 'checking':
      return 'Checking…';
    case 'current':
      return 'Goetia is up to date';
    case 'available':
      return `You're on ${current}`;
    case 'error':
      return "Couldn't reach GitHub. Try again.";
    default:
      return 'Personal multi-service chat client';
  }
}
```

- [ ] **Step 2: Add the scroll-to-Updates behavior**

Inside `SettingsView`, add below `const open = state?.settingsOpen ?? false;`:

```tsx
  const focusSection = useShell((s) => s.focusSection);
  const setFocusSection = useShell((s) => s.setFocusSection);
  const updatesRef = useRef<HTMLDivElement>(null);
  const [flash, setFlash] = useState(false);
  const updateStatus = state?.update.status;
```

Add a second `useEffect` immediately after the existing Escape-key effect — it must sit **above** the `if (!state?.settingsOpen) return null;` line, since hooks cannot run conditionally:

```tsx
  // arriving from the gear dot or from Check for Updates… lands the user on
  // Updates rather than wherever the modal happened to be scrolled
  useEffect(() => {
    if (!open) return;
    if (focusSection !== 'updates' && updateStatus !== 'checking') return;
    updatesRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    setFocusSection(null);
    setFlash(true);
    const id = setTimeout(() => setFlash(false), 1400);
    return () => clearTimeout(id);
  }, [open, focusSection, updateStatus, setFocusSection]);
```

- [ ] **Step 3: Replace the About section**

Add below `const update = (patch: Partial<Settings>) => ...`:

```tsx
  const u = state.update;
  const updatePending = u.status === 'available' && u.latest !== null;
```

Replace the entire `<Section title="About">…</Section>` block with:

```tsx
          <div
            ref={updatesRef}
            className={`scroll-mt-2 rounded-modal transition-colors duration-300 ${
              flash ? 'bg-accent/10' : ''
            }`}
          >
            <Section title="Updates">
              <div className="flex items-center justify-between gap-4 border-b border-border py-3">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-text-1">
                    {updatePending ? `Version ${u.latest} available` : `Version ${state.version}`}
                  </span>
                  <span className="text-text-2">{updateStatusLine(u, state.version)}</span>
                </span>
                <button
                  type="button"
                  data-testid="update-action"
                  disabled={u.status === 'checking'}
                  onClick={() =>
                    updatePending
                      ? window.goetia.send('updates:openDownload', {})
                      : window.goetia.send('updates:check', {})
                  }
                  className={`flex-none rounded-ctl px-3 py-1.5 transition-colors duration-120 disabled:opacity-50 ${
                    updatePending
                      ? 'bg-accent font-semibold text-on-accent hover:brightness-110'
                      : 'border border-border bg-bg-2 text-text-1 hover:border-accent'
                  }`}
                >
                  {updatePending ? 'Download' : 'Check for updates'}
                </button>
              </div>
              <Row label="Automatic updates">
                <input
                  type="checkbox"
                  checked={s.checkForUpdates}
                  onChange={(e) => update({ checkForUpdates: e.target.checked })}
                />
              </Row>
            </Section>
          </div>
```

- [ ] **Step 4: Verify the whole gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`

Expected: all three exit 0.

- [ ] **Step 5: Drive it by hand**

Run: `corepack pnpm dev`

Expected, in order:

1. Open Settings (⌘/Ctrl+,). The Updates section shows `Version 0.2.0` / `Personal multi-service chat client` and a **Check for updates** button.
2. Click **Check for updates**. The button disables and the sub-line reads `Checking…`, then settles on `Goetia is up to date` — 0.2.0 is the newest published release at the time of writing. If a newer release exists the row flips to `Version X available` with a **Download** button.
3. Toggle **Automatic updates** off and on. No error, and the checkbox state survives closing and reopening Settings.
4. Pick **Check for Updates…** from the app menu with Settings closed: Settings opens and scrolls to Updates with a brief highlight.

Quit with Cmd/Ctrl+Q.

- [ ] **Step 6: Checkpoint**

Stop and ask the user to run `/grimoire-core:commit`.

---

### Task 8: End-to-end proof and docs

**Files:**

- Create: `tests/e2e/updates.spec.ts`
- Modify: `README.md`
- Modify: `docs/FEATURES.md`

**Interfaces:**

- Consumes: `--goetia-e2e-update` (Task 4), `[data-testid="update-toast"]` (Task 6), `[data-testid="gear-dot"]` (Task 5), `[data-testid="update-action"]` (Task 7).
- Produces: nothing downstream.

- [ ] **Step 1: Write the failing e2e spec**

Create `tests/e2e/updates.spec.ts`:

```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

const isShell = (p: { url(): string }) =>
  p.url().startsWith('file://') && !p.url().includes('loading.html');

test('update toast expires on its own and leaves a dot that opens Updates', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-'));
  // one enabled service: the welcome screen would otherwise fill the content
  // region the toast is anchored to
  writeFileSync(
    join(profile, 'settings.json'),
    JSON.stringify({
      disabled: {
        whatsapp: true,
        messenger: true,
        telegram: true,
        discord: true,
        zalo: false,
        tiktok: true,
        shopee: true,
      },
    }),
  );

  const app = await electron.launch({
    args: ['out/main/index.js', '--goetia-e2e-update', `--goetia-user-data=${profile}`],
  });
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));

  const toast = win.locator('[data-testid="update-toast"]');
  await expect(toast).toBeVisible({ timeout: 10_000 });
  await expect(toast).toContainText('Goetia 99.0.0 is available');

  // nobody clicks or hovers it — the whole point is that it leaves anyway
  await expect(toast).toHaveCount(0, { timeout: 15_000 });

  // the dot is what the toast leaves behind
  await expect(win.locator('[data-testid="gear-dot"]')).toBeVisible();

  await win.locator('[data-testid="settings-btn"]').click();
  await expect(win.locator('[data-testid="settings"]')).toBeVisible();
  const action = win.locator('[data-testid="update-action"]');
  await expect(action).toHaveText('Download');
  await expect(action).toBeInViewport();

  await app.close();
});
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm exec playwright test tests/e2e/updates.spec.ts`

Expected: FAIL — `out/main/index.js` is stale until the build runs. If it fails on a missing build, run `corepack pnpm build` first and re-run.

- [ ] **Step 3: Run the full e2e suite**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`

Expected: PASS — the new spec plus the existing `smoke`, `welcome`, and `loading` specs. The existing specs must be untouched; the update seed is behind its own `--goetia-e2e-update` flag.

- [ ] **Step 4: Document it for users**

In `README.md`, add a bullet to the **Handy to know** list, after the notifications bullet:

```markdown
- **Updates check themselves**: when a newer version is published, a small
  notice appears for a few seconds and a dot lands on the settings icon.
  Click either one to open the download page — Goetia can't install its own
  update, because it isn't code-signed. Turn the check off in
  **Settings → Updates → Automatic updates**.
```

- [ ] **Step 5: Document it for maintainers**

In `docs/FEATURES.md`, add to the **Settings & persistence** list, after the corrupt-file bullet:

```markdown
- **Update check** — GitHub Releases polled 10s after launch and every 24h,
  plus `Check for Updates…`. Announced by a self-dismissing toast (8s) and a
  dot on the settings gear; the download page opens via `shell.openExternal`
  behind `isSafeExternalUrl`, using a URL built from a validated version, not
  from the API payload. Automatic checks are silent on failure and skipped
  when unpackaged. Impl: `src/main/updates.ts`,
  `src/main/lib/update-check.ts`. Verified: `update-check.test.ts`,
  `updates.test.ts`, `toast-rules.test.ts`, `tests/e2e/updates.spec.ts`.
```

- [ ] **Step 6: Verify the docs lint**

Run: `corepack pnpm exec markdownlint-cli2 README.md docs/FEATURES.md`

Expected: `Summary: 0 issues`.

- [ ] **Step 7: Verify the whole gate**

Run:

```bash
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test
env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e
```

Expected: all four exit 0.

- [ ] **Step 8: Checkpoint**

Stop and ask the user to run `/grimoire-core:commit`.

---

## Manual verification before calling it done

These cannot be automated and are the last gate:

- [ ] **A real update is found.** Temporarily set `"version": "0.0.1"` in `package.json`, run `corepack pnpm dev`, open Settings → Updates, click **Check for updates**. Expect `Version 0.2.0 available` and a **Download** button. Click it and confirm the browser opens `https://github.com/quyennguyenvu/goetia/releases/tag/v0.2.0`. **Revert `package.json` afterwards.**
- [ ] **Offline is silent.** Turn off networking, restart with the version still at `0.0.1`, wait past the first check, and confirm no toast and no error text appear anywhere. Then click **Check for updates** and confirm `Couldn't reach GitHub. Try again.` appears — only for the manual check.
- [ ] **The toast waits for a visible window.** With `closeToTray` on, hide the window before the first check fires, wait, then reopen from the tray. The toast should appear on reopen, not have been lost.
- [ ] **Reduced motion still dismisses.** macOS: System Settings → Accessibility → Display → Reduce motion. Trigger the toast and confirm it still disappears after ~8 seconds with no animation.

## Notes for the implementer

- **Why the fetch is in main:** the shell renderer's CSP is `default-src 'self'` (`src/renderer/index.html`). A renderer-side fetch to `api.github.com` would be blocked, and the CSP must not be widened.
- **Why the URL is never taken from the payload:** `html_url` in the GitHub response is attacker-influenced if the API or DNS is ever compromised. Building the URL from a regex-validated version means the worst a bad payload can do is show a wrong number.
- **Why `announce` is separate from `latest`:** `latest` is what exists and drives durable surfaces; `announce` is the transient "toast this now" signal, which must be withheld while the window is hidden.
- **Why dismissal is a `setTimeout` and not `animationend`:** `tokens.css` sets `animation: none !important` under `prefers-reduced-motion: reduce`, so an animation-driven dismissal would strand the toast on screen for those users.
