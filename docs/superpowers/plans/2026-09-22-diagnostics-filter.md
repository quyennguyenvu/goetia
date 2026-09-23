# Diagnostics Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Diagnostics pane be narrowed by a search field and tag chips, with Copy report copying what is shown and saying so in the header.

**Architecture:** One process-agnostic module, `src/shared/diag-filter.ts`, owns the filter shape, its normaliser and the match rule; the pane filters the rows it already holds, and `diagnostics:report` carries the same filter to main so the report is narrowed by the identical function and gains a `Filtered:` header line. No new channel, nothing persisted, nothing removed from the ring.

**Tech Stack:** TypeScript, React, Vitest, Playwright-Electron.

Spec: `docs/superpowers/specs/2026-09-22-diagnostics-filter-design.md`.

## Global Constraints

- Gates: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`; `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e -- tests/e2e/diagnostics.spec.ts` at the end.
- No commits from the plan; the user commits through `/commit`. One summary at the end.
- `src/shared/**` imports no `electron` and no DOM.
- The ring is never emptied or edited: this plan adds no Clear and no new IPC channel.
- Copy, verbatim: placeholder `Filter lines…`; button labels `Copy report`, `Copy <shown> of <total>`, `Copied`; empty states `Nothing to report yet.` and `No lines match.`; link `Show all`; report line `Filtered: tag=nav,recipe · "zalo" · 12 of 87 lines` (tags or query omitted when empty); body `(nothing matched)` when a narrowing filter matches nothing, `(nothing recorded)` on an empty ring otherwise.
- `DIAG_QUERY_MAX` = 100.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/shared/diag-filter.ts` (create) | `DIAG_TAGS`, `DiagFilter`, `EMPTY_DIAG_FILTER`, `isDiagTag`, `normalizeDiagFilter`, `matchesDiagFilter`, `diagFilterNarrows`, `describeDiagFilter` |
| `src/main/lib/diagnostics.ts` | `restoreEntries` reads `isDiagTag`; `formatReport` prints the `Filtered:` line; `Diagnostics.report(header, filter)` |
| `src/shared/ipc.ts` | `diagnostics:report` gains `payload: { filter: DiagFilter }` |
| `src/main/ipc-handlers.ts` | the handler normalises the payload and passes it to `report` |
| `src/renderer/src/components/DiagnosticsPane.tsx` | toolbar (field, chips, Copy label), no-match state |
| tests | `diag-filter.test.ts` (create), `diagnostics.test.ts`, e2e `diagnostics.spec.ts` |
| docs | `FEATURES.md`, `CLAUDE.md`, spec status |

---

### Task 1: the shared filter module (tests first)

**Files:**

- Create: `src/shared/diag-filter.ts`
- Test: `tests/unit/diag-filter.test.ts`

**Interfaces:**

- Consumes: `DiagEntry`, `DiagTag` from `src/shared/types.ts`.
- Produces: everything later tasks import — `DIAG_TAGS: DiagTag[]`, `DIAG_QUERY_MAX = 100`, `interface DiagFilter { readonly tags: readonly DiagTag[]; readonly query: string }`, `EMPTY_DIAG_FILTER`, `isDiagTag(v: unknown): v is DiagTag`, `normalizeDiagFilter(raw: unknown): DiagFilter`, `matchesDiagFilter(entry: DiagEntry, filter: DiagFilter): boolean`, `diagFilterNarrows(filter: DiagFilter): boolean`, `describeDiagFilter(filter: DiagFilter, shown: number, total: number): string`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/diag-filter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  DIAG_QUERY_MAX,
  DIAG_TAGS,
  describeDiagFilter,
  diagFilterNarrows,
  EMPTY_DIAG_FILTER,
  isDiagTag,
  matchesDiagFilter,
  normalizeDiagFilter,
} from '../../src/shared/diag-filter';
import type { DiagEntry } from '../../src/shared/types';

const nav: DiagEntry = { at: 1, tag: 'nav', serviceId: 'zalo', line: 'contained: zalo id.zalo.me (/oauth)' };
const stale: DiagEntry = { at: 2, tag: 'recipe', serviceId: 'zalo', line: 'zalo stale: count timeout' };
const started: DiagEntry = { at: 3, tag: 'app', line: 'started 0.17.2' };

describe('DIAG_TAGS', () => {
  it('lists every tag once, in chip order', () => {
    expect(DIAG_TAGS).toEqual([
      'app',
      'nav',
      'open',
      'identity',
      'passkey',
      'ipc',
      'notifications',
      'downloads',
      'recipe',
      'view',
      'peek',
    ]);
    expect(isDiagTag('recipe')).toBe(true);
    expect(isDiagTag('bogus')).toBe(false);
    expect(isDiagTag(42)).toBe(false);
  });
});

describe('normalizeDiagFilter', () => {
  it('keeps known tags only, deduped, in DIAG_TAGS order', () => {
    expect(normalizeDiagFilter({ tags: ['view', 'bogus', 'nav', 'view', 7], query: '' }).tags).toEqual([
      'nav',
      'view',
    ]);
  });

  it('trims and clips the query', () => {
    expect(normalizeDiagFilter({ tags: [], query: '  zalo  ' }).query).toBe('zalo');
    expect(normalizeDiagFilter({ tags: [], query: 'x'.repeat(500) }).query).toHaveLength(DIAG_QUERY_MAX);
  });

  it('maps anything malformed to the empty filter', () => {
    for (const raw of [undefined, null, 'zalo', 42, [], { tags: 'nav', query: 3 }, {}]) {
      expect(normalizeDiagFilter(raw)).toEqual({ tags: [], query: '' });
    }
    expect(EMPTY_DIAG_FILTER).toEqual({ tags: [], query: '' });
  });
});

describe('matchesDiagFilter', () => {
  it('matches every row on the empty filter', () => {
    for (const e of [nav, stale, started]) expect(matchesDiagFilter(e, EMPTY_DIAG_FILTER)).toBe(true);
  });

  it('narrows by tag set', () => {
    const f = { tags: ['nav', 'app'] as const, query: '' };
    expect(matchesDiagFilter(nav, f)).toBe(true);
    expect(matchesDiagFilter(started, f)).toBe(true);
    expect(matchesDiagFilter(stale, f)).toBe(false);
  });

  it('matches the query case-insensitively against tag, service id and line', () => {
    expect(matchesDiagFilter(nav, { tags: [], query: 'ZALO.ME' })).toBe(true);
    expect(matchesDiagFilter(stale, { tags: [], query: '[recipe]' })).toBe(true);
    expect(matchesDiagFilter(nav, { tags: [], query: 'zalo' })).toBe(true); // the service id
    expect(matchesDiagFilter(started, { tags: [], query: 'zalo' })).toBe(false);
    expect(matchesDiagFilter(started, { tags: [], query: '  started ' })).toBe(true); // trimmed
  });

  it('requires both when both are set', () => {
    expect(matchesDiagFilter(stale, { tags: ['recipe'], query: 'timeout' })).toBe(true);
    expect(matchesDiagFilter(stale, { tags: ['recipe'], query: 'oauth' })).toBe(false);
    expect(matchesDiagFilter(nav, { tags: ['recipe'], query: 'oauth' })).toBe(false);
  });
});

describe('diagFilterNarrows', () => {
  it('is false for the empty filter and a whitespace query', () => {
    expect(diagFilterNarrows(EMPTY_DIAG_FILTER)).toBe(false);
    expect(diagFilterNarrows({ tags: [], query: '   ' })).toBe(false);
    expect(diagFilterNarrows({ tags: ['nav'], query: '' })).toBe(true);
    expect(diagFilterNarrows({ tags: [], query: 'x' })).toBe(true);
  });
});

describe('describeDiagFilter', () => {
  it('names the tags, the query and the count, omitting what is empty', () => {
    expect(describeDiagFilter({ tags: ['nav', 'recipe'], query: ' zalo ' }, 12, 87)).toBe(
      'tag=nav,recipe · "zalo" · 12 of 87 lines',
    );
    expect(describeDiagFilter({ tags: ['app'], query: '' }, 2, 3)).toBe('tag=app · 2 of 3 lines');
    expect(describeDiagFilter({ tags: [], query: 'nope' }, 0, 2)).toBe('"nope" · 0 of 2 lines');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `corepack pnpm test -- tests/unit/diag-filter.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/shared/diag-filter"`.

- [ ] **Step 3: Write the module**

Create `src/shared/diag-filter.ts`:

```ts
import type { DiagEntry, DiagTag } from './types';

/** Every tag the ring knows, in the order the pane's chips render. A Record
 *  keyed on DiagTag so adding a tag to the type without listing it here is a
 *  compile error — restoreEntries, the chips and the normaliser read this one
 *  table. */
const TAG_ORDER: Record<DiagTag, true> = {
  app: true,
  nav: true,
  open: true,
  identity: true,
  passkey: true,
  ipc: true,
  notifications: true,
  downloads: true,
  recipe: true,
  view: true,
  peek: true,
};
export const DIAG_TAGS = Object.keys(TAG_ORDER) as DiagTag[];
const TAG_SET: ReadonlySet<string> = new Set(DIAG_TAGS);

/** Bound on the query: it is renderer-supplied data that ends up in the
 *  report's header, so it is clipped before either use. */
export const DIAG_QUERY_MAX = 100;

export interface DiagFilter {
  /** empty means every tag */
  readonly tags: readonly DiagTag[];
  /** case-insensitive substring; whitespace-only means none */
  readonly query: string;
}

export const EMPTY_DIAG_FILTER: DiagFilter = { tags: [], query: '' };

export function isDiagTag(v: unknown): v is DiagTag {
  return typeof v === 'string' && TAG_SET.has(v);
}

/** What crossed IPC is data: known tags only, deduped into DIAG_TAGS order,
 *  the query trimmed and clipped, anything malformed the empty filter. */
export function normalizeDiagFilter(raw: unknown): DiagFilter {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { tags: [], query: '' };
  const r = raw as Record<string, unknown>;
  const wanted = new Set<string>(Array.isArray(r.tags) ? r.tags.filter(isDiagTag) : []);
  const tags = DIAG_TAGS.filter((t) => wanted.has(t));
  const query = typeof r.query === 'string' ? r.query.trim().slice(0, DIAG_QUERY_MAX) : '';
  return { tags, query };
}

/** The text a query is tested against: `[tag] serviceId line`, the service
 *  id omitted when absent. Lower-cased once here so the pane and the report
 *  agree on every row. */
function haystack(e: DiagEntry): string {
  return `[${e.tag}]${e.serviceId ? ` ${e.serviceId}` : ''} ${e.line}`.toLowerCase();
}

export function matchesDiagFilter(entry: DiagEntry, filter: DiagFilter): boolean {
  if (filter.tags.length > 0 && !filter.tags.includes(entry.tag)) return false;
  const q = filter.query.trim().toLowerCase();
  return q === '' || haystack(entry).includes(q);
}

/** true when the filter can drop a row — what decides the `Filtered:` line
 *  and the Copy label */
export function diagFilterNarrows(filter: DiagFilter): boolean {
  return filter.tags.length > 0 || filter.query.trim() !== '';
}

/** `tag=nav,recipe · "zalo" · 12 of 87 lines`; tags or query left out when
 *  empty, the count always present */
export function describeDiagFilter(filter: DiagFilter, shown: number, total: number): string {
  const parts: string[] = [];
  if (filter.tags.length > 0) parts.push(`tag=${filter.tags.join(',')}`);
  const q = filter.query.trim();
  if (q !== '') parts.push(`"${q}"`);
  parts.push(`${shown} of ${total} lines`);
  return parts.join(' · ');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `corepack pnpm test -- tests/unit/diag-filter.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Lint and typecheck**

Run: `corepack pnpm lint && corepack pnpm typecheck`
Expected: both clean. If biome reorders the import block in the test, accept its fix (`corepack pnpm biome check --write tests/unit/diag-filter.test.ts`).

---

### Task 2: the ring reports through the filter (tests first)

**Files:**

- Modify: `src/main/lib/diagnostics.ts` (the `TAGS` set, `formatReport`, `Diagnostics.report`)
- Test: `tests/unit/diagnostics.test.ts`

**Interfaces:**

- Consumes: `isDiagTag`, `DiagFilter`, `EMPTY_DIAG_FILTER`, `matchesDiagFilter`, `diagFilterNarrows`, `describeDiagFilter` from Task 1.
- Produces: `formatReport(header: ReportHeader, oldestFirst: readonly DiagEntry[], filtered?: string): string` and `Diagnostics.report(header: ReportHeader, filter: DiagFilter = EMPTY_DIAG_FILTER): string`, which Task 3's handler calls.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/diagnostics.test.ts`, add `EMPTY_DIAG_FILTER` to the imports:

```ts
import { EMPTY_DIAG_FILTER } from '../../src/shared/diag-filter';
```

Then add inside `describe('Diagnostics ring', …)`, after the `'builds the report oldest first under the header'` case:

```ts
  it('narrows the report through a filter and names it in the header', () => {
    const { diag, tick } = harness(Date.UTC(2026, 8, 19, 10, 0, 0));
    diag.note('nav', 'contained: zalo a.example (/x)', 'zalo');
    tick(60_000);
    diag.note('recipe', 'zalo stale', 'zalo');
    const text = diag.report(header, { tags: ['recipe'], query: '' });
    expect(text.split('\n').slice(7)).toEqual([
      'Filtered: tag=recipe · 1 of 2 lines',
      '',
      '2026-09-19T10:01:00.000Z [recipe] zalo stale',
    ]);
  });

  it('leaves the report untouched under the empty filter or a blank query', () => {
    const { diag } = harness();
    diag.note('nav', 'contained: zalo a.example (/x)', 'zalo');
    const plain = diag.report(header);
    expect(plain).not.toContain('Filtered:');
    expect(diag.report(header, EMPTY_DIAG_FILTER)).toBe(plain);
    expect(diag.report(header, { tags: [], query: '   ' })).toBe(plain);
  });

  it('says (nothing matched) when a narrowing filter drops every line', () => {
    const { diag } = harness();
    diag.note('nav', 'contained: zalo a.example (/x)', 'zalo');
    const lines = diag.report(header, { tags: [], query: 'nope' }).split('\n');
    expect(lines[7]).toBe('Filtered: "nope" · 0 of 1 lines');
    expect(lines.at(-1)).toBe('(nothing matched)');
  });
```

And in `describe('formatReport', …)`:

```ts
  it('prints the filter line last in the header when given one', () => {
    const lines = formatReport(header, [], 'tag=app · 0 of 3 lines').split('\n');
    expect(lines[7]).toBe('Filtered: tag=app · 0 of 3 lines');
    expect(lines[8]).toBe('');
    expect(lines.at(-1)).toBe('(nothing matched)');
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `corepack pnpm test -- tests/unit/diagnostics.test.ts`
Expected: three of the four new cases FAIL — vitest does not typecheck, so the extra argument is silently ignored and every `Filtered:` assertion misses; the `untouched` case passes trivially now and guards the unfiltered format from here on. Every existing case still passes.

- [ ] **Step 3: Change `src/main/lib/diagnostics.ts`**

Replace the imports and the `TAGS` set at the top of the file:

```ts
import {
  type DiagFilter,
  describeDiagFilter,
  diagFilterNarrows,
  EMPTY_DIAG_FILTER,
  isDiagTag,
  matchesDiagFilter,
} from '../../shared/diag-filter';
import { SERVICES } from '../../shared/services';
import type { Counts, DiagEntry, DiagTag, ServiceId, Settings } from '../../shared/types';
```

Delete the `const TAGS: ReadonlySet<string> = new Set<DiagTag>([ … ]);` block entirely (the table now lives in `shared/diag-filter.ts`).

In `restoreEntries`, replace the tag check:

```ts
    if (!isDiagTag(r.tag)) continue;
```

and the entry construction no longer needs the cast:

```ts
    const entry: DiagEntry = {
      at: r.at,
      tag: r.tag,
      line: r.line.slice(0, DIAG_LINE_MAX),
    };
```

Replace `formatReport`:

```ts
/** Header block, blank line, then the lines oldest first: a reader scrolls
 *  down through time. The pane shows the same ring newest first. `filtered`
 *  is the describeDiagFilter text when a filter narrowed the rows — printed
 *  as the last header line so the reader knows rows were dropped and by
 *  what rule. */
export function formatReport(
  header: ReportHeader,
  oldestFirst: readonly DiagEntry[],
  filtered?: string,
): string {
  const head = [
    `Goetia ${header.version} · Electron ${header.electron} · ${header.platform} ${header.arch} · OS ${header.os}`,
    `Started ${new Date(header.startedAt).toISOString()} · up ${uptime(header.now - header.startedAt)}`,
    `Services: ${header.enabled.join(', ')}`,
    `Settings: ${header.settings}`,
    'Now:',
    ...header.services.map((l) => `  ${l}`),
    ...(filtered ? [`Filtered: ${filtered}`] : []),
    '',
  ];
  const body =
    oldestFirst.length === 0
      ? [filtered ? '(nothing matched)' : '(nothing recorded)']
      : oldestFirst.map((e) => `${new Date(e.at).toISOString()} [${e.tag}] ${e.line}`);
  return [...head, ...body].join('\n');
}
```

Replace `Diagnostics.report`:

```ts
  /** The pane's filter is applied here with the same rule the pane used, so
   *  the two can never disagree on which rows match. The empty filter is
   *  today's whole report, byte for byte. */
  report(header: ReportHeader, filter: DiagFilter = EMPTY_DIAG_FILTER): string {
    const rows = this.entries.filter((e) => matchesDiagFilter(e, filter));
    const filtered = diagFilterNarrows(filter)
      ? describeDiagFilter(filter, rows.length, this.entries.length)
      : undefined;
    return formatReport(header, rows, filtered);
  }
```

`DiagTag` stays imported — `note()` still takes it. If tsc does not carry the `isDiagTag` narrowing through to `tag: r.tag`, keep the old `r.tag as DiagTag` cast there.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `corepack pnpm test -- tests/unit/diagnostics.test.ts tests/unit/diag-filter.test.ts`
Expected: PASS, all cases including the four new ones and the existing `restoreEntries` case (a `bogus` tag is still dropped, now through `isDiagTag`).

- [ ] **Step 5: Lint and typecheck**

Run: `corepack pnpm lint && corepack pnpm typecheck`
Expected: clean.

---

### Task 3: the invoke carries the filter

**Files:**

- Modify: `src/shared/ipc.ts` (the `'diagnostics:report'` entry in `RendererInvoke`)
- Modify: `src/main/ipc-handlers.ts` (the `diagnostics:report` handler and its import block)
- Test: `tests/unit/ipc-sender-policy.test.ts` (no change needed — the existing `'refuses the diagnostics channels from a service frame'` case already covers `diagnostics:report`; a service frame is refused before the payload is read)

**Interfaces:**

- Consumes: `DiagFilter`, `normalizeDiagFilter` from Task 1; `Diagnostics.report(header, filter)` from Task 2.
- Produces: `window.goetia.invoke('diagnostics:report', { filter })` for Task 4. The preload's `invoke` spreads the payload from `RendererInvoke`, so no preload change.

- [ ] **Step 1: Type the payload in `src/shared/ipc.ts`**

Add to the imports at the top of the file:

```ts
import type { DiagFilter } from './diag-filter';
```

Replace the two diagnostics lines in `RendererInvoke`:

```ts
  /** Settings → Diagnostics: the evidence ring, fetched once per open and
   *  never broadcast; `report` is the pasteable text behind Copy report,
   *  narrowed by the pane's filter (normalised in main — it is renderer data)
   *  and stamped with a `Filtered:` header line when it narrows.
   *  Shell-only, so both are refused while locked. */
  'diagnostics:recent': { result: DiagEntry[] };
  'diagnostics:report': { payload: { filter: DiagFilter }; result: string };
```

- [ ] **Step 2: Typecheck to find the callers**

Run: `corepack pnpm typecheck`
Expected: one error in `src/renderer/src/components/DiagnosticsPane.tsx` — `invoke('diagnostics:report')` now requires a payload. Task 4 fixes it; the handler in main compiles either way because `payload` is only ever read.

- [ ] **Step 3: Normalise in the handler, `src/main/ipc-handlers.ts`**

Add to the imports:

```ts
import { normalizeDiagFilter } from '../shared/diag-filter';
```

Replace the handler:

```ts
  onInvoke('diagnostics:report', '', (payload) => {
    // renderer data until re-checked: unknown tags dropped, query clipped
    const filter = normalizeDiagFilter(payload?.filter);
    const s = ctx.settings.get();
    const enabled = s.order.filter((id) => !s.disabled[id]);
    return ctx.diag.report(
      {
        version: app.getVersion(),
        electron: process.versions.electron,
        platform: process.platform,
        arch: process.arch,
        os: release(),
        startedAt: ctx.startedAt,
        now: Date.now(),
        enabled,
        settings: settingsSummary(s),
        services: enabled.map((id) => {
          const rt = ctx.state.runtime(id);
          return serviceSnapshotLine({
            id,
            page: ctx.views.pageUrl(id),
            unread: rt.unread,
            stale: rt.stale,
            crashed: rt.crashed,
            muted: s.muted[id],
          });
        }),
      },
      filter,
    );
  });
```

`payload?.filter` keeps the optional chain on purpose: the type says the payload is present, but a bare invoke arrives as `undefined` at runtime and must become the empty filter, not a throw into the `blocked` path.

- [ ] **Step 4: Lint**

Run: `corepack pnpm lint`
Expected: clean (the typecheck error from Step 2 remains until Task 4).

---

### Task 4: the pane

**Files:**

- Modify: `src/renderer/src/components/DiagnosticsPane.tsx` (whole file)

**Interfaces:**

- Consumes: `DIAG_TAGS`, `DiagFilter`, `diagFilterNarrows`, `matchesDiagFilter` from Task 1; the payload from Task 3.
- Produces: test ids the e2e in Task 5 drives — `diag-search`, `diag-tag-<tag>`, `diag-copy`, `diag-row`, `diag-empty`, `diag-no-match`, `diag-show-all`; and `copyLabel(shown, total, narrows)`.

- [ ] **Step 1: Replace the file**

```tsx
import { useEffect, useMemo, useState } from 'react';
import {
  DIAG_TAGS,
  type DiagFilter,
  diagFilterNarrows,
  matchesDiagFilter,
} from '../../../shared/diag-filter';
import type { DiagEntry, DiagTag } from '../../../shared/types';
import { useShell } from '../store';
import { TOAST_MS } from './toast-rules';

/** `12s ago`, `4 min ago`, `2 h ago`, else a date — read at render time; the
 *  pane is fetched once per open, so a stale relative time is at most the
 *  time the pane has been on screen. */
export function relativeTime(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(at).toLocaleDateString();
}

/** The button says what it will copy: the whole report, or the shown rows. */
export function copyLabel(shown: number, total: number, narrows: boolean): string {
  return narrows ? `Copy ${shown} of ${total}` : 'Copy report';
}

const chipClass = (on: boolean) =>
  `rounded-ctl px-2 py-1 text-[11px] transition-colors duration-120 ${
    on ? 'bg-accent/15 font-medium text-accent' : 'bg-bg-2 text-text-2 hover:text-text-1'
  }`;

/** Settings → Diagnostics: the evidence ring, newest first, narrowed by a
 *  search field and tag chips, and one button that puts the pasteable
 *  report — the shown rows, when narrowed — on the clipboard. Fetched on
 *  open, never broadcast; the filter is component state and dies with the
 *  pane. See main/lib/diagnostics.ts and shared/diag-filter.ts. */
export default function DiagnosticsPane() {
  const services = useShell((s) => s.state?.services);
  const [entries, setEntries] = useState<DiagEntry[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [tags, setTags] = useState<DiagTag[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    window.goetia.invoke('diagnostics:recent').then(setEntries);
  }, []);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), TOAST_MS);
    return () => clearTimeout(t);
  }, [copied]);

  const filter = useMemo<DiagFilter>(() => ({ tags, query }), [tags, query]);
  const shown = useMemo(
    () => (entries ?? []).filter((e) => matchesDiagFilter(e, filter)),
    [entries, filter],
  );
  // chips only for tags the ring holds, so a chip alone never empties the list
  const present = useMemo(
    () => DIAG_TAGS.filter((t) => entries?.some((e) => e.tag === t)),
    [entries],
  );
  const narrows = diagFilterNarrows(filter);

  const toggleTag = (t: DiagTag) =>
    setTags((prev) =>
      prev.includes(t)
        ? prev.filter((x) => x !== t)
        : DIAG_TAGS.filter((x) => x === t || prev.includes(x)),
    );
  const showAll = () => {
    setTags([]);
    setQuery('');
  };

  const copy = async () => {
    const text = await window.goetia.invoke('diagnostics:report', { filter });
    await navigator.clipboard.writeText(text);
    setCopied(true);
  };

  if (entries === null) return null;
  const now = Date.now();
  const total = entries.length;
  return (
    <div>
      <div className="flex items-center justify-between gap-4 py-2">
        <p className="text-[11px] text-text-2">
          What Goetia noticed going wrong since it started: a badge counter that stopped, a login it
          had to contain, a page that crashed. Never a message, a name or a file.
        </p>
        <button
          type="button"
          data-testid="diag-copy"
          onClick={() => void copy()}
          className="flex-none rounded-ctl border border-border bg-bg-2 px-2.5 py-1 text-text-1 transition-colors duration-120 hover:border-accent"
        >
          {copied ? 'Copied' : copyLabel(shown.length, total, narrows)}
        </button>
      </div>
      {total === 0 ? (
        <p className="pb-3 text-[11px] text-text-2" data-testid="diag-empty">
          Nothing to report yet.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1 pb-2">
            <input
              type="text"
              value={query}
              placeholder="Filter lines…"
              aria-label="Filter lines"
              data-testid="diag-search"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // Escape with text clears the field and stops there; empty, it
                // reaches the Settings handler and closes Settings as anywhere else
                if (e.key === 'Escape' && query !== '') {
                  e.stopPropagation();
                  setQuery('');
                }
              }}
              className="w-[160px] rounded-ctl border border-border bg-bg-2 px-2 py-1 text-[12px] text-text-1 placeholder:text-text-2"
            />
            {present.map((t) => {
              const on = tags.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  data-testid={`diag-tag-${t}`}
                  aria-pressed={on}
                  onClick={() => toggleTag(t)}
                  className={chipClass(on)}
                >
                  {t}
                </button>
              );
            })}
          </div>
          {shown.length === 0 ? (
            <p className="pb-3 text-[11px] text-text-2" data-testid="diag-no-match">
              No lines match.{' '}
              <button
                type="button"
                data-testid="diag-show-all"
                onClick={showAll}
                className="text-accent hover:underline"
              >
                Show all
              </button>
            </p>
          ) : (
            <ul className="pb-2">
              {shown.map((e) => {
                const svc = e.serviceId ? services?.find((s) => s.id === e.serviceId) : undefined;
                return (
                  <li
                    key={`${e.at}-${e.tag}-${e.line}`}
                    data-testid="diag-row"
                    className="flex items-baseline gap-2 border-b border-border py-1.5 last:border-b-0"
                  >
                    <span className="tabular w-[72px] flex-none text-[11px] text-text-2">
                      {relativeTime(e.at, now)}
                    </span>
                    <span
                      aria-hidden="true"
                      className="mt-1 h-[7px] w-[7px] flex-none self-center rounded-full"
                      style={{ background: svc?.color ?? 'transparent' }}
                    />
                    <span className="min-w-0 break-words text-[12px] text-text-1">
                      <span className="text-text-2">[{e.tag}]</span> {e.line}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
```

Why `e.stopPropagation()` works against the Settings Escape handler: `SettingsView` listens with `window.addEventListener('keydown', …)`; React dispatches at its root container below `window`, and a synthetic `stopPropagation` stops the native event there, so the window listener never runs for that keystroke.

- [ ] **Step 2: Typecheck, lint, unit tests**

Run: `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test`
Expected: all clean; the Task 3 typecheck error is gone. If biome's `useExhaustiveDependencies` objects to the `useMemo` blocks, the dependency arrays above are exactly the values each callback reads — accept its fix only if it agrees.

- [ ] **Step 3: Look at it**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm dev`, open Settings → Diagnostics. Check: the field and the chips sit in one row under the description; typing narrows the list at once; a chip highlights in the accent and the Copy label changes to `Copy n of m`; a nonsense query shows `No lines match.` with Show all; Escape with text in the field clears it and leaves Settings open; Escape again closes Settings. Quit with `⌘Q`.

---

### Task 5: e2e

**Files:**

- Modify: `tests/e2e/diagnostics.spec.ts` (the tail of the single test, from the first `diag-copy` click)

**Interfaces:**

- Consumes: the test ids from Task 4; the `Filtered:` header line from Task 2. At this point in the test the ring holds three rows — the hook's `[recipe] zalo stale`, this launch's `[app] started` and the restored one — so the numbers below are `1 of 3` and `2 of 3`.

- [ ] **Step 1: Replace the tail of the test**

Replace everything from `await win.getByTestId('diag-copy').click();` to the end of the test body (keep `await app.close();`) with:

```ts
  // the filter narrows what is shown and what Copy says it will copy —
  // asserted before the first copy, since 'Copied' then holds the label for TOAST_MS
  const copy = win.getByTestId('diag-copy');
  const search = win.getByTestId('diag-search');
  await expect(copy).toHaveText('Copy report');
  await search.fill('STALE');
  await expect(rows).toHaveCount(1);
  await expect(copy).toHaveText('Copy 1 of 3');
  await search.fill('nothing like this');
  await expect(win.getByTestId('diag-no-match')).toBeVisible();
  await win.getByTestId('diag-show-all').click();
  await expect(search).toHaveValue('');
  await expect(rows).toHaveCount(3);
  await win.getByTestId('diag-tag-app').click();
  await expect(win.getByTestId('diag-tag-app')).toHaveAttribute('aria-pressed', 'true');
  await expect(rows).toHaveCount(2);
  await expect(copy).toHaveText('Copy 2 of 3');

  // a filtered copy carries the Filtered: line last in the header and only the shown rows
  await copy.click();
  await expect(copy).toHaveText('Copied');
  await expect
    .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
    .toContain('Filtered: tag=app · 2 of 3 lines');
  const filtered = (await app.evaluate(({ clipboard }) => clipboard.readText())).split('\n');
  const gap = filtered.indexOf('');
  expect(filtered[gap - 1]).toBe('Filtered: tag=app · 2 of 3 lines');
  const shownBody = filtered.slice(gap + 1);
  expect(shownBody).toHaveLength(2);
  for (const l of shownBody) expect(l).toContain('[app] started');

  // chip off again: the whole report, byte for byte as before
  await win.getByTestId('diag-tag-app').click();
  await expect(rows).toHaveCount(3);
  await copy.click();
  await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).not.toContain('Filtered:');
  const text = await app.evaluate(({ clipboard }) => clipboard.readText());
  const lines = text.split('\n');
  expect(lines[0]).toMatch(/^Goetia \d+\.\d+\.\d+ · Electron \d+\.\d+\.\d+ · \w+ \w+ · OS /);
  expect(lines[1]).toMatch(/^Started \d{4}-.* · up \d+m$/);
  expect(lines[2]).toBe('Services: zalo');
  expect(lines[3]).toMatch(/^Settings: lightSleep=on /);
  expect(lines[4]).toBe('Now:');
  expect(lines[5]).toMatch(/^ {2}zalo: (live · |asleep)/);
  const blank = lines.indexOf('');
  expect(blank).toBeGreaterThan(5);
  // the previous launch's ring came back from disk, so its start marker
  // precedes this launch's, then the hook's line
  const body = lines.slice(blank + 1);
  expect(body.filter((l) => l.includes('[app] started'))).toHaveLength(2);
  expect(body.at(-1)).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z \[recipe\] zalo stale$/);
```

The two `expect.poll` calls exist because the second and third copies click a button that already reads `Copied`, so the label cannot signal that the clipboard write has landed; polling the clipboard for the line that distinguishes each report does.

- [ ] **Step 2: Run the e2e**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e -- tests/e2e/diagnostics.spec.ts`
Expected: 1 passed. If it fails on `Copy 1 of 3`, check the ring holds exactly three rows at that point (the count assertions just above it), not the label code.

- [ ] **Step 3: Full gates**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: clean, every unit file green.

---

### Task 6: docs

**Files:**

- Modify: `docs/FEATURES.md` (the `Settings → Diagnostics` bullet, line 76)
- Modify: `CLAUDE.md` (the `Evidence lines go through ctx.diag.note` bullet, line 72)
- Modify: `docs/superpowers/specs/2026-09-22-diagnostics-filter-design.md` (the status line)

- [ ] **Step 1: FEATURES.md**

In the `Settings → Diagnostics` bullet, replace the sentence `Both channels shell-only and so refused while locked.` with:

```text
A search field (tag, service id and line text, case-insensitive substring) and one chip per tag present in the ring narrow the list; while a filter narrows, **Copy report** reads `Copy <shown> of <total>` and the copied text carries only the shown rows under a `Filtered: tag=… · "…" · n of m lines` header line (`shared/diag-filter.ts`, the one rule the pane and main both apply — the filter crosses IPC as data and is normalised in main). There is no Clear: the ring is evidence (2026-09-22, user decision). Both channels shell-only and so refused while locked.
```

And in the same bullet's `Impl:` list add `shared/diag-filter.ts`; in `Verified:` add `diag-filter.test.ts` and extend the e2e note to `(incl. the ring surviving a relaunch, and a filtered copy)`.

- [ ] **Step 2: CLAUDE.md**

At the end of the `Evidence lines go through ctx.diag.note` bullet, after `views.ts reaches it through ViewHooks.note.`, append one sentence:

```text
The pane's search and tag chips (2026-09-22) are one pure rule in `shared/diag-filter.ts` applied by both the pane and `Diagnostics.report`, so a filtered **Copy report** can never disagree with what is on screen; the filter crosses `diagnostics:report` as data (`normalizeDiagFilter`) and nothing about it is persisted. **There is no Clear** (user decision, same day): the ring is evidence, the 200-line cap rotates noise out, and Clear would defeat the restore-at-boot the 2026-09-20 amendment added — do not add one.
```

- [ ] **Step 3: Spec status**

In the spec's first paragraph change `Status: approved in brainstorm (user decision, same day); not implemented.` to `Status: implemented 2026-09-22.`

- [ ] **Step 4: Lint the markdown**

Run: `npx markdownlint-cli2 docs/FEATURES.md CLAUDE.md docs/superpowers/specs/2026-09-22-diagnostics-filter-design.md docs/superpowers/plans/2026-09-22-diagnostics-filter.md`
Expected: `Summary: 0 issues`.

- [ ] **Step 5: Hand off**

Do not commit. Report: the files touched, the gate results (lint, typecheck, unit count, the e2e result), and ask the user to run `/commit`.
