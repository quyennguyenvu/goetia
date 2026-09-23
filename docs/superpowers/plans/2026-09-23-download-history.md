# Download History and Guard Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Settings → Downloads keeps its history across launches in a sealed file, removing rows is a guarded action behind the app lock's credential, the row itself reveals the file, and every destructive or exposing action in the app leaves a Diagnostics line — including closing the one bypass that let `settings:update` switch the lock off.

**Architecture:** A `DownloadHistoryStore` (the `PinStore` shape: `Conf` + `KeyCodec`) is injected into `DownloadManager`, which persists ended records on every change to that set. Removal reuses the 2026-09-13 consent slot: three new `GuardedAction` kinds, `sameAction` bound to the exact ids, enforcement in main's `authorized()`. Recording is `ctx.diag.note` lines composed from kinds, ids and counts, under a new `lock` tag and the existing ones. The pane is Model A: checkboxes in the gutter, the row body reveals, an inline `CredentialConfirm` under the selection bar.

**Tech Stack:** Electron main (TypeScript), React renderer with Tailwind v4 tokens, `conf` for atomic JSON writes, vitest for unit tests, Playwright for e2e. Spec: `docs/superpowers/specs/2026-09-23-download-history-design.md`.

## Global Constraints

- Definition of done for every task: `corepack pnpm lint`, `corepack pnpm typecheck` and `corepack pnpm test` green; `corepack pnpm e2e` at the end (Task 11). Run vitest for one file with `corepack pnpm vitest run tests/unit/<file>.test.ts`.
- **Never run `git commit`.** Each task ends at a commit checkpoint: report the passing commands and ask the user to run `/grimoire-core:commit`. Never write `GRIMOIRE_COMMIT_MSG.txt`. Never `--amend`.
- `src/shared/**` imports no `electron` and no DOM. Pure decision logic lives in `src/main/lib/` with a vitest test; `ipc-handlers.ts`, `index.ts` and `views.ts` stay thin wiring. There is no electron mock for vitest, so handler bodies are verified by typecheck and e2e, and their decisions are extracted into `lib/` helpers that are unit-tested.
- Every new IPC channel is classified: all four download channels are shell-only and refused while locked (never added to `LOCKED_ALLOWED_CHANNELS`).
- A Diagnostics line never carries a filename, path, title, body or pin text. An rpId is a host and may appear.
- `DOWNLOAD_HISTORY_CAP` is `200`. The store writes ended records only (`saved`, `failed`), never on `updated`, never at quit.
- Markdown edited in this plan passes `npx --no-install markdownlint-cli2 <file>`; prose is never hard-wrapped (one line per paragraph or bullet).
- Comments explain why, not what; match the surrounding file's density.
- Copy, verbatim: Lock pane row "Ask before summoning a service, purging a login or removing download history"; hint sentence "Removing download history erases the record of what was downloaded."; selection copy "Prove it's you to remove n files from the list." with sub-line "The files themselves stay where they are."; Undo row "n files removed from the list."; empty state "Nothing downloaded yet."; header "History · n files".

---

### Task 1: Types, tags and pure rules

**Files:**

- Modify: `src/shared/types.ts` (the `DiagTag` union at line 76; add `DownloadStorage` beside `DownloadState` at line 102)
- Modify: `src/shared/diag-filter.ts:7-19` (`TAG_ORDER`)
- Modify: `src/shared/lock.ts` (`GuardedAction`, `sameAction`, new `idSet` and `describeAction`)
- Modify: `src/main/lib/download-rules.ts` (cap, `restoreRecords`, `persistable`, `downloadsSettingLines`)
- Test: `tests/unit/diag-filter.test.ts`, `tests/unit/lock-consent.test.ts`, `tests/unit/download-rules.test.ts`

**Interfaces:**

- Produces: `DownloadStorage = 'sealed' | 'plain' | 'unreadable'`; `DiagTag` gains `'lock'`; `GuardedAction` gains `{ kind: 'downloads-remove'; ids: number[] } | { kind: 'downloads-clear' } | { kind: 'passkey-forget'; id: string }`; `idSet(ids: readonly number[]): number[]`; `describeAction(a: GuardedAction): string`; `DOWNLOAD_HISTORY_CAP = 200`; `DOWNLOAD_NAME_MAX = 255`; `restoreRecords(raw: unknown, known: ReadonlySet<string>): DownloadRecord[]`; `persistable(records: readonly DownloadRecord[]): DownloadRecord[]`; `downloadsSettingLines(before: Settings['downloads'], after: Settings['downloads']): string[]`.

- [x] **Step 1: Write the failing tests**

Append to `tests/unit/download-rules.test.ts` (extend the import list with `DOWNLOAD_NAME_MAX`, `downloadsSettingLines`, `persistable`, `restoreRecords`):

```ts
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
    const rows = [saved(1, 1), saved(2, 2, { state: 'downloading' }), saved(3, 3, { state: 'failed' })];
    expect(persistable(rows).map((r) => r.id)).toEqual([1, 3]);
  });
});

describe('downloadsSettingLines', () => {
  it('names a folder change without the path, and a mode change', () => {
    expect(downloadsSettingLines({ ask: false, dir: null }, { ask: false, dir: '/Volumes/X' })).toEqual([
      'folder changed',
    ]);
    expect(downloadsSettingLines({ ask: false, dir: '/Volumes/X' }, { ask: false, dir: null })).toEqual([
      'folder reset to the OS default',
    ]);
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
```

In `tests/unit/diag-filter.test.ts:30-42`, insert `'lock',` after `'passkey',` in the expected list.

Append to `tests/unit/lock-consent.test.ts` inside `describe('LockController.consumeConsent', …)`:

```ts
  it('binds a downloads-remove to its exact id set, order- and duplicate-insensitive', async () => {
    const { controller } = await armed();
    await controller.grantConsent({ kind: 'downloads-remove', ids: [3, 1, 3] }, pass);
    expect(controller.consumeConsent({ kind: 'downloads-remove', ids: [1, 2, 3] })).toBe(false);
    expect(controller.consumeConsent({ kind: 'downloads-clear' })).toBe(false);
    expect(controller.consumeConsent({ kind: 'downloads-remove', ids: [1, 3] })).toBe(true);
  });

  it('matches downloads-clear and passkey-forget only with themselves', async () => {
    const { controller } = await armed();
    await controller.grantConsent({ kind: 'downloads-clear' }, pass);
    expect(controller.consumeConsent({ kind: 'downloads-remove', ids: [1] })).toBe(false);
    expect(controller.consumeConsent({ kind: 'downloads-clear' })).toBe(true);
    await controller.grantConsent({ kind: 'passkey-forget', id: 'abc' }, pass);
    expect(controller.consumeConsent({ kind: 'passkey-forget', id: 'xyz' })).toBe(false);
    expect(controller.consumeConsent({ kind: 'passkey-forget', id: 'abc' })).toBe(true);
  });
```

Add a new top-level describe to the same file (import `describeAction`, `idSet` from `../../src/shared/lock`):

```ts
describe('idSet / describeAction', () => {
  it('sorts and deduplicates', () => {
    expect(idSet([3, 1, 3, 2])).toEqual([1, 2, 3]);
    expect(idSet([])).toEqual([]);
  });
  it('describes an action by kind, service or count — never by content', () => {
    expect(describeAction({ kind: 'summon' })).toBe('summon');
    expect(describeAction({ kind: 'purge-one', serviceId: 'slack' })).toBe('purge-one slack');
    expect(describeAction({ kind: 'purge-all' })).toBe('purge-all');
    expect(describeAction({ kind: 'downloads-remove', ids: [4, 4, 9] })).toBe('downloads-remove (2 rows)');
    expect(describeAction({ kind: 'downloads-clear' })).toBe('downloads-clear');
    expect(describeAction({ kind: 'passkey-forget', id: 'abc' })).toBe('passkey-forget');
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `corepack pnpm vitest run tests/unit/download-rules.test.ts tests/unit/lock-consent.test.ts tests/unit/diag-filter.test.ts`
Expected: FAIL — `restoreRecords`, `persistable`, `downloadsSettingLines`, `idSet`, `describeAction` are not exported; the tag list lacks `lock`; `DOWNLOAD_HISTORY_CAP` is 50.

- [x] **Step 3: Types and tags**

In `src/shared/types.ts`, change the `DiagTag` union to:

```ts
export type DiagTag =
  | 'app'
  | 'nav'
  | 'open'
  | 'identity'
  | 'passkey'
  | 'lock'
  | 'ipc'
  | 'notifications'
  | 'downloads'
  | 'recipe'
  | 'view'
  | 'peek';
```

Below `export type DownloadState = …` add:

```ts
/** How downloads.json rests: sealed by the keychain, plaintext because there
 *  is none, or sealed by a keychain this launch cannot open (read-only). */
export type DownloadStorage = 'sealed' | 'plain' | 'unreadable';
```

In `src/shared/diag-filter.ts` `TAG_ORDER`, insert `lock: true,` after `passkey: true,`.

- [x] **Step 4: Guarded actions**

In `src/shared/lock.ts`, replace the `GuardedAction` type and `sameAction` with:

```ts
/** An action that needs the lock's credential even while the app is unlocked.
 *  See the 2026-09-13 spec: the guard is on the direction that *exposes*
 *  (summon) and on the ones that destroy — purge, forgetting a passkey, and
 *  erasing the download record (2026-09-23) — never on banish, reorder or an
 *  Undo. */
export type GuardedAction =
  | { kind: 'summon' }
  | { kind: 'purge-one'; serviceId: ServiceId }
  | { kind: 'purge-all' }
  /** bound to the exact rows: a consent for two ids is not a consent for three */
  | { kind: 'downloads-remove'; ids: number[] }
  | { kind: 'downloads-clear' }
  | { kind: 'passkey-forget'; id: string };

/** The shape a consent is bound to: sorted, deduplicated. */
export function idSet(ids: readonly number[]): number[] {
  return [...new Set(ids)].sort((a, b) => a - b);
}

/** Exact match on kind *and* target. Without the target, a consent would be
 *  a capability rather than an authorization, and one logic bug would spend a
 *  confirm for Slack on Discord, or one for two rows on the whole list. */
export function sameAction(a: GuardedAction, b: GuardedAction): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'purge-one' && b.kind === 'purge-one') return a.serviceId === b.serviceId;
  if (a.kind === 'passkey-forget' && b.kind === 'passkey-forget') return a.id === b.id;
  if (a.kind === 'downloads-remove' && b.kind === 'downloads-remove') {
    const x = idSet(a.ids);
    const y = idSet(b.ids);
    return x.length === y.length && x.every((v, i) => v === y[i]);
  }
  return true;
}

/** For a Diagnostics line: kind plus service or count. Never an id that
 *  could name content — a passkey's credential id is left out. */
export function describeAction(a: GuardedAction): string {
  switch (a.kind) {
    case 'purge-one':
      return `purge-one ${a.serviceId}`;
    case 'downloads-remove':
      return `downloads-remove (${idSet(a.ids).length} rows)`;
    default:
      return a.kind;
  }
}
```

- [x] **Step 5: Rules**

In `src/main/lib/download-rules.ts`, change the import line to `import type { DownloadView, ServiceId, Settings } from '../../shared/types';`, replace the cap constant's comment and value, and append the three functions:

```ts
/** Rows Settings → Downloads keeps, across launches (downloads.json). 200 is
 *  Diagnostics parity — the one bounded-history number the app already has. */
export const DOWNLOAD_HISTORY_CAP = 200;
/** A restored name is clipped here; Chromium already bounds a live one. */
export const DOWNLOAD_NAME_MAX = 255;
```

```ts
/** What comes back from disk is data, not trust: exact shape, a known
 *  service, a state in saved | failed (a downloading row cannot survive
 *  quit), finite numbers, string name and path; newest DOWNLOAD_HISTORY_CAP
 *  kept, a repeated id dropped. */
export function restoreRecords(raw: unknown, known: ReadonlySet<string>): DownloadRecord[] {
  if (!Array.isArray(raw)) return [];
  const kept: DownloadRecord[] = [];
  const seen = new Set<number>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const id = r.id;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1 || seen.has(id)) continue;
    if (typeof r.serviceId !== 'string' || !known.has(r.serviceId)) continue;
    if (r.state !== 'saved' && r.state !== 'failed') continue;
    if (typeof r.filename !== 'string' || typeof r.path !== 'string') continue;
    const nums = [r.received, r.total, r.at];
    if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) continue;
    seen.add(id);
    kept.push({
      id,
      serviceId: r.serviceId as ServiceId,
      filename: r.filename.slice(0, DOWNLOAD_NAME_MAX),
      path: r.path,
      state: r.state,
      received: r.received as number,
      total: r.total as number,
      at: r.at as number,
    });
  }
  kept.sort((a, b) => b.at - a.at || b.id - a.id);
  return kept.slice(0, DOWNLOAD_HISTORY_CAP);
}

/** The rows the file holds: a downloading row is never written. */
export function persistable(records: readonly DownloadRecord[]): DownloadRecord[] {
  return records.filter((r) => r.state !== 'downloading');
}

/** Diagnostics lines for a change to the downloads block — the folder is an
 *  exfiltration channel, so it is recorded (never the path itself). */
export function downloadsSettingLines(
  before: Settings['downloads'],
  after: Settings['downloads'],
): string[] {
  const lines: string[] = [];
  if (before.dir !== after.dir) {
    lines.push(after.dir === null ? 'folder reset to the OS default' : 'folder changed');
  }
  if (before.ask !== after.ask) lines.push(after.ask ? 'mode: ask' : 'mode: save to folder');
  return lines;
}
```

- [x] **Step 6: Run the tests to verify they pass**

Run: `corepack pnpm vitest run tests/unit/download-rules.test.ts tests/unit/lock-consent.test.ts tests/unit/diag-filter.test.ts tests/unit/downloads.test.ts tests/unit/diagnostics.test.ts`
Expected: PASS. (`downloads.test.ts`'s cap case still holds at 200: `f0.txt` is evicted, `f49.txt` remains.)

- [x] **Step 7: Lint, typecheck, checkpoint**

Run: `corepack pnpm lint && corepack pnpm typecheck`
Expected: both clean (typecheck will flag nothing yet: no caller reads the changed shapes). Report, then ask the user to run `/grimoire-core:commit` with the suggested subject `feat(downloads): history rules, guarded-action kinds and the lock tag`.

---

### Task 2: DownloadHistoryStore

**Files:**

- Create: `src/main/download-history.ts`
- Test: `tests/unit/download-history.test.ts`

**Interfaces:**

- Consumes: `restoreRecords`, `persistable`, `DownloadRecord` (Task 1); `KeyCodec` (`src/main/codec.ts`); `SERVICES` (`src/shared/services.ts`).
- Produces: `interface DownloadHistoryLike { load(): DownloadRecord[]; save(records: readonly DownloadRecord[]): void; storage(): DownloadStorage }` and `class DownloadHistoryStore implements DownloadHistoryLike` with `constructor(cwd: string, codec: KeyCodec | null)`.

- [x] **Step 1: Write the failing test**

Create `tests/unit/download-history.test.ts`:

```ts
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { KeyCodec } from '../../src/main/codec';
import { DownloadHistoryStore } from '../../src/main/download-history';
import type { DownloadRecord } from '../../src/main/lib/download-rules';

/** Reversible stand-in for safeStorage, so the store never imports electron. */
const codec: KeyCodec = {
  encrypt: (plain) => Buffer.from(plain, 'utf8').toString('base64'),
  decrypt: (cipher) => Buffer.from(cipher, 'base64').toString('utf8'),
};

/** A denied keychain, or a profile copied to another machine. */
const denied: KeyCodec = {
  encrypt: codec.encrypt,
  decrypt: () => {
    throw new Error('keychain denied');
  },
};

const rec = (id: number, state: DownloadRecord['state'] = 'saved'): DownloadRecord => ({
  id,
  serviceId: 'zalo',
  filename: `bao-gia-${id}.pdf`,
  path: `/tmp/dl/bao-gia-${id}.pdf`,
  state,
  received: 5,
  total: 5,
  at: id,
});

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'goetia-dlhist-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const file = () => readFileSync(join(dir, 'downloads.json'), 'utf8');

describe('DownloadHistoryStore', () => {
  it('starts empty on a fresh profile and writes nothing until asked', () => {
    const store = new DownloadHistoryStore(dir, codec);
    expect(store.load()).toEqual([]);
    expect(store.storage()).toBe('sealed');
    expect(() => file()).toThrow(); // no `downloads: []` default, no empty envelope
  });

  it('seals with a codec: the file names no file in clear, and a fresh store reads it back', () => {
    const store = new DownloadHistoryStore(dir, codec);
    store.save([rec(1), rec(2, 'failed')]);
    const raw = file();
    expect(raw).toContain('"sealed"');
    expect(raw).not.toContain('bao-gia');
    expect(new DownloadHistoryStore(dir, codec).load().map((r) => r.id)).toEqual([2, 1]);
  });

  it('never writes a downloading row', () => {
    const store = new DownloadHistoryStore(dir, codec);
    store.save([rec(1), rec(2, 'downloading')]);
    expect(store.load().map((r) => r.id)).toEqual([1]);
    expect(new DownloadHistoryStore(dir, codec).load().map((r) => r.id)).toEqual([1]);
  });

  it('writes plaintext with no keychain and says so', () => {
    const store = new DownloadHistoryStore(dir, null);
    expect(store.storage()).toBe('plain');
    store.save([rec(1)]);
    expect(JSON.parse(file())).toEqual({ downloads: [rec(1)] });
  });

  it('re-seals a plaintext file on a launch that has a keychain', () => {
    writeFileSync(join(dir, 'downloads.json'), JSON.stringify({ downloads: [rec(1)] }));
    const store = new DownloadHistoryStore(dir, codec);
    expect(store.load().map((r) => r.id)).toEqual([1]);
    expect(file()).toContain('"sealed"');
    expect(file()).not.toContain('bao-gia');
  });

  it('keeps a sealed file it cannot open: reads nothing, writes nothing, reports unreadable', () => {
    new DownloadHistoryStore(dir, codec).save([rec(1)]);
    const before = file();
    const store = new DownloadHistoryStore(dir, denied);
    expect(store.storage()).toBe('unreadable');
    expect(store.load()).toEqual([]);
    store.save([rec(2)]);
    expect(file()).toBe(before);
    // the next launch that can read it gets the old rows back
    expect(new DownloadHistoryStore(dir, codec).load().map((r) => r.id)).toEqual([1]);
  });

  it('treats a sealed file with no keychain at all as unreadable', () => {
    new DownloadHistoryStore(dir, codec).save([rec(1)]);
    const store = new DownloadHistoryStore(dir, null);
    expect(store.storage()).toBe('unreadable');
    expect(store.load()).toEqual([]);
  });

  it('survives a corrupt file as an empty history', () => {
    writeFileSync(join(dir, 'downloads.json'), '{not json');
    const store = new DownloadHistoryStore(dir, codec);
    expect(store.load()).toEqual([]);
    expect(store.storage()).toBe('sealed');
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/download-history.test.ts`
Expected: FAIL — cannot resolve `../../src/main/download-history`.

- [x] **Step 3: Write the store**

Create `src/main/download-history.ts`:

```ts
import Conf from 'conf';
import { SERVICES } from '../shared/services';
import type { DownloadStorage } from '../shared/types';
import type { KeyCodec } from './codec';
import { type DownloadRecord, persistable, restoreRecords } from './lib/download-rules';

/** On disk: one of the two keys, or neither on a fresh profile. `sealed` is
 *  the codec's output over JSON.stringify({ downloads }); `downloads` is the
 *  plaintext written when no keychain is available. */
interface DownloadsFile {
  sealed?: string;
  downloads?: DownloadRecord[];
}

/** What DownloadManager needs from the store; the unit test hands in a fake. */
export interface DownloadHistoryLike {
  load(): DownloadRecord[];
  save(records: readonly DownloadRecord[]): void;
  storage(): DownloadStorage;
}

/** Settings → Downloads' history at rest, <cwd>/downloads.json. File names
 *  and paths are the content the pins decision sealed for the same reason, so
 *  this is PinStore's shape: a safeStorage envelope, plaintext only with no
 *  keychain, and a sealed file this launch cannot open is kept untouched —
 *  read as empty, never written — so the next launch that can read it gets
 *  it back. Written by the manager whenever the set of ended rows changes. */
export class DownloadHistoryStore implements DownloadHistoryLike {
  private conf: Conf<DownloadsFile>;
  private records: DownloadRecord[] = [];
  private unreadable = false;

  constructor(
    cwd: string,
    private codec: KeyCodec | null,
  ) {
    this.conf = new Conf<DownloadsFile>({
      cwd,
      configName: 'downloads',
      // no `downloads: []` default: it would make a fresh profile look like a
      // legacy file and write an empty envelope at every first boot
      defaults: {},
      // a corrupt file yields the defaults instead of a throw at boot
      clearInvalidConfig: true,
    });
    const known = new Set<string>(SERVICES.map((s) => s.id));
    const raw = this.conf.store;
    if (typeof raw.sealed === 'string') {
      try {
        if (!codec) throw new Error('sealed file, no keychain');
        const opened: unknown = JSON.parse(codec.decrypt(raw.sealed));
        this.records = restoreRecords((opened as { downloads?: unknown } | null)?.downloads, known);
      } catch {
        this.unreadable = true;
      }
    } else if (Array.isArray(raw.downloads)) {
      this.records = restoreRecords(raw.downloads, known);
      // migrate: the plaintext leaves the disk now, not on the next download
      if (codec) this.write(this.records);
    }
  }

  load(): DownloadRecord[] {
    return [...this.records];
  }

  save(records: readonly DownloadRecord[]): void {
    if (this.unreadable) return; // never overwrite what could not be read
    this.records = persistable(records);
    this.write(this.records);
  }

  storage(): DownloadStorage {
    if (this.unreadable) return 'unreadable';
    return this.codec ? 'sealed' : 'plain';
  }

  private write(records: readonly DownloadRecord[]): void {
    // assigning the store is one atomic write, same as SettingsStore
    this.conf.store = this.codec
      ? { sealed: this.codec.encrypt(JSON.stringify({ downloads: records })) }
      : { downloads: [...records] };
  }
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/download-history.test.ts`
Expected: PASS (8 tests).

- [x] **Step 5: Lint, typecheck, checkpoint**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: clean. Ask the user to run `/grimoire-core:commit` — suggested subject `feat(downloads): sealed history store`.

---

### Task 3: DownloadManager persists, removes, restores, opens the folder

**Files:**

- Modify: `src/main/downloads.ts`
- Test: `tests/unit/downloads.test.ts`

**Interfaces:**

- Consumes: `DownloadHistoryLike` (Task 2); `DOWNLOAD_HISTORY_CAP`, `historyEvict`, `historyViews` (Task 1 / existing).
- Produces on `DownloadManagerDeps`: `history: DownloadHistoryLike; isDirectory(path: string): boolean; openFolder(path: string): void; note(line: string): void`. On `DownloadManager`: `remove(ids: readonly number[]): number`, `clear(): number`, `restore(): number`, `openFolder(): boolean`, and `recent(): { rows: DownloadView[]; storage: DownloadStorage }` (changed shape). `cancel(id)` unchanged in signature.

- [x] **Step 1: Update the harness and the existing history tests**

In `tests/unit/downloads.test.ts`, extend the imports:

```ts
import type { DownloadHistoryLike } from '../../src/main/download-history';
import {
  DOWNLOAD_BURST_CAP,
  DOWNLOAD_HISTORY_CAP,
  type DownloadRecord,
} from '../../src/main/lib/download-rules';
import type { DownloadStorage } from '../../src/shared/types';
```

Add above `harness`:

```ts
/** In-memory stand-in for DownloadHistoryStore that records every write. */
function fakeHistory(initial: DownloadRecord[] = [], storage: DownloadStorage = 'sealed') {
  const writes: DownloadRecord[][] = [];
  const store: DownloadHistoryLike = {
    load: () => initial,
    save: (records) => void writes.push([...records]),
    storage: () => storage,
  };
  return { store, writes };
}
```

Change `harness` so it builds a history and exposes it — replace its signature and the deps object head:

```ts
function harness(
  over: Partial<DownloadManagerDeps> & { files?: Set<string>; initial?: DownloadRecord[] } = {},
) {
  const files = over.files ?? new Set<string>();
  const banners: DownloadBanner[] = [];
  const notes: string[] = [];
  const history = fakeHistory(over.initial ?? []);
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
    openDownloads: vi.fn(),
    history: history.store,
    isDirectory: (p) => p === DIR,
    openFolder: vi.fn(),
    note: (line) => void notes.push(line),
    now: () => 1_000_000,
    ...over,
  };
  const dm = new DownloadManager(deps);
  const ses = new FakeSession();
  dm.attach('whatsapp', ses);
  return { dm, ses, deps, banners, box, files, notes, writes: history.writes };
}
```

Then update every existing `dm.recent()` in the `history` describe to read the rows:

Run: `sed -i '' 's/dm\.recent()/dm.recent().rows/g' tests/unit/downloads.test.ts`

The first history test's `toEqual([...])` now compares against `dm.recent().rows` and still holds.

- [x] **Step 2: Write the failing tests**

Append a new describe to `tests/unit/downloads.test.ts`:

```ts
describe('history at rest', () => {
  const rec = (id: number, state: DownloadRecord['state'] = 'saved'): DownloadRecord => ({
    id,
    serviceId: 'whatsapp',
    filename: `f${id}.txt`,
    path: join(DIR, `f${id}.txt`),
    state,
    received: 1,
    total: 1,
    at: id,
  });

  it('restores the store at construction and numbers new rows after it', () => {
    const { dm, ses } = harness({ initial: [rec(7), rec(3, 'failed')] });
    expect(dm.recent().rows.map((r) => r.id)).toEqual([7, 3]);
    ses.fire(new FakeItem('new.txt'));
    expect(dm.recent().rows[0]).toMatchObject({ id: 8, filename: 'new.txt' });
  });

  it('writes on finish, never on progress, and never a downloading row', () => {
    const { ses, writes } = harness();
    const item = new FakeItem('a.pdf');
    ses.fire(item);
    item.progress(50);
    expect(writes).toHaveLength(0);
    item.finish('completed');
    expect(writes).toHaveLength(1);
    expect(writes[0].map((r) => r.filename)).toEqual(['a.pdf']);
    const bad = new FakeItem('b.pdf');
    ses.fire(bad);
    expect(writes).toHaveLength(1);
    bad.finish('interrupted');
    expect(writes).toHaveLength(2);
    expect(writes[1].map((r) => r.state)).toEqual(['saved', 'failed']);
  });

  it('a cancelled download writes nothing: it was never on disk', () => {
    const { ses, writes } = harness();
    const item = new FakeItem('a.pdf');
    ses.fire(item);
    item.finish('cancelled');
    expect(writes).toHaveLength(0);
  });

  it('writes when an eviction drops an ended row', () => {
    const initial = Array.from({ length: DOWNLOAD_HISTORY_CAP }, (_, i) => rec(i + 1));
    const { ses, writes } = harness({ initial });
    ses.fire(new FakeItem('overflow.txt'));
    expect(writes).toHaveLength(1);
    expect(writes[0]).toHaveLength(DOWNLOAD_HISTORY_CAP - 1);
    expect(writes[0].some((r) => r.id === 1)).toBe(false);
  });

  it('remove drops the ended rows named, skips an in-flight or unknown id, and writes once', () => {
    const { dm, ses, writes } = harness({ initial: [rec(1), rec(2, 'failed')] });
    ses.fire(new FakeItem('live.bin')); // id 3
    expect(dm.remove([1, 2, 3, 99])).toBe(2);
    expect(dm.recent().rows.map((r) => r.id)).toEqual([3]);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual([]);
    expect(dm.remove([42])).toBe(0);
    expect(writes).toHaveLength(1); // nothing removed, nothing written
  });

  it('clear drops every ended row and leaves the running one', () => {
    const { dm, ses, writes } = harness({ initial: [rec(1), rec(2, 'failed')] });
    ses.fire(new FakeItem('live.bin'));
    expect(dm.clear()).toBe(2);
    expect(dm.recent().rows.map((r) => r.filename)).toEqual(['live.bin']);
    expect(writes).toHaveLength(1);
    expect(dm.clear()).toBe(0);
  });

  it('restore puts the last removal back once, under the cap', () => {
    const { dm, writes } = harness({ initial: [rec(1), rec(2)] });
    dm.remove([1]);
    expect(dm.restore()).toBe(1);
    expect(dm.recent().rows.map((r) => r.id)).toEqual([2, 1]);
    expect(writes).toHaveLength(2);
    expect(dm.restore()).toBe(0);
    dm.clear();
    expect(dm.restore()).toBe(2);
    const full = harness({ initial: Array.from({ length: DOWNLOAD_HISTORY_CAP }, (_, i) => rec(i + 1)) });
    full.dm.remove([1, 2]);
    full.ses.fire(new FakeItem('x.txt'));
    expect(full.dm.restore()).toBe(2);
    expect(full.dm.recent().rows.length).toBeLessThanOrEqual(DOWNLOAD_HISTORY_CAP);
  });

  it('opens the folder only when it is a directory', () => {
    const { dm, deps, box } = harness();
    expect(dm.openFolder()).toBe(true);
    expect(deps.openFolder).toHaveBeenCalledWith(DIR);
    box.settings = { ask: false, dir: '/Volumes/Gone' };
    expect(dm.openFolder()).toBe(false);
    expect(deps.openFolder).toHaveBeenCalledTimes(1);
  });

  it('recent carries the storage state', () => {
    const plain = fakeHistory([], 'plain');
    const { dm } = harness({ history: plain.store });
    expect(dm.recent().storage).toBe('plain');
  });

  it('notes a cancel the user asked for, not one the lifecycle made', () => {
    const { dm, ses, notes } = harness();
    const a = new FakeItem('a.bin');
    ses.fire(a);
    dm.cancel(1);
    expect(notes).toEqual(['cancelled by user: whatsapp']);
    const b = new FakeItem('b.bin');
    ses.fire(b);
    dm.detach('whatsapp');
    expect(notes).toHaveLength(1);
  });
});
```

- [x] **Step 3: Run the tests to verify they fail**

Run: `corepack pnpm vitest run tests/unit/downloads.test.ts`
Expected: FAIL — `history`, `isDirectory`, `openFolder`, `note` are not on `DownloadManagerDeps` (typecheck error), `remove`/`clear`/`restore`/`openFolder` do not exist, `recent()` is an array.

- [x] **Step 4: Implement**

In `src/main/downloads.ts`, change the imports:

```ts
import { basename } from 'node:path';
import type { DownloadStorage, DownloadView, ServiceId, Settings } from '../shared/types';
import type { DownloadHistoryLike } from './download-history';
import {
  ASK_URL_CAP,
  bannerFor,
  DOWNLOAD_BURST_WINDOW_MS,
  DOWNLOAD_HISTORY_CAP,
  type DownloadEnd,
  type DownloadRecord,
  decideSave,
  historyEvict,
  historyViews,
  progressFraction,
} from './lib/download-rules';
import { redactBanner } from './lib/lock-rules';
```

Add to `DownloadManagerDeps` after `openDownloads(): void;`:

```ts
  /** downloads.json — ended rows, sealed; see download-history.ts */
  history: DownloadHistoryLike;
  /** statSync(path).isDirectory(), false on any error */
  isDirectory(path: string): boolean;
  /** shell.openPath — the one openPath in the app, and only ever on a directory */
  openFolder(path: string): void;
  /** ctx.diag.note('downloads', …): counts and states, never a name */
  note(line: string): void;
```

Replace the `records` field comment and the constructor:

```ts
  /** the history rows behind Settings → Downloads; DOWNLOAD_HISTORY_CAP,
   *  restored from `deps.history` and written back on every change to the
   *  ended set */
  private records = new Map<number, DownloadRecord>();
  private nextId = 1;
  /** the last remove or clear, kept for one Undo */
  private lastRemoved: DownloadRecord[] = [];
  /** row ids whose Cancel the user pressed — a lifecycle cancel notes nothing */
  private userCancelled = new Set<number>();

  constructor(private deps: DownloadManagerDeps) {
    for (const r of deps.history.load()) this.records.set(r.id, r);
    this.nextId = [...this.records.keys()].reduce((max, id) => Math.max(max, id), 0) + 1;
  }
```

In `handle`, replace the two eviction lines with:

```ts
    const evict = historyEvict([...this.records.values()]);
    if (evict !== null) {
      this.records.delete(evict);
      this.persist(); // an ended row left the set
    }
```

In `finish`, replace the `if (state === 'cancelled') { … } else if (record) { … }` block with:

```ts
    if (state === 'cancelled') {
      this.records.delete(f.id); // a cancelled file gets no row, as it gets no banner
      if (this.userCancelled.delete(f.id)) this.deps.note(`cancelled by user: ${id}`);
    } else if (record) {
      record.state = state === 'completed' ? 'saved' : 'failed';
      record.path = path;
      if (path) record.filename = basename(path); // an Ask save learns its name here
      record.received = item.getReceivedBytes();
      record.total = item.getTotalBytes();
      this.persist();
    }
```

Replace `recent()` and `cancel()` and add the new methods before `pushProgress`:

```ts
  /** Settings → Downloads, in flight first then newest; `missing` decided
   *  here against the disk so the renderer never holds a path. */
  recent(): { rows: DownloadView[]; storage: DownloadStorage } {
    return {
      rows: historyViews([...this.records.values()], this.deps.exists),
      storage: this.deps.history.storage(),
    };
  }

  /** Cancel an in-flight download by row id; false for anything else. */
  cancel(id: number): boolean {
    for (const [item, f] of this.inflight) {
      if (f.id === id) {
        this.userCancelled.add(id);
        item.cancel();
        return true;
      }
    }
    return false;
  }

  /** Remove ended rows by id. An in-flight id is skipped (Cancel is its
   *  control) and so is an unknown one. Returns how many left. */
  remove(ids: readonly number[]): number {
    const removed: DownloadRecord[] = [];
    for (const id of ids) {
      const r = this.records.get(id);
      if (!r || r.state === 'downloading') continue;
      this.records.delete(id);
      removed.push(r);
    }
    return this.forget(removed);
  }

  /** Remove every ended row; a running download keeps its row and its Cancel. */
  clear(): number {
    const removed = [...this.records.values()].filter((r) => r.state !== 'downloading');
    for (const r of removed) this.records.delete(r.id);
    return this.forget(removed);
  }

  /** Undo the last remove or clear, once. Restoring is the safe direction and
   *  is not guarded; the cap still holds. */
  restore(): number {
    const back = this.lastRemoved;
    this.lastRemoved = [];
    if (back.length === 0) return 0;
    for (const r of back) this.records.set(r.id, r);
    let evict = historyEvict([...this.records.values()]);
    while (this.records.size > DOWNLOAD_HISTORY_CAP && evict !== null) {
      this.records.delete(evict);
      evict = historyEvict([...this.records.values()]);
    }
    this.persist();
    return back.length;
  }

  /** Open the download folder itself — settings' folder, never a page's path,
   *  and only when it is a directory right now. */
  openFolder(): boolean {
    const dir = this.deps.settings().dir ?? this.deps.defaultDir();
    if (!this.deps.isDirectory(dir)) return false;
    this.deps.openFolder(dir);
    return true;
  }

  private forget(removed: DownloadRecord[]): number {
    if (removed.length === 0) return 0;
    this.lastRemoved = removed;
    this.persist();
    return removed.length;
  }

  /** Whenever the set of ended rows changes — never on progress, never at quit. */
  private persist(): void {
    this.deps.history.save([...this.records.values()]);
  }
```

- [x] **Step 5: Run the tests to verify they pass**

Run: `corepack pnpm vitest run tests/unit/downloads.test.ts`
Expected: PASS.

- [x] **Step 6: Typecheck will fail in the callers — that is Tasks 5 and 6**

Run: `corepack pnpm typecheck`
Expected: errors only in `src/main/index.ts` (missing deps) and `src/main/ipc-handlers.ts` (`downloads:recent` result shape). Do not fix them here. Run `corepack pnpm lint` (clean) and `corepack pnpm test` (green), report both plus the expected typecheck state, and ask the user to run `/grimoire-core:commit` — suggested subject `feat(downloads): persist history, remove/clear/restore, open folder`. If the user prefers a green typecheck per commit, fold Tasks 3, 5 and 6 into one checkpoint.

---

### Task 4: Recording the lock

**Files:**

- Modify: `src/main/lock.ts` (`LockDeps`, `unlock`, `grantConsent`, `configure`)
- Test: `tests/unit/lock-controller.test.ts`, `tests/unit/lock-consent.test.ts`

**Interfaces:**

- Consumes: `describeAction` (Task 1).
- Produces: `LockDeps.note?(line: string): void`. Lines (exact): `unlocked (passcode)` / `unlocked (touch id)`; `unlock refused: wrong passcode (n failures)`; `unlock refused: touch id cancelled`; `unlock throttled`; `unlock refused: stored passcode unreadable`; `consent granted: <describeAction> (passcode|touch id)`; `consent refused: <describeAction>, wrong passcode (n failures)` / `…, touch id cancelled` / `consent throttled: <describeAction>`; `configured: enabled` / `disabled` / `passcode changed` / `touch id on` / `touch id off` / `guard on` / `guard off`; `configure refused: wrong passcode`.

- [x] **Step 1: Write the failing tests**

In `tests/unit/lock-controller.test.ts` and `tests/unit/lock-consent.test.ts`, change `build()` to collect notes: add `const notes: string[] = [];` before `const controller = …`, add `note: (line) => void notes.push(line),` to the deps object, and add `notes` to the returned object.

Append to `tests/unit/lock-controller.test.ts`:

```ts
describe('LockController notes', () => {
  it('records unlocks and refusals with the method and the failure count', async () => {
    const { controller, notes } = await armed();
    controller.lock();
    await controller.unlock({ method: 'passcode', passcode: 'wrong' });
    await controller.unlock({ method: 'touchId' });
    expect(notes.slice(-2)).toEqual(['unlock refused: wrong passcode (1 failures)', 'unlocked (touch id)']);
  });

  it('records a cancelled Touch ID and a throttled try', async () => {
    const { controller, notes, advance } = await armed({ finger: false });
    controller.lock();
    await controller.unlock({ method: 'touchId' });
    await controller.unlock({ method: 'passcode', passcode: 'wrong' });
    await controller.unlock({ method: 'passcode', passcode: 'correct horse' });
    expect(notes.slice(-3)).toEqual([
      'unlock refused: touch id cancelled',
      'unlock refused: wrong passcode (1 failures)',
      'unlock throttled',
    ]);
    advance(60_000);
    await controller.unlock({ method: 'passcode', passcode: 'correct horse' });
    expect(notes.at(-1)).toBe('unlocked (passcode)');
  });

  it('records every configuration and a refused one', async () => {
    const { controller, notes } = build();
    await controller.configure({ action: 'enable', passcode: 'correct horse' });
    await controller.configure({ action: 'setTouchId', current: 'correct horse', touchId: false });
    await controller.configure({ action: 'setGuardActions', current: 'correct horse', guardActions: false });
    await controller.configure({ action: 'change', current: 'correct horse', next: 'battery staple' });
    await controller.configure({ action: 'verify', current: 'nope' });
    await controller.configure({ action: 'verify', current: 'battery staple' });
    await controller.configure({ action: 'disable', current: 'battery staple' });
    expect(notes).toEqual([
      'configured: enabled',
      'configured: touch id off',
      'configured: guard off',
      'configured: passcode changed',
      'configure refused: wrong passcode',
      'configured: disabled',
    ]);
  });
});
```

Append to `tests/unit/lock-consent.test.ts` inside `describe('LockController.grantConsent', …)`:

```ts
  it('records a granted and a refused consent by action, never by content', async () => {
    const { controller, notes } = await armed();
    await controller.grantConsent({ kind: 'purge-one', serviceId: 'slack' }, pass);
    await controller.grantConsent(
      { kind: 'downloads-remove', ids: [2, 1] },
      { method: 'passcode', passcode: 'wrong' },
    );
    expect(notes.slice(-2)).toEqual([
      'consent granted: purge-one slack (passcode)',
      'consent refused: downloads-remove (2 rows), wrong passcode (1 failures)',
    ]);
  });
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `corepack pnpm vitest run tests/unit/lock-controller.test.ts tests/unit/lock-consent.test.ts`
Expected: FAIL — `notes` is empty (`note` is not a known dep; typecheck also flags the excess property).

- [x] **Step 3: Implement**

In `src/main/lock.ts`, import `describeAction` from `'../shared/lock'` (extend the existing import), add to `LockDeps`:

```ts
  /** ctx.diag.note('lock', …): methods, kinds and counts, never a secret */
  note?(line: string): void;
```

Replace `unlock` and `grantConsent`, and add two private helpers:

```ts
  async unlock(req: UnlockRequest): Promise<UnlockResult> {
    if (!this.locked) return { ok: false, waitMs: 0, reason: 'unavailable' };
    const result = await this.check(req);
    if (result.ok) {
      this.open();
      this.deps.note?.(`unlocked (${method(req)})`);
    } else {
      const why = this.failure(result);
      if (result.reason === 'throttled') this.deps.note?.('unlock throttled');
      else if (why) this.deps.note?.(`unlock refused: ${why}`);
    }
    return result;
  }

  /** Authorize one guarded action. Unlike unlock() this runs while the app is
   *  open, which is the whole point: it guards acting, not reading. */
  async grantConsent(action: GuardedAction, credential: UnlockRequest): Promise<UnlockResult> {
    if (!this.deps.enabled() || !this.store.has()) {
      return { ok: false, waitMs: 0, reason: 'unavailable' };
    }
    const result = await this.check(credential);
    const what = describeAction(action);
    if (result.ok) {
      this.consent = { action, at: this.deps.now() };
      this.deps.note?.(`consent granted: ${what} (${method(credential)})`);
    } else {
      const why = this.failure(result);
      if (result.reason === 'throttled') this.deps.note?.(`consent throttled: ${what}`);
      else if (why) this.deps.note?.(`consent refused: ${what}, ${why}`);
    }
    return result;
  }

  /** The refusal, worded for the ring; null for the reasons that say nothing
   *  about the person at the keyboard (unavailable). */
  private failure(result: UnlockResult): string | null {
    switch (result.reason) {
      case 'wrong':
        return `wrong passcode (${this.failures} failures)`;
      case 'cancelled':
        return 'touch id cancelled';
      case 'unreadable':
        return 'stored passcode unreadable';
      default:
        return null;
    }
  }
```

Add a module-level helper above the class:

```ts
const method = (req: UnlockRequest): string => (req.method === 'touchId' ? 'touch id' : 'passcode');
```

In `configure`, add a note beside each `persist`/`set` on the success paths and on the wrong-passcode refusal:

```ts
  async configure(req: LockConfigure): Promise<LockConfigResult> {
    if (req.action === 'enable') {
      if (this.store.has()) return { ok: false, error: 'already-set' };
      if (!passcodeAcceptable(req.passcode)) return { ok: false, error: 'too-short' };
      await this.store.set(req.passcode);
      this.deps.persist({ enabled: true });
      this.deps.note?.('configured: enabled');
      return { ok: true };
    }
    if (!this.store.has()) return { ok: false, error: 'not-set' };
    // every configuration is authorized by the passcode, never by Touch ID:
    // the credential a second enrolled finger defeats must not be able to
    // widen or remove the lock it guards
    if (!this.store.readable() || !(await this.store.verify(req.current))) {
      this.deps.note?.('configure refused: wrong passcode');
      return { ok: false, error: 'wrong' };
    }
    if (req.action === 'verify') return { ok: true };
    if (req.action === 'disable') {
      // the flag and the secret leave together; either outliving the other is
      // a state nothing else in the app could recover from
      this.store.clear();
      this.deps.persist({ enabled: false });
      this.deps.note?.('configured: disabled');
      return { ok: true };
    }
    if (req.action === 'change') {
      if (!passcodeAcceptable(req.next)) return { ok: false, error: 'too-short' };
      await this.store.set(req.next);
      this.deps.note?.('configured: passcode changed');
      return { ok: true };
    }
    if (req.action === 'setTouchId') {
      this.deps.persist({ touchId: req.touchId });
      this.deps.note?.(`configured: touch id ${req.touchId ? 'on' : 'off'}`);
      return { ok: true };
    }
    this.deps.persist({ guardActions: req.guardActions });
    this.deps.note?.(`configured: guard ${req.guardActions ? 'on' : 'off'}`);
    return { ok: true };
  }
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `corepack pnpm vitest run tests/unit/lock-controller.test.ts tests/unit/lock-consent.test.ts`
Expected: PASS.

- [x] **Step 5: Wire the dep in index.ts**

In `src/main/index.ts:135-144`, the `LockController` deps object gains one line after `now: Date.now,`:

```ts
      // the ring is evidence: who tried what at the lock, as methods and counts
      note: (line) => diag.note('lock', line),
```

- [x] **Step 6: Lint, test, checkpoint**

Run: `corepack pnpm lint && corepack pnpm test`
Expected: clean and green (typecheck still carries Task 3's two expected errors). Ask the user to run `/grimoire-core:commit` — suggested subject `feat(lock): record unlocks, consents and configuration in Diagnostics`.

---

### Task 5: IPC channels and their classification

**Files:**

- Modify: `src/shared/ipc.ts` (`RendererToMain`, `R2M_CHANNELS`, `RendererInvoke['downloads:recent']`, `SHELL_ONLY_CHANNELS`)
- Test: `tests/unit/ipc-sender-policy.test.ts`, `tests/unit/lock-ipc-policy.test.ts`

**Interfaces:**

- Produces send channels `downloads:remove { ids: number[] }`, `downloads:clear {}`, `downloads:restore {}`, `downloads:openDir {}`; invoke `downloads:recent` result `{ rows: DownloadView[]; storage: DownloadStorage }`.

- [x] **Step 1: Write the failing tests**

Append to `tests/unit/ipc-sender-policy.test.ts` inside `describe('ipcSenderAllowed', …)`:

```ts
  it('keeps the download history channels shell-only', () => {
    for (const channel of [
      'downloads:remove',
      'downloads:clear',
      'downloads:restore',
      'downloads:openDir',
    ] as const) {
      expect(
        ipcSenderAllowed({ channel, fromShell: true, senderServiceId: null, payloadServiceId: undefined }),
      ).toBe(true);
      expect(
        ipcSenderAllowed({
          channel,
          fromShell: false,
          senderServiceId: 'zalo',
          payloadServiceId: undefined,
        }),
      ).toBe(false);
    }
  });
```

Append to `tests/unit/lock-ipc-policy.test.ts` inside `describe('channelAllowedWhileLocked', …)`:

```ts
  // a locked app lists, removes, restores and opens nothing
  it('refuses every download history channel', () => {
    for (const channel of [
      'downloads:recent',
      'downloads:remove',
      'downloads:clear',
      'downloads:restore',
      'downloads:openDir',
    ] as const) {
      expect(channelAllowedWhileLocked(channel)).toBe(false);
    }
  });
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `corepack pnpm vitest run tests/unit/ipc-sender-policy.test.ts tests/unit/lock-ipc-policy.test.ts`
Expected: FAIL on typecheck of the channel literals (not members of the union) or on the assertion for a channel the shell-only set does not hold.

- [x] **Step 3: Implement**

In `src/shared/ipc.ts`, extend the types import with `DownloadStorage`. In `RendererToMain`, after `'downloads:cancel': { id: number };` add:

```ts
  /** Settings → Downloads history. `remove` and `clear` are guarded actions —
   *  lock:confirm mints the consent first when the guard is on, and main
   *  refuses without one; `restore` is the Undo and is not guarded (the safe
   *  direction); `openDir` opens the download folder itself, a directory from
   *  settings, never a page's path. Ids are main's row ids. All shell-only. */
  'downloads:remove': { ids: number[] };
  'downloads:clear': Record<string, never>;
  'downloads:restore': Record<string, never>;
  'downloads:openDir': Record<string, never>;
```

In `R2M_CHANNELS`, after `'downloads:cancel',` add:

```ts
  'downloads:remove',
  'downloads:clear',
  'downloads:restore',
  'downloads:openDir',
```

Replace the `downloads:recent` entry in `RendererInvoke`:

```ts
  /** Settings → Downloads: the history rows, fetched when the pane opens and
   *  polled once a second only while one is still downloading, plus how the
   *  file rests (the pane's keychain band). */
  'downloads:recent': { result: { rows: DownloadView[]; storage: DownloadStorage } };
```

In `SHELL_ONLY_CHANNELS`, after `'downloads:cancel',` add the same four channel names. Do **not** touch `LOCKED_ALLOWED_CHANNELS`.

- [x] **Step 4: Run the tests to verify they pass**

Run: `corepack pnpm vitest run tests/unit/ipc-sender-policy.test.ts tests/unit/lock-ipc-policy.test.ts tests/unit/guard-policy.test.ts`
Expected: PASS.

- [x] **Step 5: Lint, checkpoint**

Run: `corepack pnpm lint && corepack pnpm test`
Expected: clean and green. Ask the user to run `/grimoire-core:commit` — suggested subject `feat(ipc): download history channels, shell-only and refused while locked`.

---

### Task 6: Guard helpers and the handlers

**Files:**

- Modify: `src/main/lib/guard-policy.ts` (add `normalizeRemoveIds`, `normalizeAction`, `stripAppLock`)
- Modify: `src/main/ipc-handlers.ts` (`AppContext.downloads` comment, `authorized`, `applySettingsPatch`, `service:purgeLogin`, `services:purgeAll`, `passkeys:forget`, `lock:confirm`, `downloads:*`, `settings:export`, `settings:import`)
- Modify: `src/main/index.ts` (history store, manager deps)
- Test: `tests/unit/guard-policy.test.ts`

**Interfaces:**

- Consumes: `idSet`, `describeAction`, `GuardedAction` (Task 1); `downloadsSettingLines`, `DOWNLOAD_HISTORY_CAP` (Task 1); `DownloadHistoryStore` (Task 2); manager methods (Task 3).
- Produces: `normalizeRemoveIds(raw: unknown, cap: number): number[] | null`; `normalizeAction(raw: GuardedAction, cap: number): GuardedAction | null`; `stripAppLock(patch: Partial<Settings>): { patch: Partial<Settings>; carried: boolean }`.

- [x] **Step 1: Write the failing tests**

Append to `tests/unit/guard-policy.test.ts` (extend the import to `{ actionGuarded, normalizeAction, normalizeRemoveIds, stripAppLock }` and add `import { DEFAULT_SETTINGS } from '../../src/shared/types';`):

```ts
describe('normalizeRemoveIds', () => {
  it('sorts and dedupes finite positive integers', () => {
    expect(normalizeRemoveIds([3, 1, 3], 200)).toEqual([1, 3]);
  });
  it('refuses anything a consent must not be minted for', () => {
    expect(normalizeRemoveIds([], 200)).toBeNull();
    expect(normalizeRemoveIds([1.5], 200)).toBeNull();
    expect(normalizeRemoveIds([0], 200)).toBeNull();
    expect(normalizeRemoveIds(['1'], 200)).toBeNull();
    expect(normalizeRemoveIds('1,2', 200)).toBeNull();
    expect(normalizeRemoveIds([1, 2, 3], 2)).toBeNull();
    expect(normalizeRemoveIds([Number.MAX_SAFE_INTEGER + 1], 200)).toBeNull();
  });
});

describe('normalizeAction', () => {
  it('normalises a remove, bounds a passkey id, passes the rest through', () => {
    expect(normalizeAction({ kind: 'downloads-remove', ids: [2, 2, 1] }, 200)).toEqual({
      kind: 'downloads-remove',
      ids: [1, 2],
    });
    expect(normalizeAction({ kind: 'downloads-remove', ids: [] }, 200)).toBeNull();
    expect(normalizeAction({ kind: 'passkey-forget', id: '' }, 200)).toBeNull();
    expect(normalizeAction({ kind: 'passkey-forget', id: 'x'.repeat(257) }, 200)).toBeNull();
    expect(normalizeAction({ kind: 'passkey-forget', id: 'abc' }, 200)).toEqual({
      kind: 'passkey-forget',
      id: 'abc',
    });
    expect(normalizeAction({ kind: 'purge-all' }, 200)).toEqual({ kind: 'purge-all' });
  });
});

describe('stripAppLock', () => {
  // lock:configure is the only writer of appLock; a settings:update that
  // carries it is the shell console trying to switch the lock off
  it('drops appLock and reports it, leaving every other key', () => {
    const { patch, carried } = stripAppLock({
      appLock: { ...DEFAULT_SETTINGS.appLock, enabled: false },
      theme: 'dark',
    });
    expect(carried).toBe(true);
    expect(patch).toEqual({ theme: 'dark' });
  });
  it('passes an ordinary patch through untouched', () => {
    const input = { theme: 'dark' as const };
    const { patch, carried } = stripAppLock(input);
    expect(carried).toBe(false);
    expect(patch).toBe(input);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/guard-policy.test.ts`
Expected: FAIL — the three helpers are not exported.

- [x] **Step 3: Write the helpers**

Replace `src/main/lib/guard-policy.ts` with:

```ts
import { type GuardedAction, idSet } from '../../shared/lock';
import type { Settings } from '../../shared/types';

/** Whether a guarded action needs a credential right now. One condition in
 *  one place: the setting alone is not enough, because with no passcode
 *  stored there is nothing to ask for. */
export function actionGuarded(opts: { guardActions: boolean; configured: boolean }): boolean {
  return opts.guardActions && opts.configured;
}

/** Row ids as a consent is bound to them: finite positive integers, at most
 *  `cap` of them, sorted and deduplicated. Null for anything else, so a
 *  malformed payload mints nothing and removes nothing. */
export function normalizeRemoveIds(raw: unknown, cap: number): number[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > cap) return null;
  if (!raw.every((n) => typeof n === 'number' && Number.isSafeInteger(n) && n > 0)) return null;
  return idSet(raw as number[]);
}

/** The bound on a passkey credential id crossing lock:confirm. */
const PASSKEY_ID_MAX = 256;

/** What lock:confirm may mint: the slot must never hold a shape sameAction was
 *  not written for. Renderer data in, exact action out or null. */
export function normalizeAction(raw: GuardedAction, cap: number): GuardedAction | null {
  if (raw.kind === 'downloads-remove') {
    const ids = normalizeRemoveIds(raw.ids, cap);
    return ids ? { kind: 'downloads-remove', ids } : null;
  }
  if (raw.kind === 'passkey-forget') {
    const ok = typeof raw.id === 'string' && raw.id.length > 0 && raw.id.length <= PASSKEY_ID_MAX;
    return ok ? { kind: 'passkey-forget', id: raw.id } : null;
  }
  return raw;
}

/** settings:update never writes appLock — lock:configure is its only writer,
 *  behind the passcode. The shell's own console can send any shell channel,
 *  so this is enforced here rather than trusted to the Lock pane. */
export function stripAppLock(patch: Partial<Settings>): {
  patch: Partial<Settings>;
  carried: boolean;
} {
  if (!('appLock' in patch)) return { patch, carried: false };
  const { appLock: _dropped, ...rest } = patch;
  return { patch: rest, carried: true };
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/guard-policy.test.ts`
Expected: PASS.

- [x] **Step 5: Wire the handlers**

In `src/main/ipc-handlers.ts`:

Imports — extend `import type { GuardedAction } from '../shared/lock';` to `import { describeAction, type GuardedAction } from '../shared/lock';`; extend the guard-policy import to `import { actionGuarded, normalizeAction, normalizeRemoveIds, stripAppLock } from './lib/guard-policy';`; add `import { DOWNLOAD_HISTORY_CAP, downloadsSettingLines } from './lib/download-rules';`.

`AppContext.downloads` comment becomes `/** the download history behind Settings → Downloads; persisted, see download-history.ts */`.

Replace `authorized`:

```ts
/** True when this action may proceed: either the guard is off, or the user
 *  has just authorized exactly this action. A refusal is silent to the
 *  caller, like every other refusal in this file — and noted in the ring,
 *  because someone asked for a guarded action without the credential. */
function authorized(ctx: AppContext, action: GuardedAction): boolean {
  const guarded = actionGuarded({
    guardActions: ctx.settings.get().appLock.guardActions,
    configured: ctx.lock.configured(),
  });
  if (!guarded) return true;
  const ok = ctx.lock.consumeConsent(action);
  const what = describeAction(action);
  ctx.diag.note('lock', ok ? `${what} authorized` : `${what} refused: no consent`);
  return ok;
}
```

Replace the head of `applySettingsPatch` (down to and including the `stamped` computation's opening) so it reads:

```ts
export function applySettingsPatch(ctx: AppContext, raw: Partial<Settings>): boolean {
  const stripped = stripAppLock(raw);
  if (stripped.carried) ctx.diag.note('ipc', 'settings:update carried appLock; dropped');
  const patch = stripped.patch;
  const before = ctx.settings.get();
  if (patch.disabled) {
    const summoned = summonedIds(before.order, before.disabled, patch.disabled);
    if (summoned.length > 0) {
      if (!authorized(ctx, { kind: 'summon' })) return false;
      ctx.diag.note('app', `summoned: ${summoned.join(', ')}`);
    }
  }
  if (patch.downloads) {
    for (const line of downloadsSettingLines(before.downloads, patch.downloads)) {
      ctx.diag.note('downloads', line);
    }
  }
  // summoning restarts the unused clock, in the same write as the summon:
  // Home commits adds, banishes and reorders as one frame, and a second
  // settings write here would cost a second broadcast and menu rebuild
  const stamped = patch.disabled
```

The rest of the function is unchanged (it already reads `patch`).

Replace the two purge handlers:

```ts
  on('service:purgeLogin', ({ serviceId }) => {
    if (!authorized(ctx, { kind: 'purge-one', serviceId })) return;
    ctx.diag.note('app', `purged login: ${serviceId}`);
    void purgeLogin(ctx, serviceId);
  });
```

```ts
  onInvoke('services:purgeAll', { purged: 0 }, async () => {
    // the same shape a blocked sender gets, so the toast says nothing
    // happened — which is true
    if (!authorized(ctx, { kind: 'purge-all' })) return { purged: 0 };
    const result = await purgeAll(ctx);
    ctx.diag.note('app', `purged all logins (${result.purged})`);
    return result;
  });
```

Replace `passkeys:forget`:

```ts
  onInvoke('passkeys:forget', [], ({ id }) => {
    // destroys a credential Goetia made: guarded like a purge, and recorded
    if (typeof id !== 'string' || !authorized(ctx, { kind: 'passkey-forget', id })) {
      return ctx.passkeyStore.views();
    }
    const rpId = ctx.passkeyStore.get(id)?.rpId;
    if (ctx.passkeyStore.forget(id) && rpId) ctx.diag.note('passkey', `forgot ${rpId}`);
    return ctx.passkeyStore.views();
  });
```

Replace the download handlers:

```ts
  onInvoke('downloads:recent', { rows: [], storage: 'sealed' }, () => ctx.downloads.recent());
  on('downloads:reveal', ({ id }) => {
    if (Number.isSafeInteger(id)) ctx.downloads.reveal(id);
  });
  on('downloads:cancel', ({ id }) => {
    if (Number.isSafeInteger(id)) ctx.downloads.cancel(id);
  });
  on('downloads:remove', ({ ids }) => {
    const set = normalizeRemoveIds(ids, DOWNLOAD_HISTORY_CAP);
    if (!set || !authorized(ctx, { kind: 'downloads-remove', ids: set })) return;
    const n = ctx.downloads.remove(set);
    if (n > 0) ctx.diag.note('downloads', `history: removed ${n} rows`);
  });
  on('downloads:clear', () => {
    if (!authorized(ctx, { kind: 'downloads-clear' })) return;
    const n = ctx.downloads.clear();
    if (n > 0) ctx.diag.note('downloads', `history cleared (${n} rows)`);
  });
  on('downloads:restore', () => {
    const n = ctx.downloads.restore();
    if (n > 0) ctx.diag.note('downloads', `history: restored ${n} rows`);
  });
  on('downloads:openDir', () => {
    ctx.downloads.openFolder();
  });
```

Replace `lock:confirm`:

```ts
  onInvoke('lock:confirm', { ok: false, waitMs: 0, reason: 'unavailable' }, (req) => {
    const action = normalizeAction(req.action, DOWNLOAD_HISTORY_CAP);
    if (!action) return { ok: false, waitMs: 0, reason: 'unavailable' };
    return ctx.lock.grantConsent(action, req.credential);
  });
```

In `settings:export`, before `return { ok: true, path };` add `ctx.diag.note('app', 'settings exported');`. In `settings:import`, immediately after the `if (!applySettingsPatch(ctx, patch)) { … }` block add `ctx.diag.note('app', \`settings imported (${Object.keys(parsed.patch).length} keys)\`);`.

- [x] **Step 6: Wire index.ts**

In `src/main/index.ts`: change the first import to `import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';` and add `import { DownloadHistoryStore } from './download-history';` beside the `DownloadManager` import.

After the `PinStore` block (`} else if (!pinCodec) { … }` ends at line 133), add:

```ts
    // the download history rests under the same key as the pins; a file this
    // launch cannot open is kept, and the pane's band says so
    const downloadHistory = new DownloadHistoryStore(app.getPath('userData'), pinCodec);
    if (downloadHistory.storage() === 'unreadable') {
      diag.note('downloads', 'history unreadable: sealed file, keychain would not open it');
    } else if (downloadHistory.storage() === 'plain') {
      diag.note('downloads', 'history stored unencrypted: the OS keychain is unavailable');
    }
```

In the `DownloadManager` deps (after `openDownloads: …`), add:

```ts
      history: downloadHistory,
      isDirectory: (p) => {
        try {
          return statSync(p).isDirectory();
        } catch {
          return false;
        }
      },
      // the one openPath in the app, and only ever on the directory above
      openFolder: (p) => void shell.openPath(p),
      note: (line) => diag.note('downloads', line),
```

- [x] **Step 7: Typecheck, lint, test, checkpoint**

Run: `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test`
Expected: typecheck now fails **only** in `src/renderer/src/components/DownloadsPane.tsx` (`rows` is no longer an array) — that is Task 7. Lint and tests green. Ask the user to run `/grimoire-core:commit` — suggested subject `feat(guard): guarded history removal, passkey forget, appLock refused on settings:update, actions recorded`.

---

### Task 7: The pane — Model A

> Amended after the live look (2026-09-23, user decision): the selection state replaced a bar inside the card, which pushed the list down under the pointer. The header line's right side now swaps between **Clear all…** and "n selected · Remove from list · Cancel" at one text size, the hint "Click a file to show it in Finder" is gone (the row's hover ghost and `title` carry it), and the credential block and Undo row render at the card's foot. A second live look at 200 rows moved the Undo state into that header line too and made the credential a card anchored under it (the foot sat 40 screens away), rebuilt the folder row (label and two buttons on one line, the path full-width beneath) and added a search field (`shared/download-filter.ts`). The code below is the first cut; the spec's Surface section is the source of truth.

**Files:**

- Create: `src/renderer/src/components/Pane.tsx`
- Modify: `src/renderer/src/components/SettingsView.tsx` (imports; remove the local `Pane`; the Downloads section)
- Rewrite: `src/renderer/src/components/DownloadsPane.tsx`

**Interfaces:**

- Consumes: `downloads:recent` `{ rows, storage }`, the four send channels (Task 5); `CredentialConfirm` (existing); `TOAST_MS` (`./toast-rules`).
- Produces: `Pane({ title, children, highlight?, aside? })` default export; `DownloadsPane({ landing: string | null; guarded: boolean })`; `selectable(r: DownloadView): boolean`. Test ids: `download-row` (`data-state`), `download-select`, `download-reveal` (the saved row's body), `download-cancel`, `downloads-selection`, `downloads-remove`, `downloads-remove-cancel`, `downloads-ask-cancel`, `downloads-clear`, `downloads-undo`, `downloads-band`, `downloads-empty`, `downloads-open-dir`.

- [x] **Step 1: Extract `Pane`**

Create `src/renderer/src/components/Pane.tsx`:

```tsx
import type React from 'react';

/** A Settings card under an uppercase label. `aside` sits at the label's
 *  right for a hint or a quiet action; `highlight` rides the card, not a
 *  wrapper, because the card is opaque and would paint over a tinted
 *  ancestor. */
export default function Pane({
  title,
  children,
  highlight,
  aside,
}: {
  title: string;
  children: React.ReactNode;
  highlight?: boolean;
  aside?: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-text-2">{title}</h2>
        {aside}
      </div>
      <div
        className={`rounded-modal border bg-bg-1 px-4 py-1 transition duration-300 ${
          highlight ? 'border-accent ring-2 ring-accent/25' : 'border-border'
        }`}
      >
        {children}
      </div>
    </div>
  );
}
```

In `SettingsView.tsx`: delete the local `function Pane(…) { … }` (lines 76 to its closing brace) and add `import Pane from './Pane';` after `import LockPane from './LockPane';`.

- [x] **Step 2: The Downloads section in SettingsView**

Replace the Folder row's controls and the list card. The `Folder` row's `<span className="flex items-center gap-3">` gains, as its first child before the `downloads-reset` conditional:

```tsx
                      <button
                        type="button"
                        data-testid="downloads-open-dir"
                        onClick={() => window.goetia.send('downloads:openDir', {})}
                        className="rounded-ctl border border-border bg-bg-2 px-2 py-1 text-text-1"
                      >
                        Open folder
                      </button>
```

Replace:

```tsx
                <Pane title="Recent · this session">
                  <DownloadsPane
                    landing={s.downloads.ask ? null : (s.downloads.dir ?? 'your Downloads folder')}
                  />
                </Pane>
```

with:

```tsx
                <DownloadsPane
                  landing={s.downloads.ask ? null : (s.downloads.dir ?? 'your Downloads folder')}
                  guarded={s.appLock.guardActions && state.lockConfigured}
                />
```

- [x] **Step 3: Rewrite DownloadsPane**

Replace `src/renderer/src/components/DownloadsPane.tsx` with:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { extensionChip, formatBytes, formatProgress } from '../../../shared/format';
import type { GuardedAction } from '../../../shared/lock';
import type { DownloadStorage, DownloadView } from '../../../shared/types';
import { useShell } from '../store';
import CredentialConfirm from './CredentialConfirm';
import Pane from './Pane';
import { relativeTime } from './relative-time';
import { TOAST_MS } from './toast-rules';

/** while a row is downloading the pane re-fetches this often; never otherwise */
const POLL_MS = 1000;
const isMac = navigator.platform.startsWith('Mac');
export const REVEAL_LABEL = isMac ? 'Show in Finder' : 'Show in folder';

/** whole percent, or null while Chromium does not know the total */
export function percent(r: { received: number; total: number }): number | null {
  return r.total > 0 ? Math.min(100, Math.round((r.received / r.total) * 100)) : null;
}

/** the rows a checkbox may select: ended ones — an in-flight row has Cancel */
export function selectable(r: DownloadView): boolean {
  return r.state !== 'downloading';
}

const files = (n: number) => `${n} ${n === 1 ? 'file' : 'files'}`;

const btn =
  'flex-none rounded-ctl border border-border bg-bg-2 px-2 py-1 text-[12px] text-text-1 transition-colors duration-120';

const BAND: Record<Exclude<DownloadStorage, 'sealed'>, string> = {
  unreadable:
    'Goetia cannot read its download history on this device. The file is sealed to a keychain this launch cannot open; it is kept as it is, and downloads this session are not being recorded.',
  plain: 'History is kept unencrypted on this device. The OS keychain is unavailable.',
};

function Sub({ r, service, now }: { r: DownloadView; service: string; now: number }) {
  switch (r.state) {
    case 'downloading':
      return <>{`${service} · downloading · ${formatProgress(r.received, r.total)}`}</>;
    case 'saved':
      return (
        <>{`${service} · ${relativeTime(r.at, now)} · ${formatBytes(r.received || r.total)}`}</>
      );
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

function Body({ r, service, now }: { r: DownloadView; service: string; now: number }) {
  const gone = r.state === 'missing';
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span
        className={`truncate font-medium ${
          gone ? 'text-text-2 line-through decoration-border' : 'text-text-1'
        }`}
      >
        {r.filename}
      </span>
      <span className="text-[11px] text-text-2">
        <Sub r={r} service={service} now={now} />
      </span>
      {r.state === 'downloading' && (
        <span className="mt-0.5 h-[3px] overflow-hidden rounded-full bg-bg-2">
          <span
            className="block h-full bg-accent"
            style={{ width: `${percent(r) ?? 100}%`, opacity: percent(r) === null ? 0.4 : 1 }}
          />
        </span>
      )}
    </span>
  );
}

/** Settings → Downloads → History: every file a chat sent, across launches,
 *  in flight first. Fetched when the pane opens and polled once a second only
 *  while a row is still downloading. A saved row's body is the reveal; a
 *  checkbox selects an ended row for Remove, which — like Clear all — is a
 *  guarded action: with the guard on the credential is asked inline and main
 *  enforces; with it off the row leaves at once. Either way an Undo row
 *  follows. No path ever reaches this process — see main/downloads.ts.
 *  `landing` names the folder for the empty state, null under Always ask. */
export default function DownloadsPane({
  landing,
  guarded,
}: {
  landing: string | null;
  guarded: boolean;
}) {
  const services = useShell((s) => s.state?.services);
  const [data, setData] = useState<{ rows: DownloadView[]; storage: DownloadStorage } | null>(
    null,
  );
  const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set());
  /** the guarded action waiting on the credential, or null */
  const [asking, setAsking] = useState<GuardedAction | null>(null);
  /** how many rows the last removal took, while its Undo shows */
  const [undo, setUndo] = useState<number | null>(null);

  const load = useCallback(() => {
    window.goetia.invoke('downloads:recent').then(setData);
  }, []);
  useEffect(load, [load]);

  const rows = data?.rows ?? null;
  const live = rows?.some((r) => r.state === 'downloading') ?? false;
  useEffect(() => {
    if (!live) return;
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [live, load]);

  useEffect(() => {
    if (undo === null) return;
    const t = setTimeout(() => setUndo(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [undo]);

  // a row that left the list, or started downloading again, cannot stay selected
  useEffect(() => {
    if (!rows) return;
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => rows.some((r) => r.id === id && selectable(r))));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  const reveal = (id: number) => {
    window.goetia.send('downloads:reveal', { id });
    load();
  };
  const cancel = (id: number) => {
    window.goetia.send('downloads:cancel', { id });
    load();
  };
  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const clearSelection = () => {
    setSelected(new Set());
    setAsking(null);
  };

  /** main is the enforcer; this sends once the credential passed, or at once
   *  with the guard off */
  const perform = (action: GuardedAction) => {
    if (action.kind === 'downloads-remove') {
      window.goetia.send('downloads:remove', { ids: action.ids });
      setUndo(action.ids.length);
    } else if (action.kind === 'downloads-clear') {
      window.goetia.send('downloads:clear', {});
      setUndo(rows?.filter(selectable).length ?? 0);
    }
    clearSelection();
    load();
  };
  const request = (action: GuardedAction) => (guarded ? setAsking(action) : perform(action));
  const restore = () => {
    window.goetia.send('downloads:restore', {});
    setUndo(null);
    load();
  };

  if (data === null || rows === null) return null;
  const now = Date.now();
  const ended = rows.filter(selectable).length;
  const count = selected.size;
  const askingFor =
    asking?.kind === 'downloads-remove' ? asking.ids.length : asking?.kind === 'downloads-clear' ? ended : 0;

  const aside = rows.length > 0 && (
    <span className="flex items-center gap-3 text-[11px] text-text-2">
      <span>Click a file to show it in {isMac ? 'Finder' : 'its folder'}</span>
      {ended > 0 && (
        <button
          type="button"
          data-testid="downloads-clear"
          onClick={() => request({ kind: 'downloads-clear' })}
          className="transition-colors duration-120 hover:text-danger hover:underline"
        >
          Clear all…
        </button>
      )}
    </span>
  );

  return (
    <Pane title={`History · ${files(rows.length)}`} aside={aside || undefined}>
      {data.storage !== 'sealed' && (
        <p
          data-testid="downloads-band"
          className="my-2 rounded-ctl border border-border bg-bg-2 px-3 py-2 text-[11px] text-text-2"
        >
          {BAND[data.storage]}
        </p>
      )}
      {undo !== null && (
        <div
          role="status"
          data-testid="downloads-undo"
          className="my-2 flex items-center justify-between gap-4 rounded-ctl bg-bg-2 px-3 py-2"
        >
          <span className="text-text-1">{files(undo)} removed from the list.</span>
          <button
            type="button"
            onClick={restore}
            className="font-semibold text-accent transition-colors duration-120 hover:underline"
          >
            Undo
          </button>
        </div>
      )}
      {count > 0 && (
        <div
          data-testid="downloads-selection"
          className="flex items-center justify-between gap-3 border-b border-border py-2"
        >
          <span className="text-[12px] font-semibold text-text-1">{count} selected</span>
          <span className="flex items-center gap-2">
            <button
              type="button"
              data-testid="downloads-remove"
              onClick={() => request({ kind: 'downloads-remove', ids: [...selected] })}
              className={`${btn} hover:border-danger`}
            >
              Remove from list
            </button>
            <button
              type="button"
              data-testid="downloads-remove-cancel"
              onClick={clearSelection}
              className={btn}
            >
              Cancel
            </button>
          </span>
        </div>
      )}
      {asking && (
        <div className="border-b border-border pb-2">
          <p className="pt-2 text-[12px] text-text-1">
            Prove it's you to remove {files(askingFor)} from the list.
          </p>
          <p className="text-[11px] text-text-2">The files themselves stay where they are.</p>
          <CredentialConfirm autoFocus action={asking} onVerified={() => perform(asking)} />
          <button
            type="button"
            data-testid="downloads-ask-cancel"
            onClick={() => setAsking(null)}
            className="text-[11px] text-text-2 hover:underline"
          >
            Cancel
          </button>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="py-3 text-[11px] text-text-2" data-testid="downloads-empty">
          Nothing downloaded yet.
          {landing !== null && ` Files a chat sends land in ${landing}.`}
        </p>
      ) : (
        <ul className="pb-1">
          {rows.map((r) => {
            const svc = services?.find((s) => s.id === r.serviceId);
            const service = svc?.name ?? r.serviceId;
            return (
              <li
                key={r.id}
                data-testid="download-row"
                data-state={r.state}
                className="flex items-center gap-2.5 border-b border-border py-2 last:border-b-0"
              >
                {selectable(r) ? (
                  <input
                    type="checkbox"
                    data-testid="download-select"
                    aria-label={`Select ${r.filename}`}
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                    className="h-3.5 w-3.5 flex-none accent-accent"
                  />
                ) : (
                  <span aria-hidden="true" className="h-3.5 w-3.5 flex-none" />
                )}
                <span
                  aria-hidden="true"
                  className="h-2 w-2 flex-none rounded-full"
                  style={{ background: svc?.color ?? 'transparent' }}
                />
                <span className="flex h-[30px] w-[28px] flex-none items-center justify-center rounded-ctl border border-border bg-bg-2 text-[8px] font-extrabold tracking-wide text-text-2">
                  {extensionChip(r.filename)}
                </span>
                {r.state === 'saved' ? (
                  <button
                    type="button"
                    data-testid="download-reveal"
                    title={REVEAL_LABEL}
                    onClick={() => reveal(r.id)}
                    className="group flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <Body r={r} service={service} now={now} />
                    <span className="flex-none text-[11px] text-text-2 opacity-0 transition-opacity duration-120 group-hover:opacity-100 group-focus-visible:opacity-100">
                      {REVEAL_LABEL}
                    </span>
                  </button>
                ) : (
                  <Body r={r} service={service} now={now} />
                )}
                {r.state === 'downloading' && (
                  <span className="flex flex-none items-center gap-2">
                    <span className="tabular text-[12px] text-text-2">
                      {percent(r) === null ? '…' : `${percent(r)}%`}
                    </span>
                    <button
                      type="button"
                      data-testid="download-cancel"
                      onClick={() => cancel(r.id)}
                      className={`${btn} hover:border-danger`}
                    >
                      Cancel
                    </button>
                  </span>
                )}
                {(r.state === 'failed' || r.state === 'missing') && (
                  <span className="flex-none px-2 text-text-2">—</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Pane>
  );
}
```

- [x] **Step 4: Typecheck, lint, run the app**

Run: `corepack pnpm typecheck && corepack pnpm lint`
Expected: clean (the renderer now reads `rows` off the invoke result; `REVEAL_LABEL` and `percent` keep their exports).

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm dev` and open Settings → Downloads. Check by eye: the header reads "History · n files", a saved row's body shows the reveal ghost on hover, a checkbox raises the selection bar, Open folder opens Finder on the folder. Quit.

- [x] **Step 5: Test, checkpoint**

Run: `corepack pnpm test`
Expected: green. Ask the user to run `/grimoire-core:commit` — suggested subject `feat(settings): download history pane — row reveals, gutter selection, guarded remove, Open folder`.

---

### Task 8: Passkeys pane guard and copy changes

**Files:**

- Modify: `src/renderer/src/components/PasskeysPane.tsx`
- Modify: `src/renderer/src/components/LockPane.tsx` (the guard row's label and hint)
- Modify: `src/renderer/src/components/ShortcutsPane.tsx:27`
- Modify: `src/shared/shortcuts.ts:10`

**Interfaces:**

- Consumes: `passkeys:forget` guarded (Task 6); `CredentialConfirm`.
- Produces: test ids `passkey-ask-cancel`; copy per Global Constraints.

- [x] **Step 1: PasskeysPane**

In `src/renderer/src/components/PasskeysPane.tsx`, add `import CredentialConfirm from './CredentialConfirm';`, and inside the component after the `undo` state add:

```tsx
  // main enforces; this only decides when to ask — the PurgeConfirm line
  const guarded = useShell(
    (s) => (s.state?.settings.appLock.guardActions ?? false) && (s.state?.lockConfigured ?? false),
  );
  const [asking, setAsking] = useState<PasskeyView | null>(null);
```

Replace `forget` with:

```tsx
  const forget = async (p: PasskeyView) => {
    setAsking(null);
    setList(await window.goetia.invoke('passkeys:forget', { id: p.id }));
    setUndo({ id: p.id, rpId: p.rpId });
  };
  const request = (p: PasskeyView) => (guarded ? setAsking(p) : void forget(p));
```

Change the Forget button's `onClick={() => forget(p)}` to `onClick={() => request(p)}`, and wrap each row so the confirm can follow it: replace the row's outer `<div key={p.id} data-testid={…} className="flex …">` … `</div>` with:

```tsx
          <div key={p.id} data-testid={`passkey-${p.rpId}`} className="border-b border-border">
            <div className="flex items-center justify-between gap-4 py-2">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-text-1">
                  {p.rpId} <span className="text-text-2">· {p.account}</span>
                </span>
                <span className="text-[11px] text-text-2">
                  {svc ? `via ${svc.name} · ` : ''}created {dateOf(p.createdAt)} · last used{' '}
                  {dateOf(p.lastUsedAt)}
                </span>
              </span>
              <button
                type="button"
                data-testid={`forget-${p.rpId}`}
                onClick={() => request(p)}
                className="rounded-ctl border border-border bg-bg-2 px-2.5 py-1 text-text-1 transition-colors duration-120 hover:border-accent"
              >
                Forget
              </button>
            </div>
            {asking?.id === p.id && (
              <div className="pb-2">
                <p className="text-[12px] text-text-1">
                  Prove it's you to forget the passkey for {p.rpId}.
                </p>
                <CredentialConfirm
                  autoFocus
                  action={{ kind: 'passkey-forget', id: p.id }}
                  onVerified={() => void forget(p)}
                />
                <button
                  type="button"
                  data-testid="passkey-ask-cancel"
                  onClick={() => setAsking(null)}
                  className="text-[11px] text-text-2 hover:underline"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
```

- [x] **Step 2: Lock pane copy**

In `src/renderer/src/components/LockPane.tsx`, in the guard row: change the label text `Ask before summoning a service or purging a login` to `Ask before summoning a service, purging a login or removing download history`, and change the hint to:

```tsx
                A banished service keeps its login, so summoning one back reveals its conversations
                — a purge cannot be undone, and removing download history erases the record of what
                was downloaded. This asks even while Goetia is unlocked. It does not guard services
                already on your rail.
```

- [x] **Step 3: Session-only wording**

- `src/renderer/src/components/ShortcutsPane.tsx:27`: `desc: "downloads — this session's files"` → `desc: 'downloads — your files'`.
- `src/shared/shortcuts.ts:10`: `/** left half too: Settings → Downloads, this session's files */` → `/** left half too: Settings → Downloads, your files */`.

- [x] **Step 4: Typecheck, lint, test, checkpoint**

Run: `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test`
Expected: clean and green. Check `grep -rn "this session" src --include='*.ts' --include='*.tsx'` shows no downloads-related hit (the `unread-jump.ts` and `settings-backup.ts` hits are unrelated and stay). Ask the user to run `/grimoire-core:commit` — suggested subject `feat(passkeys): guard Forget; wording for persistent download history`.

---

### Task 9: End-to-end

**Files:**

- Modify: `tests/e2e/downloads.spec.ts` (module-level helpers; one new test)
- Modify: `tests/e2e/lock.spec.ts` (one new test)
- Modify: `tests/e2e/passkeys.spec.ts` (the first test's Forget tail)

**Interfaces:**

- Consumes: everything above; the `armLock` / `verifyAfterFailure` helpers copied from `tests/e2e/guarded-actions.spec.ts` (there is no shared e2e helper module).

- [x] **Step 1: Hoist helpers in downloads.spec.ts**

Above the existing test, add:

```ts
const PASSCODE = 'correct horse';

async function launch(profile: string) {
  const app = await electron.launch({
    args: ['out/main/index.js', '--goetia-e2e', `--goetia-user-data=${profile}`],
  });
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
  await win.waitForLoadState('domcontentloaded');
  return { app, win };
}

/** the service view's document exists and has finished loading */
async function waitForService(app: ElectronApplication) {
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
}

const trigger = (app: ElectronApplication) =>
  app.evaluate(({ webContents }, js) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().startsWith('https://'));
    if (!wc) throw new Error('no service view');
    return wc.executeJavaScript(js);
  }, BLOB_DOWNLOAD);

async function openPane(win: Page) {
  await win.getByTestId('settings-btn').click();
  await win.getByTestId('settings-nav-downloads').click();
}

/** Turning the lock on is what arms the guard (guarded-actions.spec's helper). */
async function armLock(win: Page) {
  await win.getByTestId('settings-btn').click();
  await win.getByTestId('settings-nav-lock').click();
  await win.getByTestId('lock-new-passcode').fill(PASSCODE);
  await win.getByTestId('lock-enable').click();
  await expect(win.getByTestId('lock-status')).toHaveText('Lock on.');
  await win.keyboard.press('Escape');
  await expect(win.getByTestId('settings')).toHaveCount(0);
}

/** After a wrong attempt the backoff is checked before the credential: wait
 *  it out and submit again, which is exactly what a person does. */
async function verifyAfterFailure(win: Page) {
  await win.getByTestId('credential-passcode').fill(PASSCODE);
  await win.getByTestId('credential-passcode').press('Enter');
  await expect(win.getByTestId('credential-message')).toContainText('Too many attempts');
  await expect(win.getByTestId('credential-passcode')).toBeEnabled({ timeout: 5000 });
  await win.getByTestId('credential-passcode').press('Enter');
}
```

In the existing test, replace its inline `electron.launch` + window lookup with `const { app, win } = await launch(profile);`, its inline poll with `await waitForService(app);`, and its inline `const trigger = () => …` with calls to `trigger(app)`. Add `appLock: { enabled: false, touchId: false, guardActions: true }` to `makeProfile`'s settings so the guard test below can arm the lock without a Touch ID prompt. Leave every assertion as it is: the saved row still carries `download-reveal` (now on its body) and the missing row still has none.

- [x] **Step 2: Write the new downloads test**

Append:

```ts
test('history survives a relaunch, rows leave with Undo, and the guard asks once the lock is on', async () => {
  const { profile, downloads } = makeProfile();
  const first = await launch(profile);
  await waitForService(first.app);
  await trigger(first.app);
  await expect.poll(() => existsSync(join(downloads, 'note.txt')), { timeout: 15_000 }).toBe(true);
  await trigger(first.app);
  await expect
    .poll(() => existsSync(join(downloads, 'note (1).txt')), { timeout: 15_000 })
    .toBe(true);
  await first.app.close();

  // sealed at rest: the names are not in the file in clear
  const atRest = readFileSync(join(profile, 'downloads.json'), 'utf8');
  expect(atRest).toContain('"sealed"');
  expect(atRest).not.toContain('note.txt');

  // a file deleted between launches reads as gone, and both rows came back
  rmSync(join(downloads, 'note.txt'));
  const { app, win } = await launch(profile);
  await openPane(win);
  const rows = win.getByTestId('download-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('note (1).txt');
  await expect(rows.nth(1)).toHaveAttribute('data-state', 'missing');
  await expect(win.getByTestId('downloads-band')).toHaveCount(0);

  // no lock yet: Remove acts at once, and Undo brings the row back
  await rows.nth(1).getByTestId('download-select').check();
  await expect(win.getByTestId('downloads-selection')).toContainText('1 selected');
  await win.getByTestId('downloads-remove').click();
  await expect(win.getByTestId('credential-confirm')).toHaveCount(0);
  await expect(rows).toHaveCount(1);
  await expect(win.getByTestId('downloads-undo')).toContainText('1 file removed');
  await win.getByTestId('downloads-undo').getByRole('button', { name: 'Undo' }).click();
  await expect(rows).toHaveCount(2);

  // Clear all empties the list
  await win.getByTestId('downloads-clear').click();
  await expect(rows).toHaveCount(0);
  await expect(win.getByTestId('downloads-empty')).toBeVisible();
  await win.keyboard.press('Escape');

  // arm the lock: the guard now stands in front of Remove
  await armLock(win);
  await waitForService(app);
  await trigger(app);
  await expect.poll(() => existsSync(join(downloads, 'note.txt')), { timeout: 15_000 }).toBe(true);
  await openPane(win);
  await expect(rows).toHaveCount(1);
  await rows.first().getByTestId('download-select').check();
  await win.getByTestId('downloads-remove').click();
  await expect(win.getByTestId('credential-confirm')).toBeVisible();

  // a wrong passcode leaves the row; the right one removes it
  await win.getByTestId('credential-passcode').fill('not the passcode');
  await win.getByTestId('credential-passcode').press('Enter');
  await expect(win.getByTestId('credential-message')).toHaveText('That is not your passcode.');
  await expect(rows).toHaveCount(1);
  await verifyAfterFailure(win);
  await expect(rows).toHaveCount(0);

  // the removal and the consent are in the ring, as counts
  await win.getByTestId('settings-nav-diagnostics').click();
  const diag = win.getByTestId('diag-row');
  await expect(diag.filter({ hasText: '[downloads] history: removed 1 rows' })).toHaveCount(1);
  await expect(diag.filter({ hasText: '[lock] downloads-remove (1 rows) authorized' })).toHaveCount(
    1,
  );
  await expect(diag.filter({ hasText: 'note.txt' })).toHaveCount(0);

  await app.close();
});
```

- [x] **Step 3: Write the lock bypass test**

In `tests/e2e/lock.spec.ts`, extend the `node:fs` import with `readFileSync` and append:

```ts
test('settings:update cannot switch the lock off — lock:configure is its only writer', async () => {
  const profile = makeProfile();
  const { app, win } = await launch(profile);
  await win.getByTestId('settings-btn').click();
  await win.getByTestId('settings-nav-lock').click();
  await win.getByTestId('lock-new-passcode').fill(PASSCODE);
  await win.getByTestId('lock-enable').click();
  await expect(win.getByTestId('lock-status')).toHaveText('Lock on.');

  // what the shell's own console could send: a patch that carries appLock
  await win.evaluate(() => {
    (window as unknown as { goetia: { send(c: string, p: unknown): void } }).goetia.send(
      'settings:update',
      { appLock: { enabled: false, touchId: false, guardActions: false } },
    );
  });
  await win.getByTestId('settings-nav-diagnostics').click();
  await expect(
    win.getByTestId('diag-row').filter({ hasText: '[ipc] settings:update carried appLock; dropped' }),
  ).toHaveCount(1);
  await app.close();

  expect(JSON.parse(readFileSync(join(profile, 'settings.json'), 'utf8')).appLock).toMatchObject({
    enabled: true,
    guardActions: true,
  });
  // and the next launch comes up locked
  const again = await launch(profile);
  await expect(again.win.getByTestId('lock-screen')).toBeVisible();
  await again.app.close();
});
```

- [x] **Step 4: Guarded Forget in passkeys.spec.ts**

The first test already mints a passkey live (`GOETIA_WEBAUTHN_PROMPT: 'accept'`), forgets it and undoes. After its `await expect(win.getByTestId(`passkey-${rp}`)).toBeVisible();` line, still inside the `try`, add:

```ts
    // arm the lock from the pane beside it: Forget now asks before it forgets
    await win.getByTestId('settings-nav-lock').click();
    await win.getByTestId('lock-new-passcode').fill('correct horse');
    await win.getByTestId('lock-enable').click();
    await expect(win.getByTestId('lock-status')).toHaveText('Lock on.');
    await win.getByTestId('settings-nav-passkeys').click();
    await win.getByTestId(`forget-${rp}`).click();
    await expect(win.getByTestId(`passkey-${rp}`)).toBeVisible();
    await expect(win.getByTestId('credential-confirm')).toBeVisible();
    await win.getByTestId('credential-passcode').fill('correct horse');
    await win.getByTestId('credential-passcode').press('Enter');
    await expect(win.getByTestId('passkey-undo')).toBeVisible();
    await expect(win.getByTestId(`passkey-${rp}`)).toHaveCount(0);
```

- [x] **Step 5: Build and run the three specs**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm build && env -u ELECTRON_RUN_AS_NODE npx playwright test tests/e2e/downloads.spec.ts tests/e2e/lock.spec.ts tests/e2e/passkeys.spec.ts`
Expected: all three files pass. If the keychain is unavailable on the machine the `"sealed"` assertion fails — that is the `plain` case, and the run must be repeated on a machine with a keychain rather than the assertion weakened.

- [x] **Step 6: Checkpoint**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: clean and green. Ask the user to run `/grimoire-core:commit` — suggested subject `test(e2e): download history across launches, guarded remove and forget, appLock refused`.

---

### Task 10: Documentation

**Files:**

- Modify: `CLAUDE.md` (the Downloads bullet under Security; a new bullet after it)
- Modify: `docs/FEATURES.md` (the Downloads row at line 45; the Diagnostics row at line 76; a new row after "Pins sealed at rest" at line 81)
- Modify: `docs/superpowers/specs/2026-09-23-downloads-pane-design.md`, `docs/superpowers/specs/2026-09-13-guarded-actions-design.md` (superseded notes)
- Modify: `docs/superpowers/specs/2026-09-23-download-history-design.md` (one testing bullet)

- [x] **Step 1: CLAUDE.md**

Replace the sentence in the Downloads bullet beginning `**Settings → Downloads** (2026-09-23; spec …)` through `Never Open, never Clear.` with:

**Settings → Downloads** (2026-09-23; specs `docs/superpowers/specs/2026-09-23-downloads-pane-design.md` and `2026-09-23-download-history-design.md`) holds the folder rows — with **Open folder**, the one `shell.openPath` in the app, run only on the directory settings name after a `statSync(...).isDirectory()` check at click time — and the **history**: `DownloadManager.records`, `DOWNLOAD_HISTORY_CAP` (200), in flight first then newest (`historyViews`), persisted across launches by `DownloadHistoryStore` (`src/main/download-history.ts`, `downloads.json`) as a `safeStorage`-sealed envelope in `pins.json`'s shape — ended rows only, written on every change to that set and never on progress; plaintext plus a Diagnostics line with no keychain; a sealed file the keychain will not open is kept untouched, reads empty, and refuses writes that launch, and `downloads:recent` carries `storage` so the pane's band says so. A saved file that is gone reads `missing` (checked main-side, so `DownloadView` carries no path). A saved row's body is the reveal (`downloads:reveal`, re-checking lock and existence like the banner); a running row has Cancel (`downloads:cancel`); an ended row has a checkbox. **Removing rows is a guarded action**: `downloads:remove { ids }` (consent bound to the exact id set, `sameAction`) and `downloads:clear` run through `authorized()` like a purge and note `[downloads] history: removed n rows` / `history cleared (n rows)`; `downloads:restore` is the Undo and is not guarded (the safe direction). All shell-only, refused while locked; `downloads:recent` is polled by the pane only while a row is downloading. `⌘/Ctrl ⇧ D` (`ACCELERATORS.downloads`, left half) opens it through `settingsFocus` on `MainState`, cleared when Settings closes; a completed banner clicked after its file moved opens the pane instead of revealing nothing. Never Open a file.

After that bullet add a new bullet:

**Guarded actions are recorded, and `settings:update` never writes `appLock`** (2026-09-23; spec `docs/superpowers/specs/2026-09-23-download-history-design.md`, the guard audit). The consent slot from 2026-09-13 now covers `summon`, `purge-one`, `purge-all`, `downloads-remove` (bound to ids), `downloads-clear` and `passkey-forget` (bound to the id) — `shared/lock.ts` `GuardedAction`, `sameAction`, `describeAction`; `lock:confirm` normalises the action (`normalizeAction`, `lib/guard-policy.ts`) before minting. Every performed or refused guarded action notes itself: `authorized()` writes `[lock] <action> authorized` / `refused: no consent`, `LockController` writes unlocks, consents and configurations under the `lock` tag (methods, kinds, counts — never a secret), and each handler writes its action (`[app] summoned: …`, `purged login: …`, `purged all logins (n)`, `settings exported` / `imported (n keys)`; `[passkey] forgot <rpId>`; `[downloads] folder changed` / `mode: …` / `cancelled by user: <id>`). `applySettingsPatch` drops `appLock` from any patch and notes `[ipc] settings:update carried appLock; dropped`: `lock:configure` is the only writer, because the shell's own console is one menu item away in a packaged build and the Lock pane's passcode gate is renderer-side. Enforcement lives in main; the renderer only decides when to ask (`guardActions && lockConfigured`). Restores and Undo are never guarded. The folder change is recorded, not guarded (user decision).

- [x] **Step 2: FEATURES.md**

Replace the **Downloads** row (line 45) with this one line:

```markdown
- **Downloads** — a file a service page downloads is saved silently into the folder from Settings → Downloads (the OS Downloads folder until Choose… picks one; `Use Downloads folder` returns to it; `Always ask` restores the Save dialog; **Open folder** opens the folder itself — the app's one `openPath`, directory-checked), de-duplicated as `name (1).ext`. Completion is a silent native banner (`<file>` / `Saved from <Service>`, service icon) whose click reveals the file — Goetia never opens one — plus the macOS dock bounce; an interrupted download says so; progress rides the dock/taskbar icon. More than 5 page-initiated downloads in 30s fall back to the dialog (the burst cap). The context menu's `Save Image As…` always asks. Settings → Downloads (also `Go ▸ Downloads`, ⌘/Ctrl ⇧ D) lists the **history**, 200 rows kept across launches in `downloads.json` as a `safeStorage`-sealed envelope (plaintext with no keychain, kept untouched and read-only when the keychain will not open it — the pane's band says which), in flight first: a downloading row shows progress and **Cancel**, a saved row reveals on click, a failed one reads `Could not save`, and one whose file has since moved reads `moved or deleted since`. Ended rows carry a checkbox; **Remove from list** and **Clear all…** are guarded actions (the lock's credential when the guard is on; Undo row after), and every removal is a Diagnostics line. A completed banner clicked after the file moved opens the pane. While locked the banner is redacted to the service name and its click only shows the window. Impl: `src/main/downloads.ts`, `src/main/download-history.ts`, `lib/download-rules.ts` (incl. `historyViews`, `historyEvict`, `restoreRecords`, `downloadsSettingLines`), `shared/format.ts`, `views.ts` (`configureSession`, `destroy`, `save-image`), `ipc-handlers.ts` (`downloads:chooseDir`, `downloads:recent`, `downloads:reveal`, `downloads:cancel`, `downloads:remove`, `downloads:clear`, `downloads:restore`, `downloads:openDir`), `renderer/src/components/DownloadsPane.tsx`. Verified: `download-rules.test.ts`, `download-history.test.ts`, `downloads.test.ts`, `format.test.ts`, `shortcuts.test.ts`, `settings.test.ts`, `ipc-sender-policy.test.ts`, `lock-ipc-policy.test.ts`, e2e `downloads.spec.ts` (incl. the history surviving a relaunch and the guard in front of Remove); the banner, bounce, taskbar progress and Open folder are Manual.
```

In the **Settings → Diagnostics** row (line 76), extend the parenthesised tag list that ends with `` `[downloads]` `` so it also names `` `[lock]` `` (unlocks, consents granted and refused, configurations — methods, kinds and counts only), and extend the "plus runtime transitions it never logged before:" list with the guarded actions' own lines: `` `[app] summoned` `` / `` `purged login` `` / `` `purged all logins` `` / `` `settings exported|imported` ``, `` `[passkey] forgot <rpId>` ``, `` `[downloads] history: removed|restored n rows` `` / `` `history cleared` `` / `` `folder changed` `` / `` `mode: …` `` / `` `cancelled by user` ``, and `` `[ipc] settings:update carried appLock; dropped` ``.

After the **Pins sealed at rest** row (line 81) add this one line:

```markdown
- **Guarded actions, recorded** — with the app lock configured and `Ask before summoning a service, purging a login or removing download history` on (default), summon, both purges, forgetting a passkey and removing or clearing download history need the lock's credential even while unlocked: a one-shot consent minted by `lock:confirm`, bound to the exact action (service, or id set), spent once in main by `authorized()`; Touch ID accepted, 60s TTL, dropped on lock. Every grant, refusal and performed action is a Diagnostics line, so someone at an unlocked laptop cannot act without leaving a trace or erase the trace without the credential. `settings:update` drops `appLock` — `lock:configure` is its only writer — closing the shell-console bypass. Undo and restore are never guarded; the download folder change is recorded, not guarded. Impl: `shared/lock.ts`, `main/lock.ts`, `lib/guard-policy.ts`, `ipc-handlers.ts` (`authorized`, `applySettingsPatch`), `CredentialConfirm.tsx`, `PurgeConfirm.tsx`, `SummonConfirm.tsx`, `DownloadsPane.tsx`, `PasskeysPane.tsx`. Verified: `lock-consent.test.ts`, `lock-controller.test.ts`, `guard-policy.test.ts`, `summoned-ids.test.ts`, e2e `guarded-actions.spec.ts`, `downloads.spec.ts`, `lock.spec.ts`, `passkeys.spec.ts`.
```

- [x] **Step 3: Superseded notes in the two earlier specs**

In `docs/superpowers/specs/2026-09-23-downloads-pane-design.md`, append to the end of the **In memory, this session only.** decision bullet (same line):

```markdown
 Superseded 2026-09-23 (same day, user decision): history persists across launches, sealed, at 200 rows, and removing rows is a guarded action — `2026-09-23-download-history-design.md`.
```

Append to the end of the **One action per row, and never Open.** bullet (same line):

```markdown
 Superseded 2026-09-23: the row's body is the reveal, ended rows carry a checkbox, Remove and Clear all exist and are guarded — same spec. Never Open stands.
```

In `docs/superpowers/specs/2026-09-13-guarded-actions-design.md`, add a paragraph after the Decisions list:

```markdown
Amended 2026-09-23 (`2026-09-23-download-history-design.md`): the set grew to `downloads-remove` (bound to the exact ids), `downloads-clear` and `passkey-forget` (bound to the id); every guarded action, grant and refusal is recorded in Diagnostics under a `lock` tag; and `settings:update` drops `appLock`, closing the shell-console bypass the audit found.
```

- [x] **Step 4: The spec's own testing bullets**

In `docs/superpowers/specs/2026-09-23-download-history-design.md`:

- In the `tests/e2e/downloads.spec.ts` bullet, replace the clause `clicking a saved row's body fires the reveal;` with:

```markdown
a saved row's body carries the reveal control (the click itself is unit-tested against `deps.reveal`, since an e2e click would open Finder on the test machine);
```

- Replace the bullet that begins `` - `tests/unit/guarded-handlers.test.ts` (new) — `` with: `` - `tests/unit/guard-policy.test.ts` — `normalizeRemoveIds`, `normalizeAction` and `stripAppLock` (the handlers' decisions, extracted because vitest has no electron mock; the handler wiring is verified by typecheck and the e2e specs). ``
- Replace the `tests/e2e/passkeys.spec.ts` bullet's text with `under the guard, Forget asks before it forgets, on the passkey the first test mints live.`

- [x] **Step 5: Lint the markdown**

Run: `npx --no-install markdownlint-cli2 CLAUDE.md docs/FEATURES.md docs/superpowers/specs/2026-09-23-downloads-pane-design.md docs/superpowers/specs/2026-09-13-guarded-actions-design.md docs/superpowers/specs/2026-09-23-download-history-design.md docs/superpowers/plans/2026-09-23-download-history.md`
Expected: `Summary: 0 issues`. Ask the user to run `/grimoire-core:commit` — suggested subject `docs: download history, guarded-action record, appLock rule`.

---

### Task 11: Full verification

- [x] **Step 1: The whole suite**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`
Expected: every command green. A reorder or restart e2e that fails only under the full run is re-run alone before it is called a regression (known flake under load).

- [x] **Step 2: Manual pass (record the outcome in the final report)**

In `env -u ELECTRON_RUN_AS_NODE corepack pnpm dev`: Open folder opens Finder on the folder; with a lock and Touch ID, Remove offers the Touch ID button and a touch removes the row; Settings → Diagnostics shows the `lock` chip and its lines; Settings → Passkeys → Forget asks under the guard (needs a passkey minted live).

- [x] **Step 3: Report**

State what passed with the command output, what was manual and its result, and that every commit is the user's to make with `/grimoire-core:commit`.
