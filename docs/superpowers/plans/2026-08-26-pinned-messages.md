# Pinned Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pinboard on Home — right-click any message in any service to pin it, order pins by priority (pin 0 is "in progress"), click to jump back to the conversation, mark Done/unpin with Undo — persisted across restarts.

**Architecture:** A `PinStore` in main owns the ordered list and persists it to `pins.json` (via `conf`, like `SettingsStore`); pure rules live in `lib/pin-rules.ts`. Capture is main-side: the existing context-menu builder gains a `pin-message` item and the `views.ts` wiring hands the selection + page URL to main through a new `ViewHooks` callback — no service-side IPC. Renderer-safe rows (`PinView`, hrefless) ride `ShellState.pins`; five shell-only channels mutate/open pins; opening reuses `resolveBannerClick` → `performBannerAction` verbatim. Home renders a `PinnedBand` (altar + scrolling queue, one `Reorder.Group`); a tally pill beside the rail's Home sigil shows the count and pulses on a new pin.

**Tech Stack:** Electron 43, TypeScript, React 19, Tailwind 4, `motion` (Reorder + `useDragControls`), zustand, `conf`, vitest, Playwright (Electron).

Spec: `docs/superpowers/specs/2026-08-25-pinned-messages-design.md`. Mock: the "Goetia Pinboard" artifact (focus altar, compact two-line card).

## Global Constraints

- Definition of done for every task: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` green. Final task also runs `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e` (VS Code shells export `ELECTRON_RUN_AS_NODE`, which breaks Playwright's Electron launch).
- **Commits: never run `git commit` yourself.** Every "Commit" step below means: stop and ask the user to run `/grimoire-core:commit`; the user confirms the drafted message. No `Co-Authored-By` trailers, no `--amend`.
- `src/shared/**` stays process-agnostic: no `electron`, no DOM imports.
- Every new IPC channel is shell-only: add it to `R2M_CHANNELS` **and** `SHELL_ONLY_CHANNELS` in `src/shared/ipc.ts`; register through the `on()` wrapper in `ipc-handlers.ts` only.
- Renderer CSP: no `innerHTML` / `dangerouslySetInnerHTML`; pinned text renders as React text nodes only.
- Reorder never streams to IPC: drag-local draft, one `pins:reorder` per drop, draft cleared when the broadcast lands (not on commit).
- Pin acknowledgement at pin time is a **tally pill beside the Home sigil** (pin glyph + count) that pulses — never a badge on the sigil (a top-right count circle is the unread language) and **no shell toast at pin time** (the service page covers the shell). Toasts only for Done/unpin on Home.
- Constants (verbatim from spec): `PIN_CAP = 50`, `PIN_TEXT_MAX = 300`, `PIN_NOTE_MAX = 200`. Menu label `Pin Message`; at cap `Pin Message — 50 max`. Toast copy `Done — nice.` / `Unpinned.`. Empty state `Nothing pinned — right-click a message in any service.`
- Markdown you edit (CLAUDE.md, FEATURES.md, this plan, the spec) must pass `npx markdownlint-cli2 <file>` with 0 issues; never hard-wrap prose.
- Code comments: why, not what; match the surrounding density.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/shared/pins.ts` (new) | `PIN_CAP`, `PIN_TEXT_MAX`, `PIN_NOTE_MAX` — shared by main and renderer |
| `src/shared/types.ts` | `PinView`; `ShellState.pins` |
| `src/shared/ipc.ts` | five `pins:*` channels, shell-only |
| `src/main/lib/pin-rules.ts` (new) | pure: `Pin` type, `clampText`, `isPermutation`, `parsePins`, `pinViews` |
| `src/main/pins.ts` (new) | `PinStore`: ordered list + `conf`-backed `pins.json` + `lastRemoved` for Undo |
| `src/main/lib/context-menu.ts` | `pin-message` item; `ContextMenuInfo` gains `pageTitle`, `serviceOrigin`, `pinsFull` |
| `src/main/views.ts` | `ViewHooks.onPinMessage` / `pinsFull`; wiring + `menuItemFor` case |
| `src/main/state.ts` | `snapshot(..., pins)` |
| `src/main/ipc-handlers.ts` | `AppContext.pins`; five handlers |
| `src/main/index.ts` | construct `PinStore`, wire hooks, ctx, snapshot |
| `src/renderer/src/components/toast-rules.ts` | `pinRemovedMessage` |
| `src/renderer/src/store.ts` | `pinToast` |
| `src/renderer/src/components/PinToast.tsx` (new) | Done/unpin toast with Undo |
| `src/renderer/src/components/Rail.tsx` | pin tally pill beside the sigil + pulse |
| `src/renderer/src/tokens.css` | `.tally-pulse` |
| `src/renderer/src/components/welcome/PinnedBand.tsx` (new) | altar + queue, drag reorder, inline note |
| `src/renderer/src/components/Welcome.tsx` | mount `PinnedBand`; Unbound keeps one row |
| `src/renderer/src/App.tsx` | mount `PinToast` |
| `tests/unit/pin-rules.test.ts`, `tests/unit/pins.test.ts` (new); `context-menu.test.ts`, `state.test.ts`, `toast-rules.test.ts`, `ipc-sender-policy.test.ts` (rows) | unit coverage |
| `tests/e2e/pins.spec.ts` (new) | end-to-end with a pre-seeded `pins.json` |
| `CLAUDE.md`, `docs/FEATURES.md`, the spec | docs |

---

### Task 1: Shared types, constants and IPC channels

**Files:**

- Create: `src/shared/pins.ts`
- Modify: `src/shared/types.ts` (after `ActivityEntryView`, and in `ShellState`)
- Modify: `src/shared/ipc.ts`
- Test: `tests/unit/ipc-sender-policy.test.ts`

**Interfaces:**

- Produces: `PinView { id; serviceId; text; note; at }`, `ShellState.pins: PinView[]`, constants `PIN_CAP/PIN_TEXT_MAX/PIN_NOTE_MAX`, channels `pins:reorder {ids:number[]}`, `pins:unpin {id}`, `pins:restore {id}`, `pins:setNote {id; note}`, `pins:open {id}`.

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe` in `tests/unit/ipc-sender-policy.test.ts` (the file already imports `ipcSenderAllowed`):

```ts
  it('keeps every pins:* channel shell-only', () => {
    const channels = [
      'pins:reorder',
      'pins:unpin',
      'pins:restore',
      'pins:setNote',
      'pins:open',
    ] as const;
    for (const channel of channels) {
      expect(
        ipcSenderAllowed({
          channel,
          fromShell: true,
          senderServiceId: null,
          payloadServiceId: undefined,
        }),
      ).toBe(true);
      // a service frame naming itself is still refused: only the shell pins
      expect(
        ipcSenderAllowed({
          channel,
          fromShell: false,
          senderServiceId: 'zalo',
          payloadServiceId: 'zalo',
        }),
      ).toBe(false);
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test -- tests/unit/ipc-sender-policy.test.ts`
Expected: FAIL — TypeScript/vitest complains `'pins:reorder'` is not assignable to `keyof RendererToMain` (or the assertion `toBe(true)` fails because an unknown channel is treated as a service channel).

- [ ] **Step 3: Add the shared constants**

Create `src/shared/pins.ts`:

```ts
/** The pinboard's limits. Shared: main enforces them, the renderer mirrors
 *  them on the note input and the menu label. */
export const PIN_CAP = 50;
export const PIN_TEXT_MAX = 300;
export const PIN_NOTE_MAX = 200;
```

- [ ] **Step 4: Add `PinView` and `ShellState.pins`**

In `src/shared/types.ts`, directly after the `ActivityEntryView` interface:

```ts
/** What Home renders per pin. Hrefless like ActivityEntryView: the
 *  conversation URL stays in main and is re-validated at open time. */
export interface PinView {
  id: number;
  serviceId: ServiceId;
  /** the captured selection — the "message" */
  text: string;
  /** the user's brief description, '' until edited */
  note: string;
  at: number;
}
```

In `ShellState`, after `capTrimmed: ServiceId[];`:

```ts
  /** the pinboard in priority order; pins[0] is the one in progress */
  pins: PinView[];
```

- [ ] **Step 5: Add the channels**

In `src/shared/ipc.ts`, inside `RendererToMain` after `'activity:open'`:

```ts
  /** Home's pinboard. All shell-only; ids are opaque handles into PinStore
   *  and hrefs never cross IPC — main re-validates at open time. */
  'pins:reorder': { ids: number[] };
  'pins:unpin': { id: number };
  /** undo the most recent unpin/Done */
  'pins:restore': { id: number };
  'pins:setNote': { id: number; note: string };
  'pins:open': { id: number };
```

Add to `R2M_CHANNELS` after `'activity:open',`:

```ts
  'pins:reorder',
  'pins:unpin',
  'pins:restore',
  'pins:setNote',
  'pins:open',
```

Add the same five strings to `SHELL_ONLY_CHANNELS` after `'activity:open',`.

- [ ] **Step 6: Run test and typecheck**

Run: `corepack pnpm test -- tests/unit/ipc-sender-policy.test.ts && corepack pnpm typecheck`
Expected: the new test PASSES. Typecheck FAILS in `src/main/state.ts` (`pins` missing from the `ShellState` literal) — that is Task 5's job; note it and continue. (If you prefer a green typecheck now, add `pins: [],` to the `snapshot()` return in `state.ts` temporarily; Task 5 replaces it.)

- [ ] **Step 7: Commit**

Ask the user to run `/grimoire-core:commit` with a message like `feat(pins): shared pin types, limits and shell-only channels`.

---

### Task 2: Pure pin rules

**Files:**

- Create: `src/main/lib/pin-rules.ts`
- Test: `tests/unit/pin-rules.test.ts`

**Interfaces:**

- Consumes: `PinView`, `ServiceId` (Task 1), `PIN_*` constants (Task 1).
- Produces: `interface Pin { id; serviceId; text; note; href; at }`, `clampText(raw, max): string`, `isPermutation(ids, current): boolean`, `parsePins(raw: unknown, known: ReadonlySet<string>): Pin[]`, `pinViews(pins): PinView[]`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/pin-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  clampText,
  isPermutation,
  type Pin,
  parsePins,
  pinViews,
} from '../../src/main/lib/pin-rules';
import { PIN_TEXT_MAX } from '../../src/shared/pins';

const KNOWN = new Set(['zalo', 'messenger']);

const pin = (over: Partial<Pin> = {}): Pin => ({
  id: 1,
  serviceId: 'zalo',
  text: 'hello',
  note: '',
  href: 'https://chat.zalo.me/',
  at: 5,
  ...over,
});

describe('clampText', () => {
  it('collapses whitespace and trims — a pin row has one line', () => {
    expect(clampText('  a\n\n  b\t c  ', 300)).toBe('a b c');
  });

  it('caps with an ellipsis at max', () => {
    const out = clampText('x'.repeat(400), PIN_TEXT_MAX);
    expect(out).toHaveLength(PIN_TEXT_MAX);
    expect(out.endsWith('…')).toBe(true);
  });

  it('leaves short text alone', () => {
    expect(clampText('short', 10)).toBe('short');
  });
});

describe('isPermutation', () => {
  it('accepts the same ids in another order', () => {
    expect(isPermutation([3, 1, 2], [1, 2, 3])).toBe(true);
  });

  it('rejects a drop, a duplicate and a stranger', () => {
    expect(isPermutation([1, 2], [1, 2, 3])).toBe(false);
    expect(isPermutation([1, 1, 3], [1, 2, 3])).toBe(false);
    expect(isPermutation([1, 2, 9], [1, 2, 3])).toBe(false);
  });
});

describe('parsePins', () => {
  it('returns [] for anything that is not an array', () => {
    for (const raw of [undefined, null, 'x', 42, {}]) expect(parsePins(raw, KNOWN)).toEqual([]);
  });

  it('keeps well-formed pins and clamps their text', () => {
    const out = parsePins([pin({ text: '  hi   there ' })], KNOWN);
    expect(out).toEqual([pin({ text: 'hi there' })]);
  });

  it('drops malformed entries, unknown services, empty text and duplicate ids', () => {
    const out = parsePins(
      [
        null,
        'junk',
        pin({ id: 1 }),
        pin({ id: 1, text: 'dup' }),
        pin({ id: 2, serviceId: 'gone' as Pin['serviceId'] }),
        pin({ id: 3, text: '   ' }),
        { ...pin({ id: 4 }), href: 7 },
        pin({ id: 5, serviceId: 'messenger' }),
      ],
      KNOWN,
    );
    expect(out.map((p) => p.id)).toEqual([1, 5]);
  });

  it('defaults a missing note and a bad timestamp', () => {
    const raw = { id: 1, serviceId: 'zalo', text: 'x', href: 'https://chat.zalo.me/', at: 'no' };
    expect(parsePins([raw], KNOWN)).toEqual([pin({ text: 'x', at: 0 })]);
  });
});

describe('pinViews', () => {
  it('never exposes hrefs to the renderer', () => {
    const views = pinViews([pin()]);
    expect(views).toEqual([{ id: 1, serviceId: 'zalo', text: 'hello', note: '', at: 5 }]);
    expect('href' in views[0]).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `corepack pnpm test -- tests/unit/pin-rules.test.ts`
Expected: FAIL — `Cannot find module '../../src/main/lib/pin-rules'`.

- [ ] **Step 3: Implement**

Create `src/main/lib/pin-rules.ts`:

```ts
import { PIN_NOTE_MAX, PIN_TEXT_MAX } from '../../shared/pins';
import type { PinView, ServiceId } from '../../shared/types';

export interface Pin {
  id: number;
  serviceId: ServiceId;
  /** the captured selection — the "message" */
  text: string;
  /** the user's brief description, '' until edited */
  note: string;
  /** document URL at pin time; validated only at open time */
  href: string;
  at: number;
}

/** Collapse whitespace, trim, cap with an ellipsis — a selection can span a
 *  whole thread, and a pin row has one line. */
export function clampText(raw: string, max: number): string {
  const flat = raw.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** A reorder is a permutation of the current ids or it is ignored: a stale
 *  renderer must never drop or duplicate a pin. */
export function isPermutation(ids: readonly number[], current: readonly number[]): boolean {
  if (ids.length !== current.length) return false;
  const seen = new Set(ids);
  return seen.size === ids.length && current.every((id) => seen.has(id));
}

/** Tolerant loader for pins.json: anything not a well-formed pin is dropped,
 *  as is a pin for a service no longer in the catalog. Ids stay unique. */
export function parsePins(raw: unknown, known: ReadonlySet<string>): Pin[] {
  if (!Array.isArray(raw)) return [];
  const out: Pin[] = [];
  const ids = new Set<number>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const r = entry as Record<string, unknown>;
    if (typeof r.id !== 'number' || !Number.isInteger(r.id) || r.id <= 0 || ids.has(r.id)) continue;
    if (typeof r.serviceId !== 'string' || !known.has(r.serviceId)) continue;
    if (typeof r.text !== 'string' || typeof r.href !== 'string') continue;
    const text = clampText(r.text, PIN_TEXT_MAX);
    if (text === '') continue;
    ids.add(r.id);
    out.push({
      id: r.id,
      serviceId: r.serviceId as ServiceId,
      text,
      note: typeof r.note === 'string' ? clampText(r.note, PIN_NOTE_MAX) : '',
      href: r.href,
      at: typeof r.at === 'number' && Number.isFinite(r.at) ? r.at : 0,
    });
  }
  return out;
}

/** Renderer rows: display fields and the opaque id — never the href. */
export function pinViews(pins: readonly Pin[]): PinView[] {
  return pins.map(({ id, serviceId, text, note, at }) => ({ id, serviceId, text, note, at }));
}
```

- [ ] **Step 4: Run tests**

Run: `corepack pnpm test -- tests/unit/pin-rules.test.ts && corepack pnpm lint`
Expected: all PASS; lint clean.

- [ ] **Step 5: Commit**

Ask the user to run `/grimoire-core:commit`: `feat(pins): pure pin rules — clamp, permutation guard, tolerant loader`.

---

### Task 3: `PinStore` with `pins.json` persistence

**Files:**

- Create: `src/main/pins.ts`
- Test: `tests/unit/pins.test.ts`

**Interfaces:**

- Consumes: Task 2 helpers; `SERVICES` from `src/shared/services.ts`; `conf`.
- Produces: `class PinStore { constructor(cwd: string); all(): readonly Pin[]; get(id): Pin | undefined; isFull(): boolean; views(): PinView[]; pin(input: { serviceId; text; href; at }): Pin | null; unpin(id): boolean; restore(id): boolean; setNote(id, note): boolean; reorder(ids: number[]): boolean }`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/pins.test.ts`:

```ts
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PinStore } from '../../src/main/pins';
import { PIN_CAP } from '../../src/shared/pins';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'goetia-pins-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const input = (text: string, serviceId: 'zalo' | 'messenger' = 'zalo') => ({
  serviceId,
  text,
  href: 'https://chat.zalo.me/',
  at: 1,
});

describe('PinStore', () => {
  it('starts empty and appends to the end of the queue', () => {
    const store = new PinStore(dir);
    expect(store.views()).toEqual([]);
    store.pin(input('first'));
    store.pin(input('second'));
    expect(store.views().map((p) => p.text)).toEqual(['first', 'second']);
    expect(store.views().map((p) => p.id)).toEqual([1, 2]);
  });

  it('refuses at the cap and reports isFull', () => {
    const store = new PinStore(dir);
    for (let i = 0; i < PIN_CAP; i++) store.pin(input(`p${i}`));
    expect(store.isFull()).toBe(true);
    expect(store.pin(input('one more'))).toBeNull();
    expect(store.all()).toHaveLength(PIN_CAP);
  });

  it('refuses a selection that clamps to nothing', () => {
    const store = new PinStore(dir);
    expect(store.pin(input('  \n '))).toBeNull();
    expect(store.all()).toHaveLength(0);
  });

  it('persists across instances and never reuses an id', () => {
    const a = new PinStore(dir);
    a.pin(input('keep'));
    a.pin(input('drop'));
    a.unpin(2);
    const b = new PinStore(dir);
    expect(b.views().map((p) => p.text)).toEqual(['keep']);
    expect(b.pin(input('new'))?.id).toBe(2); // ids continue from the highest kept id
    expect(readFileSync(join(dir, 'pins.json'), 'utf8')).toContain('"new"');
  });

  it('recovers from a corrupt file with an empty board', () => {
    writeFileSync(join(dir, 'pins.json'), '{ not json');
    expect(new PinStore(dir).views()).toEqual([]);
  });

  it('drops pins for services no longer in the catalog at load', () => {
    writeFileSync(
      join(dir, 'pins.json'),
      JSON.stringify({
        pins: [
          { id: 1, serviceId: 'gone', text: 'x', note: '', href: 'https://a/', at: 1 },
          { id: 2, serviceId: 'zalo', text: 'y', note: '', href: 'https://chat.zalo.me/', at: 1 },
        ],
      }),
    );
    expect(new PinStore(dir).views().map((p) => p.id)).toEqual([2]);
  });

  it('unpin then restore puts the pin back at its old index', () => {
    const store = new PinStore(dir);
    store.pin(input('a'));
    store.pin(input('b'));
    store.pin(input('c'));
    expect(store.unpin(2)).toBe(true);
    expect(store.views().map((p) => p.text)).toEqual(['a', 'c']);
    expect(store.restore(2)).toBe(true);
    expect(store.views().map((p) => p.text)).toEqual(['a', 'b', 'c']);
  });

  it('restore only undoes the most recent removal, once', () => {
    const store = new PinStore(dir);
    store.pin(input('a'));
    store.pin(input('b'));
    store.unpin(1);
    store.unpin(2);
    expect(store.restore(1)).toBe(false); // superseded
    expect(store.restore(2)).toBe(true);
    expect(store.restore(2)).toBe(false); // already back
    expect(store.unpin(99)).toBe(false);
  });

  it('restore clamps the index when the board shrank meanwhile', () => {
    const store = new PinStore(dir);
    store.pin(input('a'));
    store.pin(input('b'));
    store.pin(input('c'));
    store.unpin(3);
    store.reorder([2, 1]);
    // lastRemoved survives a reorder; the old index 2 still fits at the end
    expect(store.restore(3)).toBe(true);
    expect(store.views().map((p) => p.text)).toEqual(['b', 'a', 'c']);
  });

  it('setNote clamps, persists, and reports a no-op', () => {
    const store = new PinStore(dir);
    store.pin(input('a'));
    expect(store.setNote(1, '  after   lunch ')).toBe(true);
    expect(store.views()[0].note).toBe('after lunch');
    expect(store.setNote(1, 'after lunch')).toBe(false);
    expect(store.setNote(42, 'x')).toBe(false);
    expect(new PinStore(dir).views()[0].note).toBe('after lunch');
  });

  it('reorder accepts only a permutation and ignores a no-op', () => {
    const store = new PinStore(dir);
    store.pin(input('a'));
    store.pin(input('b'));
    store.pin(input('c'));
    expect(store.reorder([1, 2, 3])).toBe(false);
    expect(store.reorder([1, 2])).toBe(false);
    expect(store.reorder([3, 1, 2])).toBe(true);
    expect(store.views().map((p) => p.text)).toEqual(['c', 'a', 'b']);
    expect(new PinStore(dir).views().map((p) => p.text)).toEqual(['c', 'a', 'b']);
  });

  it('views carry no href', () => {
    const store = new PinStore(dir);
    store.pin(input('a'));
    expect('href' in store.views()[0]).toBe(false);
    expect(store.get(1)?.href).toBe('https://chat.zalo.me/');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `corepack pnpm test -- tests/unit/pins.test.ts`
Expected: FAIL — `Cannot find module '../../src/main/pins'`.

- [ ] **Step 3: Implement**

Create `src/main/pins.ts`:

```ts
import Conf from 'conf';
import { PIN_CAP, PIN_NOTE_MAX, PIN_TEXT_MAX } from '../shared/pins';
import { SERVICES } from '../shared/services';
import type { PinView, ServiceId } from '../shared/types';
import { clampText, isPermutation, type Pin, parsePins, pinViews } from './lib/pin-rules';

interface PinsFile {
  pins: Pin[];
}

/** The pinboard: an ordered todo list of messages the user chose to keep.
 *  Persisted to <cwd>/pins.json — the one deliberate exception to
 *  "conversation content never touches disk": unchosen content (the activity
 *  log) still never does; a pin is explicit, and it leaves the file with the
 *  pin. One atomic write per mutation: every mutation is a user click, and a
 *  drag reaches here once, so nothing needs deferring. */
export class PinStore {
  private conf: Conf<PinsFile>;
  private pins: Pin[];
  private nextId: number;
  /** the most recent removal, kept for one Undo */
  private lastRemoved: { pin: Pin; index: number } | null = null;

  constructor(cwd: string) {
    this.conf = new Conf<PinsFile>({
      cwd,
      configName: 'pins',
      defaults: { pins: [] },
      // a corrupt file yields the defaults instead of a throw at boot
      clearInvalidConfig: true,
    });
    this.pins = parsePins(this.conf.store.pins, new Set(SERVICES.map((s) => s.id)));
    this.nextId = this.pins.reduce((max, p) => Math.max(max, p.id), 0) + 1;
  }

  all(): readonly Pin[] {
    return this.pins;
  }

  get(id: number): Pin | undefined {
    return this.pins.find((p) => p.id === id);
  }

  isFull(): boolean {
    return this.pins.length >= PIN_CAP;
  }

  views(): PinView[] {
    return pinViews(this.pins);
  }

  /** Append to the end of the queue. Null when full or when nothing pinnable
   *  survives clamping. */
  pin(input: { serviceId: ServiceId; text: string; href: string; at: number }): Pin | null {
    if (this.isFull()) return null;
    const text = clampText(input.text, PIN_TEXT_MAX);
    if (text === '') return null;
    const pin: Pin = {
      id: this.nextId++,
      serviceId: input.serviceId,
      text,
      note: '',
      href: input.href,
      at: input.at,
    };
    this.pins = [...this.pins, pin];
    this.save();
    return pin;
  }

  /** Done and unpin both land here: the pin leaves the board and stays
   *  restorable until the next removal. */
  unpin(id: number): boolean {
    const index = this.pins.findIndex((p) => p.id === id);
    if (index === -1) return false;
    this.lastRemoved = { pin: this.pins[index], index };
    this.pins = this.pins.filter((p) => p.id !== id);
    this.save();
    return true;
  }

  /** Undo the last removal, back at its old position (clamped to the end). */
  restore(id: number): boolean {
    const last = this.lastRemoved;
    if (!last || last.pin.id !== id || this.isFull()) return false;
    const next = [...this.pins];
    next.splice(Math.min(last.index, next.length), 0, last.pin);
    this.pins = next;
    this.lastRemoved = null;
    this.save();
    return true;
  }

  setNote(id: number, note: string): boolean {
    const pin = this.get(id);
    if (!pin) return false;
    const clamped = clampText(note, PIN_NOTE_MAX);
    if (clamped === pin.note) return false;
    this.pins = this.pins.map((p) => (p.id === id ? { ...p, note: clamped } : p));
    this.save();
    return true;
  }

  reorder(ids: number[]): boolean {
    const current = this.pins.map((p) => p.id);
    if (!isPermutation(ids, current) || ids.every((id, i) => id === current[i])) return false;
    const byId = new Map(this.pins.map((p) => [p.id, p]));
    this.pins = ids.map((id) => byId.get(id)).filter((p): p is Pin => p !== undefined);
    this.save();
    return true;
  }

  private save(): void {
    // assigning the store is one atomic write, same as SettingsStore
    this.conf.store = { pins: this.pins };
  }
}
```

- [ ] **Step 4: Run tests**

Run: `corepack pnpm test -- tests/unit/pins.test.ts && corepack pnpm lint`
Expected: all PASS; lint clean.

- [ ] **Step 5: Commit**

Ask the user to run `/grimoire-core:commit`: `feat(pins): PinStore persisted to pins.json with one-step undo`.

---

### Task 4: Context-menu `pin-message` item

**Files:**

- Modify: `src/main/lib/context-menu.ts`
- Test: `tests/unit/context-menu.test.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces: `ContextMenuInfo` gains `pageTitle: string`, `serviceOrigin: string`, `pinsFull: boolean`; `ContextMenuItem` gains `{ kind: 'pin-message'; text: string; href: string | null; enabled: boolean }` (`href: null` = "the document URL — wiring supplies it"). Section order: spelling, edit, **pin**, link, image.

- [ ] **Step 1: Update the test fixture and add failing tests**

In `tests/unit/context-menu.test.ts`, extend `base`:

```ts
const base: ContextMenuInfo = {
  misspelledWord: '',
  dictionarySuggestions: [],
  isEditable: false,
  editFlags: noEdit,
  selectionText: '',
  linkURL: '',
  imageURL: '',
  pageTitle: '',
  serviceOrigin: 'https://chat.zalo.me',
  pinsFull: false,
};
```

Replace the expectation of `'offers Copy alone for a bare selection outside an editable field'` with:

```ts
    ).toEqual([
      { kind: 'edit', action: 'copy', enabled: true },
      { kind: 'separator' },
      { kind: 'pin-message', text: 'hello', href: null, enabled: true },
    ]);
```

and rename that test to `'offers Copy and Pin Message for a bare selection outside an editable field'`.

Replace the expectation of `'never offers spelling items outside an editable field'` with:

```ts
    ).toEqual([
      { kind: 'edit', action: 'copy', enabled: true },
      { kind: 'separator' },
      { kind: 'pin-message', text: 'goetya', href: null, enabled: true },
    ]);
```

Then add, before the `'separates sections…'` test:

```ts
  it('pins the trimmed selection, sitting between the edit and link sections', () => {
    const items = buildContextMenuTemplate(
      info({
        isEditable: true,
        editFlags: allEdit,
        selectionText: '  quoted text ',
        linkURL: 'https://example.com/x',
      }),
    );
    expect(items.map((i) => i.kind)).toEqual([
      'edit',
      'edit',
      'edit',
      'edit',
      'separator',
      'pin-message',
      'separator',
      'copy-link',
      'open-link',
    ]);
    expect(items[5]).toEqual({
      kind: 'pin-message',
      text: 'quoted text',
      href: null,
      enabled: true,
    });
  });

  it('without a selection, pins a same-origin link titled by the page', () => {
    expect(
      buildContextMenuTemplate(
        info({ linkURL: 'https://chat.zalo.me/#/thread/9', pageTitle: 'Zalo — Mẹ' }),
      ),
    ).toEqual([
      { kind: 'pin-message', text: 'Zalo — Mẹ', href: 'https://chat.zalo.me/#/thread/9', enabled: true },
      { kind: 'separator' },
      { kind: 'copy-link', url: 'https://chat.zalo.me/#/thread/9' },
      { kind: 'open-link', url: 'https://chat.zalo.me/#/thread/9' },
    ]);
  });

  it('never pins a cross-origin link, a bad link, or a link on an untitled page', () => {
    for (const over of [
      { linkURL: 'https://example.com/x', pageTitle: 'Zalo' },
      { linkURL: 'not a url', pageTitle: 'Zalo' },
      { linkURL: 'https://chat.zalo.me/x', pageTitle: '   ' },
    ]) {
      expect(buildContextMenuTemplate(info(over)).some((i) => i.kind === 'pin-message')).toBe(false);
    }
  });

  it('shows the item disabled at the cap — the cap is visible, not silent', () => {
    expect(buildContextMenuTemplate(info({ selectionText: 'x', pinsFull: true }))).toEqual([
      { kind: 'pin-message', text: 'x', href: null, enabled: false },
    ]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `corepack pnpm test -- tests/unit/context-menu.test.ts`
Expected: FAIL — type errors on the new `ContextMenuInfo` fields and the missing `pin-message` items.

- [ ] **Step 3: Implement**

In `src/main/lib/context-menu.ts`, extend `ContextMenuInfo`:

```ts
  /** document.title at right-click time — the pin text for a link pin */
  pageTitle: string;
  /** the service's origin; a link pin must stay on it */
  serviceOrigin: string;
  /** the pinboard is at capacity: the item still shows, disabled */
  pinsFull: boolean;
```

Extend `ContextMenuItem` (before `separator`):

```ts
  | { kind: 'pin-message'; text: string; href: string | null; enabled: boolean }
```

Change the sections line in `buildContextMenuTemplate` to:

```ts
  const sections = [spelling(info), edit(info), pin(info), link(info), image(info)].filter(
    (s) => s.length > 0,
  );
```

Add after `edit()`:

```ts
/** A selection is the message. Without one, a link that stays on the
 *  service's origin pins the conversation it points at, titled by the page.
 *  `href: null` means "the document URL" — the wiring supplies it. */
function pin(info: ContextMenuInfo): ContextMenuItem[] {
  const enabled = !info.pinsFull;
  const selection = info.selectionText.trim();
  if (selection !== '') return [{ kind: 'pin-message', text: selection, href: null, enabled }];
  const title = info.pageTitle.trim();
  if (title !== '' && info.linkURL !== '' && sameOrigin(info.linkURL, info.serviceOrigin)) {
    return [{ kind: 'pin-message', text: title, href: info.linkURL, enabled }];
  }
  return [];
}

function sameOrigin(url: string, origin: string): boolean {
  if (origin === '') return false;
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `corepack pnpm test -- tests/unit/context-menu.test.ts && corepack pnpm lint`
Expected: all PASS (including the untouched separator test — its fixture has no selection, so no pin section). Typecheck still fails in `views.ts` (missing fields) until Task 5.

- [ ] **Step 5: Commit**

Ask the user to run `/grimoire-core:commit`: `feat(pins): Pin Message item in the service context menu`.

---

### Task 5: Main wiring — hooks, state, IPC handlers

**Files:**

- Modify: `src/main/views.ts` (`ViewHooks`, the `context-menu` listener ~line 221, `menuItemFor` ~line 401)
- Modify: `src/main/state.ts` (`snapshot`)
- Modify: `src/main/ipc-handlers.ts` (`AppContext`, `registerIpcHandlers`)
- Modify: `src/main/index.ts`
- Test: `tests/unit/state.test.ts`

**Interfaces:**

- Consumes: `PinStore` (Task 3), `pin-message` item (Task 4), channels (Task 1), `resolveBannerClick`/`performBannerAction` (existing).
- Produces: `ViewHooks.onPinMessage(id, text, href)`, `ViewHooks.pinsFull(): boolean`, `AppContext.pins: PinStore`, `MainState.snapshot(settings, theme, version, quietActive, pins: PinView[] = [])`.

- [ ] **Step 1: Write the failing test**

Append to the `describe('MainState')` block in `tests/unit/state.test.ts`:

```ts
  it('snapshots pins, defaulting to empty', () => {
    const s = new MainState();
    expect(s.snapshot(DEFAULT_SETTINGS, 'dark', '0.1.0', false).pins).toEqual([]);
    const pins = [{ id: 1, serviceId: 'zalo' as const, text: 'x', note: '', at: 1 }];
    expect(s.snapshot(DEFAULT_SETTINGS, 'dark', '0.1.0', false, pins).pins).toEqual(pins);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test -- tests/unit/state.test.ts`
Expected: FAIL — `snapshot` takes 4 arguments / `pins` is undefined.

- [ ] **Step 3: `state.ts` snapshot**

In `src/main/state.ts`, import `PinView`:

```ts
import type {
  PinView,
  ServiceId,
  ServiceRuntime,
  Settings,
  ShellState,
  UpdateState,
} from '../shared/types';
```

Change the signature and return:

```ts
  snapshot(
    settings: Settings,
    theme: 'light' | 'dark',
    version: string,
    quietActive: boolean,
    pins: PinView[] = [],
  ): ShellState {
```

and add `pins,` to the returned object after `capTrimmed: [...this.capTrimmed],`.

- [ ] **Step 4: `views.ts` hooks and wiring**

Add to `ViewHooks`:

```ts
  /** "Pin Message" from the page's context menu — captured here in main, so
   *  the service preload needs no channel for it */
  onPinMessage(id: ServiceId, text: string, href: string): void;
  /** the pinboard is at capacity, so the item renders disabled */
  pinsFull(): boolean;
```

Add the import at the top of `views.ts`:

```ts
import { PIN_CAP } from '../shared/pins';
```

In the `context-menu` listener, extend the `buildContextMenuTemplate` call and the mapping:

```ts
    wc.on('context-menu', (_e, params) => {
      const items = buildContextMenuTemplate({
        misspelledWord: params.misspelledWord,
        dictionarySuggestions: params.dictionarySuggestions,
        isEditable: params.isEditable,
        editFlags: {
          canCut: params.editFlags.canCut,
          canCopy: params.editFlags.canCopy,
          canPaste: params.editFlags.canPaste,
          canSelectAll: params.editFlags.canSelectAll,
        },
        selectionText: params.selectionText,
        linkURL: params.linkURL,
        imageURL: params.mediaType === 'image' ? params.srcURL : '',
        pageTitle: wc.getTitle(),
        serviceOrigin: new URL(serviceById(id).url).origin,
        pinsFull: this.hooks.pinsFull(),
      });
      if (items.length === 0) return;
      const template = items.map((item) => this.menuItemFor(id, item, wc, params));
      Menu.buildFromTemplate(template).popup({ window: this.win });
    });
```

Change `menuItemFor`'s signature and add the case:

```ts
  private menuItemFor(
    id: ServiceId,
    item: ContextMenuItem,
    wc: WebContents,
    params: ContextMenuParams,
  ): MenuItemConstructorOptions {
    switch (item.kind) {
      // …existing cases unchanged…
      case 'pin-message':
        return {
          label: item.enabled ? 'Pin Message' : `Pin Message — ${PIN_CAP} max`,
          enabled: item.enabled,
          // pageURL is the document at right-click time — the conversation
          // the selection was read in
          click: () => this.hooks.onPinMessage(id, item.text, item.href ?? params.pageURL),
        };
      case 'separator':
        return { type: 'separator' };
    }
  }
```

- [ ] **Step 5: `ipc-handlers.ts` context and handlers**

Add the import:

```ts
import type { PinStore } from './pins';
```

Add to `AppContext` after `activity: ActivityLog;`:

```ts
  /** the pinboard; persisted, see pins.ts */
  pins: PinStore;
```

Add inside `registerIpcHandlers`, after the `activity:open` handler:

```ts
  // every mutation broadcasts only when the store actually changed — a stale
  // renderer's no-op must not cost a fan-out
  on('pins:reorder', ({ ids }) => {
    if (ctx.pins.reorder(ids)) ctx.broadcast();
  });
  on('pins:unpin', ({ id }) => {
    if (ctx.pins.unpin(id)) ctx.broadcast();
  });
  on('pins:restore', ({ id }) => {
    if (ctx.pins.restore(id)) ctx.broadcast();
  });
  on('pins:setNote', ({ id, note }) => {
    if (ctx.pins.setNote(id, note)) ctx.broadcast();
  });
  on('pins:open', ({ id }) => {
    const pin = ctx.pins.get(id);
    if (!pin) return; // removed since Home rendered the row
    const meta = serviceById(pin.serviceId);
    // the recents path, verbatim: the href is validated now, not at pin time
    const action = resolveBannerClick({
      disabled: ctx.settings.get().disabled[pin.serviceId],
      hasView: ctx.views.has(pin.serviceId),
      href: pin.href,
      serviceUrl: meta.url,
      chatPaths: meta.chatPaths,
    });
    performBannerAction(ctx, pin.serviceId, action);
  });
```

- [ ] **Step 6: `index.ts` construction and wiring**

Import:

```ts
import { PinStore } from './pins';
```

After `const settings = new SettingsStore(app.getPath('userData'));`:

```ts
    const pins = new PinStore(app.getPath('userData'));
```

Add to the `ServiceViewManager` hooks object (after `onLoadFailed`):

```ts
        onPinMessage: (id, text, href) => {
          if (pins.pin({ serviceId: id, text, href, at: Date.now() })) broadcast();
        },
        pinsFull: () => pins.isFull(),
```

(`broadcast` is declared later in the same scope; the hook only runs after startup, so the reference is fine — the existing hooks reference `resilience` the same way.)

Change the `shell:state` send in `flushBroadcast`:

```ts
      win.webContents.send(
        'shell:state',
        state.snapshot(s, effectiveTheme(), app.getVersion(), quiet.quietNow(), pins.views()),
      );
```

Add `pins,` to the `ctx: AppContext = { … }` literal after `activity: new ActivityLog(),`.

- [ ] **Step 7: Run everything**

Run: `corepack pnpm test && corepack pnpm typecheck && corepack pnpm lint`
Expected: all PASS, typecheck clean (the `ShellState.pins` gap from Task 1 is now filled), lint clean.

- [ ] **Step 8: Commit**

Ask the user to run `/grimoire-core:commit`: `feat(pins): wire capture, store and pins:* handlers in main`.

---

### Task 6: Done/unpin toast in the renderer

**Files:**

- Modify: `src/renderer/src/components/toast-rules.ts`
- Modify: `src/renderer/src/store.ts`
- Create: `src/renderer/src/components/PinToast.tsx`
- Modify: `src/renderer/src/App.tsx`
- Test: `tests/unit/toast-rules.test.ts`

**Interfaces:**

- Produces: `pinRemovedMessage(kind: 'done' | 'unpin'): string`; store `pinToast: { message: string; undoId: number } | null`, `setPinToast(t)`; `<PinToast />` reading it and sending `pins:restore` on Undo.

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/toast-rules.test.ts` (extend the import list with `pinRemovedMessage`):

```ts
describe('pinRemovedMessage', () => {
  it('tells Done and unpin apart — same effect, different intent', () => {
    expect(pinRemovedMessage('done')).toBe('Done — nice.');
    expect(pinRemovedMessage('unpin')).toBe('Unpinned.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test -- tests/unit/toast-rules.test.ts`
Expected: FAIL — `pinRemovedMessage` is not exported.

- [ ] **Step 3: Implement the rule**

Append to `src/renderer/src/components/toast-rules.ts`:

```ts
/** Done and unpin remove the same pin; the copy tells the intents apart. */
export function pinRemovedMessage(kind: 'done' | 'unpin'): string {
  return kind === 'done' ? 'Done — nice.' : 'Unpinned.';
}
```

- [ ] **Step 4: Store state**

In `src/renderer/src/store.ts`, add after `PurgeRequest`:

```ts
/** The last Done/unpin on Home, with the id Undo restores. */
export interface PinToastState {
  message: string;
  undoId: number;
}
```

Add to `ShellStore`:

```ts
  /** renderer-local like purgeToast: the toast acknowledges the renderer's
   *  own click, and Undo needs only the id it just sent */
  pinToast: PinToastState | null;
  setPinToast(t: PinToastState | null): void;
```

and to the `create` body:

```ts
  pinToast: null,
  setPinToast: (pinToast) => set({ pinToast }),
```

- [ ] **Step 5: The component**

Create `src/renderer/src/components/PinToast.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { useShell } from '../store';
import { TOAST_MS } from './toast-rules';

/** Acknowledges a Done or unpin on Home and offers one Undo. Same timer
 *  machinery as PurgeToast (hover banks the remainder). Only ever triggered
 *  from Home, which is also the only time it could be seen — a service page
 *  covers everything else. Shares PurgeToast's bottom-centre slot; the two
 *  cannot both be live except by a purge followed by a Done within 8 s. */
export default function PinToast() {
  const toast = useShell((s) => s.pinToast);
  const [paused, setPaused] = useState(false);
  const remaining = useRef(TOAST_MS);

  useEffect(() => {
    if (toast) remaining.current = TOAST_MS;
  }, [toast]);

  useEffect(() => {
    if (!toast || paused) return;
    const startedAt = Date.now();
    const id = setTimeout(() => useShell.getState().setPinToast(null), remaining.current);
    return () => {
      clearTimeout(id);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
    };
  }, [toast, paused]);

  const dismiss = () => useShell.getState().setPinToast(null);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-x-4 bottom-4 z-10 flex justify-center"
    >
      {toast && (
        <div
          data-testid="pin-toast"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          className="toast-in pointer-events-auto relative flex w-[340px] max-w-full items-center gap-3 overflow-hidden rounded-modal border border-border bg-bg-1 p-3.5 shadow-[0_8px_32px_rgba(0,0,0,.4)]"
        >
          <span className="h-7 w-7 flex-none rounded-tile bg-linear-to-br from-[#FFB43D] via-[#FF8A2A] to-[#F04E3E]" />
          <button type="button" onClick={dismiss} className="min-w-0 flex-1 text-left text-text-1">
            {toast.message}
          </button>
          <button
            type="button"
            data-testid="pin-undo"
            onClick={() => {
              window.goetia.send('pins:restore', { id: toast.undoId });
              dismiss();
            }}
            className="flex-none rounded-ctl px-2 py-1 font-semibold text-accent transition-colors duration-120 hover:bg-bg-2"
          >
            Undo
          </button>
          <span
            aria-hidden="true"
            style={{
              animationDuration: `${TOAST_MS}ms`,
              animationPlayState: paused ? 'paused' : 'running',
            }}
            className="toast-drain absolute inset-x-0 bottom-0 h-0.5 bg-accent"
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Mount it**

In `src/renderer/src/App.tsx`, import `PinToast from './components/PinToast'` and render `<PinToast />` directly after `<PurgeToast />`.

- [ ] **Step 7: Run tests, typecheck, lint**

Run: `corepack pnpm test -- tests/unit/toast-rules.test.ts && corepack pnpm typecheck && corepack pnpm lint`
Expected: PASS / clean.

- [ ] **Step 8: Commit**

Ask the user to run `/grimoire-core:commit`: `feat(pins): Done/unpin toast with Undo`.

---

### Task 7: Rail pin tally and pulse

**Files:**

- Modify: `src/renderer/src/tokens.css`
- Modify: `src/renderer/src/components/Rail.tsx`

**Interfaces:**

- Consumes: `ShellState.pins` (Task 1/5).
- Produces: `[data-testid="pin-tally"]` — a pill between the Home sigil and the divider showing a pin glyph + `pins.length` (absent at 0), clicking it opens Home; `.tally-pulse` applied to it for 1.6 s when the highest pin id rises. **Not** a badge on the sigil: a top-right count circle is the unread language (user review, 2026-08-26).

- [ ] **Step 1: CSS**

In `src/renderer/src/tokens.css`, after the `.hero-glow` rule:

```css
/* two breaths, then still: the rail's pin tally saying "a pin just landed" */
.tally-pulse {
  animation: tile-breathe 0.8s ease-in-out 2;
}
```

- [ ] **Step 2: Rail**

In `src/renderer/src/components/Rail.tsx`:

Change the React import to `import { useEffect, useRef, useState } from 'react';` and the types import to `import type { PinView, ServiceId } from '../../../shared/types';`.

Add right after the imports:

```ts
// stable empty: a fresh [] per snapshot would re-run the effect below forever
const NO_PINS: PinView[] = [];
const PIN_PULSE_MS = 1600;
```

Add a `PinIcon` beside `BellIcon`/`GearIcon`:

```tsx
function PinIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M14 2l8 8-3 1-4 4 1 6-2 1-5-5-6 6-1-1 6-6-5-5 1-2 6 1 4-4z" />
    </svg>
  );
}
```

Inside `Rail()`, **before** `if (!state) return null;` (hooks must not sit behind the early return), after the `useTileReorder` call:

```ts
  // A pin is captured while a service page covers the content area, so the
  // tally beside the sigil is the whole acknowledgement: the count ticks up
  // and it breathes twice. A rising max id is the signal — length alone would
  // also pulse on an Undo.
  const pins = state?.pins ?? NO_PINS;
  const maxPinId = pins.reduce((max, p) => Math.max(max, p.id), 0);
  const seenMaxPin = useRef<number | null>(null);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    const prev = seenMaxPin.current;
    seenMaxPin.current = maxPinId;
    if (prev === null || maxPinId <= prev) return;
    setPulse(true);
    const t = setTimeout(() => setPulse(false), PIN_PULSE_MS);
    return () => clearTimeout(t);
  }, [maxPinId]);
```

Leave the Home `<button>` as it is. Directly **after** its closing `</button>` and **before** the divider `<div aria-hidden="true" …/>`, insert:

```tsx
        {/* a label, not a badge: a count circle on a tile's corner is the
            unread language, and this number is things you chose to keep */}
        {pins.length > 0 && (
          <button
            type="button"
            data-testid="pin-tally"
            title={`${pins.length} pinned — open Home`}
            onClick={() => window.goetia.send('home:setOpen', { open: true })}
            className={`tabular flex h-[18px] flex-none items-center gap-0.5 rounded-full border
            border-accent/40 bg-accent/10 px-1.5 text-[10px] font-bold text-accent outline-none
            transition-colors duration-120 hover:bg-accent/20 focus-visible:ring-2
            focus-visible:ring-accent ${pulse ? 'tally-pulse' : ''}`}
          >
            <PinIcon />
            {pins.length}
          </button>
        )}
```

On a vertical rail the `nav` is a flex column, so the pill lands under the sigil with no extra work.

- [ ] **Step 3: Typecheck and lint**

Run: `corepack pnpm typecheck && corepack pnpm lint`
Expected: clean. (Visual check lands in Task 9's e2e: `pin-tally` shows the seeded count.)

- [ ] **Step 4: Commit**

Ask the user to run `/grimoire-core:commit`: `feat(pins): pin tally pill beside the Home sigil, pulses on a new pin`.

---

### Task 8: `PinnedBand` on Home

**Files:**

- Create: `src/renderer/src/components/welcome/PinnedBand.tsx`
- Modify: `src/renderer/src/components/Welcome.tsx`

**Interfaces:**

- Consumes: `ShellState.pins`, `ShellState.services`, `settings.disabled`; store `setPinToast` (Task 6); `pinRemovedMessage` (Task 6); channels (Task 1); `PIN_NOTE_MAX` (Task 1); `ServiceBand` (existing).
- Produces: `<PinnedBand pins services disabled />` with test ids `welcome-section-pinned`, `pin-altar`, `pin-row`, buttons named `Done`, `Unpin`, `Open ↗`, textbox `Pin note`.

- [ ] **Step 1: The component**

Create `src/renderer/src/components/welcome/PinnedBand.tsx`:

```tsx
import { Reorder, useDragControls } from 'motion/react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { PIN_NOTE_MAX } from '../../../../shared/pins';
import type { PinView, ServiceId, ServiceMeta } from '../../../../shared/types';
import { useShell } from '../../store';
import { pinRemovedMessage } from '../toast-rules';
import ServiceBand from './ServiceBand';

const logos = import.meta.glob<string>('../../assets/logos/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

const DRAG_CURSOR = 'tile-dragging';
const EMBER_CTA =
  'bg-linear-to-br from-[#FFB43D] via-[#FF8A2A] to-[#F04E3E] text-[#15181F] font-semibold';

interface Props {
  pins: PinView[];
  services: ServiceMeta[];
  disabled: Record<ServiceId, boolean>;
}

/** Home's pinboard: pin 0 is the altar (in progress), the rest the queue.
 *  One Reorder.Group holds all of them, so dragging into slot 0 is how the
 *  in-progress item changes. The drag runs on a local draft and reaches main
 *  once, on drop — the rail's useTileReorder rule, for pin ids. The band's
 *  max-height caps it at the altar plus about six rows; the queue scrolls
 *  inside, so Summoned and a row of Unbound always stay on screen. Pin
 *  actions commit immediately — a todo list has no multi-part edit to stage. */
export default function PinnedBand({ pins, services, disabled }: Props) {
  const liveIds = pins.map((p) => p.id);
  const liveKey = liveIds.join(',');
  const [draft, setDraft] = useState<number[] | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const shown = draft ?? liveIds;
  const byId = new Map(pins.map((p) => [p.id, p]));
  const svcById = new Map(services.map((s) => [s.id, s]));

  // never cleared on commit (one frame of snap-back); cleared when the
  // broadcast lands — the arriving order equals the draft — or when anything
  // else moves the list under it
  useEffect(() => setDraft(null), [liveKey]);
  useEffect(() => () => document.body.classList.remove(DRAG_CURSOR), []);

  const remove = (id: number, kind: 'done' | 'unpin') => {
    window.goetia.send('pins:unpin', { id });
    useShell.getState().setPinToast({ message: pinRemovedMessage(kind), undoId: id });
  };
  const open = (id: number) => window.goetia.send('pins:open', { id });
  const commitNote = (id: number, note: string) => {
    setEditing(null);
    if (note.trim() !== (byId.get(id)?.note ?? '')) window.goetia.send('pins:setNote', { id, note });
  };
  const dragEnd = () => {
    document.body.classList.remove(DRAG_CURSOR);
    if (shown.join(',') === liveKey) {
      setDraft(null);
      return;
    }
    window.goetia.send('pins:reorder', { ids: shown });
  };

  return (
    <ServiceBand
      testid="welcome-section-pinned"
      label="Pinned"
      count={pins.length}
      className="max-h-[344px] min-h-[124px] flex-[0_1_auto]"
    >
      {pins.length === 0 ? (
        <p className="text-xs text-text-2 opacity-70">
          Nothing pinned — right-click a message in any service.
        </p>
      ) : (
        <Reorder.Group
          as="div"
          axis="y"
          values={shown}
          onReorder={setDraft}
          className="flex flex-col gap-1.5"
        >
          {shown.map((id, index) => {
            const pin = byId.get(id);
            const svc = pin && svcById.get(pin.serviceId);
            if (!pin || !svc) return null;
            return (
              <PinRow
                key={id}
                pin={pin}
                service={svc}
                logo={logos[`../../assets/logos/${svc.id}.svg`]}
                altar={index === 0}
                banished={disabled[svc.id]}
                editing={editing === id}
                onEdit={() => setEditing(id)}
                onCommitNote={(note) => commitNote(id, note)}
                onOpen={() => open(id)}
                onDone={() => remove(id, 'done')}
                onUnpin={() => remove(id, 'unpin')}
                onDragStart={() => document.body.classList.add(DRAG_CURSOR)}
                onDragEnd={dragEnd}
              />
            );
          })}
        </Reorder.Group>
      )}
    </ServiceBand>
  );
}

interface RowProps {
  pin: PinView;
  service: ServiceMeta;
  logo: string;
  altar: boolean;
  banished: boolean;
  editing: boolean;
  onEdit(): void;
  onCommitNote(note: string): void;
  onOpen(): void;
  onDone(): void;
  onUnpin(): void;
  onDragStart(): void;
  onDragEnd(): void;
}

function PinRow({
  pin,
  service,
  logo,
  altar,
  banished,
  editing,
  onEdit,
  onCommitNote,
  onOpen,
  onDone,
  onUnpin,
  onDragStart,
  onDragEnd,
}: RowProps) {
  // a handle, not the whole row: the row is buttons end to end, and a click
  // on the text opens the conversation
  const controls = useDragControls();
  const openTitle = banished ? 'Banished — summon it on this board to open' : `Open in ${service.name}`;

  const handle = (
    <span
      role="presentation"
      title="Drag to reprioritize"
      onPointerDown={(e) => controls.start(e)}
      className="flex-none cursor-grab select-none text-text-2 opacity-50 hover:opacity-100"
    >
      ⠿
    </span>
  );
  const chip = (
    <span className="flex min-w-[88px] flex-none items-center gap-1.5 text-[11px] text-text-2">
      <span
        className="flex h-4 w-4 items-center justify-center rounded-[5px] text-white"
        style={{ background: service.color }}
      >
        <span
          className="glyph h-2.5 w-2.5"
          style={{ '--glyph': `url("${logo}")` } as React.CSSProperties}
        />
      </span>
      {service.name}
    </span>
  );
  const text = (
    <button
      type="button"
      onClick={onOpen}
      disabled={banished}
      title={openTitle}
      className={`min-w-0 flex-1 truncate text-left text-text-1 disabled:opacity-50 ${
        altar ? 'text-sm' : ''
      }`}
    >
      {pin.text}
    </button>
  );
  const note = editing ? (
    <input
      type="text"
      // biome-ignore lint/a11y/noAutofocus: the user just clicked the note to edit it
      autoFocus
      defaultValue={pin.note}
      aria-label="Pin note"
      maxLength={PIN_NOTE_MAX}
      onBlur={(e) => onCommitNote(e.currentTarget.value)}
      onKeyDown={(e) => {
        // Enter/Escape are Home's too (Escape leaves Home): keep them here
        e.stopPropagation();
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          e.currentTarget.value = pin.note;
          e.currentTarget.blur();
        }
      }}
      className="min-w-0 flex-1 rounded-ctl border border-border bg-bg-1 px-1.5 py-0.5 text-xs text-text-1 outline-none focus:border-accent"
    />
  ) : (
    <button
      type="button"
      onClick={onEdit}
      title="Edit note"
      className={`max-w-[40%] flex-none truncate text-xs italic text-text-2 hover:text-text-1 ${
        pin.note ? '' : 'opacity-50'
      }`}
    >
      {pin.note || 'add a note'}
    </button>
  );
  const done = (
    <button
      type="button"
      aria-label="Done"
      title="Done — removes the pin"
      onClick={onDone}
      className={`flex-none rounded-ctl text-ok transition-colors duration-120 hover:bg-ok/20 ${
        altar ? 'border border-ok/40 bg-ok/10 px-2.5 py-0.5 text-xs font-semibold' : 'px-1'
      }`}
    >
      {altar ? '✓ Done' : '✓'}
    </button>
  );
  const unpin = (
    <button
      type="button"
      aria-label="Unpin"
      title="Unpin"
      onClick={onUnpin}
      className="flex-none px-1 text-text-2 hover:text-text-1"
    >
      ×
    </button>
  );

  return (
    <Reorder.Item
      as="div"
      value={pin.id}
      dragListener={false}
      dragControls={controls}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      whileDrag={{ scale: 1.01, zIndex: 10, boxShadow: '0 8px 16px rgba(0,0,0,0.35)' }}
      data-testid={altar ? 'pin-altar' : 'pin-row'}
      className={`${banished ? 'opacity-60' : ''} ${
        altar
          ? 'flex flex-col gap-1 rounded-tile border border-accent/50 bg-bg-2 bg-[linear-gradient(90deg,rgba(232,89,12,0.09),transparent_60%)] px-3 py-2 shadow-[inset_3px_0_0_var(--accent)]'
          : 'flex items-center gap-2 rounded-ctl border border-border bg-bg-2 px-2.5 py-1'
      }`}
    >
      {altar ? (
        <>
          <div className="flex items-center gap-2">
            {handle}
            {chip}
            <span className="rounded-full border border-accent/45 bg-bg-1 px-2 py-px text-[9px] font-bold uppercase tracking-wider text-accent">
              In progress
            </span>
            <span className="ml-auto flex items-center gap-2">
              {done}
              <button
                type="button"
                onClick={onOpen}
                disabled={banished}
                title={openTitle}
                className={`flex-none rounded-ctl px-2.5 py-0.5 text-xs disabled:opacity-40 ${EMBER_CTA}`}
              >
                Open ↗
              </button>
              {unpin}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            {text}
            {note}
          </div>
        </>
      ) : (
        <>
          {handle}
          {chip}
          {text}
          {note}
          {done}
          {unpin}
        </>
      )}
    </Reorder.Item>
  );
}
```

- [ ] **Step 2: Mount it in Welcome and protect the Unbound row**

In `src/renderer/src/components/Welcome.tsx`, import:

```ts
import PinnedBand from './welcome/PinnedBand';
```

Inside the board `div` (`className="flex min-h-0 min-w-0 flex-1 flex-col gap-3.5 px-6 py-4"`), add as the **first** child, before the Summoned `ServiceBand`:

```tsx
        <PinnedBand
          pins={state.pins}
          services={state.services}
          disabled={state.settings.disabled}
        />
```

Change the Unbound band's `className="flex-1"` to `className="min-h-[128px] flex-1"` — one tile row plus its label always survives whatever the pinboard takes.

- [ ] **Step 3: Typecheck, lint, tests**

Run: `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test`
Expected: clean / PASS. If biome flags the `autoFocus` ignore comment as unused, delete the comment; if it flags `autoFocus` itself, keep the comment.

- [ ] **Step 4: Run the app and eyeball it**

Run: `corepack pnpm dev` and open Home (rail sigil). With no pins the band shows the empty line above Summoned. Seed two pins by right-clicking selected text in any logged-in service → "Pin Message"; the sigil badge should read 2 and pulse; Home should show the altar (first pin) + one queue row. Drag the row's `⠿` above the altar; the two swap and the rail order is untouched. Click `add a note`, type, Enter — the note appears; Escape while editing must not leave Home. Fix anything off before continuing.

- [ ] **Step 5: Commit**

Ask the user to run `/grimoire-core:commit`: `feat(home): pinboard band — focus altar, scrolling queue, inline notes`.

---

### Task 9: End-to-end spec

**Files:**

- Create: `tests/e2e/pins.spec.ts`

**Interfaces:**

- Consumes: everything above; `pins.json` format `{ pins: Pin[] }` (Task 3); test ids `pin-tally`, `pin-altar`, `pin-row`, `pin-toast`, `pin-undo`, `welcome`, `welcome-section-pinned`.

- [ ] **Step 1: Write the spec**

Create `tests/e2e/pins.spec.ts`:

```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type ElectronApplication, _electron as electron, expect, test } from '@playwright/test';

const isShell = (p: { url(): string }) =>
  p.url().startsWith('file://') && !p.url().includes('loading.html');

async function visibleServiceUrls(app: ElectronApplication): Promise<string[]> {
  const urls = await app.evaluate(({ BrowserWindow }) =>
    (BrowserWindow.getAllWindows()[0].contentView.children as Electron.WebContentsView[])
      .filter((v) => v.getVisible())
      .map((v) => v.webContents.getURL()),
  );
  return urls.filter((u) => !u.includes('loading.html'));
}

/** messenger + zalo summoned, two pins on disk: zalo in progress, messenger next */
function seedProfile(): string {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-pins-'));
  writeFileSync(
    join(profile, 'settings.json'),
    JSON.stringify({
      disabled: {
        whatsapp: true,
        messenger: false,
        telegram: true,
        discord: true,
        zalo: false,
        tiktok: true,
        shopee: true,
        instagram: true,
        slack: true,
        teams: true,
      },
    }),
  );
  writeFileSync(
    join(profile, 'pins.json'),
    JSON.stringify({
      pins: [
        {
          id: 1,
          serviceId: 'zalo',
          text: 'Gửi lại báo giá cho khách bên Q7',
          note: '',
          href: 'https://chat.zalo.me/',
          at: 1,
        },
        {
          id: 2,
          serviceId: 'messenger',
          text: 'review the release checklist',
          note: 'after lunch',
          href: 'https://www.facebook.com/messages/',
          at: 2,
        },
      ],
    }),
  );
  return profile;
}

async function launch(profile: string) {
  const app = await electron.launch({
    args: ['out/main/index.js', '--goetia-e2e', `--goetia-user-data=${profile}`],
  });
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
  return { app, win };
}

test('pins: the sigil counts them, Home shows altar + queue', async () => {
  const { app, win } = await launch(seedProfile());
  await expect(win.locator('[data-testid="pin-tally"]')).toHaveText('2');

  await win.locator('[data-testid="home-btn"]').click();
  const band = win.locator('[data-testid="welcome-section-pinned"]');
  await expect(band).toContainText('Pinned');
  const altar = band.locator('[data-testid="pin-altar"]');
  await expect(altar).toContainText('Gửi lại báo giá');
  await expect(altar).toContainText('In progress');
  await expect(band.locator('[data-testid="pin-row"]')).toHaveCount(1);
  await expect(band.locator('[data-testid="pin-row"]')).toContainText('after lunch');
  await app.close();
});

test('pins: Done promotes the next pin, Undo brings it back', async () => {
  const { app, win } = await launch(seedProfile());
  await win.locator('[data-testid="home-btn"]').click();
  const band = win.locator('[data-testid="welcome-section-pinned"]');
  const altar = band.locator('[data-testid="pin-altar"]');

  await altar.getByRole('button', { name: 'Done' }).click();
  await expect(altar).toContainText('review the release checklist');
  await expect(band.locator('[data-testid="pin-row"]')).toHaveCount(0);
  await expect(win.locator('[data-testid="pin-tally"]')).toHaveText('1');
  const toast = win.locator('[data-testid="pin-toast"]');
  await expect(toast).toContainText('Done — nice.');

  await win.locator('[data-testid="pin-undo"]').click();
  await expect(altar).toContainText('Gửi lại báo giá'); // back at index 0
  await expect(band.locator('[data-testid="pin-row"]')).toHaveCount(1);
  await expect(toast).toHaveCount(0);
  await app.close();
});

test('pins: Open leaves Home and lands on the service', async () => {
  const { app, win } = await launch(seedProfile());
  await win.locator('[data-testid="home-btn"]').click();
  const welcome = win.locator('[data-testid="welcome"]');
  await expect(welcome).toBeVisible();

  await win
    .locator('[data-testid="pin-altar"]')
    .getByRole('button', { name: 'Open ↗' })
    .click();
  await expect(welcome).toHaveCount(0);
  await expect(win.locator('[data-testid="service-tile"][aria-current="page"]')).toHaveAttribute(
    'aria-label',
    'Zalo',
  );
  // the view layer is the oracle for "a service took the screen"
  await expect(async () => {
    expect((await visibleServiceUrls(app)).some((u) => u.includes('zalo'))).toBe(true);
  }).toPass();
  await app.close();
});

test('pins: a removal survives a relaunch', async () => {
  const profile = seedProfile();
  const first = await launch(profile);
  await first.win.locator('[data-testid="home-btn"]').click();
  await first.win
    .locator('[data-testid="pin-row"]')
    .getByRole('button', { name: 'Unpin' })
    .click();
  await expect(first.win.locator('[data-testid="pin-tally"]')).toHaveText('1');
  await first.app.close();

  const second = await launch(profile);
  await expect(second.win.locator('[data-testid="pin-tally"]')).toHaveText('1');
  await second.win.locator('[data-testid="home-btn"]').click();
  await expect(second.win.locator('[data-testid="pin-altar"]')).toContainText('Gửi lại báo giá');
  await expect(second.win.locator('[data-testid="pin-row"]')).toHaveCount(0);
  await second.app.close();
});
```

- [ ] **Step 2: Run it**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e -- tests/e2e/pins.spec.ts`
Expected: 4 passed. If `Open ↗` leaves `aria-current` on Messenger, check that `pins:open` reached `performBannerAction` (the pin id must exist — the spec seeds ids 1 and 2) before touching UI code.

- [ ] **Step 3: Run the whole e2e suite**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`
Expected: every spec passes — in particular `home.spec.ts` (the board gained a band above Summoned; its tests address sections by test id, not position).

- [ ] **Step 4: Commit**

Ask the user to run `/grimoire-core:commit`: `test(e2e): pinboard — badge, altar/queue, Done/Undo, Open, persistence`.

---

### Task 10: Docs and final verification

**Files:**

- Modify: `CLAUDE.md` (Product principle list; the "Recents are the banner stream remembered" bullet)
- Modify: `docs/FEATURES.md` ("Shell & navigation" list)
- Modify: `docs/superpowers/specs/2026-08-25-pinned-messages-design.md` (status line)

- [ ] **Step 1: CLAUDE.md**

Append this bullet to the **Product principle: chat ONLY** list (after the "Launch restores the surface you left" bullet):

```markdown
- **Pins are the user's todo list, on Home** (2026-08-26; spec `docs/superpowers/specs/2026-08-25-pinned-messages-design.md`). Captured main-side from the page context menu (`pin-message` in `lib/context-menu.ts` → `ViewHooks.onPinMessage`) — no service-side IPC. `PinStore` (`src/main/pins.ts`) persists to `pins.json`: the one exception to "conversation content never touches disk" — explicitly pinned text lives there and leaves with the pin; the activity log stays in-memory. Pins survive purge and banish (a banished pin dims; its open is `show-only`). Acknowledgement is the tally pill beside the Home sigil (count + pulse) — never a badge on the sigil (a corner count circle is the unread language) and never a shell toast at pin time, because the service page covers the shell; at `PIN_CAP` the menu item renders disabled. Pin 0 is "in progress" by position alone; the board is one `Reorder.Group` with a drag-local draft and ONE `pins:reorder` per drop; Done/unpin toast with Undo (`pins:restore`) only on Home. `pins:open` reuses `resolveBannerClick` verbatim — hrefs never leave main.
```

In the **Notifications & mute** section, extend the "Recents are the banner stream remembered" bullet: after "conversation titles never touch disk;" insert " (pins are the sole, explicit exception — see Product principle);".

Run: `npx markdownlint-cli2 CLAUDE.md` → 0 issues.

- [ ] **Step 2: FEATURES.md**

Append to the **Shell & navigation** list:

```markdown
- **Pinned messages** — right-click selected text in any service → Pin Message; Home's Pinned band orders them (pin 0 = in progress, drag to reprioritize), Done/unpin with Undo, click opens the conversation. Persisted to `pins.json`. Impl: `src/main/pins.ts`, `lib/pin-rules.ts`, `lib/context-menu.ts`, `renderer/src/components/welcome/PinnedBand.tsx`. Verified: `pin-rules.test.ts`, `pins.test.ts`, `context-menu.test.ts`, `state.test.ts`, e2e `pins.spec.ts`.
```

Run: `npx markdownlint-cli2 docs/FEATURES.md` → 0 issues.

- [ ] **Step 3: Spec status**

In the spec, change `Status: approved for implementation.` to `Status: implemented (plan \`docs/superpowers/plans/2026-08-26-pinned-messages.md\`).` and lint it.

- [ ] **Step 4: Full definition of done**

Run, in order:

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e
```

Expected: all four green. Paste the summary lines (test counts) into the commit conversation.

- [ ] **Step 5: Commit**

Ask the user to run `/grimoire-core:commit`: `docs(pins): record the pinboard in CLAUDE.md, FEATURES.md and the spec`.

---

## Self-review notes

- Spec coverage: capture (T4/T5), store + persistence + cap + undo (T3), IPC + ShellState (T1/T5), open via `resolveBannerClick` (T5), tally-pill acknowledgement (T7), altar/queue/height cap/empty state/inline note/immediate commit (T8), Done/unpin toast with Undo (T6/T8), purge/banish survival (nothing to do — `purgeService` never touches pins; banished rows dim and `show-only` no-ops in T5/T8), removed-service drop at load (T2/T3), tests (T2–T5, T9), CLAUDE.md (T10).
- Type consistency: `PinView` fields `{id, serviceId, text, note, at}` everywhere; `PinStore.pin()` takes `{serviceId, text, href, at}` and `index.ts` passes exactly that; `ViewHooks.onPinMessage(id, text, href)` matches the `menuItemFor` call; channel payload keys `ids`/`id`/`note` match handlers and renderer sends.
- Placeholders: none — every step has its code or exact command.
