# Downloads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A file a service page downloads lands in the user's chosen folder (or asks, per Settings), announces itself with a silent native banner whose click reveals it, and a page cannot silently flood the folder.

**Architecture:** One `will-download` listener per service partition, attached in `configureSession`, hands each `DownloadItem` to a `DownloadManager` (`src/main/downloads.ts`) that is thin wiring over pure rules in `src/main/lib/download-rules.ts` (mode decision, de-duplicated naming, burst cap, banner text, progress fraction). Completion is its own notification path, deliberately outside `NotificationRouter` (no activity log, no mute gating, always silent). The setting is a `downloads` block on `Settings`; the folder picker is a new shell-only invoke channel.

**Tech Stack:** Electron 43 (`session.on('will-download')`, `DownloadItem`, `Notification`, `shell.showItemInFolder`, `app.dock.downloadFinished`, `BrowserWindow.setProgressBar`, `dialog.showOpenDialog`), TypeScript, React (Settings pane), Vitest, Playwright-Electron, Biome.

Spec: `docs/superpowers/specs/2026-09-18-downloads-design.md`. Read it first.

## Global Constraints

- Definition of done for every task: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` green. Task 6 additionally runs `corepack pnpm e2e` (in a VS Code shell prefix with `env -u ELECTRON_RUN_AS_NODE`).
- **Never run `git commit`.** Every "Commit" step below means: stop and ask the user to run `/grimoire-core:commit`, then continue only after they have. Never write `GRIMOIRE_COMMIT_MSG.txt`.
- `src/shared/**` imports nothing from `electron` and nothing DOM.
- Pure logic goes in `src/main/lib/download-rules.ts` with unit tests; `downloads.ts`, `views.ts`, `index.ts`, `ipc-handlers.ts` stay thin wiring.
- Constants, verbatim from the spec: `DOWNLOAD_BURST_CAP = 5`, `DOWNLOAD_BURST_WINDOW_MS = 30_000`, `DOWNLOAD_DEDUP_MAX = 99`, `ASK_URL_CAP = 16`.
- Goetia never opens a downloaded file. The only file action is `shell.showItemInFolder`. Never call `shell.openPath` anywhere in this feature.
- The download banner is always `silent: true`, never enters `ActivityLog`, and is never gated by mute or quiet hours. While `ctx.lock.locked` it is redacted with `redactBanner` from `src/main/lib/lock-rules.ts` and its click only shows the window.
- New invoke channel `downloads:chooseDir` is shell-only: add to `INVOKE_CHANNELS` and `SHELL_ONLY_CHANNELS` in `src/shared/ipc.ts`.
- Every timer or listener added is removed on `destroy(id)` / `dispose()`; every deferred callback is guarded with `win.isDestroyed()`.
- Copy, verbatim: completed banner title `<filename>`, body `Saved from <Service>`; interrupted banner title `Could not save <filename>`, body `<Service>`; Settings rows labelled `Downloads` (options `Save to folder`, `Always ask`) and `Folder` (button `Choose…`).
- Markdown edited in Task 7 must pass `npx markdownlint-cli2 <file>`; prose is never hard-wrapped.
- Biome formatting: single quotes, 2-space indent, 100-column lines. Run `corepack pnpm lint` and fix, or `corepack pnpm biome check --write .` for formatting only.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/shared/types.ts` (modify) | `Settings.downloads: { ask: boolean; dir: string \| null }` and its default |
| `src/main/settings.ts` (modify) | `fillDownloads` field-by-field coercion, wired into `normalize` |
| `src/main/lib/download-rules.ts` (create) | pure: constants, `safeFilename`, `uniquePath`, `burstExceeded`, `decideSave`, `bannerFor`, `progressFraction` |
| `src/main/downloads.ts` (create) | `DownloadManager`: per-session listener, in-flight tracking, banner, progress, cancel on destroy |
| `src/main/notifications.ts` (modify) | export `ICON_DIR` so the download banner reuses the same icons |
| `src/main/views.ts` (modify) | take a `DownloadManager`; `attach` in `configureSession`, `detach` in `destroy`, `expectAsk` before `Save Image As…` |
| `src/main/index.ts` (modify) | construct `DownloadManager` with Electron-backed deps; `dispose` on `before-quit` |
| `src/shared/ipc.ts` (modify) | `downloads:chooseDir` invoke channel, shell-only |
| `src/main/ipc-handlers.ts` (modify) | the folder-picker handler |
| `src/renderer/src/components/SettingsView.tsx` (modify) | Downloads + Folder rows in General |
| `tests/unit/download-rules.test.ts` (create) | rules coverage |
| `tests/unit/downloads.test.ts` (create) | manager driven with a fake `DownloadItem` |
| `tests/unit/settings.test.ts` (modify) | `downloads` block normalisation |
| `tests/unit/ipc-sender-policy.test.ts` (modify) | the new channel is refused from a service frame |
| `tests/e2e/downloads.spec.ts` (create) | a blob download from a service view lands in the configured folder, twice, de-duplicated |
| `docs/FEATURES.md`, `README.md`, `CLAUDE.md` (modify) | inventory, user tips, guardrail |

---

### Task 1: The `downloads` settings block

**Files:**

- Modify: `src/shared/types.ts` (the `Settings` interface after `appLock`, and `DEFAULT_SETTINGS` after `appLock`)
- Modify: `src/main/settings.ts` (add `fillDownloads`, call it in `normalize`)
- Test: `tests/unit/settings.test.ts`

**Interfaces:**

- Produces: `Settings['downloads']` = `{ ask: boolean; dir: string | null }`, default `{ ask: false, dir: null }`. Later tasks read it via `settings.get().downloads`.

- [ ] **Step 1: Write the failing tests**

Append inside the top-level `describe('SettingsStore', …)` block of `tests/unit/settings.test.ts`, after the last `appLock` test:

```ts
  it('defaults downloads to the OS folder without asking', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    expect(new SettingsStore(dir).get().downloads).toEqual({ ask: false, dir: null });
  });

  it('keeps a chosen download folder and the ask mode', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ downloads: { ask: true, dir: '/Users/me/Chat files' } }),
    );
    expect(new SettingsStore(dir).get().downloads).toEqual({
      ask: true,
      dir: '/Users/me/Chat files',
    });
  });

  it('coerces a hand-mangled downloads block field by field', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ downloads: { ask: 'yes', dir: 42 } }),
    );
    // a non-boolean must not coerce truthy into asking; a non-string dir is
    // the OS folder, never a path built from garbage
    expect(new SettingsStore(dir).get().downloads).toEqual({ ask: false, dir: null });
  });

  it('treats an empty dir string as the OS folder', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ downloads: { dir: '' } }));
    expect(new SettingsStore(dir).get().downloads).toEqual({ ask: false, dir: null });
  });

  it('fills a settings.json written before downloads existed', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ globalMuted: true }));
    expect(new SettingsStore(dir).get().downloads).toEqual({ ask: false, dir: null });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `corepack pnpm vitest run tests/unit/settings.test.ts`
Expected: FAIL, the four new tests with `expected undefined to deeply equal { ask: false, dir: null }` (typecheck also fails until Step 3).

- [ ] **Step 3: Add the type and default**

In `src/shared/types.ts`, inside `interface Settings`, directly after the `appLock` line:

```ts
  /** Where a file a service page downloads lands. `ask` shows the Save dialog
   *  every time; otherwise the file is saved silently into `dir`, or into the
   *  OS Downloads folder (app.getPath('downloads')) while `dir` is null — so
   *  nothing platform-specific is persisted until the user picks a folder.
   *  See main/lib/download-rules.ts and the 2026-09-18 spec. */
  downloads: { ask: boolean; dir: string | null };
```

In `DEFAULT_SETTINGS`, directly after the `appLock:` line:

```ts
  downloads: { ask: false, dir: null },
```

- [ ] **Step 4: Add `fillDownloads` and wire it**

In `src/main/settings.ts`, after `fillAppLock`:

```ts
/** summonHotkey-style field-by-field coercion for the downloads block. A
 *  non-string or empty `dir` is the OS folder: a path must never be built
 *  from a corrupt value. */
function fillDownloads(raw: unknown): Settings['downloads'] {
  const d = DEFAULT_SETTINGS.downloads;
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Settings['downloads']>;
  return {
    ask: typeof r.ask === 'boolean' ? r.ask : d.ask,
    dir: typeof r.dir === 'string' && r.dir !== '' ? r.dir : d.dir,
  };
}
```

In `normalize`, in the returned `settings` object, after `appLock: fillAppLock(raw.appLock),`:

```ts
      downloads: fillDownloads(raw.downloads),
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `corepack pnpm vitest run tests/unit/settings.test.ts && corepack pnpm typecheck && corepack pnpm lint`
Expected: all settings tests PASS; typecheck and lint clean.

- [ ] **Step 6: Commit**

Stop and ask the user to run `/grimoire-core:commit` (suggested message: `feat(settings): add the downloads block`). Do not run `git commit`.

---

### Task 2: Pure download rules

**Files:**

- Create: `src/main/lib/download-rules.ts`
- Test: `tests/unit/download-rules.test.ts`

**Interfaces:**

- Produces (all exported from `src/main/lib/download-rules.ts`):
  - `DOWNLOAD_BURST_CAP: 5`, `DOWNLOAD_BURST_WINDOW_MS: 30_000`, `DOWNLOAD_DEDUP_MAX: 99`, `ASK_URL_CAP: 16`
  - `safeFilename(name: string): string`
  - `uniquePath(dir: string, name: string, exists: (p: string) => boolean): string | null`
  - `burstExceeded(starts: readonly number[], now: number): boolean`
  - `type AskReason = 'user-request' | 'setting' | 'missing-dir' | 'burst' | 'exhausted'`
  - `type SaveDecision = { mode: 'save'; path: string } | { mode: 'ask'; defaultPath: string; reason: AskReason }`
  - `decideSave(input: { filename: string; ask: boolean; dir: string; userRequested: boolean; recentStarts: readonly number[]; now: number; exists: (p: string) => boolean }): SaveDecision`
  - `type DownloadEnd = 'completed' | 'cancelled' | 'interrupted'`
  - `bannerFor(state: DownloadEnd, filename: string, serviceName: string): { title: string; body: string } | null`
  - `progressFraction(items: readonly { received: number; total: number }[]): number`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/download-rules.test.ts`:

```ts
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ASK_URL_CAP,
  bannerFor,
  burstExceeded,
  decideSave,
  DOWNLOAD_BURST_CAP,
  DOWNLOAD_BURST_WINDOW_MS,
  DOWNLOAD_DEDUP_MAX,
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `corepack pnpm vitest run tests/unit/download-rules.test.ts`
Expected: FAIL with `Cannot find module '../../src/main/lib/download-rules'`.

- [ ] **Step 3: Write the rules**

Create `src/main/lib/download-rules.ts`:

```ts
import { basename, extname, join } from 'node:path';

/** Silent saves a page may start inside one window before the rest of them
 *  fall back to the Save dialog, which needs a human. Chrome bounds this with
 *  its automatic-downloads permission; Electron has nothing. */
export const DOWNLOAD_BURST_CAP = 5;
export const DOWNLOAD_BURST_WINDOW_MS = 30_000;
/** `name (99).ext` is the last name tried before the dialog takes over. */
export const DOWNLOAD_DEDUP_MAX = 99;
/** URLs the context menu's Save Image As… has promised a dialog for. */
export const ASK_URL_CAP = 16;

export type AskReason = 'user-request' | 'setting' | 'missing-dir' | 'burst' | 'exhausted';

export type SaveDecision =
  | { mode: 'save'; path: string }
  | { mode: 'ask'; defaultPath: string; reason: AskReason };

export type DownloadEnd = 'completed' | 'cancelled' | 'interrupted';

/** Chromium has already stripped separators from getFilename(); this is the
 *  second line — a dotfile or an empty name never reaches the disk as such. */
export function safeFilename(name: string): string {
  const base = basename(name).trim();
  if (base === '' || base === '..' || base.startsWith('.')) return 'download';
  return base;
}

/** `name.ext`, then `name (1).ext` … up to DOWNLOAD_DEDUP_MAX; null when all
 *  are taken. Probes DOWNLOAD_DEDUP_MAX + 1 paths at most. */
export function uniquePath(
  dir: string,
  name: string,
  exists: (path: string) => boolean,
): string | null {
  const first = join(dir, name);
  if (!exists(first)) return first;
  const ext = extname(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let n = 1; n <= DOWNLOAD_DEDUP_MAX; n++) {
    const candidate = join(dir, `${stem} (${n})${ext}`);
    if (!exists(candidate)) return candidate;
  }
  return null;
}

/** `starts` are the earlier page-initiated starts for this service; the one
 *  being decided is not among them. */
export function burstExceeded(starts: readonly number[], now: number): boolean {
  let inWindow = 0;
  for (const t of starts) if (now - t < DOWNLOAD_BURST_WINDOW_MS) inWindow++;
  return inWindow >= DOWNLOAD_BURST_CAP;
}

/** The one decision per download. Reasons are ordered: a user's explicit
 *  Save As… is honoured before anything else; the setting next; then the
 *  three ways a silent save cannot proceed. `dir` is already resolved (the
 *  chosen folder or the OS default) and `exists` is probed once for it. */
export function decideSave(input: {
  filename: string;
  ask: boolean;
  dir: string;
  userRequested: boolean;
  recentStarts: readonly number[];
  now: number;
  exists: (path: string) => boolean;
}): SaveDecision {
  const name = safeFilename(input.filename);
  const defaultPath = join(input.dir, name);
  const ask = (reason: AskReason): SaveDecision => ({ mode: 'ask', defaultPath, reason });
  if (input.userRequested) return ask('user-request');
  if (input.ask) return ask('setting');
  if (!input.exists(input.dir)) return ask('missing-dir');
  if (burstExceeded(input.recentStarts, input.now)) return ask('burst');
  const path = uniquePath(input.dir, name, input.exists);
  if (path === null) return ask('exhausted');
  return { mode: 'save', path };
}

export function bannerFor(
  state: DownloadEnd,
  filename: string,
  serviceName: string,
): { title: string; body: string } | null {
  switch (state) {
    case 'completed':
      return { title: filename, body: `Saved from ${serviceName}` };
    case 'interrupted':
      return { title: `Could not save ${filename}`, body: serviceName };
    case 'cancelled':
      return null;
  }
}

/** For BrowserWindow.setProgressBar: -1 clears, 0..1 is the aggregate, and
 *  any value above 1 renders indeterminate — used when a total is unknown. */
export function progressFraction(items: readonly { received: number; total: number }[]): number {
  if (items.length === 0) return -1;
  let received = 0;
  let total = 0;
  for (const it of items) {
    if (it.total <= 0) return 2;
    received += it.received;
    total += it.total;
  }
  return Math.min(1, received / total);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `corepack pnpm vitest run tests/unit/download-rules.test.ts && corepack pnpm typecheck && corepack pnpm lint`
Expected: PASS (all), typecheck and lint clean.

- [ ] **Step 5: Commit**

Stop and ask the user to run `/grimoire-core:commit` (suggested: `feat(downloads): add the pure download rules`). Do not run `git commit`.

---

### Task 3: `DownloadManager`

**Files:**

- Create: `src/main/downloads.ts`
- Test: `tests/unit/downloads.test.ts`

**Interfaces:**

- Consumes: everything Task 2 exports; `redactBanner(serviceName)` from `src/main/lib/lock-rules.ts`; `Settings['downloads']` and `ServiceId` from `src/shared/types.ts`.
- Produces (exported from `src/main/downloads.ts`):
  - `interface DownloadItemLike` — the subset of Electron's `DownloadItem` the manager touches (Electron's class satisfies it structurally)
  - `interface DownloadBanner { title: string; body: string; icon?: string; onClick: () => void }`
  - `interface DownloadManagerDeps { settings(): Settings['downloads']; defaultDir(): string; locked(): boolean; serviceName(id: ServiceId): string; icons: ReadonlyMap<ServiceId, string>; exists(path: string): boolean; notify(banner: DownloadBanner): void; reveal(path: string): void; dockFinished(path: string): void; setProgress(fraction: number): void; showWindow(): void; now(): number }`
  - `class DownloadManager` with `attach(id, ses: DownloadSessionLike)`, `detach(id)`, `expectAsk(url)`, `handle(id, item)`, `inflightCount(): number`, `dispose()`
  - `interface DownloadSessionLike { on(event: 'will-download', fn: WillDownload): unknown; removeListener(event: 'will-download', fn: WillDownload): unknown }`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/downloads.test.ts`:

```ts
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  type DownloadBanner,
  type DownloadItemLike,
  DownloadManager,
  type DownloadManagerDeps,
} from '../../src/main/downloads';
import { DOWNLOAD_BURST_CAP } from '../../src/main/lib/download-rules';

const DIR = '/tmp/goetia-dl';

class FakeItem extends EventEmitter implements DownloadItemLike {
  savePath = '';
  dialog: { defaultPath?: string } | null = null;
  cancelled = false;
  received = 0;
  constructor(
    private name: string,
    private url = `blob:https://web.whatsapp.com/${name}`,
    public total = 100,
  ) {
    super();
  }
  getFilename() {
    return this.name;
  }
  getURL() {
    return this.url;
  }
  setSavePath(p: string) {
    this.savePath = p;
  }
  getSavePath() {
    return this.savePath;
  }
  setSaveDialogOptions(o: { defaultPath?: string }) {
    this.dialog = o;
  }
  getReceivedBytes() {
    return this.received;
  }
  getTotalBytes() {
    return this.total;
  }
  cancel() {
    this.cancelled = true;
    this.emit('done', {}, 'cancelled');
  }
  progress(received: number) {
    this.received = received;
    this.emit('updated', {}, 'progressing');
  }
  finish(state: 'completed' | 'interrupted' | 'cancelled') {
    this.emit('done', {}, state);
  }
}

class FakeSession extends EventEmitter {
  fire(item: FakeItem) {
    this.emit('will-download', {}, item, {});
  }
}

function harness(over: Partial<DownloadManagerDeps> & { files?: Set<string> } = {}) {
  const files = over.files ?? new Set<string>();
  const banners: DownloadBanner[] = [];
  const box = { locked: false, settings: { ask: false, dir: null as string | null } };
  const deps: DownloadManagerDeps = {
    settings: () => box.settings,
    defaultDir: () => DIR,
    locked: () => box.locked,
    serviceName: (id) => (id === 'whatsapp' ? 'WhatsApp' : id),
    icons: new Map([['whatsapp', '/icons/whatsapp.png']]),
    exists: (p) => p === DIR || files.has(p),
    notify: (b) => void banners.push(b),
    reveal: vi.fn(),
    dockFinished: vi.fn(),
    setProgress: vi.fn(),
    showWindow: vi.fn(),
    now: () => 1_000_000,
    ...over,
  };
  const dm = new DownloadManager(deps);
  const ses = new FakeSession();
  dm.attach('whatsapp', ses);
  return { dm, ses, deps, banners, box, files };
}

describe('DownloadManager', () => {
  it('saves into the OS folder silently and announces the file', () => {
    const { ses, deps, banners } = harness();
    const item = new FakeItem('photo.jpg');
    ses.fire(item);
    expect(item.savePath).toBe(join(DIR, 'photo.jpg'));
    expect(item.dialog).toBeNull();
    item.finish('completed');
    expect(banners).toHaveLength(1);
    expect(banners[0]).toMatchObject({
      title: 'photo.jpg',
      body: 'Saved from WhatsApp',
      icon: '/icons/whatsapp.png',
    });
    expect(deps.dockFinished).toHaveBeenCalledWith(join(DIR, 'photo.jpg'));
    banners[0].onClick();
    expect(deps.reveal).toHaveBeenCalledWith(join(DIR, 'photo.jpg'));
    expect(deps.showWindow).not.toHaveBeenCalled();
  });

  it('prefers the chosen folder over the OS default', () => {
    const { ses, box } = harness({ exists: (p) => p === '/Volumes/Chat' });
    box.settings = { ask: false, dir: '/Volumes/Chat' };
    const item = new FakeItem('a.pdf');
    ses.fire(item);
    expect(item.savePath).toBe(join('/Volumes/Chat', 'a.pdf'));
  });

  it('shows the dialog when the setting asks, seeded with the folder', () => {
    const { ses, box } = harness();
    box.settings = { ask: true, dir: null };
    const item = new FakeItem('a.pdf');
    ses.fire(item);
    expect(item.savePath).toBe('');
    expect(item.dialog).toEqual({ defaultPath: join(DIR, 'a.pdf') });
  });

  it('honours Save Image As… once, then forgets the URL', () => {
    const { dm, ses } = harness();
    dm.expectAsk('https://cdn.example/x.png');
    const first = new FakeItem('x.png', 'https://cdn.example/x.png');
    ses.fire(first);
    expect(first.dialog).not.toBeNull();
    const again = new FakeItem('x.png', 'https://cdn.example/x.png');
    ses.fire(again);
    expect(again.dialog).toBeNull();
    expect(again.savePath).toBe(join(DIR, 'x.png'));
  });

  it('turns a burst back into dialogs, not counting user requests', () => {
    const { dm, ses } = harness();
    for (let i = 0; i < DOWNLOAD_BURST_CAP; i++) {
      const it = new FakeItem(`p${i}.jpg`);
      ses.fire(it);
      expect(it.dialog).toBeNull();
    }
    const excess = new FakeItem('p9.jpg');
    ses.fire(excess);
    expect(excess.dialog).not.toBeNull();
    // a Save Image As… inside the burst is the user's, and asks anyway
    dm.expectAsk('https://cdn.example/y.png');
    const user = new FakeItem('y.png', 'https://cdn.example/y.png');
    ses.fire(user);
    expect(user.dialog).not.toBeNull();
  });

  it('de-duplicates against files already on disk', () => {
    const files = new Set([join(DIR, 'photo.jpg')]);
    const { ses } = harness({ files });
    const item = new FakeItem('photo.jpg');
    ses.fire(item);
    expect(item.savePath).toBe(join(DIR, 'photo (1).jpg'));
  });

  it('reports an interrupted download and stays silent on cancel', () => {
    const { ses, deps, banners } = harness();
    const bad = new FakeItem('a.pdf');
    ses.fire(bad);
    bad.finish('interrupted');
    expect(banners[0]).toMatchObject({ title: 'Could not save a.pdf', body: 'WhatsApp' });
    banners[0].onClick();
    expect(deps.showWindow).toHaveBeenCalledTimes(1);
    expect(deps.reveal).not.toHaveBeenCalled();
    const gone = new FakeItem('b.pdf');
    ses.fire(gone);
    gone.finish('cancelled');
    expect(banners).toHaveLength(1);
  });

  it('redacts the banner while locked and never reveals through it', () => {
    const { ses, deps, banners, box } = harness();
    const item = new FakeItem('secret.pdf');
    ses.fire(item);
    box.locked = true;
    item.finish('completed');
    expect(banners[0]).toMatchObject({ title: 'WhatsApp', body: '' });
    banners[0].onClick();
    expect(deps.reveal).not.toHaveBeenCalled();
    expect(deps.showWindow).toHaveBeenCalledTimes(1);
  });

  it('checks the lock at click time too', () => {
    const { ses, deps, banners, box } = harness();
    const item = new FakeItem('secret.pdf');
    ses.fire(item);
    item.finish('completed');
    box.locked = true;
    banners[0].onClick();
    expect(deps.reveal).not.toHaveBeenCalled();
    expect(deps.showWindow).toHaveBeenCalledTimes(1);
  });

  it('drives the progress bar and clears it when the last item ends', () => {
    const { ses, deps } = harness();
    const a = new FakeItem('a.bin', undefined, 100);
    const b = new FakeItem('b.bin', undefined, 100);
    ses.fire(a);
    ses.fire(b);
    a.progress(50);
    expect(deps.setProgress).toHaveBeenLastCalledWith(0.25);
    b.progress(50);
    expect(deps.setProgress).toHaveBeenLastCalledWith(0.5);
    a.finish('completed');
    expect(deps.setProgress).toHaveBeenLastCalledWith(0.5);
    b.finish('completed');
    expect(deps.setProgress).toHaveBeenLastCalledWith(-1);
  });

  it('cancels a service’s downloads and stops listening on detach', () => {
    const { dm, ses, deps, banners } = harness();
    const item = new FakeItem('a.bin');
    ses.fire(item);
    dm.detach('whatsapp');
    expect(item.cancelled).toBe(true);
    expect(banners).toHaveLength(0);
    expect(deps.setProgress).toHaveBeenLastCalledWith(-1);
    const late = new FakeItem('late.bin');
    ses.fire(late);
    expect(late.savePath).toBe('');
    expect(dm.inflightCount()).toBe(0);
  });

  it('attaches one listener per service however often attach is called', () => {
    const { dm, ses } = harness();
    dm.attach('whatsapp', ses);
    dm.attach('whatsapp', ses);
    expect(ses.listenerCount('will-download')).toBe(1);
  });

  it('dispose cancels everything and clears the bar', () => {
    const { dm, ses, deps } = harness();
    const item = new FakeItem('a.bin');
    ses.fire(item);
    dm.dispose();
    expect(item.cancelled).toBe(true);
    expect(deps.setProgress).toHaveBeenLastCalledWith(-1);
    expect(ses.listenerCount('will-download')).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `corepack pnpm vitest run tests/unit/downloads.test.ts`
Expected: FAIL with `Cannot find module '../../src/main/downloads'`.

- [ ] **Step 3: Write the manager**

Create `src/main/downloads.ts`:

```ts
import type { ServiceId, Settings } from '../shared/types';
import {
  ASK_URL_CAP,
  bannerFor,
  DOWNLOAD_BURST_WINDOW_MS,
  type DownloadEnd,
  decideSave,
  progressFraction,
} from './lib/download-rules';
import { redactBanner } from './lib/lock-rules';

/** The slice of Electron's DownloadItem this class touches; the real one
 *  satisfies it structurally, and the unit test drives a fake. */
export interface DownloadItemLike {
  getFilename(): string;
  getURL(): string;
  setSavePath(path: string): void;
  getSavePath(): string;
  setSaveDialogOptions(options: { defaultPath?: string }): void;
  getReceivedBytes(): number;
  getTotalBytes(): number;
  cancel(): void;
  on(event: 'updated', listener: (event: unknown, state: string) => void): unknown;
  once(event: 'done', listener: (event: unknown, state: DownloadEnd) => void): unknown;
}

type WillDownload = (event: unknown, item: DownloadItemLike, webContents: unknown) => void;

export interface DownloadSessionLike {
  on(event: 'will-download', fn: WillDownload): unknown;
  removeListener(event: 'will-download', fn: WillDownload): unknown;
}

export interface DownloadBanner {
  title: string;
  body: string;
  icon?: string;
  onClick: () => void;
}

/** Every Electron touch is injected, so the class is testable without a
 *  runtime and index.ts stays the only place that knows the real APIs. */
export interface DownloadManagerDeps {
  settings(): Settings['downloads'];
  /** app.getPath('downloads') — the OS folder while `dir` is null */
  defaultDir(): string;
  locked(): boolean;
  serviceName(id: ServiceId): string;
  icons: ReadonlyMap<ServiceId, string>;
  exists(path: string): boolean;
  /** shows a silent native banner; the click runs `onClick` */
  notify(banner: DownloadBanner): void;
  /** shell.showItemInFolder — the only file action Goetia ever takes */
  reveal(path: string): void;
  /** app.dock.downloadFinished on macOS, a no-op elsewhere */
  dockFinished(path: string): void;
  /** win.setProgressBar, guarded against a destroyed window */
  setProgress(fraction: number): void;
  showWindow(): void;
  now(): number;
}

interface Inflight {
  serviceId: ServiceId;
  received: number;
  total: number;
}

/** One will-download listener per service partition; the decision is
 *  decideSave, the completion is a banner of its own (never the message
 *  router: no activity log, no mute gating, always silent). */
export class DownloadManager {
  private listeners = new Map<ServiceId, { ses: DownloadSessionLike; fn: WillDownload }>();
  private inflight = new Map<DownloadItemLike, Inflight>();
  /** page-initiated start times per service, trimmed to the burst window */
  private starts = new Map<ServiceId, number[]>();
  /** URLs Save Image As… promised a dialog for; consumed on first match */
  private askUrls: string[] = [];

  constructor(private deps: DownloadManagerDeps) {}

  attach(id: ServiceId, ses: DownloadSessionLike): void {
    if (this.listeners.has(id)) return;
    const fn: WillDownload = (_e, item) => this.handle(id, item);
    ses.on('will-download', fn);
    this.listeners.set(id, { ses, fn });
  }

  /** Stop listening and end every download the service still has open. */
  detach(id: ServiceId): void {
    const l = this.listeners.get(id);
    if (l) {
      l.ses.removeListener('will-download', l.fn);
      this.listeners.delete(id);
    }
    for (const [item, f] of this.inflight) {
      if (f.serviceId === id) item.cancel();
    }
    this.starts.delete(id);
  }

  expectAsk(url: string): void {
    this.askUrls.push(url);
    if (this.askUrls.length > ASK_URL_CAP) this.askUrls.splice(0, this.askUrls.length - ASK_URL_CAP);
  }

  inflightCount(): number {
    return this.inflight.size;
  }

  handle(id: ServiceId, item: DownloadItemLike): void {
    const now = this.deps.now();
    const url = item.getURL();
    const askAt = this.askUrls.indexOf(url);
    const userRequested = askAt !== -1;
    if (userRequested) this.askUrls.splice(askAt, 1);
    const recent = (this.starts.get(id) ?? []).filter((t) => now - t < DOWNLOAD_BURST_WINDOW_MS);
    const s = this.deps.settings();
    const decision = decideSave({
      filename: item.getFilename(),
      ask: s.ask,
      dir: s.dir ?? this.deps.defaultDir(),
      userRequested,
      recentStarts: recent,
      now,
      exists: this.deps.exists,
    });
    if (decision.mode === 'save') item.setSavePath(decision.path);
    else item.setSaveDialogOptions({ defaultPath: decision.defaultPath });
    // a user's Save As… is not the page's doing, so it never counts
    if (!userRequested) this.starts.set(id, [...recent, now]);

    this.inflight.set(item, { serviceId: id, received: 0, total: item.getTotalBytes() });
    item.on('updated', () => {
      const f = this.inflight.get(item);
      if (!f) return;
      f.received = item.getReceivedBytes();
      f.total = item.getTotalBytes();
      this.pushProgress();
    });
    item.once('done', (_e, state) => this.finish(id, item, state));
  }

  private finish(id: ServiceId, item: DownloadItemLike, state: DownloadEnd): void {
    const tracked = this.inflight.delete(item);
    this.pushProgress();
    // detach cancelled it; a cancel is silent anyway, but never announce a
    // download the service no longer owns
    if (!tracked) return;
    const name = this.deps.serviceName(id);
    const banner = bannerFor(state, item.getFilename(), name);
    if (!banner) return;
    const path = item.getSavePath();
    if (state === 'completed') this.deps.dockFinished(path);
    const shown = this.deps.locked() ? redactBanner(name) : banner;
    const icon = this.deps.icons.get(id);
    this.deps.notify({
      ...shown,
      ...(icon ? { icon } : {}),
      onClick: () => {
        // re-checked at click time: a banner clicked hours later must not be
        // a way to reveal a file past a lock that has since engaged
        if (state === 'completed' && !this.deps.locked()) this.deps.reveal(path);
        else this.deps.showWindow();
      },
    });
  }

  private pushProgress(): void {
    this.deps.setProgress(progressFraction([...this.inflight.values()]));
  }

  dispose(): void {
    for (const id of [...this.listeners.keys()]) this.detach(id);
    for (const item of [...this.inflight.keys()]) item.cancel();
    this.inflight.clear();
    this.deps.setProgress(-1);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `corepack pnpm vitest run tests/unit/downloads.test.ts && corepack pnpm typecheck && corepack pnpm lint`
Expected: PASS (13 tests), typecheck and lint clean. If lint complains about line width in `expectAsk`, break the `splice` line.

- [ ] **Step 5: Commit**

Stop and ask the user to run `/grimoire-core:commit` (suggested: `feat(downloads): add the DownloadManager`). Do not run `git commit`.

---

### Task 4: Wire the manager into views and main

**Files:**

- Modify: `src/main/notifications.ts:21` (export `ICON_DIR`)
- Modify: `src/main/views.ts` (imports; constructor params at `:133-146`; `configureSession` at `:174`; `destroy` at `:788`; `menuItemFor` `save-image` case at `:611`)
- Modify: `src/main/index.ts` (imports; construct before `new ServiceViewManager` at `:123`; pass it; `before-quit` at `:377`)

**Interfaces:**

- Consumes: `DownloadManager`, `DownloadManagerDeps` from Task 3; `resolveIcons` from `src/main/lib/notification-icons.ts`; `redactBanner` is already inside the manager.
- Produces: `ServiceViewManager` constructor gains a `downloads: DownloadManager` parameter directly after `identityShare`. Nothing else changes shape.

- [ ] **Step 1: Export the icon directory**

In `src/main/notifications.ts` change line 21 from `const ICON_DIR = app.isPackaged` to:

```ts
export const ICON_DIR = app.isPackaged
```

- [ ] **Step 2: Give `ServiceViewManager` the manager**

In `src/main/views.ts` add to the imports (after the `./identity-share` import):

```ts
import type { DownloadManager } from './downloads';
```

In the constructor parameter list, directly after `private identityShare: IdentityShare,`:

```ts
    /** saves and announces what a page downloads; one listener per partition */
    private downloads: DownloadManager,
```

In `configureSession`, directly after the `ses.setSpellCheckerLanguages(…)` call and before `ses.setPermissionRequestHandler`:

```ts
    // attach() is idempotent: a hibernated service re-creates its view and
    // reaches here again on the same persistent session
    this.downloads.attach(id, ses);
```

In `destroy(id)`, directly after `this.closeContainedWindow(id);`:

```ts
    this.downloads.detach(id);
```

In `menuItemFor`, replace the `save-image` case:

```ts
      case 'save-image':
        return {
          label: 'Save Image As…',
          click: () => {
            // the label promises a dialog whatever the Downloads setting says
            this.downloads.expectAsk(item.url);
            wc.downloadURL(item.url);
          },
        };
```

- [ ] **Step 3: Construct it in main**

In `src/main/index.ts` change the first four import lines to:

```ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  app,
  BrowserWindow,
  nativeImage,
  nativeTheme,
  Notification,
  powerMonitor,
  session,
  shell,
} from 'electron';
import { aggregateBadges, type BadgeSummary } from '../shared/badges';
import { SERVICES, serviceById } from '../shared/services';
```

and add these among the local imports (Biome's organizer will place them; `./downloads` goes after `./commands`, `./lib/notification-icons` after `./lib/coalesce`, and the `./notifications` line becomes the two-name form):

```ts
import { DownloadManager } from './downloads';
import { resolveIcons } from './lib/notification-icons';
import { ICON_DIR, NotificationRouter } from './notifications';
```

Directly before `const views = new ServiceViewManager(` (line 123):

```ts
    const downloads = new DownloadManager({
      settings: () => settings.get().downloads,
      defaultDir: () => app.getPath('downloads'),
      locked: () => lock.locked,
      serviceName: (id) => serviceById(id).name,
      icons: resolveIcons(
        ICON_DIR,
        SERVICES.map((s) => s.id),
        process.platform,
        existsSync,
      ),
      exists: existsSync,
      notify: ({ title, body, icon, onClick }) => {
        // silent always: a download is not a message, and the user asked for it
        const n = new Notification({ title, body, silent: true, ...(icon ? { icon } : {}) });
        n.on('click', onClick);
        n.on('failed', (_e, err) => console.error(`[downloads] banner: ${err}`));
        n.show();
      },
      reveal: (path) => shell.showItemInFolder(path),
      dockFinished: (path) => app.dock?.downloadFinished(path),
      setProgress: (fraction) => {
        if (!win.isDestroyed()) win.setProgressBar(fraction);
      },
      showWindow: () => {
        if (!win.isDestroyed()) win.show();
      },
      now: Date.now,
    });
```

In the `new ServiceViewManager(` call, directly after the `identityShare,` argument:

```ts
      downloads,
```

In the `before-quit` handler, directly after `identityShare.dispose();`:

```ts
      downloads.dispose();
```

- [ ] **Step 4: Verify**

Run: `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test`
Expected: all clean and green. Then a smoke run of the built app:

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e -- tests/e2e/smoke.spec.ts`
Expected: PASS (the wiring did not break launch).

- [ ] **Step 5: Commit**

Stop and ask the user to run `/grimoire-core:commit` (suggested: `feat(downloads): save what a page downloads and announce it`). Do not run `git commit`.

---

### Task 5: The folder picker channel and the Settings rows

**Files:**

- Modify: `src/shared/ipc.ts` (`RendererInvoke` after `lock:confirm`; `INVOKE_CHANNELS`; `SHELL_ONLY_CHANNELS`)
- Modify: `src/main/ipc-handlers.ts` (import `dialog`; handler after the `passkeys:restore` handler at `:374-377`)
- Modify: `src/renderer/src/components/SettingsView.tsx` (General pane, after the `Combo` row at `:311-327`)
- Test: `tests/unit/ipc-sender-policy.test.ts`

**Interfaces:**

- Consumes: `Settings['downloads']` (Task 1).
- Produces: `RendererInvoke['downloads:chooseDir'] = { result: string | null }`, invoked bare from the shell as `window.goetia.invoke('downloads:chooseDir')`.

- [ ] **Step 1: Write the failing policy test**

Open `tests/unit/ipc-sender-policy.test.ts` and read its imports; it imports `ipcSenderAllowed` from `../../src/main/lib/ipc-sender-policy`. Append inside its top-level `describe`:

```ts
  it('refuses downloads:chooseDir from a service frame', () => {
    expect(
      ipcSenderAllowed({
        channel: 'downloads:chooseDir',
        fromShell: false,
        senderServiceId: 'zalo',
        payloadServiceId: undefined,
      }),
    ).toBe(false);
    expect(
      ipcSenderAllowed({
        channel: 'downloads:chooseDir',
        fromShell: true,
        senderServiceId: null,
        payloadServiceId: undefined,
      }),
    ).toBe(true);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `corepack pnpm vitest run tests/unit/ipc-sender-policy.test.ts`
Expected: FAIL (typecheck error on the channel literal, or the shell case returning `false` because the channel is unknown).

- [ ] **Step 3: Declare the channel**

In `src/shared/ipc.ts`, in `interface RendererInvoke` after the `'lock:confirm'` entry:

```ts
  /** Settings → General → Downloads → Choose…: the native folder picker.
   *  Returns the picked path, or null on cancel; the renderer then writes it
   *  through settings:update. Shell-only — a page must never move the
   *  folder its own downloads land in. */
  'downloads:chooseDir': { result: string | null };
```

Add `'downloads:chooseDir',` to the end of `INVOKE_CHANNELS` (after `'lock:confirm',`) and to the end of `SHELL_ONLY_CHANNELS` (after `'lock:confirm',`).

- [ ] **Step 4: Handle it in main**

In `src/main/ipc-handlers.ts`, add `dialog` to the `electron` import on line 1:

```ts
import {
  app,
  type BrowserWindow,
  dialog,
  type IpcMainInvokeEvent,
  ipcMain,
  Menu,
  shell,
} from 'electron';
```

After the `passkeys:restore` handler:

```ts
  onInvoke('downloads:chooseDir', null, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(ctx.win, {
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: ctx.settings.get().downloads.dir ?? app.getPath('downloads'),
    });
    return canceled || filePaths.length === 0 ? null : filePaths[0];
  });
```

- [ ] **Step 5: Render the rows**

In `src/renderer/src/components/SettingsView.tsx`, inside the component body next to `const update = …` (line 201), add:

```ts
  const chooseDownloadDir = async () => {
    const dir = await window.goetia.invoke('downloads:chooseDir');
    if (dir) update({ downloads: { ...s.downloads, dir } });
  };
```

In the General pane, directly after the closing `</Row>` of the `Combo` row:

```tsx
                <Row
                  label="Downloads"
                  hint={
                    s.downloads.ask
                      ? 'Asks where to save every file.'
                      : 'Files a chat sends you are saved without asking.'
                  }
                >
                  <select
                    data-testid="downloads-mode"
                    value={s.downloads.ask ? 'ask' : 'folder'}
                    onChange={(e) =>
                      update({ downloads: { ...s.downloads, ask: e.target.value === 'ask' } })
                    }
                    className="rounded-ctl border border-border bg-bg-2 px-2 py-1 text-text-1"
                  >
                    <option value="folder">Save to folder</option>
                    <option value="ask">Always ask</option>
                  </select>
                </Row>
                <Row label="Folder" hint={s.downloads.dir ?? 'Your Downloads folder'}>
                  <button
                    type="button"
                    data-testid="downloads-choose"
                    disabled={s.downloads.ask}
                    onClick={() => void chooseDownloadDir()}
                    className="rounded-ctl border border-border bg-bg-2 px-2 py-1 text-text-1 disabled:opacity-40"
                  >
                    Choose…
                  </button>
                </Row>
```

The renderer shows the chosen path, or the words `Your Downloads folder` for the OS default: main resolves the real path at save time, and putting it on `ShellState` would ride every broadcast for a label.

- [ ] **Step 6: Verify**

Run: `corepack pnpm vitest run tests/unit/ipc-sender-policy.test.ts && corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test`
Expected: all green. Then launch the built app and check by hand: `corepack pnpm dev` (or `env -u ELECTRON_RUN_AS_NODE corepack pnpm dev`), open Settings → General, switch the mode, press Choose…, pick a folder, confirm the hint shows it and `settings.json` in the user-data folder holds `downloads.dir`.

- [ ] **Step 7: Commit**

Stop and ask the user to run `/grimoire-core:commit` (suggested: `feat(settings): choose where downloads land`). Do not run `git commit`.

---

### Task 6: End-to-end: a download lands, twice, de-duplicated

**Files:**

- Create: `tests/e2e/downloads.spec.ts`

**Interfaces:**

- Consumes: the `--goetia-e2e` and `--goetia-user-data=` launch flags handled in `src/main/index.ts:41-43`; `settings.json` seeding as in `tests/e2e/lock.spec.ts`; the `will-download` path from Task 4.

- [ ] **Step 1: Write the spec**

Create `tests/e2e/downloads.spec.ts`:

```ts
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, type Page, test } from '@playwright/test';

const isShell = (p: Page) => p.url().startsWith('file://') && !p.url().includes('loading.html');

/** zalo alone summoned (its logged-out page is a stable, real document);
 *  downloads pointed at a folder inside the profile so nothing touches the
 *  machine's real Downloads. */
function makeProfile(): { profile: string; downloads: string } {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-downloads-'));
  const downloads = join(profile, 'saved');
  mkdirSync(downloads);
  writeFileSync(
    join(profile, 'settings.json'),
    JSON.stringify({
      lastActiveId: 'zalo',
      disabled: {
        whatsapp: true,
        messenger: true,
        telegram: true,
        discord: true,
        zalo: false,
        tiktok: true,
        shopee: true,
        instagram: true,
        slack: true,
        teams: true,
      },
      downloads: { ask: false, dir: downloads },
    }),
  );
  return { profile, downloads };
}

/** Start a download from inside the service page the way a chat's "save"
 *  button does: an anchor with `download` on a blob URL, clicked. */
const BLOB_DOWNLOAD = `
  (() => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['hello from goetia'], { type: 'text/plain' }));
    a.download = 'note.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  })()
`;

test('a page download lands in the configured folder and de-duplicates', async () => {
  const { profile, downloads } = makeProfile();
  const app = await electron.launch({
    args: ['out/main/index.js', '--goetia-e2e', `--goetia-user-data=${profile}`],
  });
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
  await win.waitForLoadState('domcontentloaded');

  // wait for the service view's document to exist before scripting it
  await expect
    .poll(
      () =>
        app.evaluate(({ webContents }) =>
          webContents
            .getAllWebContents()
            .some((w) => w.getURL().startsWith('https://') && !w.isLoading()),
        ),
      { timeout: 30_000 },
    )
    .toBe(true);

  const trigger = () =>
    app.evaluate(({ webContents }, js) => {
      const wc = webContents.getAllWebContents().find((w) => w.getURL().startsWith('https://'));
      if (!wc) throw new Error('no service view');
      return wc.executeJavaScript(js);
    }, BLOB_DOWNLOAD);

  await trigger();
  await expect.poll(() => existsSync(join(downloads, 'note.txt')), { timeout: 15_000 }).toBe(true);
  expect(readFileSync(join(downloads, 'note.txt'), 'utf8')).toBe('hello from goetia');

  await trigger();
  await expect
    .poll(() => existsSync(join(downloads, 'note (1).txt')), { timeout: 15_000 })
    .toBe(true);

  await app.close();
});
```

- [ ] **Step 2: Run it**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e -- tests/e2e/downloads.spec.ts`
Expected: PASS. If the poll for the service view times out, the zalo page did not load (network); rerun once, and if it still fails, check `[nav]` lines in the Playwright output before touching the spec.

- [ ] **Step 3: Run the whole suite**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`
Expected: everything green.

- [ ] **Step 4: Commit**

Stop and ask the user to run `/grimoire-core:commit` (suggested: `test(e2e): a page download lands in the configured folder`). Do not run `git commit`.

---

### Task 7: Documentation and the live check

**Files:**

- Modify: `docs/FEATURES.md` (Notifications section: new bullet; Settings & persistence: extend the persisted list; Manual checks: add items)
- Modify: `README.md` (`### Handy to know`, a new bullet after the right-click one)
- Modify: `CLAUDE.md` (Security section, a new bullet after **Permissions**)

**Interfaces:** none.

- [ ] **Step 1: FEATURES.md**

In the `## Notifications` section, after the **Click a banner** bullet, add:

```markdown
- **Downloads** — a file a service page downloads is saved silently into the folder from Settings → General → Downloads (the OS Downloads folder until Choose… picks one; `Always ask` restores the Save dialog), de-duplicated as `name (1).ext`. Completion is a silent native banner (`<file>` / `Saved from <Service>`, service icon) whose click reveals the file — Goetia never opens one — plus the macOS dock bounce; an interrupted download says so; progress rides the dock/taskbar icon. More than 5 page-initiated downloads in 30s fall back to the dialog (the burst cap). The context menu's `Save Image As…` always asks. While locked the banner is redacted to the service name and its click only shows the window. Impl: `src/main/downloads.ts`, `lib/download-rules.ts`, `views.ts` (`configureSession`, `destroy`, `save-image`), `ipc-handlers.ts` (`downloads:chooseDir`). Verified: `download-rules.test.ts`, `downloads.test.ts`, `settings.test.ts`, `ipc-sender-policy.test.ts`, e2e `downloads.spec.ts`; the banner, bounce and taskbar progress are Manual.
```

In `## Settings & persistence`, replace the **Persisted settings** bullet (line 65) with:

```markdown
- **Persisted settings** — order, muted, disabled, neverHibernate, zoom, theme, railPosition, closeToTray, launchAtLogin, globalMuted, downloads. Impl: `src/main/settings.ts`. Verified: `settings.test.ts`.
```

In `## Manual checks`, replace the run-by-hand paragraph (line 100) with:

```markdown
Run these by hand after touching the related area: close-to-tray on/off, tray menu, launch-at-login, theme switching, reorder-by-drag, actual notification banners (and click-to-activate), the Windows taskbar overlay, window resize with several services live, each service's live login + unread badge, a download's banner and its reveal-in-Finder click, the dock bounce, the Windows taskbar progress, and the quarantine attribute on a file a service saved (`xattr -p com.apple.quarantine <file>`).
```

- [ ] **Step 2: README.md**

In `### Handy to know`, directly after the **Right-click in a chat** bullet:

```markdown
- **Files a chat sends you** save straight into your Downloads folder — no dialog — and a small banner names the file when it lands; click it to see the file in Finder or Explorer. Pick a different folder, or go back to being asked every time, in **Settings → General → Downloads**. Goetia only ever shows you the file, never opens it.
```

- [ ] **Step 3: CLAUDE.md**

In `## Security`, directly after the **Permissions** bullet:

```markdown
- **Downloads are saved, never opened** (2026-09-18; spec `docs/superpowers/specs/2026-09-18-downloads-design.md`). One `will-download` per partition feeds `DownloadManager` (`src/main/downloads.ts`), decisions live in `lib/download-rules.ts`. The completion banner is its own silent path — not `NotificationRouter`, so no activity log and no mute gating — and its click is `shell.showItemInFolder`, never `openPath`. A page can download without a gesture, so silent saving is bounded by `DOWNLOAD_BURST_CAP` per `DOWNLOAD_BURST_WINDOW_MS`; the excess gets the Save dialog. `downloads:chooseDir` is shell-only; the folder is never page-controlled. While locked the banner is `redactBanner`'d and never reveals.
```

- [ ] **Step 4: Lint the Markdown**

Run: `npx markdownlint-cli2 docs/FEATURES.md README.md CLAUDE.md`
Expected: `0 issues`.

- [ ] **Step 5: The live check**

Run the built app (`env -u ELECTRON_RUN_AS_NODE corepack pnpm dev`), open a signed-in service, save a photo from a chat, and confirm:

1. The file appears in the Downloads folder under its own name, with no dialog.
2. A silent banner names it; clicking the banner reveals it in Finder.
3. The dock's Downloads stack bounced.
4. `xattr -p com.apple.quarantine <file>` prints a value (Chromium tagged it).
5. Right-click a photo → `Save Image As…` shows the dialog.
6. Settings → Lock on, lock the app, save another file: the banner reads only the service name and its click shows the lock screen.

Record the outcome of item 4 in the spec's Threat model paragraph (replace "the live pass confirms" with what was found and the date).

- [ ] **Step 6: Commit**

Stop and ask the user to run `/grimoire-core:commit` (suggested: `docs: describe downloads in FEATURES, README and the guardrails`). Do not run `git commit`.
