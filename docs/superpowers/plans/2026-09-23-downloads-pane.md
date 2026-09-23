# Downloads Pane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Settings → Downloads pane holding the folder choice and this session's downloads, with Show in Finder or Cancel per row, opened by `⌘/Ctrl ⇧ D`.

**Architecture:** `DownloadManager` keeps a bounded in-memory record per download beside its in-flight map; pure ordering, eviction and formatting rules live in `lib/download-rules.ts` and `shared/format.ts`. Three shell-only channels serve the pane. A `settingsFocus` slot on `MainState` lets a main-side command open Settings on a named pane, and the chord is declared once in `shared/shortcuts.ts` like every other.

**Tech Stack:** TypeScript, Electron, React, Vitest, Playwright-Electron.

Spec: `docs/superpowers/specs/2026-09-23-downloads-pane-design.md`. Mock: artifact `Goetia Downloads`, variant A.

## Global Constraints

- Gates: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`; at the end `corepack pnpm build` then `env -u ELECTRON_RUN_AS_NODE npx playwright test tests/e2e/downloads.spec.ts --reporter=line`.
- No commits from the plan; the user commits through `/commit`. One summary at the end.
- `DownloadView` carries no path. Reveal re-checks `locked()` and `exists(path)` at click time. Goetia never opens a file.
- `DOWNLOAD_HISTORY_CAP` = 50; history is in memory only. The three channels are shell-only and refused while locked.
- Copy, verbatim: row label `When a chat sends a file`; pane titles `Downloads` and `Recent · this session`; hint `Click a file to show it in Finder` (`…in its folder` off macOS); buttons `Show in Finder` / `Show in folder`, `Cancel`; sub-lines `<Service> · downloading · <progress>`, `<Service> · <time> · <size>`, `Could not save · <Service> · <time>`, `<Service> · <time> · moved or deleted since`; empty `Nothing downloaded yet this session. Files a chat sends land in <folder>.`; menu `Downloads`; Shortcuts row `downloads — this session's files`.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/shared/format.ts` (create) | `formatBytes`, `formatProgress`, `extensionChip` |
| `src/shared/types.ts` | `DownloadState`, `DownloadView`, `SettingsFocus`, `ShellState.settingsFocus` |
| `src/main/lib/download-rules.ts` | `DOWNLOAD_HISTORY_CAP`, `DownloadRecord`, `historyViews`, `historyEvict` |
| `src/main/downloads.ts` | records, `recent` / `cancel` / `reveal`, `openDownloads` dep |
| `src/shared/ipc.ts`, `src/main/ipc-handlers.ts`, `src/main/index.ts` | the three channels, `ctx.downloads`, the dep wiring |
| `src/main/state.ts`, `src/main/activate.ts` | `settingsFocus`, cleared when Settings closes |
| `src/shared/shortcuts.ts`, `src/main/lib/shortcuts.ts`, `src/main/commands.ts`, `src/main/menu.ts` | the chord, the command, the menu item |
| `src/renderer/src/components/relative-time.ts` (create), `DownloadsPane.tsx` (create), `DiagnosticsPane.tsx`, `SettingsView.tsx` | the pane and its wiring |
| tests | `format.test.ts` (create), `download-rules.test.ts`, `downloads.test.ts`, `shortcuts.test.ts`, `state.test.ts`, `activate.test.ts`, `ipc-sender-policy.test.ts`, `lock-ipc-policy.test.ts`, e2e `downloads.spec.ts` |
| docs | spec status, the 2026-09-18 spec's superseded line, `CLAUDE.md`, `FEATURES.md`, `README.md` |

---

### Task 1: pure rules and formats (tests first)

**Files:**

- Create: `src/shared/format.ts`, `tests/unit/format.test.ts`
- Modify: `src/shared/types.ts` (after `homeOpen: boolean;` line 351, and after `pinsUnreadable: boolean;`), `src/main/lib/download-rules.ts` (imports; append)
- Test: `tests/unit/download-rules.test.ts`

**Interfaces:**

- Produces: `DownloadState`, `DownloadView`, `SettingsFocus` (shared types); `DOWNLOAD_HISTORY_CAP`, `DownloadRecord`, `historyViews(records, exists): DownloadView[]`, `historyEvict(records): number | null`; `formatBytes(n)`, `formatProgress(received, total)`, `extensionChip(filename)`.

- [ ] **Step 1: Types**

In `src/shared/types.ts`, after `homeOpen: boolean;` inside `ShellState`:

```ts
  /** a main-side command asked Settings to open on a pane; `seq` makes a
   *  repeat press land again while Settings is already open. Cleared when
   *  Settings closes. */
  settingsFocus: SettingsFocus | null;
```

and after the `DiagEntry` interface (top-level):

```ts
/** which Settings pane a main-side command asked for */
export interface SettingsFocus {
  section: 'downloads';
  seq: number;
}

export type DownloadState = 'downloading' | 'saved' | 'failed' | 'missing';

/** One row of Settings → Downloads. No path: the pane needs none, and a path
 *  is where a later feature would be tempted to open something. */
export interface DownloadView {
  id: number;
  serviceId: ServiceId;
  filename: string;
  /** `missing`: saved, but the file was gone when the list was fetched */
  state: DownloadState;
  received: number;
  /** 0 when unknown */
  total: number;
  /** epoch ms the download started */
  at: number;
}
```

- [ ] **Step 2: Write the failing tests**

Create `tests/unit/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { extensionChip, formatBytes, formatProgress } from '../../src/shared/format';

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

describe('formatBytes', () => {
  it('picks the unit and keeps one decimal only under ten', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(812 * KB)).toBe('812 KB');
    expect(formatBytes(3.1 * MB)).toBe('3.1 MB');
    expect(formatBytes(77 * MB)).toBe('77 MB');
    expect(formatBytes(2.5 * GB)).toBe('2.5 GB');
  });
});

describe('formatProgress', () => {
  it("shares the total's unit, and says so far with no total", () => {
    expect(formatProgress(48 * MB, 77 * MB)).toBe('48 of 77 MB');
    expect(formatProgress(300 * KB, 3.1 * MB)).toBe('0.3 of 3.1 MB');
    expect(formatProgress(48 * MB, 0)).toBe('48 MB so far');
  });
});

describe('extensionChip', () => {
  it('upper-cases the extension, clipped to four, FILE when there is none', () => {
    expect(extensionChip('photo.jpg')).toBe('JPG');
    expect(extensionChip('x.jpeg')).toBe('JPEG');
    expect(extensionChip('archive.tar.gz')).toBe('GZ');
    expect(extensionChip('x.webarchive')).toBe('WEBA');
    expect(extensionChip('README')).toBe('FILE');
    expect(extensionChip('.env')).toBe('FILE');
  });
});
```

Append to `tests/unit/download-rules.test.ts` (and add `DOWNLOAD_HISTORY_CAP`, `type DownloadRecord`, `historyEvict`, `historyViews` to its import block):

```ts
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
```

- [ ] **Step 3: Run them to verify they fail**

Run: `corepack pnpm vitest run tests/unit/format.test.ts tests/unit/download-rules.test.ts`
Expected: `format.test.ts` fails to resolve its import; `download-rules.test.ts` fails on the missing exports.

- [ ] **Step 4: Write `src/shared/format.ts`**

```ts
const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

function unitFor(n: number): number {
  let i = 0;
  let v = Math.max(0, n);
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024;
    i++;
  }
  return i;
}

/** one decimal under ten, none above; bytes are always whole */
function inUnit(n: number, unit: number): string {
  const v = Math.max(0, n) / 1024 ** unit;
  if (unit === 0) return String(Math.round(v));
  return v < 10 ? v.toFixed(1) : String(Math.round(v));
}

export function formatBytes(n: number): string {
  const u = unitFor(n);
  return `${inUnit(n, u)} ${UNITS[u]}`;
}

/** `48 of 77 MB`: both numbers in the total's unit so they compare at a
 *  glance; `48 MB so far` when Chromium does not know the total. */
export function formatProgress(received: number, total: number): string {
  if (total <= 0) return `${formatBytes(received)} so far`;
  const u = unitFor(total);
  return `${inUnit(received, u)} of ${inUnit(total, u)} ${UNITS[u]}`;
}

/** The row's file-type chip: the extension upper-cased and clipped to four
 *  characters, FILE for a name with none (README, .env). */
export function extensionChip(filename: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(filename);
  if (!m || m.index === 0) return 'FILE';
  return m[1].toUpperCase().slice(0, 4);
}
```

- [ ] **Step 5: Extend `src/main/lib/download-rules.ts`**

Add to the imports at the top:

```ts
import type { DownloadView, ServiceId } from '../../shared/types';
```

Append at the end of the file:

```ts
/** Rows Settings → Downloads keeps for the session; in memory only. */
export const DOWNLOAD_HISTORY_CAP = 50;

/** Main's own record of one download. `path` is empty until Chromium knows
 *  it (an Ask download learns it at done) and never leaves main. */
export interface DownloadRecord {
  id: number;
  serviceId: ServiceId;
  filename: string;
  path: string;
  state: 'downloading' | 'saved' | 'failed';
  received: number;
  total: number;
  at: number;
}

/** In flight first, then newest first (id breaks a tie); a saved file that
 *  is gone reads `missing`, checked here so the pane never sees a path. */
export function historyViews(
  records: readonly DownloadRecord[],
  exists: (path: string) => boolean,
): DownloadView[] {
  const rank = (r: DownloadRecord) => (r.state === 'downloading' ? 0 : 1);
  return [...records]
    .sort((a, b) => rank(a) - rank(b) || b.at - a.at || b.id - a.id)
    .map((r) => ({
      id: r.id,
      serviceId: r.serviceId,
      filename: r.filename,
      state: r.state === 'saved' && !exists(r.path) ? 'missing' : r.state,
      received: r.received,
      total: r.total,
      at: r.at,
    }));
}

/** The one record to drop when the cap is met: the oldest ended one, so a
 *  running download keeps its row and its Cancel; the oldest of all only
 *  when every row is still in flight (its download continues unlisted). */
export function historyEvict(records: readonly DownloadRecord[]): number | null {
  if (records.length < DOWNLOAD_HISTORY_CAP) return null;
  const ended = records.filter((r) => r.state !== 'downloading');
  const pool = ended.length > 0 ? ended : records;
  return pool.reduce((a, b) => (b.at < a.at || (b.at === a.at && b.id < a.id) ? b : a)).id;
}
```

- [ ] **Step 6: Run the tests, lint, typecheck**

Run: `corepack pnpm vitest run tests/unit/format.test.ts tests/unit/download-rules.test.ts && corepack pnpm lint && corepack pnpm typecheck`
Expected: both files pass; lint clean; typecheck reports `settingsFocus` missing from `MainState.snapshot`'s returned object — Task 3 adds it. If typecheck lists nothing else, continue.

---

### Task 2: the manager keeps records (tests first)

**Files:**

- Modify: `src/main/downloads.ts`
- Test: `tests/unit/downloads.test.ts`

**Interfaces:**

- Consumes: `DownloadRecord`, `historyViews`, `historyEvict` from Task 1.
- Produces: `DownloadManagerDeps.openDownloads(): void`; `recent(): DownloadView[]`, `cancel(id: number): boolean`, `reveal(id: number): boolean`. Task 3's handlers call the three.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/downloads.test.ts` add `DOWNLOAD_HISTORY_CAP` to the `download-rules` import, add `openDownloads: vi.fn(),` to the `deps` object in `harness()` (after `showWindow: vi.fn(),`), and in the first case `'saves into the OS folder silently and announces the file'` insert `files.add(join(DIR, 'photo.jpg'));` immediately before `item.finish('completed');` (destructure `files` from `harness()` there) — the banner's click now reveals only a file that exists. Then append:

```ts
describe('history', () => {
  it('lists a download from start to saved, without a path', () => {
    const { dm, ses, files } = harness();
    const item = new FakeItem('photo.jpg');
    ses.fire(item);
    expect(dm.recent()).toEqual([
      {
        id: 1,
        serviceId: 'whatsapp',
        filename: 'photo.jpg',
        state: 'downloading',
        received: 0,
        total: 100,
        at: 1_000_000,
      },
    ]);
    item.progress(40);
    expect(dm.recent()[0]).toMatchObject({ received: 40, total: 100 });
    files.add(join(DIR, 'photo.jpg'));
    item.finish('completed');
    expect(dm.recent()[0]).toMatchObject({ state: 'saved', received: 40 });
    expect('path' in dm.recent()[0]).toBe(false);
  });

  it('reads missing once the file is gone, failed on interruption, nothing on cancel', () => {
    const { dm, ses } = harness();
    const a = new FakeItem('a.pdf');
    ses.fire(a);
    a.finish('completed'); // never added to files
    expect(dm.recent()[0].state).toBe('missing');
    const b = new FakeItem('b.pdf');
    ses.fire(b);
    b.finish('interrupted');
    expect(dm.recent()[0]).toMatchObject({ filename: 'b.pdf', state: 'failed' });
    const c = new FakeItem('c.pdf');
    ses.fire(c);
    c.finish('cancelled');
    expect(dm.recent().map((r) => r.filename)).toEqual(['b.pdf', 'a.pdf']);
  });

  it('puts in-flight rows first', () => {
    const { dm, ses } = harness();
    const a = new FakeItem('a.pdf');
    ses.fire(a);
    a.finish('completed');
    ses.fire(new FakeItem('b.pdf'));
    ses.fire(new FakeItem('c.pdf'));
    expect(dm.recent().map((r) => r.filename)).toEqual(['c.pdf', 'b.pdf', 'a.pdf']);
  });

  it('cancel ends only an in-flight download and removes its row', () => {
    const { dm, ses } = harness();
    const a = new FakeItem('a.pdf');
    ses.fire(a);
    a.finish('completed');
    const b = new FakeItem('b.pdf');
    ses.fire(b);
    expect(dm.cancel(1)).toBe(false); // saved
    expect(dm.cancel(99)).toBe(false);
    expect(dm.cancel(2)).toBe(true);
    expect(b.cancelled).toBe(true);
    expect(dm.recent().map((r) => r.filename)).toEqual(['a.pdf']);
  });

  it('reveals only a saved file that is still there, never while locked', () => {
    const { dm, ses, deps, box, files } = harness();
    const a = new FakeItem('a.pdf');
    ses.fire(a);
    files.add(join(DIR, 'a.pdf'));
    a.finish('completed');
    ses.fire(new FakeItem('b.pdf'));
    expect(dm.reveal(2)).toBe(false); // downloading
    expect(dm.reveal(42)).toBe(false);
    box.locked = true;
    expect(dm.reveal(1)).toBe(false);
    box.locked = false;
    expect(dm.reveal(1)).toBe(true);
    expect(deps.reveal).toHaveBeenCalledWith(join(DIR, 'a.pdf'));
    files.delete(join(DIR, 'a.pdf'));
    expect(dm.reveal(1)).toBe(false);
  });

  it("opens the pane from a completed banner's click once the file is gone", () => {
    const { ses, deps, banners } = harness();
    const a = new FakeItem('a.pdf');
    ses.fire(a);
    a.finish('completed'); // never in files
    banners[0].onClick();
    expect(deps.reveal).not.toHaveBeenCalled();
    expect(deps.openDownloads).toHaveBeenCalledTimes(1);
  });

  it("detach drops the service's in-flight rows and keeps the saved ones", () => {
    const { dm, ses } = harness();
    const a = new FakeItem('a.pdf');
    ses.fire(a);
    a.finish('completed');
    ses.fire(new FakeItem('b.pdf'));
    dm.detach('whatsapp');
    expect(dm.recent().map((r) => r.filename)).toEqual(['a.pdf']);
  });

  it('keeps at most DOWNLOAD_HISTORY_CAP rows, dropping ended ones first', () => {
    const { dm, ses } = harness();
    ses.fire(new FakeItem('live.bin')); // id 1, stays in flight
    for (let i = 0; i < DOWNLOAD_HISTORY_CAP; i++) {
      const it = new FakeItem(`f${i}.txt`);
      ses.fire(it);
      it.finish('completed');
    }
    const names = dm.recent().map((r) => r.filename);
    expect(names).toHaveLength(DOWNLOAD_HISTORY_CAP);
    expect(names[0]).toBe('live.bin');
    expect(names).not.toContain('f0.txt');
    expect(names).toContain('f49.txt');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `corepack pnpm vitest run tests/unit/downloads.test.ts`
Expected: the `history` cases fail (`dm.recent is not a function`); the first existing case still passes.

- [ ] **Step 3: Change `src/main/downloads.ts`**

Imports (`basename` names a row by the file on disk):

```ts
import { basename } from 'node:path';
import type { DownloadView, ServiceId, Settings } from '../shared/types';
import {
  ASK_URL_CAP,
  bannerFor,
  DOWNLOAD_BURST_WINDOW_MS,
  type DownloadEnd,
  type DownloadRecord,
  decideSave,
  historyEvict,
  historyViews,
  progressFraction,
} from './lib/download-rules';
```

Add to `DownloadManagerDeps`, after `showWindow(): void;`:

```ts
  /** Settings → Downloads — a completed banner clicked after its file moved */
  openDownloads(): void;
```

Replace `Inflight`:

```ts
interface Inflight {
  id: number;
  serviceId: ServiceId;
  received: number;
  total: number;
}
```

Add two fields after `askUrls`:

```ts
  /** this session's rows behind Settings → Downloads; DOWNLOAD_HISTORY_CAP */
  private records = new Map<number, DownloadRecord>();
  private nextId = 1;
```

In `handle`, replace everything from `this.inflight.set(item, …)` to the end of the method:

```ts
    const evict = historyEvict([...this.records.values()]);
    if (evict !== null) this.records.delete(evict);
    // the row is named by the file on disk: a de-duplicated save is
    // `note (1).txt`, not the `note.txt` the page asked for
    const record: DownloadRecord = {
      id: this.nextId++,
      serviceId: id,
      filename: decision.mode === 'save' ? basename(decision.path) : item.getFilename(),
      path: decision.mode === 'save' ? decision.path : '',
      state: 'downloading',
      received: 0,
      total: item.getTotalBytes(),
      at: now,
    };
    this.records.set(record.id, record);
    this.inflight.set(item, { id: record.id, serviceId: id, received: 0, total: record.total });
    item.on('updated', () => {
      const f = this.inflight.get(item);
      if (!f) return;
      f.received = item.getReceivedBytes();
      f.total = item.getTotalBytes();
      record.received = f.received;
      record.total = f.total;
      this.pushProgress();
    });
    item.once('done', (_e, state) => this.finish(id, item, state));
  }
```

Replace `finish`:

```ts
  private finish(id: ServiceId, item: DownloadItemLike, state: DownloadEnd): void {
    const f = this.inflight.get(item);
    const tracked = this.inflight.delete(item);
    this.pushProgress();
    // detach cancelled it; a cancel is silent anyway, but never announce a
    // download the service no longer owns
    if (!tracked || !f) return;
    const path = item.getSavePath();
    const record = this.records.get(f.id);
    if (state === 'cancelled') {
      this.records.delete(f.id); // a cancelled file gets no row, as it gets no banner
    } else if (record) {
      record.state = state === 'completed' ? 'saved' : 'failed';
      record.path = path;
      if (path) record.filename = basename(path); // an Ask save learns its name here
      record.received = item.getReceivedBytes();
      record.total = item.getTotalBytes();
    }
    const name = this.deps.serviceName(id);
    const banner = bannerFor(state, item.getFilename(), name);
    if (!banner) return;
    if (state === 'completed') this.deps.dockFinished(path);
    const shown = this.deps.locked() ? redactBanner(name) : banner;
    const icon = this.deps.icons.get(id);
    this.deps.notify({
      ...shown,
      ...(icon ? { icon } : {}),
      onClick: () => {
        // re-checked at click time: a banner clicked hours later must not be
        // a way to reveal a file past a lock that has since engaged
        if (state === 'completed' && !this.deps.locked()) {
          if (this.deps.exists(path)) this.deps.reveal(path);
          else this.deps.openDownloads(); // the row there reads "moved or deleted since"
        } else this.deps.showWindow();
      },
    });
  }
```

Add three methods before `pushProgress`:

```ts
  /** Settings → Downloads, in flight first then newest; `missing` decided
   *  here against the disk so the renderer never holds a path. */
  recent(): DownloadView[] {
    return historyViews([...this.records.values()], this.deps.exists);
  }

  /** Cancel an in-flight download by row id; false for anything else. */
  cancel(id: number): boolean {
    for (const [item, f] of this.inflight) {
      if (f.id === id) {
        item.cancel();
        return true;
      }
    }
    return false;
  }

  /** Reveal a saved file by row id — the banner's click, re-checked the same
   *  way: never while locked, never a file that is gone. */
  reveal(id: number): boolean {
    const r = this.records.get(id);
    if (!r || r.state !== 'saved' || this.deps.locked() || !this.deps.exists(r.path)) return false;
    this.deps.reveal(r.path);
    return true;
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `corepack pnpm vitest run tests/unit/downloads.test.ts`
Expected: PASS, every existing case and the eight new ones.

- [ ] **Step 5: Lint**

Run: `corepack pnpm lint`
Expected: clean. (Typecheck is red until Task 3 wires `openDownloads` and `settingsFocus`.)

---

### Task 3: channels, state, command, chord, menu (tests first)

**Files:**

- Modify: `src/shared/ipc.ts`, `src/main/ipc-handlers.ts`, `src/main/index.ts`, `src/main/state.ts`, `src/main/activate.ts`, `src/shared/shortcuts.ts`, `src/main/lib/shortcuts.ts`, `src/main/commands.ts`, `src/main/menu.ts`
- Test: `tests/unit/shortcuts.test.ts`, `tests/unit/state.test.ts`, `tests/unit/activate.test.ts`, `tests/unit/ipc-sender-policy.test.ts`, `tests/unit/lock-ipc-policy.test.ts`

**Interfaces:**

- Consumes: `recent` / `cancel` / `reveal` and `openDownloads` from Task 2; `SettingsFocus` from Task 1.
- Produces: channels `downloads:recent` (invoke), `downloads:reveal` and `downloads:cancel` (send, `{ id: number }`); `ACCELERATORS.downloads`; `ShellCommand { kind: 'downloads' }`; `openDownloads(ctx)`; `ctx.downloads`; `ShellState.settingsFocus` populated. Task 4 consumes the channels and the flag.

- [ ] **Step 1: Write the failing tests**

`tests/unit/shortcuts.test.ts` — in `'covers every Goetia chord the app menu declares'` add:

```ts
    expect(on('D', { shift: true })).toEqual({ kind: 'downloads' });
```

and in `'is the single source the menu labels and the Settings pane read from'`:

```ts
    expect(ACCELERATORS.downloads).toBe('CmdOrCtrl+Shift+D');
```

`tests/unit/state.test.ts` — after `'snapshots pinsUnreadable, and hides it while locked like the pins'`:

```ts
  it('snapshots settingsFocus, null until a command sets it', () => {
    const s = new MainState();
    expect(s.snapshot(DEFAULT_SETTINGS, 'dark', '0.1.0', false).settingsFocus).toBeNull();
    s.settingsFocus = { section: 'downloads', seq: 2 };
    expect(s.snapshot(DEFAULT_SETTINGS, 'dark', '0.1.0', false).settingsFocus).toEqual({
      section: 'downloads',
      seq: 2,
    });
  });
```

`tests/unit/activate.test.ts` — inside `describe('setOverlayOpen', …)`:

```ts
  it('forgets the pane a command asked for when settings closes', () => {
    const state = new MainState();
    state.settingsFocus = { section: 'downloads', seq: 1 };
    const { ctx } = makeCtx(state);
    setOverlayOpen(ctx, 'settingsOpen', true);
    expect(state.settingsFocus).toEqual({ section: 'downloads', seq: 1 });
    setOverlayOpen(ctx, 'switcherOpen', false);
    expect(state.settingsFocus).toEqual({ section: 'downloads', seq: 1 });
    setOverlayOpen(ctx, 'settingsOpen', false);
    expect(state.settingsFocus).toBeNull();
  });
```

`tests/unit/ipc-sender-policy.test.ts` — after the diagnostics case:

```ts
  it('refuses the downloads channels from a service frame', () => {
    for (const channel of ['downloads:recent', 'downloads:reveal', 'downloads:cancel'] as const) {
      expect(
        ipcSenderAllowed({
          channel,
          fromShell: false,
          senderServiceId: 'zalo',
          payloadServiceId: undefined,
        }),
      ).toBe(false);
      expect(
        ipcSenderAllowed({
          channel,
          fromShell: true,
          senderServiceId: null,
          payloadServiceId: undefined,
        }),
      ).toBe(true);
    }
  });
```

`tests/unit/lock-ipc-policy.test.ts` — add `'downloads:recent', 'downloads:reveal', 'downloads:cancel',` to the list in `'refuses every channel that would put a service on screen or change it'` (after `'settings:import',`).

- [ ] **Step 2: Run them to verify they fail**

Run: `corepack pnpm vitest run tests/unit/shortcuts.test.ts tests/unit/state.test.ts tests/unit/activate.test.ts tests/unit/ipc-sender-policy.test.ts tests/unit/lock-ipc-policy.test.ts`
Expected: the new cases fail (`downloads` is not an accelerator; `settingsFocus` undefined; the channels are not shell-only).

- [ ] **Step 3: IPC**

`src/shared/ipc.ts` — add `DownloadView` to the `./types` import. In `RendererToMain`, after `'pins:open': { id: number };`:

```ts
  /** Settings → Downloads rows: reveal a saved file, cancel a running one.
   *  `id` is main's own row id; the path never leaves main. Shell-only. */
  'downloads:reveal': { id: number };
  'downloads:cancel': { id: number };
```

In `RendererInvoke`, after `'downloads:chooseDir'`:

```ts
  /** Settings → Downloads: this session's rows, fetched when the pane opens
   *  and polled once a second only while one is still downloading. */
  'downloads:recent': { result: DownloadView[] };
```

Add `'downloads:reveal', 'downloads:cancel',` to `R2M_CHANNELS` after `'pins:open',`; `'downloads:recent',` to `INVOKE_CHANNELS` after `'downloads:chooseDir',`; and all three to `SHELL_ONLY_CHANNELS` after `'downloads:chooseDir',`. Not to `LOCKED_ALLOWED_CHANNELS`.

`src/main/ipc-handlers.ts` — add `import type { DownloadManager } from './downloads';`; in `AppContext` after `pins: PinStore;`:

```ts
  /** this session's downloads; in-memory rows behind Settings → Downloads */
  downloads: DownloadManager;
```

After the `downloads:chooseDir` handler:

```ts
  onInvoke('downloads:recent', [], () => ctx.downloads.recent());
  on('downloads:reveal', ({ id }) => {
    if (Number.isSafeInteger(id)) ctx.downloads.reveal(id);
  });
  on('downloads:cancel', ({ id }) => {
    if (Number.isSafeInteger(id)) ctx.downloads.cancel(id);
  });
```

`src/main/index.ts` — in the `DownloadManager` deps after `showWindow: …},`:

```ts
      // ctx is assembled below; a banner cannot be clicked before it exists
      openDownloads: () => runShellCommand(ctx, { kind: 'downloads' }),
```

and in the `ctx` literal after `pins,`: `downloads,`.

- [ ] **Step 4: State and the overlay**

`src/main/state.ts` — after `homeOpen = false;`:

```ts
  /** the pane a main-side command asked Settings to open on (⌘⇧D); cleared
   *  by setOverlayOpen when Settings closes, so it never re-selects later */
  settingsFocus: SettingsFocus | null = null;
```

(add `SettingsFocus` to the `../shared/types` import) and in `snapshot` after `homeOpen: this.homeOpen,`:

```ts
      settingsFocus: this.settingsFocus,
```

`src/main/activate.ts` — in `setOverlayOpen`, before `ctx.state[key] = open;`:

```ts
  if (key === 'settingsOpen' && !open) ctx.state.settingsFocus = null;
```

- [ ] **Step 5: Chord, command, menu**

`src/shared/shortcuts.ts` — after `pinSelection`:

```ts
  /** left half too: Settings → Downloads, this session's files */
  downloads: 'CmdOrCtrl+Shift+D',
```

`src/main/lib/shortcuts.ts` — add `| { kind: 'downloads' }` to `ShellCommand` after `'settings'`, and to `FIXED` after the settings entry:

```ts
  [[ACCELERATORS.downloads], { kind: 'downloads' }],
```

`src/main/commands.ts` — after `openSettings`:

```ts
/** Settings, opened on the Downloads pane. `seq` bumps so a second press
 *  with Settings already open on another pane lands there again. */
export function openDownloads(ctx: AppContext): void {
  const seq = (ctx.state.settingsFocus?.seq ?? 0) + 1;
  ctx.state.settingsFocus = { section: 'downloads', seq };
  openSettings(ctx);
}
```

and in `runShellCommand` after the `'settings'` case:

```ts
    case 'downloads':
      openDownloads(ctx);
      return;
```

`src/main/menu.ts` — in the Go submenu after the Previous Unread item:

```ts
        {
          label: 'Downloads',
          accelerator: ACCELERATORS.downloads,
          click: run({ kind: 'downloads' }),
        },
```

- [ ] **Step 6: Gates**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: lint clean; typecheck clean (Task 1's `settingsFocus` gap is filled); every unit file green including the five touched here.

---

### Task 4: the pane

**Files:**

- Create: `src/renderer/src/components/relative-time.ts`, `src/renderer/src/components/DownloadsPane.tsx`
- Modify: `src/renderer/src/components/DiagnosticsPane.tsx` (drop the local `relativeTime`, import it), `src/renderer/src/components/SettingsView.tsx`

**Interfaces:**

- Consumes: the three channels, `ShellState.settingsFocus`, `formatBytes` / `formatProgress` / `extensionChip`, `ACCELERATORS.downloads`.
- Produces: test ids `settings-nav-downloads` (from `SECTIONS`), `download-row` with `data-state`, `download-reveal`, `download-cancel`, `downloads-empty`; the General rows keep `downloads-mode`, `downloads-reset`, `downloads-choose`.

- [ ] **Step 1: `relative-time.ts`**

Create `src/renderer/src/components/relative-time.ts` with the function cut from `DiagnosticsPane.tsx` (unchanged body):

```ts
/** `12s ago`, `4 min ago`, `2 h ago`, else a date — read at render time by
 *  panes that fetch once per open, so a stale label is at most as old as the
 *  pane on screen. (The switcher has its own terser `now` / `3 m` form.) */
export function relativeTime(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(at).toLocaleDateString();
}
```

In `DiagnosticsPane.tsx` delete the `relativeTime` function and its doc comment and add `import { relativeTime } from './relative-time';`.

- [ ] **Step 2: `DownloadsPane.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { extensionChip, formatBytes, formatProgress } from '../../../shared/format';
import type { DownloadView } from '../../../shared/types';
import { useShell } from '../store';
import { relativeTime } from './relative-time';

/** while a row is downloading the pane re-fetches this often; never otherwise */
const POLL_MS = 1000;
const isMac = navigator.platform.startsWith('Mac');
export const REVEAL_LABEL = isMac ? 'Show in Finder' : 'Show in folder';

/** whole percent, or null while Chromium does not know the total */
export function percent(r: { received: number; total: number }): number | null {
  return r.total > 0 ? Math.min(100, Math.round((r.received / r.total) * 100)) : null;
}

const btn =
  'flex-none rounded-ctl border border-border bg-bg-2 px-2 py-1 text-[12px] text-text-1 transition-colors duration-120';

function Sub({ r, service, now }: { r: DownloadView; service: string; now: number }) {
  switch (r.state) {
    case 'downloading':
      return <>{`${service} · downloading · ${formatProgress(r.received, r.total)}`}</>;
    case 'saved':
      return <>{`${service} · ${relativeTime(r.at, now)} · ${formatBytes(r.received || r.total)}`}</>;
    case 'failed':
      return (
        <>
          <span className="text-danger">Could not save</span>
          {` · ${service} · ${relativeTime(r.at, now)}`}
        </>
      );
    case 'missing':
      return <>{`${service} · ${relativeTime(r.at, now)} · moved or deleted since`}</>;
  }
}

function Action({
  r,
  onReveal,
  onCancel,
}: {
  r: DownloadView;
  onReveal: () => void;
  onCancel: () => void;
}) {
  if (r.state === 'downloading') {
    const pct = percent(r);
    return (
      <span className="flex flex-none items-center gap-2">
        <span className="tabular text-[12px] text-text-2">{pct === null ? '…' : `${pct}%`}</span>
        <button
          type="button"
          data-testid="download-cancel"
          onClick={onCancel}
          className={`${btn} hover:border-danger`}
        >
          Cancel
        </button>
      </span>
    );
  }
  if (r.state === 'saved') {
    return (
      <button
        type="button"
        data-testid="download-reveal"
        onClick={onReveal}
        className={`${btn} hover:border-accent`}
      >
        {REVEAL_LABEL}
      </button>
    );
  }
  return <span className="flex-none px-2 text-text-2">—</span>;
}

/** Settings → Downloads → Recent: this session's files, in flight first.
 *  Fetched when the pane opens and polled once a second only while a row is
 *  still downloading. A row's one action is reveal, or Cancel while it runs;
 *  nothing here is persisted and no path ever reaches this process — see
 *  main/downloads.ts. `landing` names the folder for the empty state, null
 *  under Always ask. */
export default function DownloadsPane({ landing }: { landing: string | null }) {
  const services = useShell((s) => s.state?.services);
  const [rows, setRows] = useState<DownloadView[] | null>(null);
  const load = useCallback(() => {
    window.goetia.invoke('downloads:recent').then(setRows);
  }, []);
  useEffect(load, [load]);

  const live = rows?.some((r) => r.state === 'downloading') ?? false;
  useEffect(() => {
    if (!live) return;
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [live, load]);

  const reveal = (id: number) => {
    window.goetia.send('downloads:reveal', { id });
    load();
  };
  const cancel = (id: number) => {
    window.goetia.send('downloads:cancel', { id });
    load();
  };

  if (rows === null) return null;
  const now = Date.now();
  if (rows.length === 0) {
    return (
      <p className="py-3 text-[11px] text-text-2" data-testid="downloads-empty">
        Nothing downloaded yet this session.
        {landing !== null && ` Files a chat sends land in ${landing}.`}
      </p>
    );
  }
  return (
    <div>
      <p className="pt-2 text-right text-[11px] text-text-2">
        Click a file to show it in {isMac ? 'Finder' : 'its folder'}
      </p>
      <ul className="pb-1">
        {rows.map((r) => {
          const svc = services?.find((s) => s.id === r.serviceId);
          const gone = r.state === 'missing';
          return (
            <li
              key={r.id}
              data-testid="download-row"
              data-state={r.state}
              className="flex items-center gap-2.5 border-b border-border py-2 last:border-b-0"
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 flex-none rounded-full"
                style={{ background: svc?.color ?? 'transparent' }}
              />
              <span className="flex h-[30px] w-[28px] flex-none items-center justify-center rounded-ctl border border-border bg-bg-2 text-[8px] font-extrabold tracking-wide text-text-2">
                {extensionChip(r.filename)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span
                  className={`truncate font-medium ${
                    gone ? 'text-text-2 line-through decoration-border' : 'text-text-1'
                  }`}
                >
                  {r.filename}
                </span>
                <span className="text-[11px] text-text-2">
                  <Sub r={r} service={svc?.name ?? r.serviceId} now={now} />
                </span>
                {r.state === 'downloading' && (
                  <span className="mt-0.5 h-[3px] overflow-hidden rounded-full bg-bg-2">
                    <span
                      className="block h-full bg-accent"
                      style={{
                        width: `${percent(r) ?? 100}%`,
                        opacity: percent(r) === null ? 0.4 : 1,
                      }}
                    />
                  </span>
                )}
              </span>
              <Action r={r} onReveal={() => reveal(r.id)} onCancel={() => cancel(r.id)} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: `SettingsView.tsx`**

**Section.** Add `'downloads'` to `SectionId` (after `'notifications'`) and `{ id: 'downloads', label: 'Downloads' },` to `SECTIONS` after the notifications entry. Import: `import DownloadsPane from './DownloadsPane';`.
**Cut the rows.** Cut the two General rows — from `<Row\n  label="Downloads"` through the Folder row's closing `</Row>` (the block ending just before `<Row label="Backup" …>`) — out of the General pane.
**Mount the pane.** After the `{active === 'diagnostics' && (…)}` block add:

```tsx
            {active === 'downloads' && (
              <div className="flex flex-col gap-4">
                <Pane title="Downloads">
                  <Row
                    label="When a chat sends a file"
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
                    <span className="flex items-center gap-3">
                      {/* null is the OS folder proper — it follows a relocated
                          Downloads, which an explicit path to it would not */}
                      {s.downloads.dir !== null && (
                        <button
                          type="button"
                          data-testid="downloads-reset"
                          disabled={s.downloads.ask}
                          onClick={() => update({ downloads: { ...s.downloads, dir: null } })}
                          className="text-[11px] text-accent hover:underline disabled:opacity-40"
                        >
                          Use Downloads folder
                        </button>
                      )}
                      <button
                        type="button"
                        data-testid="downloads-choose"
                        disabled={s.downloads.ask}
                        onClick={() => void chooseDownloadDir()}
                        className="rounded-ctl border border-border bg-bg-2 px-2 py-1 text-text-1 disabled:opacity-40"
                      >
                        Choose…
                      </button>
                    </span>
                  </Row>
                </Pane>
                <Pane title="Recent · this session">
                  <DownloadsPane
                    landing={s.downloads.ask ? null : (s.downloads.dir ?? 'your Downloads folder')}
                  />
                </Pane>
              </div>
            )}
```

**Focus effect.** After the Updates focus effect (`// arriving from the gear dot or from Check for Updates…`), add:

```tsx
  // a main-side command (⌘⇧D, or a banner whose file has moved) asked for a
  // pane; keyed on seq so a repeat press lands again and a later broadcast
  // (a new object each time over IPC) does not drag the user back
  const focusSeq = state?.settingsFocus?.seq ?? 0;
  const focusSection = state?.settingsFocus?.section;
  useEffect(() => {
    if (!open || !focusSection || focusSeq === 0) return;
    setActive(focusSection);
  }, [open, focusSeq, focusSection]);
```

**Shortcuts row.** In the Shortcuts pane's Navigate group, after the Home row:

```tsx
                    [key(ACCELERATORS.downloads), "downloads — this session's files"],
```

- [ ] **Step 4: Gates**

Run: `corepack pnpm biome check --write src && corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: clean. If biome reflows JSX, accept its formatting.

---

### Task 5: e2e

**Files:**

- Modify: `tests/e2e/downloads.spec.ts`

**Interfaces:**

- Consumes: `settings-nav-downloads`, `download-row[data-state]`, `download-reveal`, `downloads-empty`; the chord technique from `tests/e2e/shortcuts.spec.ts`.

- [ ] **Step 1: Edit the spec**

Imports: add `rmSync` to the `node:fs` import and `type ElectronApplication` to the Playwright import. Add the chord helper after `BLOB_DOWNLOAD`:

```ts
/** ⌘⇧<key> arriving at the service view's before-input-event — CDP keys bypass
 *  it, so the event is emitted on the webContents (shortcuts.spec's technique). */
async function chord(app: ElectronApplication, key: string): Promise<void> {
  await app.evaluate(
    ({ webContents }, k) => {
      const wc = webContents.getAllWebContents().find((w) => w.getURL().startsWith('https://'));
      if (!wc) throw new Error('no service view');
      wc.emit(
        'before-input-event',
        { preventDefault() {} },
        {
          type: 'keyDown',
          key: k,
          code: `Key${k}`,
          meta: process.platform === 'darwin',
          control: process.platform !== 'darwin',
          shift: true,
          alt: false,
          isAutoRepeat: false,
        },
      );
    },
    key,
  );
}
```

Replace the "Settings rows reflect the seeded block" section with:

```ts
  // the Settings rows now live on their own pane, and the list starts empty
  await win.getByTestId('settings-btn').click();
  await win.getByTestId('settings-nav-downloads').click();
  await expect(win.getByTestId('downloads-mode')).toHaveValue('folder');
  await expect(win.getByText(downloads, { exact: true })).toBeVisible();
  await expect(win.getByTestId('downloads-choose')).toBeEnabled();
  await expect(win.getByTestId('downloads-empty')).toContainText(`land in ${downloads}`);
  await win.keyboard.press('Escape');
```

After the first download's `expect(readFileSync(…)).toBe('hello from goetia');` add:

```ts
  // one row, saved, with the reveal action; nothing else on it
  await win.getByTestId('settings-btn').click();
  await win.getByTestId('settings-nav-downloads').click();
  const rows = win.getByTestId('download-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('note.txt');
  await expect(rows.first()).toHaveAttribute('data-state', 'saved');
  await expect(rows.first().getByTestId('download-reveal')).toBeVisible();
  await win.keyboard.press('Escape');
```

After the second download's `.toBe(true);` add:

```ts
  // ⌘⇧D opens Settings on the pane; the list is newest first, and a file
  // deleted behind Goetia's back reads as gone rather than offering a reveal
  rmSync(join(downloads, 'note.txt'));
  await chord(app, 'D');
  await expect(win.getByTestId('settings-nav-downloads')).toHaveAttribute('aria-current', 'page');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('note (1).txt');
  await expect(rows.nth(1)).toContainText('note.txt');
  await expect(rows.nth(1)).toContainText('moved or deleted since');
  await expect(rows.nth(1)).toHaveAttribute('data-state', 'missing');
  await expect(rows.nth(1).getByTestId('download-reveal')).toHaveCount(0);
  await win.keyboard.press('Escape');
```

In the final reset section, after `await win.getByTestId('settings-btn').click();` add `await win.getByTestId('settings-nav-downloads').click();`.

- [ ] **Step 2: Build and run**

Run: `corepack pnpm biome check --write tests && corepack pnpm build && env -u ELECTRON_RUN_AS_NODE npx playwright test tests/e2e/downloads.spec.ts --reporter=line`
Expected: 1 passed. If the chord step fails to open Settings, confirm the service view URL starts with `https://` at that moment (the helper's `find`).

- [ ] **Step 3: Full gates**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: clean.

---

### Task 6: docs

**Files:**

- Modify: `docs/superpowers/specs/2026-09-23-downloads-pane-design.md` (status), `docs/superpowers/specs/2026-09-18-downloads-design.md` (Out of scope, first bullet), `CLAUDE.md` (the Downloads bullet, line 82 area; the chords bullet), `docs/FEATURES.md` (Downloads bullet; Shell shortcuts bullet), `README.md:207`

- [ ] **Step 1: Specs**

New spec: `Status: approved in brainstorm (user decision, same day, from the mocked artifact); not implemented.` → `Status: implemented 2026-09-23.`

2026-09-18 spec, Out of scope first bullet `- A download list or history surface (see Decisions).` → `- ~~A download list or history surface (see Decisions).~~ Superseded 2026-09-23: Settings → Downloads lists the session's downloads (\`2026-09-23-downloads-pane-design.md\`).`

- [ ] **Step 2: CLAUDE.md**

Append to the **Downloads are saved, never opened** bullet, after `While locked the banner is \`redactBanner\`'d and never reveals.`:

```text
 **Settings → Downloads** (2026-09-23; spec `docs/superpowers/specs/2026-09-23-downloads-pane-design.md`) holds the folder rows and this session's rows — `DownloadManager.records`, in memory, `DOWNLOAD_HISTORY_CAP`, in flight first then newest (`historyViews`), a saved file that is gone reads `missing` (checked main-side, so `DownloadView` carries no path) — with one action per row: reveal (`downloads:reveal`, re-checking lock and existence like the banner) or Cancel while running (`downloads:cancel`); `downloads:recent` is polled by the pane only while a row is downloading. All three shell-only. `⌘/Ctrl ⇧ D` (`ACCELERATORS.downloads`, left half) opens it through `settingsFocus` on `MainState`, cleared when Settings closes; a completed banner clicked after its file moved opens the pane instead of revealing nothing. Never Open, never Clear.
```

In the chords bullet, right after the words `keep any new chord that pairs with a mouse action there too,` insert:

```text
 (Downloads is `⌘/Ctrl ⇧ D`, 2026-09-23, on the same half)
```

- [ ] **Step 3: FEATURES.md and README**

Downloads bullet: after `The context menu's \`Save Image As…\` always asks.` insert:

```text
 Settings → Downloads (also `Go ▸ Downloads`, ⌘/Ctrl ⇧ D) holds the folder rows and lists this session's downloads in flight first: a downloading row shows progress and **Cancel**, a saved one **Show in Finder**, a failed one `Could not save`, and one whose file has since moved reads `moved or deleted since`; in memory only, 50 rows, never Open. A completed banner clicked after the file moved opens the pane.
```

and add `src/main/lib/download-rules.ts` (`historyViews`, `historyEvict`), `shared/format.ts`, `renderer/src/components/DownloadsPane.tsx` to its `Impl:` and `format.test.ts`, `shortcuts.test.ts` to its `Verified:`.

Shell shortcuts bullet: after `Quick Switcher (⌘/Ctrl K),` insert `Downloads (⌘/Ctrl ⇧ D — Settings on the Downloads pane),`.

README line 207 (`**Files a chat sends you** save straight into your Downloads folder…`): append to the end of that paragraph:

```text
 Settings → Downloads (⌘/Ctrl ⇧ D) lists what came down this session, with Show in Finder or Cancel per file.
```

- [ ] **Step 4: Lint the markdown**

Run: `npx markdownlint-cli2 CLAUDE.md README.md docs/FEATURES.md docs/superpowers/specs/2026-09-23-downloads-pane-design.md docs/superpowers/specs/2026-09-18-downloads-design.md docs/superpowers/plans/2026-09-23-downloads-pane.md`
Expected: `Summary: 0 issues`.

- [ ] **Step 5: Hand off**

Do not commit. Report the files touched, the gate results and ask the user to run `/commit`.
