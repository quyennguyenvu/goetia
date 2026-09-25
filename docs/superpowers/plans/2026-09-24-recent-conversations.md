# Recent Conversations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ⌘K's Recent section the conversations the user opened (persisted sealed), and make `⌘/Ctrl ⇧ ]` / `⌘/Ctrl ⇧ [` walk that list instead of unread banners.

**Architecture:** The recipe runner in the service preload reports the conversation on screen (`conversation:active`) only while its document has focus and only on change. Main accepts a report solely for the active, focused, overlay-free service, derives the row label main-side, and upserts a `safeStorage`-sealed `RecentsStore` (`recents.json`). The switcher reads `recents:list` and opens through `recents:open`, which runs the existing banner tail (`resolveBannerClick` → `performBannerAction`). The chords walk a snapshot of that list (`lib/recents-walk.ts`). The banner-fed `ActivityLog` stays for banner clicks only.

**Tech Stack:** TypeScript, Electron, React, Vitest (happy-dom for the runner test), Playwright-Electron, `conf` for the store file.

Spec: `docs/superpowers/specs/2026-09-24-recent-conversations-design.md`.

## Global Constraints

- Gates after every task: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`. At the end also `corepack pnpm build` then `env -u ELECTRON_RUN_AS_NODE npx playwright test tests/e2e/shortcuts.spec.ts tests/e2e/smoke.spec.ts --reporter=line`, and a `package:mac` live check.
- No commits from the plan; the user commits through `/commit`. Never stage, commit or remove files through git from a task. Delete files with `rm`.
- `src/shared/**` imports nothing from `electron` or the DOM. The renderer imports nothing from `src/main`.
- Constants, exactly: `RECENTS_CAP = 50`, `RECENT_LABEL_MAX = 80`, `RECENT_URL_MAX = 2048`, `RECENT_TITLE_MAX = 512`, `WALK_TIMEOUT_MS = 4_000`. Store file: `recents.json`, keys `{ sealed }` or `{ recents }`.
- Channels, exactly: `conversation:active` (service send, validated on `serviceId`), `recents:list` (shell-only invoke), `recents:open` (shell-only send). `activity:recent` and `activity:open` are removed.
- Shortcut table keys become `nextConversation` / `prevConversation`; labels, verbatim: `Next Conversation`, `Previous Conversation`. Settings → Shortcuts row description, verbatim: `next / previous conversation — down / up the Recent list`.
- Switcher band copy, verbatim. Unreadable: `Goetia cannot read its recent conversations on this device. The file is sealed to a keychain this launch cannot open; it is kept as it is, and conversations you open this session are not being recorded.` Plain: `Recent conversations are kept unencrypted on this device. The OS keychain is unavailable.`
- Diagnostics tag `recents`; lines carry states only, never a label or URL.
- Comments explain why, not what; match the surrounding density.

---

### Task 1: Pure rules for a Recent row

**Files:**

- Create: `src/main/lib/recents-rules.ts`
- Modify: `src/shared/types.ts` (add `RecentView`, `RecentsStorage` after `DownloadStorage`)
- Test: `tests/unit/recents-rules.test.ts`

**Interfaces:**

- Consumes: `conversationFromTitle(title, serviceName)` from `src/main/lib/pin-rules.ts`; `ServiceId`, `DownloadStorage` from `src/shared/types.ts`.
- Produces: `RecentEntry`, `RECENTS_CAP`, `RECENT_LABEL_MAX`, `RECENT_URL_MAX`, `RECENT_TITLE_MAX`, `RawReport`, `CleanReport`, `sanitizeReport(raw): CleanReport | null`, `acceptReport(input): boolean`, `recentLabel(input): { label: string; conversation?: string } | null`, `conversationKey(e): string`, `upsertRecent(rows, sighting, nextId): RecentEntry[]`, `restoreRecents(raw, known): RecentEntry[]`, `recentRows(rows, onScreenKey): RecentView[]`; `RecentView`, `RecentsStorage` in `src/shared/types.ts`.

- [ ] **Step 1: Add the shared types**

In `src/shared/types.ts`, directly after the `DownloadStorage` type:

```ts
/** How recents.json rests — the three states downloads.json has. */
export type RecentsStorage = DownloadStorage;

/** What the switcher renders per recent conversation. Hrefless like PinView:
 *  the URL stays in main and is re-validated at open time. */
export interface RecentView {
  id: number;
  serviceId: ServiceId;
  /** the conversation's label — the row's text and the search haystack */
  title: string;
  /** last time it was on screen */
  at: number;
}
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import {
  acceptReport,
  conversationKey,
  RECENT_LABEL_MAX,
  RECENTS_CAP,
  type RecentEntry,
  recentLabel,
  recentRows,
  restoreRecents,
  sanitizeReport,
  upsertRecent,
} from '../../src/main/lib/recents-rules';

const entry = (n: number, over: Partial<RecentEntry> = {}): RecentEntry => ({
  id: n,
  serviceId: 'whatsapp',
  label: `chat ${n}`,
  url: 'https://web.whatsapp.com/',
  at: n,
  ...over,
});

describe('sanitizeReport', () => {
  it('type-checks, strips control characters, collapses whitespace and clips', () => {
    expect(
      sanitizeReport({ conversation: ' Minh\u0000 Anh ', url: 'https://web.whatsapp.com/', title: 'x\ny' }),
    ).toEqual({ conversation: 'Minh Anh', url: 'https://web.whatsapp.com/', title: 'x y' });
    expect(sanitizeReport({ conversation: 42, url: 'https://a.b/', title: null })).toEqual({
      conversation: null,
      url: 'https://a.b/',
      title: '',
    });
    const long = 'a'.repeat(200);
    expect(sanitizeReport({ conversation: long, url: 'https://a.b/', title: '' })?.conversation).toHaveLength(
      RECENT_LABEL_MAX,
    );
  });

  it('is null without a URL that parses', () => {
    expect(sanitizeReport({ conversation: 'x', url: 'nope', title: 'x' })).toBeNull();
    expect(sanitizeReport({ conversation: 'x', url: 7, title: 'x' })).toBeNull();
  });
});

describe('acceptReport', () => {
  const ok = {
    serviceId: 'whatsapp' as const,
    activeId: 'whatsapp' as const,
    overlayOpen: false,
    windowFocused: true,
    disabled: false,
  };
  it('accepts only the active, enabled service with no overlay and a focused window', () => {
    expect(acceptReport(ok)).toBe(true);
    expect(acceptReport({ ...ok, activeId: 'discord' })).toBe(false);
    expect(acceptReport({ ...ok, overlayOpen: true })).toBe(false);
    expect(acceptReport({ ...ok, windowFocused: false })).toBe(false);
    expect(acceptReport({ ...ok, disabled: true })).toBe(false);
  });
});

describe('recentLabel', () => {
  it('prefers the recipe hook name and keeps it as the name lane', () => {
    expect(
      recentLabel({
        conversation: 'Minh Anh',
        title: 'WhatsApp',
        url: 'https://web.whatsapp.com/',
        serviceUrl: 'https://web.whatsapp.com/',
        serviceName: 'WhatsApp',
      }),
    ).toEqual({ label: 'Minh Anh', conversation: 'Minh Anh' });
  });

  it('falls back to the title with the brand peeled, and no name lane', () => {
    const r = recentLabel({
      conversation: null,
      title: '(2) Discord | #release | Ticketbox',
      url: 'https://discord.com/channels/1/2',
      serviceUrl: 'https://discord.com/channels/@me',
      serviceName: 'Discord',
    });
    expect(r).toEqual({ label: '#release | Ticketbox' });
    expect(r && 'conversation' in r).toBe(false);
  });

  it("is null on the service's landing URL without a hook name, whatever the title", () => {
    expect(
      recentLabel({
        conversation: null,
        title: 'Discord | Friends',
        url: 'https://discord.com/channels/@me',
        serviceUrl: 'https://discord.com/channels/@me',
        serviceName: 'Discord',
      }),
    ).toBeNull();
    // trailing slash and query do not make the landing page a conversation
    expect(
      recentLabel({
        conversation: null,
        title: 'Something',
        url: 'https://web.whatsapp.com?x=1',
        serviceUrl: 'https://web.whatsapp.com/',
        serviceName: 'WhatsApp',
      }),
    ).toBeNull();
  });

  it('is null when the title names nothing beyond the brand', () => {
    expect(
      recentLabel({
        conversation: null,
        title: 'WhatsApp',
        url: 'https://web.whatsapp.com/x',
        serviceUrl: 'https://web.whatsapp.com/',
        serviceName: 'WhatsApp',
      }),
    ).toBeNull();
  });
});

describe('upsertRecent', () => {
  const sighting = (label: string, at: number, url = 'https://web.whatsapp.com/') => ({
    serviceId: 'whatsapp' as const,
    label,
    url,
    at,
  });

  it('puts a new sighting on top with a fresh id', () => {
    let n = 10;
    const rows = upsertRecent([entry(1), entry(2)], sighting('new', 9), () => n++);
    expect(rows.map((r) => r.label)).toEqual(['new', 'chat 1', 'chat 2']);
    expect(rows[0].id).toBe(10);
  });

  it('moves a known conversation to the top, keeps its id, refreshes url and at', () => {
    const rows = upsertRecent(
      [entry(1), entry(2, { url: 'https://discord.com/channels/1/2', serviceId: 'discord' })],
      { serviceId: 'discord', label: 'chat 2', url: 'https://discord.com/channels/1/2/3', at: 99 },
      () => 77,
    );
    expect(rows.map((r) => r.id)).toEqual([2, 1]);
    expect(rows[0].url).toBe('https://discord.com/channels/1/2/3');
    expect(rows[0].at).toBe(99);
  });

  it('keys on service plus label: one label on two services is two rows', () => {
    const rows = upsertRecent([entry(1, { label: 'Mẹ' })], { ...sighting('Mẹ', 5), serviceId: 'zalo' }, () => 2);
    expect(rows).toHaveLength(2);
  });

  it('drops the oldest past RECENTS_CAP', () => {
    let rows: RecentEntry[] = [];
    let n = 1;
    for (let i = 1; i <= RECENTS_CAP + 3; i++) rows = upsertRecent(rows, sighting(`c${i}`, i), () => n++);
    expect(rows).toHaveLength(RECENTS_CAP);
    expect(rows[0].label).toBe(`c${RECENTS_CAP + 3}`);
    expect(rows.at(-1)?.label).toBe('c4');
  });
});

describe('restoreRecents', () => {
  const known = new Set(['whatsapp', 'discord']);

  it('keeps well-formed rows newest first and drops the rest', () => {
    const rows = restoreRecents(
      [
        entry(1, { at: 5 }),
        entry(2, { serviceId: 'nope' as never }),
        { ...entry(3), label: '' },
        { ...entry(4), id: 'x' },
        entry(1, { at: 6 }), // repeated id
        entry(5, { at: 9, conversation: 'chat 5' }),
        'junk',
      ],
      known,
    );
    expect(rows.map((r) => r.id)).toEqual([5, 1]);
    expect(rows[0].conversation).toBe('chat 5');
    expect('conversation' in rows[1]).toBe(false);
  });

  it('is empty for anything but an array', () => {
    expect(restoreRecents(undefined, known)).toEqual([]);
    expect(restoreRecents({ id: 1 }, known)).toEqual([]);
  });

  it('caps at RECENTS_CAP newest', () => {
    const raw = Array.from({ length: RECENTS_CAP + 5 }, (_, i) => entry(i + 1, { at: i + 1 }));
    const rows = restoreRecents(raw, known);
    expect(rows).toHaveLength(RECENTS_CAP);
    expect(rows[0].id).toBe(RECENTS_CAP + 5);
  });
});

describe('recentRows', () => {
  it('is hrefless, keeps order, and leaves the on-screen conversation out', () => {
    const rows = [entry(3, { at: 3 }), entry(2, { at: 2 }), entry(1, { at: 1 })];
    const view = recentRows(rows, conversationKey(rows[0]));
    expect(view.map((r) => r.id)).toEqual([2, 1]);
    expect(view[0]).toEqual({ id: 2, serviceId: 'whatsapp', title: 'chat 2', at: 2 });
    expect('url' in view[0]).toBe(false);
    expect(recentRows(rows, null)).toHaveLength(3);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/recents-rules.test.ts`
Expected: FAIL — cannot resolve `../../src/main/lib/recents-rules`.

- [ ] **Step 4: Write the rules module**

`src/main/lib/recents-rules.ts`:

```ts
import type { RecentView, ServiceId } from '../../shared/types';
import { conversationFromTitle } from './pin-rules';

/** One conversation the user had on screen. `label` is the row and the
 *  dedupe key; `conversation` is kept apart because it is the one string a
 *  recipe's openConversation can match — absent when the label came from
 *  the page title. `url` is page data until open time validates it. */
export interface RecentEntry {
  id: number;
  serviceId: ServiceId;
  label: string;
  conversation?: string;
  url: string;
  at: number;
}

export const RECENTS_CAP = 50;
/** PIN_CONVERSATION_MAX: the same kind of string, the same bound */
export const RECENT_LABEL_MAX = 80;
export const RECENT_URL_MAX = 2048;
/** the title is clipped before peeling so a brand suffix survives the cut */
export const RECENT_TITLE_MAX = 512;

/** conversation:active as main first sees it — every field page-shaped. */
export interface RawReport {
  conversation: unknown;
  url: unknown;
  title: unknown;
}

export interface CleanReport {
  conversation: string | null;
  url: string;
  title: string;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
const CONTROL = /[\u0000-\u001f\u007f]/g;

const clean = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';

/** Type-check and clip every field; null when the URL is missing or does not
 *  parse — there is nothing to hold a row against then. */
export function sanitizeReport(raw: RawReport): CleanReport | null {
  const url = typeof raw.url === 'string' ? raw.url.slice(0, RECENT_URL_MAX) : '';
  try {
    new URL(url);
  } catch {
    return null;
  }
  const conversation = clean(raw.conversation, RECENT_LABEL_MAX);
  return {
    conversation: conversation === '' ? null : conversation,
    url,
    title: clean(raw.title, RECENT_TITLE_MAX),
  };
}

/** A report counts only from the service on screen. The preload's own focus
 *  check runs in a world the page shares, so this is what keeps a hidden or
 *  hostile page from writing rows the user never looked at. */
export function acceptReport(input: {
  serviceId: ServiceId;
  activeId: ServiceId;
  overlayOpen: boolean;
  windowFocused: boolean;
  disabled: boolean;
}): boolean {
  return (
    input.serviceId === input.activeId &&
    !input.overlayOpen &&
    input.windowFocused &&
    !input.disabled
  );
}

function sameUrl(a: string, b: string): boolean {
  try {
    const x = new URL(a);
    const y = new URL(b);
    const path = (u: URL) => u.pathname.replace(/\/$/, '') + u.hash;
    return x.origin === y.origin && path(x) === path(y);
  } catch {
    return false;
  }
}

/** The row's label, or null when the sighting is not a conversation: no hook
 *  name and either the service's own landing page (Discord's Friends,
 *  WhatsApp's empty list) or a title that names nothing beyond the brand. */
export function recentLabel(input: {
  conversation: string | null;
  title: string;
  url: string;
  serviceUrl: string;
  serviceName: string;
}): { label: string; conversation?: string } | null {
  if (input.conversation) return { label: input.conversation, conversation: input.conversation };
  if (sameUrl(input.url, input.serviceUrl)) return null;
  const label = conversationFromTitle(input.title, input.serviceName).slice(0, RECENT_LABEL_MAX);
  return label === '' ? null : { label };
}

export const conversationKey = (e: Pick<RecentEntry, 'serviceId' | 'label'>): string =>
  `${e.serviceId}\n${e.label}`;

/** Newest first. A known conversation moves to the top with its id kept;
 *  past RECENTS_CAP the oldest row goes. */
export function upsertRecent(
  rows: readonly RecentEntry[],
  sighting: Omit<RecentEntry, 'id'>,
  nextId: () => number,
): RecentEntry[] {
  const key = conversationKey(sighting);
  const prev = rows.find((r) => conversationKey(r) === key);
  const entry: RecentEntry = { ...sighting, id: prev?.id ?? nextId() };
  return [entry, ...rows.filter((r) => conversationKey(r) !== key)].slice(0, RECENTS_CAP);
}

/** Rows from disk: a known service, a non-empty string label, a string url,
 *  a finite `at`, a safe-integer id seen once; RECENTS_CAP newest kept. */
export function restoreRecents(raw: unknown, known: ReadonlySet<string>): RecentEntry[] {
  if (!Array.isArray(raw)) return [];
  const kept: RecentEntry[] = [];
  const seen = new Set<number>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const id = r.id;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1 || seen.has(id)) continue;
    if (typeof r.serviceId !== 'string' || !known.has(r.serviceId)) continue;
    if (typeof r.label !== 'string' || r.label === '' || typeof r.url !== 'string') continue;
    if (typeof r.at !== 'number' || !Number.isFinite(r.at)) continue;
    seen.add(id);
    kept.push({
      id,
      serviceId: r.serviceId as ServiceId,
      label: r.label.slice(0, RECENT_LABEL_MAX),
      ...(typeof r.conversation === 'string' && r.conversation !== ''
        ? { conversation: r.conversation.slice(0, RECENT_LABEL_MAX) }
        : {}),
      url: r.url.slice(0, RECENT_URL_MAX),
      at: r.at,
    });
  }
  return kept.sort((a, b) => b.at - a.at).slice(0, RECENTS_CAP);
}

/** What the switcher gets: hrefless, newest first, the conversation on
 *  screen left out — Enter on it would go nowhere. */
export function recentRows(rows: readonly RecentEntry[], onScreenKey: string | null): RecentView[] {
  return rows
    .filter((r) => onScreenKey === null || conversationKey(r) !== onScreenKey)
    .map((r) => ({ id: r.id, serviceId: r.serviceId, title: r.label, at: r.at }));
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/recents-rules.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 6: Gates**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: all green. If biome rejects the `biome-ignore` comment placement, move it to the line directly above `const CONTROL`.

---

### Task 2: The sealed store

**Files:**

- Create: `src/main/recents.ts`
- Test: `tests/unit/recents-store.test.ts`

**Interfaces:**

- Consumes: `KeyCodec` from `src/main/codec.ts`; `RecentEntry`, `restoreRecents`, `upsertRecent` from Task 1; `SERVICES` from `src/shared/services.ts`; `RecentsStorage`, `ServiceId` from `src/shared/types.ts`.
- Produces: `class RecentsStore { constructor(cwd: string, codec: KeyCodec | null); rows(): RecentEntry[]; get(id: number): RecentEntry | undefined; storage(): RecentsStorage; upsert(sighting: Omit<RecentEntry, 'id'>): boolean; clear(id: ServiceId): void }`.

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { KeyCodec } from '../../src/main/codec';
import type { RecentEntry } from '../../src/main/lib/recents-rules';
import { RecentsStore } from '../../src/main/recents';

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

const sighting = (label: string, at: number, serviceId: RecentEntry['serviceId'] = 'whatsapp') => ({
  serviceId,
  label,
  conversation: label,
  url: 'https://web.whatsapp.com/',
  at,
});

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'goetia-recents-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const file = () => readFileSync(join(dir, 'recents.json'), 'utf8');

describe('RecentsStore', () => {
  it('starts empty on a fresh profile and writes nothing until asked', () => {
    const store = new RecentsStore(dir, codec);
    expect(store.rows()).toEqual([]);
    expect(store.storage()).toBe('sealed');
    expect(() => file()).toThrow();
  });

  it('seals with a codec: the file names no chat in clear, and a fresh store reads it back', () => {
    const store = new RecentsStore(dir, codec);
    expect(store.upsert(sighting('Minh Anh', 1))).toBe(true);
    store.upsert(sighting('Nhóm Sale', 2));
    const raw = file();
    expect(raw).toContain('"sealed"');
    expect(raw).not.toContain('Minh Anh');
    const again = new RecentsStore(dir, codec);
    expect(again.rows().map((r) => r.label)).toEqual(['Nhóm Sale', 'Minh Anh']);
    expect(again.get(again.rows()[1].id)?.conversation).toBe('Minh Anh');
  });

  it('continues ids after a reload, so a row never inherits another row id', () => {
    const store = new RecentsStore(dir, codec);
    store.upsert(sighting('a', 1));
    store.upsert(sighting('b', 2));
    const again = new RecentsStore(dir, codec);
    again.upsert(sighting('c', 3));
    const ids = again.rows().map((r) => r.id);
    expect(new Set(ids).size).toBe(3);
    expect(Math.max(...ids)).toBe(3);
  });

  it('writes plaintext with no keychain and says so', () => {
    const store = new RecentsStore(dir, null);
    expect(store.storage()).toBe('plain');
    store.upsert(sighting('a', 1));
    expect(JSON.parse(file())).toEqual({ recents: [{ id: 1, ...sighting('a', 1) }] });
  });

  it('re-seals a plaintext file on a launch that has a keychain', () => {
    writeFileSync(join(dir, 'recents.json'), JSON.stringify({ recents: [{ id: 1, ...sighting('a', 1) }] }));
    const store = new RecentsStore(dir, codec);
    expect(store.rows().map((r) => r.label)).toEqual(['a']);
    expect(file()).toContain('"sealed"');
    expect(file()).not.toContain('"label"');
  });

  it('keeps a sealed file it cannot open: reads nothing, writes nothing, reports unreadable', () => {
    new RecentsStore(dir, codec).upsert(sighting('a', 1));
    const before = file();
    const store = new RecentsStore(dir, denied);
    expect(store.storage()).toBe('unreadable');
    expect(store.rows()).toEqual([]);
    expect(store.upsert(sighting('b', 2))).toBe(false);
    store.clear('whatsapp');
    expect(file()).toBe(before);
    expect(new RecentsStore(dir, codec).rows().map((r) => r.label)).toEqual(['a']);
  });

  it('treats a sealed file with no keychain at all as unreadable', () => {
    new RecentsStore(dir, codec).upsert(sighting('a', 1));
    const store = new RecentsStore(dir, null);
    expect(store.storage()).toBe('unreadable');
    expect(store.rows()).toEqual([]);
  });

  it('clears one service and leaves the others', () => {
    const store = new RecentsStore(dir, codec);
    store.upsert(sighting('a', 1));
    store.upsert(sighting('b', 2, 'zalo'));
    store.clear('whatsapp');
    expect(store.rows().map((r) => r.label)).toEqual(['b']);
    expect(new RecentsStore(dir, codec).rows().map((r) => r.label)).toEqual(['b']);
  });

  it('survives a corrupt file as an empty list', () => {
    writeFileSync(join(dir, 'recents.json'), '{not json');
    const store = new RecentsStore(dir, codec);
    expect(store.rows()).toEqual([]);
    expect(store.storage()).toBe('sealed');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/recents-store.test.ts`
Expected: FAIL — cannot resolve `../../src/main/recents`.

- [ ] **Step 3: Write the store**

`src/main/recents.ts`:

```ts
import Conf from 'conf';
import { SERVICES } from '../shared/services';
import type { RecentsStorage, ServiceId } from '../shared/types';
import type { KeyCodec } from './codec';
import { type RecentEntry, restoreRecents, upsertRecent } from './lib/recents-rules';

/** On disk: one of the two keys, or neither on a fresh profile. `sealed` is
 *  the codec's output over JSON.stringify({ recents }); `recents` is the
 *  plaintext written when no keychain is available. */
interface RecentsFile {
  sealed?: string;
  recents?: RecentEntry[];
}

/** ⌘K's Recent at rest, <cwd>/recents.json. Conversation labels are the
 *  content the pins decision sealed, so this is PinStore's shape: a
 *  safeStorage envelope, plaintext only with no keychain, and a sealed file
 *  this launch cannot open is kept untouched — read as empty, never written —
 *  so the next launch that can read it gets it back. */
export class RecentsStore {
  private conf: Conf<RecentsFile>;
  private entries: RecentEntry[] = [];
  private unreadable = false;
  private nextId = 1;

  constructor(
    cwd: string,
    private codec: KeyCodec | null,
  ) {
    this.conf = new Conf<RecentsFile>({
      cwd,
      configName: 'recents',
      // no `recents: []` default: it would make a fresh profile look like a
      // legacy file and write an empty envelope at every first boot
      defaults: {},
      clearInvalidConfig: true,
    });
    const known = new Set<string>(SERVICES.map((s) => s.id));
    const raw = this.conf.store;
    if (typeof raw.sealed === 'string') {
      try {
        if (!codec) throw new Error('sealed file, no keychain');
        const opened: unknown = JSON.parse(codec.decrypt(raw.sealed));
        this.entries = restoreRecents((opened as { recents?: unknown } | null)?.recents, known);
      } catch {
        this.unreadable = true;
      }
    } else if (Array.isArray(raw.recents)) {
      this.entries = restoreRecents(raw.recents, known);
      // migrate: the plaintext leaves the disk now, not on the next sighting
      if (codec) this.write();
    }
    this.nextId = this.entries.reduce((m, e) => Math.max(m, e.id), 0) + 1;
  }

  rows(): RecentEntry[] {
    return [...this.entries];
  }

  get(id: number): RecentEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  storage(): RecentsStorage {
    if (this.unreadable) return 'unreadable';
    return this.codec ? 'sealed' : 'plain';
  }

  /** The conversation moves to the top. False while unreadable: never
   *  overwrite what could not be read. */
  upsert(sighting: Omit<RecentEntry, 'id'>): boolean {
    if (this.unreadable) return false;
    this.entries = upsertRecent(this.entries, sighting, () => this.nextId++);
    this.write();
    return true;
  }

  /** A purge wipes the session these labels came from. */
  clear(id: ServiceId): void {
    if (this.unreadable) return;
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.serviceId !== id);
    if (this.entries.length !== before) this.write();
  }

  private write(): void {
    // assigning the store is one atomic write, same as SettingsStore
    this.conf.store = this.codec
      ? { sealed: this.codec.encrypt(JSON.stringify({ recents: this.entries })) }
      : { recents: [...this.entries] };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/recents-store.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Gates**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: all green.

---

### Task 3: The walk rules

**Files:**

- Create: `src/main/lib/recents-walk.ts`
- Test: `tests/unit/recents-walk.test.ts`

**Interfaces:**

- Consumes: `RecentEntry`, `conversationKey` from Task 1; `ServiceId`.
- Produces: `Walk { keys: string[]; cursor: string | null; deadline: number }`, `WALK_TIMEOUT_MS`, `walkTargets(rows, enabled): string[]`, `beginWalk(keys, onScreenKey, now): Walk`, `nextTarget(targets, cursor, step): string | null`, `stepWalk(walk, step, now): { walk: Walk; target: string | null }`, `walkActive(walk, now): walk is Walk`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { conversationKey, type RecentEntry } from '../../src/main/lib/recents-rules';
import {
  beginWalk,
  nextTarget,
  stepWalk,
  WALK_TIMEOUT_MS,
  walkActive,
  walkTargets,
} from '../../src/main/lib/recents-walk';

const row = (id: number, label: string, serviceId: RecentEntry['serviceId'] = 'whatsapp'): RecentEntry => ({
  id,
  serviceId,
  label,
  url: 'https://web.whatsapp.com/',
  at: 100 - id,
});
// newest first, as the store hands them out
const rows = [row(1, 'A'), row(2, 'B', 'discord'), row(3, 'C')];
const [A, B, C] = rows.map(conversationKey);
const T = 1_760_000_000_000;

describe('walkTargets', () => {
  it('keeps ⌘K order and skips disabled services', () => {
    expect(walkTargets(rows, () => true)).toEqual([A, B, C]);
    expect(walkTargets(rows, (id) => id !== 'discord')).toEqual([A, C]);
  });
});

describe('beginWalk', () => {
  it('anchors on the on-screen row when it is listed, else starts off any row', () => {
    expect(beginWalk([A, B, C], B, T)).toEqual({ keys: [A, B, C], cursor: B, deadline: T + WALK_TIMEOUT_MS });
    expect(beginWalk([A, B, C], null, T).cursor).toBeNull();
    // an on-screen conversation the store has not recorded yet is not listed
    expect(beginWalk([A, B, C], 'zalo\nX', T).cursor).toBeNull();
  });
});

describe('nextTarget', () => {
  it('starts at the newest going down and at the oldest going up', () => {
    expect(nextTarget([A, B, C], null, 1)).toBe(A);
    expect(nextTarget([A, B, C], null, -1)).toBe(C);
  });

  it('steps from the cursor and wraps at both ends', () => {
    expect(nextTarget([A, B, C], A, 1)).toBe(B);
    expect(nextTarget([A, B, C], C, 1)).toBe(A);
    expect(nextTarget([A, B, C], A, -1)).toBe(C);
  });

  it('restarts when the cursor is no longer a target', () => {
    expect(nextTarget([A, B, C], 'gone', 1)).toBe(A);
  });

  it('is null with no targets, and with only the cursor itself left', () => {
    expect(nextTarget([], null, 1)).toBeNull();
    expect(nextTarget([A], A, 1)).toBeNull();
    expect(nextTarget([A], null, 1)).toBe(A);
  });
});

describe('stepWalk', () => {
  it('walks the snapshot, not the live order: A → B → C → A, and back', () => {
    let w = beginWalk([A, B, C], A, T);
    let s = stepWalk(w, 1, T + 100);
    expect(s.target).toBe(B);
    w = s.walk;
    s = stepWalk(w, 1, T + 200); // B moved to the top meanwhile; the snapshot still says C is next
    expect(s.target).toBe(C);
    w = s.walk;
    s = stepWalk(w, 1, T + 300);
    expect(s.target).toBe(A);
    s = stepWalk(s.walk, -1, T + 400);
    expect(s.target).toBe(C);
  });

  it('re-arms the deadline on every press and moves the cursor to the target', () => {
    const s = stepWalk(beginWalk([A, B], A, T), 1, T + 3_000);
    expect(s.walk.cursor).toBe(B);
    expect(s.walk.deadline).toBe(T + 3_000 + WALK_TIMEOUT_MS);
  });

  it('from Home opens the newest row going down and the oldest going up', () => {
    expect(stepWalk(beginWalk([A, B, C], null, T), 1, T).target).toBe(A);
    expect(stepWalk(beginWalk([A, B, C], null, T), -1, T).target).toBe(C);
  });

  it('has nowhere to go with one row that is the one on screen, and keeps the cursor', () => {
    const s = stepWalk(beginWalk([A], A, T), 1, T);
    expect(s.target).toBeNull();
    expect(s.walk.cursor).toBe(A);
  });
});

describe('walkActive', () => {
  it('is true until the deadline, and false for no walk', () => {
    const w = beginWalk([A], null, T);
    expect(walkActive(w, T + WALK_TIMEOUT_MS - 1)).toBe(true);
    expect(walkActive(w, T + WALK_TIMEOUT_MS)).toBe(false);
    expect(walkActive(null, T)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/recents-walk.test.ts`
Expected: FAIL — cannot resolve `../../src/main/lib/recents-walk`.

- [ ] **Step 3: Write the walk module**

`src/main/lib/recents-walk.ts`:

```ts
import type { ServiceId } from '../../shared/types';
import { conversationKey, type RecentEntry } from './recents-rules';

/** ⌘⇧] / ⌘⇧[ walking ⌘K's Recent list. The keys are a snapshot: the row a
 *  press opens moves to the top of the live list, and stepping over the live
 *  order would make the second press land back where the first started. */
export interface Walk {
  /** row keys in ⌘K order at the first press, enabled services only */
  keys: string[];
  /** where the last press landed; null when the walk began off any row */
  cursor: string | null;
  /** past this the walk is over and the next press starts fresh */
  deadline: number;
}

/** Long enough to glance at a stop and keep going; short enough that a later
 *  lone press reads as "switch back" from the live order. */
export const WALK_TIMEOUT_MS = 4_000;

export function walkTargets(
  rows: readonly RecentEntry[],
  enabled: (id: ServiceId) => boolean,
): string[] {
  return rows.filter((r) => enabled(r.serviceId)).map(conversationKey);
}

/** Anchored on the on-screen row when it is listed; an on-screen conversation
 *  the store has not recorded yet is not in the list, so nothing to skip. */
export function beginWalk(keys: string[], onScreenKey: string | null, now: number): Walk {
  const cursor = onScreenKey !== null && keys.includes(onScreenKey) ? onScreenKey : null;
  return { keys, cursor, deadline: now + WALK_TIMEOUT_MS };
}

/** The key after (step 1, older) or before (step -1, newer) the cursor,
 *  wrapping. No cursor, or one no longer listed, starts at the first going
 *  down and the last going up. A lone target that is the cursor itself is
 *  nothing to jump to. */
export function nextTarget(
  targets: readonly string[],
  cursor: string | null,
  step: 1 | -1,
): string | null {
  const n = targets.length;
  if (n === 0) return null;
  const at = cursor === null ? -1 : targets.indexOf(cursor);
  if (at < 0) return step > 0 ? targets[0] : targets[n - 1];
  if (n === 1) return null;
  return targets[(at + step + n) % n];
}

/** One press: what to open, and the walk as it stands afterwards. */
export function stepWalk(
  walk: Walk,
  step: 1 | -1,
  now: number,
): { walk: Walk; target: string | null } {
  const target = nextTarget(walk.keys, walk.cursor, step);
  return {
    walk: { ...walk, cursor: target ?? walk.cursor, deadline: now + WALK_TIMEOUT_MS },
    target,
  };
}

export function walkActive(walk: Walk | null, now: number): walk is Walk {
  return walk !== null && now < walk.deadline;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/recents-walk.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Gates**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: all green.

---

### Task 4: The runner reports the conversation on screen

**Files:**

- Modify: `src/preload/recipes/runner.ts` (signature, one new block in the tick)
- Modify: `src/preload/service.ts:120-133` (the `startRecipe` call)
- Modify: `src/shared/ipc.ts` (`RendererToMain`, `R2M_CHANNELS`)
- Test: `tests/unit/runner-conversation.test.ts`

**Interfaces:**

- Consumes: `Recipe.conversation?(doc)` from `src/preload/recipes/types.ts`.
- Produces: `startRecipe(..., countTimeoutMs, reportConversation?)` — the eleventh, last parameter, `(r: { conversation: string | null; url: string; title: string }) => void`; the `conversation:active` channel type `{ serviceId: ServiceId; conversation: string | null; url: string; title: string }`.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { COUNT_TIMEOUT_MS, startRecipe } from '../../src/preload/recipes/runner';
import type { Recipe } from '../../src/preload/recipes/types';

function harness(recipe: Recipe, focused: boolean) {
  Object.defineProperty(document, 'hasFocus', { value: () => focused, configurable: true });
  let tick: (() => Promise<void>) | null = null;
  const fakeSetInterval = ((fn: () => Promise<void>) => {
    tick = fn;
    return 0;
  }) as unknown as typeof setInterval;
  const report = vi.fn();
  const onConversation = vi.fn();
  startRecipe(
    recipe,
    document,
    report,
    vi.fn(),
    undefined,
    undefined,
    undefined,
    fakeSetInterval,
    () => 0,
    COUNT_TIMEOUT_MS,
    onConversation,
  );
  if (!tick) throw new Error('interval not started');
  return { tick: tick as () => Promise<void>, report, onConversation };
}

function naming(names: (string | null)[]): Recipe {
  let i = 0;
  return {
    id: 'whatsapp',
    intervalMs: 1000,
    count: () => ({ direct: 0, indirect: 0 }),
    conversation: () => names[Math.min(i++, names.length - 1)],
  };
}

describe('runner conversation reports', () => {
  it('says nothing while the document is unfocused', async () => {
    const h = harness(naming(['Minh Anh']), false);
    await h.tick();
    await h.tick();
    expect(h.onConversation).not.toHaveBeenCalled();
  });

  it('reports the hook name with the URL and title, once per change', async () => {
    document.title = 'WhatsApp';
    const h = harness(naming(['Minh Anh', 'Minh Anh', 'Nhóm Sale']), true);
    await h.tick();
    expect(h.onConversation).toHaveBeenCalledExactlyOnceWith({
      conversation: 'Minh Anh',
      url: document.location.href,
      title: 'WhatsApp',
    });
    await h.tick();
    expect(h.onConversation).toHaveBeenCalledTimes(1);
    await h.tick();
    expect(h.onConversation).toHaveBeenCalledTimes(2);
    expect(h.onConversation).toHaveBeenLastCalledWith({
      conversation: 'Nhóm Sale',
      url: document.location.href,
      title: 'WhatsApp',
    });
  });

  it('with no hook, a title change is a change', async () => {
    document.title = 'Alice - Discord';
    const recipe: Recipe = { id: 'discord', intervalMs: 1000, count: () => ({ direct: 0, indirect: 0 }) };
    const h = harness(recipe, true);
    await h.tick();
    expect(h.onConversation).toHaveBeenCalledExactlyOnceWith({
      conversation: null,
      url: document.location.href,
      title: 'Alice - Discord',
    });
    document.title = 'Bob - Discord';
    await h.tick();
    expect(h.onConversation).toHaveBeenCalledTimes(2);
  });

  it('a throwing hook reports no name and never stops the count', async () => {
    document.title = 'WhatsApp';
    const recipe: Recipe = {
      id: 'whatsapp',
      intervalMs: 1000,
      count: () => ({ direct: 1, indirect: 0 }),
      conversation: () => {
        throw new Error('boom');
      },
    };
    const h = harness(recipe, true);
    await h.tick();
    expect(h.onConversation).toHaveBeenCalledExactlyOnceWith({
      conversation: null,
      url: document.location.href,
      title: 'WhatsApp',
    });
    expect(h.report).toHaveBeenCalledExactlyOnceWith({ direct: 1, indirect: 0 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/runner-conversation.test.ts`
Expected: FAIL — `onConversation` never called (the parameter does not exist yet; `typecheck` also reports the extra argument).

- [ ] **Step 3: Extend the runner**

In `src/preload/recipes/runner.ts`, change the signature to take the new last parameter:

```ts
export function startRecipe(
  recipe: Recipe,
  doc: Document,
  report: (c: Counts) => void,
  reportStale: (reason: string) => void,
  reportKeepAlive?: (pt: { x: number; y: number }) => void,
  reportNotification?: (n: { title: string; body: string; href?: string }) => void,
  navigate?: (url?: string) => void,
  setIntervalFn: typeof setInterval = setInterval,
  nowFn: () => number = Date.now,
  countTimeoutMs: number = COUNT_TIMEOUT_MS,
  reportConversation?: (r: { conversation: string | null; url: string; title: string }) => void,
): void {
```

After `let lastTitle: string | undefined;` add:

```ts
  /** what the last conversation:active named, so a tick with the same chat
   *  on screen costs one string compare and no IPC */
  let lastConversationKey: string | null = null;
```

Inside the tick, directly after the `if (reportKeepAlive && recipe.keepAlive) { … }` block and before the `// The count itself:` comment, add:

```ts
    // the conversation on screen, for ⌘K's Recent. Only the focused document
    // reports — a hidden view and the shell's surfaces cost one boolean here —
    // and only when what it names has changed. Main derives the label and
    // decides whether the report counts; this stays a dumb reporter.
    if (reportConversation && doc.hasFocus()) {
      let conversation: string | null = null;
      try {
        conversation = recipe.conversation?.(doc) ?? null;
      } catch {
        conversation = null; // a throwing hook must never stop the counting below
      }
      const title = doc.title;
      const key =
        conversation ?? `${(doc.location?.pathname ?? '') + (doc.location?.hash ?? '')}\n${title}`;
      if (key !== lastConversationKey) {
        lastConversationKey = key;
        reportConversation({ conversation, url: doc.location?.href ?? '', title });
      }
    }
```

- [ ] **Step 4: Declare the channel**

In `src/shared/ipc.ts`, in `RendererToMain` directly after the `'service:ready'` line:

```ts
  /** the conversation on screen in the focused view, for ⌘K's Recent — sent
   *  on change only. Every field is page data: main sanitizes it and accepts
   *  it for the active, focused, overlay-free service alone (recents-rules) */
  'conversation:active': {
    serviceId: ServiceId;
    conversation: string | null;
    url: string;
    title: string;
  };
```

In `R2M_CHANNELS`, after `'service:ready',` add `'conversation:active',`. It is a service channel: do **not** add it to `SHELL_ONLY_CHANNELS`.

- [ ] **Step 5: Wire the preload**

In `src/preload/service.ts`, change the import to `import { COUNT_TIMEOUT_MS, startRecipe } from './recipes/runner';` and extend the `startRecipe(...)` call so its last lines read:

```ts
      // chat only: page-initiated navigation, no IPC surface needed. No url =
      // snap back to the service URL; a url = the recipe's login page for a
      // logged-out shell (see Recipe.loginUrl).
      (url?: string) => window.location.assign(url ?? serviceById(serviceId).url),
      setInterval,
      Date.now,
      COUNT_TIMEOUT_MS,
      // the chat on screen, for ⌘K's Recent; main decides whether it counts
      ({ conversation, url, title }) =>
        ipcRenderer.send('conversation:active', { serviceId, conversation, url, title }),
    );
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/runner-conversation.test.ts tests/unit/runner-synth.test.ts`
Expected: PASS — 4 new tests, and the synth tests unchanged.

- [ ] **Step 7: Gates**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: all green. Main has no handler for `conversation:active` yet; an unhandled `ipcMain` channel is dropped, which is fine until Task 5.

---

### Task 5: Main accepts reports, keeps the store, serves the switcher's channels

**Files:**

- Modify: `src/shared/types.ts` (`DiagTag` gains `'recents'`)
- Modify: `src/shared/diag-filter.ts:7-20` (`TAG_ORDER`)
- Modify: `tests/unit/diag-filter.test.ts:30-43`
- Modify: `src/shared/ipc.ts` (`recents:open`, `recents:list`, lists, `SHELL_ONLY_CHANNELS`)
- Modify: `src/main/state.ts` (`onScreen`)
- Modify: `src/main/activate.ts` (`onScreenKey`, `openRecentEntry`)
- Modify: `src/main/ipc-handlers.ts` (`AppContext.recents`, three handlers)
- Modify: `src/main/index.ts:137-142` (store construction, Diagnostics lines), `:436-447` (ctx)
- Modify: `src/main/purge.ts:33`
- Test: `tests/unit/ipc-sender-policy.test.ts`

**Interfaces:**

- Consumes: Tasks 1 and 2; `resolveBannerClick`, `performBannerAction`, `anyOverlayOpen`, `serviceById`.
- Produces: `AppContext.recents: RecentsStore`; `MainState.onScreen: Map<ServiceId, string>`; `onScreenKey(ctx): string | null` and `openRecentEntry(ctx, entry): void` in `src/main/activate.ts`; channels `recents:list` → `{ rows: RecentView[]; storage: RecentsStorage }` and `recents:open { id }`.

- [ ] **Step 1: Add the Diagnostics tag**

`src/shared/types.ts`, in `DiagTag`, after `| 'peek'` add `| 'recents'`. In `src/shared/diag-filter.ts` `TAG_ORDER`, after `peek: true,` add `recents: true,`. In `tests/unit/diag-filter.test.ts`, in the expected array after `'peek',` add `'recents',`.

Run: `corepack pnpm vitest run tests/unit/diag-filter.test.ts`
Expected: PASS.

- [ ] **Step 2: Declare the shell channels**

In `src/shared/ipc.ts`:

Import `RecentsStorage` and `RecentView` from `./types` (keep `ActivityEntryView` for now; Task 7 removes it).

In `RendererToMain`, directly after the `'activity:open'` entry:

```ts
  /** open a Recent row: main resolves the stored row and re-validates its URL */
  'recents:open': { id: number };
```

In `R2M_CHANNELS`, after `'activity:open',` add `'recents:open',`.

In `RendererInvoke`, directly after the `'activity:recent'` entry:

```ts
  /** ⌘K's Recent: the conversations the user opened, newest first, the one
   *  on screen left out, fetched once per open and never broadcast — plus how
   *  recents.json rests, for the switcher's one quiet line */
  'recents:list': { result: { rows: RecentView[]; storage: RecentsStorage } };
```

In `INVOKE_CHANNELS`, after `'activity:recent',` add `'recents:list',`. In `SHELL_ONLY_CHANNELS`, after `'activity:recent',` add `'recents:open',` and `'recents:list',`.

- [ ] **Step 3: Write the sender-policy tests**

In `tests/unit/ipc-sender-policy.test.ts`, inside the top-level `describe`, after the `'rejects activity channels from a service frame'` test:

```ts
  it('keeps the recents channels shell-only', () => {
    for (const channel of ['recents:list', 'recents:open'] as const) {
      expect(
        ipcSenderAllowed({ channel, fromShell: true, senderServiceId: null, payloadServiceId: undefined }),
      ).toBe(true);
      expect(
        ipcSenderAllowed({
          channel,
          fromShell: false,
          senderServiceId: 'messenger',
          payloadServiceId: undefined,
        }),
      ).toBe(false);
    }
  });
  it('validates conversation:active against the sending view', () => {
    expect(
      ipcSenderAllowed({
        channel: 'conversation:active',
        fromShell: false,
        senderServiceId: 'whatsapp',
        payloadServiceId: 'whatsapp',
      }),
    ).toBe(true);
    expect(
      ipcSenderAllowed({
        channel: 'conversation:active',
        fromShell: false,
        senderServiceId: 'whatsapp',
        payloadServiceId: 'discord',
      }),
    ).toBe(false);
  });
```

Run: `corepack pnpm vitest run tests/unit/ipc-sender-policy.test.ts`
Expected: PASS once Step 2 is in (the policy is table-driven); a failure means a channel is missing from `SHELL_ONLY_CHANNELS`.

- [ ] **Step 4: Main state**

In `src/main/state.ts`, after the `unreadCursor` field:

```ts
  /** the Recent row key (recents-rules conversationKey) each service last
   *  reported on screen; read only for the active service while Home is
   *  closed. In-memory, never broadcast. */
  onScreen = new Map<ServiceId, string>();
```

- [ ] **Step 5: The open tail and the on-screen key**

In `src/main/activate.ts`, add to the imports `import type { RecentEntry } from './lib/recents-rules';` and append at the end of the file:

```ts
/** The Recent row on screen right now, or null: the active service's last
 *  accepted report, and nothing while Home covers every view. Read by ⌘K's
 *  exclusion and by the chord walk's anchor. */
export function onScreenKey(ctx: AppContext): string | null {
  if (ctx.state.homeOpen) return null;
  return ctx.state.onScreen.get(ctx.state.activeId) ?? null;
}

/** Open the conversation a Recent row names: the banner tail with the row's
 *  URL as the href and its hook name as the name lane — used whenever the
 *  row has one, not only on bannerTitleNamesConversation services, because
 *  it came from the recipe's own conversation(doc) and is the string its
 *  openConversation matches by construction. No replay lane, no learnUrl. */
export function openRecentEntry(ctx: AppContext, entry: RecentEntry): void {
  const meta = serviceById(entry.serviceId);
  const action = resolveBannerClick({
    disabled: ctx.settings.get().disabled[entry.serviceId],
    hasView: ctx.views.has(entry.serviceId),
    href: entry.url,
    conversation: entry.conversation,
    serviceUrl: meta.url,
    chatPaths: meta.chatPaths,
  });
  void performBannerAction(ctx, entry.serviceId, action);
}
```

- [ ] **Step 6: Context and handlers**

In `src/main/ipc-handlers.ts`:

Imports: add `openRecentEntry` and `onScreenKey` to the existing `./activate` import line; add `import { acceptReport, conversationKey, recentLabel, recentRows, sanitizeReport } from './lib/recents-rules';` and `import type { RecentsStore } from './recents';`.

In `AppContext`, after the `activity` field:

```ts
  /** ⌘K's Recent: the conversations the user opened; persisted sealed, see recents.ts */
  recents: RecentsStore;
```

After `onInvoke('activity:recent', [], () => ctx.activity.recent());` add:

```ts
  on('conversation:active', ({ serviceId, conversation, url, title }) => {
    // the preload's focus gate runs in a world the page shares, so the
    // service on screen is decided here, from main's own state
    if (
      !acceptReport({
        serviceId,
        activeId: ctx.state.activeId,
        overlayOpen: anyOverlayOpen(ctx.state),
        windowFocused: ctx.win.isFocused(),
        disabled: ctx.settings.get().disabled[serviceId],
      })
    ) {
      return;
    }
    const report = sanitizeReport({ conversation, url, title });
    if (!report) return;
    const meta = serviceById(serviceId);
    const named = recentLabel({ ...report, serviceUrl: meta.url, serviceName: meta.name });
    if (!named) {
      // the empty chat list, a login page: nothing is on screen to exclude
      ctx.state.onScreen.delete(serviceId);
      return;
    }
    const sighting = {
      serviceId,
      label: named.label,
      ...(named.conversation ? { conversation: named.conversation } : {}),
      url: report.url,
      at: Date.now(),
    };
    ctx.state.onScreen.set(serviceId, conversationKey(sighting));
    ctx.recents.upsert(sighting);
  });
  onInvoke('recents:list', { rows: [], storage: 'sealed' }, () => ({
    rows: recentRows(ctx.recents.rows(), onScreenKey(ctx)),
    storage: ctx.recents.storage(),
  }));
  on('recents:open', ({ id }) => {
    const entry = ctx.recents.get(id);
    if (entry) openRecentEntry(ctx, entry); // else purged since the switcher fetched
  });
```

- [ ] **Step 7: Construct the store, note its state, clear it on purge**

In `src/main/index.ts`, add `import { RecentsStore } from './recents';` and, directly after the `downloadHistory` Diagnostics `if/else` block:

```ts
    // ⌘K's Recent rests under the same key; an unreadable file is kept and
    // records nothing this launch, plaintext says so
    const recents = new RecentsStore(app.getPath('userData'), pinCodec);
    if (recents.storage() === 'unreadable') {
      diag.note(
        'recents',
        'unreadable: sealed file, keychain would not open it; nothing recorded this launch',
      );
    } else if (recents.storage() === 'plain') {
      diag.note('recents', 'stored unencrypted: the OS keychain is unavailable');
    }
```

In the `ctx` literal, after `activity,` add `recents,`.

In `src/main/purge.ts`, after `ctx.activity.clear(id);` add `ctx.recents.clear(id);`.

- [ ] **Step 8: Gates**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: all green. `tests/unit/activate.test.ts` builds a partial `AppContext` through `as unknown as`, so the new field needs nothing there.

---

### Task 6: The chords walk Recent

**Files:**

- Modify: `src/shared/shortcuts.ts` (keys, labels, `REBINDABLE`)
- Modify: `src/main/lib/shortcut-rules.ts:177,221-227,240-266` (pair, verdict, normaliser migration)
- Modify: `src/main/lib/shortcuts.ts:23,116-117` (`ShellCommand`, table)
- Modify: `src/main/menu.ts:137-147`
- Modify: `src/renderer/src/components/ShortcutsPane.tsx:25`
- Modify: `src/main/state.ts:45-47` (`unreadCursor` → `walk`)
- Modify: `src/main/activate.ts` (`activateService` ends a walk)
- Modify: `src/main/commands.ts` (`unread` case → `conversation`)
- Modify: `src/main/ipc-handlers.ts` (`conversation:active` ends a walk it did not cause)
- Modify: `src/main/index.ts:566-583` (e2e seed)
- Delete: `src/main/lib/unread-jump.ts`, `tests/unit/unread-jump.test.ts`
- Test: `tests/unit/shortcuts.test.ts`, `tests/unit/shortcut-rules.test.ts`, `tests/e2e/shortcuts.spec.ts:139-140,176-195`

**Interfaces:**

- Consumes: Task 3 (`walkTargets`, `beginWalk`, `stepWalk`, `walkActive`, `Walk`), Task 5 (`onScreenKey`, `openRecentEntry`, `ctx.recents`), `conversationKey`.
- Produces: `ShellCommand` member `{ kind: 'conversation'; step: 1 | -1 }`; accelerator ids `nextConversation`, `prevConversation`; `MainState.walk: Walk | null`.

- [ ] **Step 1: Rename the pair in the tests and add the migration case**

```bash
sed -i '' -e "s/kind: 'unread'/kind: 'conversation'/g" -e 's/nextUnread/nextConversation/g' -e 's/prevUnread/prevConversation/g' -e 's/to the unread jump/to the conversation walk/' tests/unit/shortcuts.test.ts tests/unit/shortcut-rules.test.ts
```

Then in `tests/unit/shortcut-rules.test.ts`, inside `describe('normalizeShortcuts', …)` after the `'keeps the unread pair only whole and only mirrored'` test (its body now reads `nextConversation`/`prevConversation`):

```ts
  // 2026-09-24: the pair was renamed; a rebinding stored under the old names
  // still means the same two keys, and the new names win when both exist
  it('carries an override stored under the old nextUnread / prevUnread names', () => {
    expect(normalizeShortcuts({ nextUnread: 'CmdOrCtrl+Right', prevUnread: 'CmdOrCtrl+Left' })).toEqual({
      nextConversation: 'CmdOrCtrl+Right',
      prevConversation: 'CmdOrCtrl+Left',
    });
    expect(
      normalizeShortcuts({
        nextUnread: 'CmdOrCtrl+Right',
        prevUnread: 'CmdOrCtrl+Left',
        nextConversation: 'CmdOrCtrl+Shift+]',
        prevConversation: 'CmdOrCtrl+Shift+[',
      }),
    ).toEqual({ nextConversation: 'CmdOrCtrl+Shift+]', prevConversation: 'CmdOrCtrl+Shift+[' });
  });
```

The second expectation keeps the new names' chords: the normaliser keeps any canonical override, default or not, and the old names are ignored once the new ones are present.

Run: `corepack pnpm vitest run tests/unit/shortcuts.test.ts tests/unit/shortcut-rules.test.ts`
Expected: FAIL — `nextConversation` is not a key of `ACCELERATORS`.

- [ ] **Step 2: The shared table**

In `src/shared/shortcuts.ts`, the `nextUnread` / `prevUnread` lines become:

```ts
  /** the browser's next/previous-tab chords, walking ⌘K's Recent list: ]
   *  the row below (older), [ the row above (newer) */
  nextConversation: 'CmdOrCtrl+Shift+]',
  prevConversation: 'CmdOrCtrl+Shift+[',
```

In `REBINDABLE`, `'nextUnread', 'prevUnread',` become `'nextConversation', 'prevConversation',`. In `SHORTCUT_LABELS`: `nextConversation: 'Next Conversation', prevConversation: 'Previous Conversation',`. Update the `RecordResult` doc comment's "both halves of the unread pair" to "both halves of the conversation pair".

- [ ] **Step 3: The rules**

In `src/main/lib/shortcut-rules.ts`:

Line 177: `const PAIR: readonly RebindableId[] = ['nextConversation', 'prevConversation'];`

In `recordVerdict`, replace `resolved.nextUnread` / `resolved.prevUnread` with `resolved.nextConversation` / `resolved.prevConversation`, and the patch with `{ nextConversation: pair.next, prevConversation: pair.prev }`. Update its doc comment's "The unread pair" to "The conversation pair".

In `normalizeShortcuts`, replace the first two lines of the body with:

```ts
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const r = { ...(raw as Record<string, unknown>) };
  // 2026-09-24: the pair was renamed from nextUnread/prevUnread; an override
  // a settings.json or backup still holds under the old names means the same
  // two keys, and the new names win where both are present
  if (r.nextConversation === undefined && typeof r.nextUnread === 'string') {
    r.nextConversation = r.nextUnread;
  }
  if (r.prevConversation === undefined && typeof r.prevUnread === 'string') {
    r.prevConversation = r.prevUnread;
  }
```

and at its end replace `out.nextUnread` / `out.prevUnread` (four occurrences) with `out.nextConversation` / `out.prevConversation`. Update the doc comment's "the unread pair kept only whole and mirrored" to "the conversation pair kept only whole and mirrored".

- [ ] **Step 4: The matcher and the menu**

`src/main/lib/shortcuts.ts`: `| { kind: 'unread'; step: 1 | -1 }` becomes `| { kind: 'conversation'; step: 1 | -1 }`; in `fixedTable`:

```ts
    [[a.nextConversation], { kind: 'conversation', step: 1 }],
    [[a.prevConversation], { kind: 'conversation', step: -1 }],
```

`src/main/menu.ts`:

```ts
        {
          label: 'Next Conversation',
          accelerator: acc.nextConversation,
          click: run({ kind: 'conversation', step: 1 }),
        },
        {
          label: 'Previous Conversation',
          accelerator: acc.prevConversation,
          click: run({ kind: 'conversation', step: -1 }),
        },
```

`src/renderer/src/components/ShortcutsPane.tsx` line 25:

```ts
  {
    ids: ['nextConversation', 'prevConversation'],
    desc: 'next / previous conversation — down / up the Recent list',
  },
```

- [ ] **Step 5: State and the walk's end conditions**

`src/main/state.ts`: add `import type { Walk } from './lib/recents-walk';` and replace the `unreadCursor` field and its comment with:

```ts
  /** the chord walk in flight (lib/recents-walk.ts): a snapshot of ⌘K's
   *  Recent order, the cursor and a deadline; in-memory and never broadcast.
   *  Cleared by activateService, so any other activation ends it. */
  walk: Walk | null = null;
```

`src/main/activate.ts`, in `activateService`, after `ctx.state.homeOpen = false;`:

```ts
  // a tile, a ⌘K row, ⌘1…9, a banner or a pin ends a chord walk; the chord's
  // own open runs through here too and stores its walk afterwards
  ctx.state.walk = null;
```

`src/main/ipc-handlers.ts`, in the `conversation:active` handler, directly before `ctx.state.onScreen.set(...)`:

```ts
    // a chat the user clicked into themselves ends a chord walk; the one the
    // walk just opened reports the cursor's own key and keeps it
    const key = conversationKey(sighting);
    if (ctx.state.walk && ctx.state.walk.cursor !== key) ctx.state.walk = null;
```

and change the following line to `ctx.state.onScreen.set(serviceId, key);`.

- [ ] **Step 6: The command**

In `src/main/commands.ts`, replace the imports of `openActivityEntry` and `./lib/unread-jump` with:

```ts
import { activateService, onScreenKey, openRecentEntry, setHomeOpen, setOverlayOpen } from './activate';
import { conversationKey } from './lib/recents-rules';
import { beginWalk, stepWalk, walkActive, walkTargets } from './lib/recents-walk';
```

and replace the whole `case 'unread': { … }` with:

```ts
    case 'conversation': {
      // ⌘K's Recent list from the keyboard: ] is the row below (older), [ the
      // row above (newer), over a snapshot — the row just opened moves to the
      // top, and the live order would turn the second press into a ping-pong
      const now = Date.now();
      const s = ctx.settings.get();
      const walk = walkActive(ctx.state.walk, now)
        ? ctx.state.walk
        : beginWalk(
            walkTargets(ctx.recents.rows(), (x) => !s.disabled[x]),
            onScreenKey(ctx),
            now,
          );
      const stepped = stepWalk(walk, command.step, now);
      ctx.state.walk = stepped.walk;
      if (stepped.target === null) return; // one row, and it is the one on screen
      const entry = ctx.recents.rows().find((r) => conversationKey(r) === stepped.target);
      if (!entry) return; // purged between the snapshot and this press
      ctx.win.show();
      openRecentEntry(ctx, entry);
      // activateService inside cleared the walk; it is stored again so the
      // next press within the deadline keeps stepping the snapshot
      ctx.state.walk = stepped.walk;
      return;
    }
```

- [ ] **Step 7: Retire the unread jump and swap the e2e seed**

```bash
rm src/main/lib/unread-jump.ts tests/unit/unread-jump.test.ts
```

In `src/main/index.ts`, replace the e2e seed's `activity.append({ … });` call (the block under the comment `// and one recents row, so ⌘⇧] has a conversation to land on`) with:

```ts
        // and one Recent row, so ⌘⇧] has a conversation to land on
        recents.upsert({
          serviceId: 'zalo',
          label: 'Minh Anh',
          conversation: 'Minh Anh',
          url: 'https://chat.zalo.me/',
          at: Date.now(),
        });
```

- [ ] **Step 8: The e2e spec**

In `tests/e2e/shortcuts.spec.ts`: line 139 comment becomes `// the conversation pair records from one arrow`; line 140 `getByTestId('shortcut-cap-nextUnread')` becomes `getByTestId('shortcut-cap-nextConversation')`. Replace the comment and title of the chord test (lines 176-179) with:

```ts
// the e2e boot hook gives zalo three direct unread and one Recent row (a
// conversation); telegram is where we start with nothing of its own in the
// list, so ⌘⇧] opens the newest row — zalo has no view yet, so the row
// resolves to plain activation and the tile still lands on zalo
test('shortcuts: ⌘/Ctrl ⇧ ] opens the most recent conversation, once', async () => {
```

and the comment before the second chord (line 191) with `// the zalo row is the only target and the walk's cursor already sits on it: nowhere to go`. The assertions stay.

- [ ] **Step 9: Run the unit tests**

Run: `corepack pnpm vitest run tests/unit/shortcuts.test.ts tests/unit/shortcut-rules.test.ts tests/unit/recents-walk.test.ts`
Expected: PASS.

- [ ] **Step 10: Gates**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: all green. Biome flags an unused `openActivityEntry` import anywhere it lingers; remove it.

---

### Task 7: The switcher reads Recent; the banner log keeps only the banner job

**Files:**

- Modify: `src/renderer/src/components/switcher-results.ts`
- Modify: `src/renderer/src/components/QuickSwitcher.tsx`
- Modify: `src/shared/ipc.ts` (remove `activity:recent`, `activity:open`)
- Modify: `src/main/ipc-handlers.ts` (remove their handlers; `activity` doc comment)
- Modify: `src/main/lib/activity-log.ts` (remove `recent()`)
- Modify: `src/shared/types.ts` (remove `ActivityEntryView`)
- Test: `tests/unit/switcher-results.test.ts`, `tests/unit/activity-log.test.ts`, `tests/unit/ipc-sender-policy.test.ts`

**Interfaces:**

- Consumes: `RecentView`, `RecentsStorage`, `recents:list`, `recents:open`.
- Produces: `switcherRows({ query, recents: RecentView[], services })`; `ActivityLog` without `recent()`.

- [ ] **Step 1: Rewrite the switcher-results test**

In `tests/unit/switcher-results.test.ts`, replace the import of `ActivityEntryView` with `import type { RecentView } from '../../src/shared/types';` and the `recent` helper with:

```ts
const recent = (id: number, title: string, over: Partial<RecentView> = {}): RecentView => ({
  id,
  serviceId: 'telegram',
  title,
  at: id,
  ...over,
});
```

Run: `corepack pnpm vitest run tests/unit/switcher-results.test.ts`
Expected: the runtime assertions pass; `typecheck` fails until Step 2. Continue.

- [ ] **Step 2: switcher-results**

In `src/renderer/src/components/switcher-results.ts`: import `RecentView` instead of `ActivityEntryView`; the `recents` parameter and return type become `RecentView[]`; delete `recentHaystack` and its comment, and score with `fuzzyScore(opts.query, r.title)`. Doc comment for `switcherRows`: "Recents arrive newest-first from main with the on-screen conversation already left out; rows for since-disabled services are dropped so Enter is always actionable."

- [ ] **Step 3: QuickSwitcher**

In `src/renderer/src/components/QuickSwitcher.tsx`:

Imports: `import type { RecentsStorage, RecentView, ServiceId } from '../../../shared/types';`

Add after the `logos` glob:

```ts
/** how recents.json rests when it is not sealed — one quiet line, the
 *  Downloads pane's wording */
const BAND: Record<Exclude<RecentsStorage, 'sealed'>, string> = {
  unreadable:
    'Goetia cannot read its recent conversations on this device. The file is sealed to a keychain this launch cannot open; it is kept as it is, and conversations you open this session are not being recorded.',
  plain: 'Recent conversations are kept unencrypted on this device. The OS keychain is unavailable.',
};
```

State: `const [recents, setRecents] = useState<RecentView[]>([]);` and `const [storage, setStorage] = useState<RecentsStorage>('sealed');`

The fetch in the `open` effect:

```ts
      // one fetch per open — recents are never broadcast
      window.goetia
        .invoke('recents:list')
        .then(({ rows, storage }) => {
          setRecents(rows);
          setStorage(storage);
        })
        .catch(() => setRecents([]));
```

`openRecent`:

```ts
  const openRecent = (id: number) => {
    window.goetia.send('recents:open', { id });
    close();
  };
```

The Recent section header and rows:

```tsx
          {(rows.recents.length > 0 || storage !== 'sealed') && <SectionLabel>Recent</SectionLabel>}
          {storage !== 'sealed' && (
            <li className="px-4 pb-2 text-[11px] leading-snug text-text-2">{BAND[storage]}</li>
          )}
          {rows.recents.map((r, i) => (
            <li key={`recent-${r.id}`}>
              <button
                type="button"
                ref={i === cursor ? activeRef : null}
                onClick={() => openRecent(r.id)}
                onMouseEnter={() => {
                  navByKey.current = false;
                  setCursor(i);
                }}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${i === cursor ? 'bg-text-1/6' : ''}`}
              >
                <RowTile serviceId={r.serviceId} active={i === cursor} />
                <span className="min-w-0 flex-1 truncate text-text-1">{r.title}</span>
                <span className="tabular text-[11px] text-text-2">{relativeTime(r.at, nowMs)}</span>
              </button>
            </li>
          ))}
```

The `Services` label condition stays `rows.recents.length > 0 && rows.services.length > 0`.

- [ ] **Step 4: Remove the activity channels**

`src/shared/ipc.ts`: delete the `'activity:open'` entry and its comment from `RendererToMain`, `'activity:open'` from `R2M_CHANNELS`, the `'activity:recent'` entry and comment from `RendererInvoke`, `'activity:recent'` from `INVOKE_CHANNELS`, both from `SHELL_ONLY_CHANNELS`, and `ActivityEntryView` from the type import.

`src/main/ipc-handlers.ts`: delete `onInvoke('activity:recent', [], () => ctx.activity.recent());` and the `on('activity:open', …)` handler (three lines, around line 701). Change the `activity` field's comment to `/** banner history behind banner clicks and the lock's parked click; in-memory only */`.

`tests/unit/ipc-sender-policy.test.ts`: delete the two tests `'allows activity channels from the shell frame'` and `'rejects activity channels from a service frame'`.

- [ ] **Step 5: Trim the banner log**

In `src/main/lib/activity-log.ts`: change the import to `import type { ServiceId } from '../../shared/types';` and delete the `recent()` method with its doc comment. Change the class doc comment to: `/** Banner history for banner clicks. Bounded and in-memory only, on purpose: conversation titles never touch disk unsealed, and the log dies with the process. */`

In `src/shared/types.ts`: delete the `ActivityEntryView` interface and its comment.

- [ ] **Step 6: Rewrite the activity-log test without `recent()`**

Replace `tests/unit/activity-log.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_CAP,
  type ActivityEntry,
  ActivityLog,
  openHref,
} from '../../src/main/lib/activity-log';

const entry = (
  n: number,
  over: Partial<Omit<ActivityEntry, 'id'>> = {},
): Omit<ActivityEntry, 'id'> => ({
  serviceId: 'telegram',
  title: `chat ${n}`,
  conversation: over.title ?? `chat ${n}`,
  synthetic: false,
  silenced: false,
  at: n,
  ...over,
});

describe('ActivityLog', () => {
  it('caps at ACTIVITY_CAP, dropping the oldest', () => {
    const log = new ActivityLog();
    const ids: number[] = [];
    for (let i = 1; i <= ACTIVITY_CAP + 5; i++) ids.push(log.append(entry(i)));
    expect(log.get(ids[0])).toBeUndefined();
    expect(log.get(ids[4])).toBeUndefined();
    expect(log.get(ids[5])?.title).toBe('chat 6');
    expect(log.get(ids[ids.length - 1])?.title).toBe(`chat ${ACTIVITY_CAP + 5}`);
  });

  it('resolves an id back to the full entry', () => {
    const log = new ActivityLog();
    const id = log.append(entry(1, { href: '/x' }));
    expect(log.get(id)?.href).toBe('/x');
    expect(log.get(999)).toBeUndefined();
  });

  it('clears one service without touching the others', () => {
    const log = new ActivityLog();
    const a = log.append(entry(1, { serviceId: 'telegram' }));
    const b = log.append(entry(2, { serviceId: 'messenger' }));
    log.clear('telegram');
    expect(log.get(a)).toBeUndefined();
    expect(log.get(b)?.serviceId).toBe('messenger');
  });

  it('clears every entry when given no service', () => {
    const log = new ActivityLog();
    const a = log.append(entry(1, { serviceId: 'telegram' }));
    const b = log.append(entry(2, { serviceId: 'messenger' }));
    log.clear();
    expect(log.get(a)).toBeUndefined();
    expect(log.get(b)).toBeUndefined();
  });

  // ids are opaque handles a Notification Center banner holds across a
  // purge; a cleared entry must resolve to undefined, never to a recycled row
  it('never reissues a cleared id', () => {
    const log = new ActivityLog();
    const first = log.append(entry(1));
    log.clear();
    const second = log.append(entry(2));
    expect(second).not.toBe(first);
    expect(log.get(first)).toBeUndefined();
    expect(log.get(second)?.title).toBe('chat 2');
  });

  it('keeps the shim clickId so a banner click can replay the page own click', () => {
    const log = new ActivityLog();
    const id = log.append(entry(1, { clickId: 7 }));
    expect(log.get(id)?.clickId).toBe(7);
  });

  // the shim registry lives and dies with the page JS context, and its ids
  // restart at 1 — replaying a pre-reload id would fire a different banner
  it('forgetReplay drops one service replay handles, keeping its entries', () => {
    const log = new ActivityLog();
    const d = log.append(entry(1, { serviceId: 'discord', clickId: 3 }));
    const w = log.append(entry(2, { serviceId: 'whatsapp', clickId: 4 }));
    log.forgetReplay('discord');
    expect(log.get(d)?.clickId).toBeUndefined();
    expect(log.get(d)?.title).toBe('chat 1');
    expect(log.get(w)?.clickId).toBe(4);
  });

  // Discord dings itself, so its entries carry only a shim handle that dies
  // with the banner's document; the URL the page landed on when that handle
  // was replayed is the one durable lane the entry can have
  it('a URL learned from a landed open becomes the entry open href', () => {
    const log = new ActivityLog();
    const id = log.append(entry(1, { serviceId: 'discord', clickId: 3 }));
    expect(openHref(log.get(id) as ActivityEntry)).toBeUndefined();
    log.learnUrl(id, 'https://discord.com/channels/1/2');
    expect(openHref(log.get(id) as ActivityEntry)).toBe('https://discord.com/channels/1/2');
  });

  it('a synthetic banner keeps its own href over anything learned', () => {
    const log = new ActivityLog();
    const id = log.append(entry(1, { serviceId: 'messenger', synthetic: true, href: '/messages/t/9' }));
    log.learnUrl(id, 'https://www.facebook.com/messages/t/other');
    expect(openHref(log.get(id) as ActivityEntry)).toBe('/messages/t/9');
  });

  // a shim banner's href field is page-controlled and never a lane by itself
  it('a non-synthetic href is not an open href', () => {
    const log = new ActivityLog();
    const id = log.append(entry(1, { serviceId: 'discord', href: '/channels/1/2' }));
    expect(openHref(log.get(id) as ActivityEntry)).toBeUndefined();
  });

  // the entry a banner click resolves is the conversation's newest, so a
  // lesson stamped on one entry alone would be lost to the very next message
  it('the learned URL follows the conversation across banners', () => {
    const log = new ActivityLog();
    const first = log.append(entry(1, { serviceId: 'discord', title: '#release', clickId: 1 }));
    log.learnUrl(first, 'https://discord.com/channels/1/2');
    const second = log.append(entry(2, { serviceId: 'discord', title: '#release', clickId: 2 }));
    const other = log.append(entry(3, { serviceId: 'discord', title: '#other', clickId: 3 }));
    expect(openHref(log.get(second) as ActivityEntry)).toBe('https://discord.com/channels/1/2');
    expect(openHref(log.get(other) as ActivityEntry)).toBeUndefined();
  });

  it('learnUrl on a rotated-out id is a no-op', () => {
    const log = new ActivityLog();
    expect(() => log.learnUrl(99, 'https://x/')).not.toThrow();
  });
});
```

- [ ] **Step 7: Run the affected tests**

Run: `corepack pnpm vitest run tests/unit/activity-log.test.ts tests/unit/switcher-results.test.ts tests/unit/ipc-sender-policy.test.ts`
Expected: PASS.

- [ ] **Step 8: Gates**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: all green. `grep -rn "ActivityEntryView\|activity:recent\|activity:open\|recentHaystack" src tests` prints nothing.

---

### Task 8: Docs, full gates, live check

**Files:**

- Modify: `CLAUDE.md:18,34-36`
- Modify: `README.md:73,198,201`
- Modify: `docs/superpowers/specs/2026-08-17-zoom-signout-and-recents-design.md:3`, `docs/superpowers/specs/2026-09-21-next-unread-design.md:3`

- [ ] **Step 1: CLAUDE.md**

Replace the sentence group in line 18 that starts with the bold lead `**Next / Previous Unread are` and ends with the sentence about a shifted US layout reporting the two closing and opening brace characters, with:

> **Next / Previous Conversation are `⌘/Ctrl ⇧ ]` and `[`** (2026-09-24, user decision; spec `docs/superpowers/specs/2026-09-24-recent-conversations-design.md`, superseding the 2026-09-21 unread jump): the browser's tab chords walking ⌘K's Recent list — `]` the row below (older), `[` the row above (newer), wrapping — over a **snapshot** taken at the first press (`MainState.walk`, in-memory, never broadcast; rules in `lib/recents-walk.ts`), because the row just opened moves to the top and a live order would make the second press a ping-pong. The walk ends `WALK_TIMEOUT_MS` (4 s) after the last press, on any other activation (`activateService` clears it) and on a `conversation:active` report naming a chat the walk did not open; after that a lone press is "switch back". A target opens through `openRecentEntry` — the banner tail with the row's URL and hook name — and nothing in that tail may be bent for the jump. A badge with no Recent row is not reachable by chord (named trade-off). Brackets need their `code` (`BracketRight`/`BracketLeft`) in the matcher — a shifted US layout reports `}` and `{`.

Replace the whole of line 34 (the bullet starting `- **Recents are the banner stream remembered.**`) with:

> - **Recent is the conversations you opened, never the banner stream** (2026-09-24, user decision; spec `docs/superpowers/specs/2026-09-24-recent-conversations-design.md`). The service preload's runner sends `conversation:active` — the recipe's `conversation(doc)` name, the URL and the title — only while `document.hasFocus()` and only on change; main accepts it solely for the active service with no overlay open and the window focused (`acceptReport`, `lib/recents-rules.ts`, because the preload's gate runs in a world the page shares), derives the label main-side (hook name, else `conversationFromTitle`; nothing, or the service's landing URL without a hook name, is no row) and upserts `RecentsStore` (`src/main/recents.ts`, `recents.json`: a `safeStorage`-sealed envelope in pins' shape — kept and read-only when unreadable, plaintext with no keychain, a `[recents]` Diagnostics line either way; `RECENTS_CAP` 50; purge clears the service's rows). ⌘K fetches `recents:list` once per open (never broadcast) with the on-screen conversation left out (`MainState.onScreen`, null while Home is open) and opens a row through `recents:open` → `openRecentEntry`: the banner tail with the row's URL as the href and its hook name as the name lane, used whenever present because it came from the recipe's own hook. The banner log (`lib/activity-log.ts`, in-memory) serves banner clicks only — `append`, `get`, `learnUrl`, `forgetReplay`, `clear` — and conversation titles still never touch disk unsealed.

In line 35 replace the lead `**A recents row opens through the same lanes as its banner**, in one decision (`resolveBannerClick`, which also serves pins):` with `**A banner click opens through lanes**, in one decision (`resolveBannerClick`, which also serves pins and Recent rows):`. In line 36 replace the lead `**A ⌘K row leads with the conversation, not the sender.**` with `**A banner title is parsed into conversation and sender once, on the way in.**`

- [ ] **Step 2: README**

Line 73: replace `or straight into a conversation: recent banners sit on top of the list (silenced ones too, marked 🌙), and picking one lands in that exact thread, not just the app:` with `or straight back into a conversation: the chats you opened most recently sit on top of the list, and picking one lands in that exact thread, not just the app:`.

Line 198: replace `(recent conversations on top — 🌙 marks ones quiet hours or mute silenced; the list lives in memory and clears on quit)` with `(the conversations you opened most recently on top — kept encrypted on this device, so they survive a restart)`.

Line 201: replace the whole bullet, keeping its two-space indent, with `- *Conversations*: ⌘/Ctrl+⇧+] and ⌘/Ctrl+⇧+[ step down and up the quick switcher's recent list — one press of ⌘/Ctrl+⇧+] is "back to the chat I was just in", and pressing again within a few seconds keeps going back.`

- [ ] **Step 3: Superseded notes**

In `docs/superpowers/specs/2026-08-17-zoom-signout-and-recents-design.md`, after line 3 (the `Date:` paragraph) insert a blank line and:

```markdown
> Superseded in part (2026-09-24): section 3's activity log no longer feeds ⌘K. Recent is the conversations the user opened — see `2026-09-24-recent-conversations-design.md`. The banner log remains for banner clicks.
```

In `docs/superpowers/specs/2026-09-21-next-unread-design.md`, after line 3 insert a blank line and:

```markdown
> Superseded (2026-09-24): the pair now walks ⌘K's Recent list — the conversations the user opened — not unread banners. See `2026-09-24-recent-conversations-design.md`.
```

Run: `npx markdownlint-cli2 CLAUDE.md README.md docs/superpowers/specs/2026-08-17-zoom-signout-and-recents-design.md docs/superpowers/specs/2026-09-21-next-unread-design.md docs/superpowers/specs/2026-09-24-recent-conversations-design.md docs/superpowers/plans/2026-09-24-recent-conversations.md`
Expected: `Summary: 0 issues`.

- [ ] **Step 4: Full gates**

```bash
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test
corepack pnpm build && env -u ELECTRON_RUN_AS_NODE npx playwright test tests/e2e/shortcuts.spec.ts tests/e2e/smoke.spec.ts --reporter=line
```

Expected: every suite green. A drag or restart spec flaking under load is not this change; rerun the named specs alone.

- [ ] **Step 5: Live check**

```bash
corepack pnpm package:mac
```

Open the built app (answer Always Allow on the `Goetia Safe Storage` keychain prompt). With WhatsApp and Discord signed in: open two WhatsApp chats and one Discord DM in turn, dwelling a few seconds on each. Then:

1. ⌘K shows the two rows you are not on, newest first, and none for the chat on screen.
2. Enter on a WhatsApp row lands in that chat with no reload (the waking cover does not appear).
3. ⌘⇧] once goes to the previous chat; ⌘⇧] again within 4 s goes one further back; ⌘⇧[ comes forward.
4. Wait 5 s, press ⌘⇧] once: "switch back" to the chat you just left.
5. Settings → Diagnostics shows no `[open] … miss` line for these opens, and the `recents` chip exists.
6. Quit and relaunch: ⌘K still lists the rows.

Report every step's outcome to the user, including any that failed, then stop for `/commit`.
