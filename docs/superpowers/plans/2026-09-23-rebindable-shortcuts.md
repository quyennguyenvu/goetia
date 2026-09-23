# Rebindable Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let eight of Goetia's chords be rebound from Settings → Shortcuts by pressing the new key, with Next/Previous Unread recorded as one mirrored pair, per-key and whole-table reset, and every consumer reading one resolved table.

**Architecture:** `settings.shortcuts` holds overrides; `resolveAccelerators` in `shared/shortcuts.ts` lays them over the defaults for the menu, the in-view interceptor and the pane. `lib/shortcut-rules.ts` is the one pure rule: chord from a key event, canonical spelling, reserved set, mirror pairs, the record verdict, and the normaliser that boot and backup import share. `ShortcutRecorder` in main owns a single pending recording, driven from the shell window's `before-input-event`, which it also uses to hold off menu accelerators. The pane only asks and displays.

**Tech Stack:** TypeScript, Electron, React, Vitest (fake timers), Playwright-Electron.

Spec: `docs/superpowers/specs/2026-09-23-rebindable-shortcuts-design.md`. Mock: artifact `Goetia Rebindable Keys`, variant A.

## Global Constraints

- Gates: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`; at the end `corepack pnpm build` then `env -u ELECTRON_RUN_AS_NODE npx playwright test tests/e2e/shortcuts.spec.ts --reporter=line`.
- No commits from the plan; the user commits through `/commit`. One summary at the end.
- The renderer imports nothing from `src/main`: the `RecordResult` types live in `shared/shortcuts.ts`.
- Rebindable ids, exactly: `switcher`, `nextUnread`, `prevUnread`, `home`, `downloads`, `pinSelection`, `mute`, `lock`. Everything else stays a constant.
- Canonical chord spelling: modifiers in the order `CmdOrCtrl`, `Ctrl`, `Alt`, `Shift`, then the key; a letter upper-cased. Every stored override is canonical.
- Copy, verbatim. Cap while recording: `Press a shortcut… esc cancels`. Refusal lines: `Needs ⌘ — press another, or esc` (`Ctrl` off macOS), `<chord> is reserved — press another, or esc`, `<chord> is taken by <Label> — press another, or esc`, `Needs a key with an opposite: brackets, arrows, Page Up/Down, Tab — press another, or esc`. Reset: `Reset to <default>`; footer `<n> key(s) changed from the defaults.` and `Reset all to defaults`. Intro: `Goetia's keys work inside every chat page, even where the site binds the same chord. Click a key to change it — keep the ones you press with the mouse in your other hand on the left half.`

## File Structure

| File | Responsibility |
| --- | --- |
| `src/shared/shortcuts.ts` | `REBINDABLE`, `RebindableId`, `ShortcutOverrides`, `Accelerators`, `SHORTCUT_LABELS`, `isRebindable`, `resolveAccelerators`, `RecordFailure`, `RecordResult` |
| `src/shared/types.ts` | `Settings.shortcuts`, default `{}` |
| `src/shared/summon.ts` | arrow glyphs in `comboLabel` |
| `src/main/lib/shortcut-rules.ts` (create) | `parseChord`, `canonical`, `chordFromInput`, `isReserved`, `pairFor`, `recordVerdict`, `normalizeShortcuts`, `RECORD_TIMEOUT_MS` |
| `src/main/lib/shortcuts.ts` | `shellCommandFor(input, platform, accelerators)`, more `CODES` |
| `src/main/shortcut-recorder.ts` (create) | `ShortcutRecorder` |
| `src/main/settings.ts`, `src/main/lib/settings-backup.ts` | `fillShortcuts`, `'shortcuts'` in `BACKUP_KEYS` and `accept` |
| `src/shared/ipc.ts`, `src/main/ipc-handlers.ts`, `src/main/index.ts`, `src/main/activate.ts`, `src/main/menu.ts`, `src/main/views.ts` | `shortcuts:record`, `ctx.recorder`, the shell key hook, cancel on close and lock, resolved table in menu and views |
| `src/renderer/src/components/ShortcutsPane.tsx` (create), `SettingsView.tsx` | the pane, lifted out of SettingsView |
| tests | `shortcut-rules.test.ts` (create), `shortcut-recorder.test.ts` (create), `shortcuts.test.ts`, `settings.test.ts`, `settings-backup.test.ts`, `activate.test.ts`, `ipc-sender-policy.test.ts`, `lock-ipc-policy.test.ts`, e2e `shortcuts.spec.ts` |
| docs | spec status, `CLAUDE.md`, `FEATURES.md` |

---

### Task 1: the shared table and the pure rules (tests first)

**Files:**

- Modify: `src/shared/shortcuts.ts`, `src/shared/types.ts`, `src/shared/summon.ts`, `src/main/lib/shortcuts.ts`
- Create: `src/main/lib/shortcut-rules.ts`, `tests/unit/shortcut-rules.test.ts`
- Test: `tests/unit/shortcuts.test.ts`

**Interfaces:**

- Produces (shared): `REBINDABLE`, `RebindableId`, `ShortcutOverrides`, `Accelerators`, `SHORTCUT_LABELS`, `isRebindable(v): v is RebindableId`, `resolveAccelerators(overrides): Accelerators`, `RecordFailure`, `RecordResult = { ok: true; patch: ShortcutOverrides } | { ok: false; reason: RecordFailure; chord?: string; takenBy?: RebindableId }`.
- Produces (rules): `RECORD_TIMEOUT_MS = 10_000`, `parseChord`, `canonical(a): string | null`, `chordFromInput(input, platform): string | null`, `isReserved(chord)`, `pairFor(chord): { next; prev } | null`, `recordVerdict(id, chord, resolved): RecordResult`, `normalizeShortcuts(raw): ShortcutOverrides`.
- Produces (matcher): `shellCommandFor(input, platform, accelerators = ACCELERATORS)`.

- [ ] **Step 1: Shared types and table**

`src/shared/shortcuts.ts` — append after `devtoolsAccelerator`:

```ts
/** The chords the user may change from Settings → Shortcuts. Everything
 *  else — service numbers, ⌘, ⌘R/F5, zoom, ⌘F, dev tools, Esc — is an OS or
 *  browser convention and stays a constant. (2026-09-23, user decision.) */
export const REBINDABLE = [
  'switcher',
  'nextUnread',
  'prevUnread',
  'home',
  'downloads',
  'pinSelection',
  'mute',
  'lock',
] as const;
export type RebindableId = (typeof REBINDABLE)[number];
/** overrides only — a missing id means the default; every value canonical */
export type ShortcutOverrides = Partial<Record<RebindableId, string>>;
/** the table every consumer reads: defaults with overrides laid over */
export type Accelerators = {
  -readonly [K in keyof typeof ACCELERATORS]: K extends 'reload' ? readonly string[] : string;
};
/** what a refusal names: "taken by Quick Switcher" */
export const SHORTCUT_LABELS: Record<RebindableId, string> = {
  switcher: 'Quick Switcher',
  nextUnread: 'Next Unread',
  prevUnread: 'Previous Unread',
  home: 'Home',
  downloads: 'Downloads',
  pinSelection: 'Pin Selection',
  mute: 'Mute All Notifications',
  lock: 'Lock Goetia',
};

export function isRebindable(v: unknown): v is RebindableId {
  return typeof v === 'string' && (REBINDABLE as readonly string[]).includes(v);
}

export function resolveAccelerators(overrides: ShortcutOverrides | undefined): Accelerators {
  const out: Accelerators = { ...ACCELERATORS };
  if (!overrides) return out;
  for (const id of REBINDABLE) {
    const v = overrides[id];
    if (typeof v === 'string' && v !== '') out[id] = v;
  }
  return out;
}

export type RecordFailure = 'modifier' | 'reserved' | 'taken' | 'pair' | 'cancelled';
/** main's answer to shortcuts:record; `patch` holds one id, or both halves
 *  of the unread pair, and is empty when the chord already was the row's */
export type RecordResult =
  | { ok: true; patch: ShortcutOverrides }
  | { ok: false; reason: RecordFailure; chord?: string; takenBy?: RebindableId };
```

`src/shared/types.ts` — add `import type { ShortcutOverrides } from './shortcuts';` at the top; in `Settings` after `summonHotkey: …;`:

```ts
  /** the user's chords, as overrides over shared/shortcuts.ts ACCELERATORS;
   *  canonical spelling, validated by lib/shortcut-rules normalizeShortcuts */
  shortcuts: ShortcutOverrides;
```

and in `DEFAULT_SETTINGS` after the `summonHotkey` entry: `shortcuts: {},`.

`src/shared/summon.ts` — after `WIN_ORDER`:

```ts
/** arrow keys read as arrows on both platforms */
const KEY_GLYPHS: Record<string, string> = { Right: '→', Left: '←', Up: '↑', Down: '↓' };
```

and in `comboLabel` replace `const keys = parts.filter((p) => !(p in MAC_GLYPHS));` with:

```ts
  const keys = parts.filter((p) => !(p in MAC_GLYPHS)).map((k) => KEY_GLYPHS[k] ?? k);
```

- [ ] **Step 2: Write the failing tests**

Create `tests/unit/shortcut-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  canonical,
  chordFromInput,
  isReserved,
  normalizeShortcuts,
  pairFor,
  parseChord,
  recordVerdict,
} from '../../src/main/lib/shortcut-rules';
import type { KeyInput } from '../../src/main/lib/shortcuts';
import { ACCELERATORS, resolveAccelerators } from '../../src/shared/shortcuts';

const press = (over: Partial<KeyInput>): KeyInput => ({
  type: 'keyDown',
  key: '',
  code: '',
  control: false,
  meta: false,
  shift: false,
  alt: false,
  ...over,
});
const defaults = resolveAccelerators({});

describe('parseChord / canonical', () => {
  it('spells modifiers in one order and upper-cases a letter', () => {
    expect(canonical('Shift+CmdOrCtrl+g')).toBe('CmdOrCtrl+Shift+G');
    expect(canonical('Alt+CmdOrCtrl+I')).toBe('CmdOrCtrl+Alt+I');
    expect(canonical('CommandOrControl+K')).toBe('CmdOrCtrl+K');
    expect(canonical('F5')).toBe('F5');
    expect(parseChord('CmdOrCtrl+Right')).toEqual({ mods: ['CmdOrCtrl'], key: 'Right' });
  });

  it('refuses what Goetia cannot bind', () => {
    // a bare key is a valid shape (F5 is one); the ⌘/Ctrl rule is refusal's
    for (const a of ['', 'CmdOrCtrl', 'CmdOrCtrl+Escape', 'Super+G', 'CmdOrCtrl+CmdOrCtrl+G', 'CmdOrCtrl+ß']) {
      expect(canonical(a)).toBeNull();
    }
  });
});

describe('chordFromInput', () => {
  it('reads the physical key: letters, digits, brackets, period, arrows, F-keys', () => {
    expect(chordFromInput(press({ code: 'KeyE', meta: true, shift: true }), 'darwin')).toBe(
      'CmdOrCtrl+Shift+E',
    );
    expect(chordFromInput(press({ code: 'Digit3', meta: true }), 'darwin')).toBe('CmdOrCtrl+3');
    // a shifted } on a US layout is still the ] key
    expect(chordFromInput(press({ key: '}', code: 'BracketRight', meta: true, shift: true }), 'darwin')).toBe(
      'CmdOrCtrl+Shift+]',
    );
    expect(chordFromInput(press({ code: 'Period', meta: true }), 'darwin')).toBe('CmdOrCtrl+.');
    expect(chordFromInput(press({ code: 'ArrowRight', meta: true }), 'darwin')).toBe('CmdOrCtrl+Right');
    expect(chordFromInput(press({ code: 'PageDown', meta: true, alt: true }), 'darwin')).toBe(
      'CmdOrCtrl+Alt+PageDown',
    );
    expect(chordFromInput(press({ code: 'F7', meta: true }), 'darwin')).toBe('CmdOrCtrl+F7');
    expect(chordFromInput(press({ code: 'Space', control: true, meta: true }), 'darwin')).toBe(
      'CmdOrCtrl+Ctrl+Space',
    );
  });

  it('maps Ctrl to CmdOrCtrl off macOS and drops the Windows key', () => {
    expect(chordFromInput(press({ code: 'KeyE', control: true, shift: true }), 'win32')).toBe(
      'CmdOrCtrl+Shift+E',
    );
    expect(chordFromInput(press({ code: 'KeyE', meta: true }), 'win32')).toBeNull();
  });

  it('is null for a bare modifier or an unmapped key', () => {
    expect(chordFromInput(press({ code: 'ShiftLeft', shift: true }), 'darwin')).toBeNull();
    expect(chordFromInput(press({ code: 'MetaLeft', meta: true }), 'darwin')).toBeNull();
    expect(chordFromInput(press({ code: 'Backquote', meta: true }), 'darwin')).toBeNull();
  });
});

describe('isReserved', () => {
  it('covers the OS and edit chords, the fixed rows and the service numbers', () => {
    for (const a of [
      'CmdOrCtrl+Q',
      'CmdOrCtrl+W',
      'CmdOrCtrl+C',
      'CmdOrCtrl+V',
      'CmdOrCtrl+A',
      'CmdOrCtrl+Shift+Z',
      'CmdOrCtrl+Shift+T',
      'CmdOrCtrl+,',
      'CmdOrCtrl+R',
      'F5',
      'CmdOrCtrl+=',
      'CmdOrCtrl+-',
      'CmdOrCtrl+0',
      'CmdOrCtrl+F',
      'Alt+CmdOrCtrl+I',
      'Ctrl+Shift+I',
      'CmdOrCtrl+1',
      'CmdOrCtrl+9',
    ]) {
      expect(isReserved(a), a).toBe(true);
    }
    for (const a of ['CmdOrCtrl+Shift+E', 'CmdOrCtrl+K', 'CmdOrCtrl+Right', 'CmdOrCtrl+Tab']) {
      expect(isReserved(a), a).toBe(false);
    }
  });
});

describe('pairFor', () => {
  it('mirrors every pair from either side', () => {
    expect(pairFor('CmdOrCtrl+Shift+]')).toEqual({ next: 'CmdOrCtrl+Shift+]', prev: 'CmdOrCtrl+Shift+[' });
    expect(pairFor('CmdOrCtrl+Shift+[')).toEqual({ next: 'CmdOrCtrl+Shift+]', prev: 'CmdOrCtrl+Shift+[' });
    expect(pairFor('CmdOrCtrl+.')).toEqual({ next: 'CmdOrCtrl+.', prev: 'CmdOrCtrl+,' });
    expect(pairFor('CmdOrCtrl+-')).toEqual({ next: 'CmdOrCtrl+=', prev: 'CmdOrCtrl+-' });
    expect(pairFor('CmdOrCtrl+Left')).toEqual({ next: 'CmdOrCtrl+Right', prev: 'CmdOrCtrl+Left' });
    expect(pairFor('CmdOrCtrl+Alt+Down')).toEqual({ next: 'CmdOrCtrl+Alt+Down', prev: 'CmdOrCtrl+Alt+Up' });
    expect(pairFor('CmdOrCtrl+PageUp')).toEqual({ next: 'CmdOrCtrl+PageDown', prev: 'CmdOrCtrl+PageUp' });
  });

  it('pairs Tab with Shift toggled', () => {
    expect(pairFor('CmdOrCtrl+Tab')).toEqual({ next: 'CmdOrCtrl+Tab', prev: 'CmdOrCtrl+Shift+Tab' });
    expect(pairFor('CmdOrCtrl+Shift+Tab')).toEqual({ next: 'CmdOrCtrl+Tab', prev: 'CmdOrCtrl+Shift+Tab' });
  });

  it('is null for a key with no opposite', () => {
    expect(pairFor('CmdOrCtrl+Shift+G')).toBeNull();
    expect(pairFor('nonsense')).toBeNull();
  });
});

describe('recordVerdict', () => {
  it('accepts a free chord, canonical, and an unchanged one with an empty patch', () => {
    expect(recordVerdict('home', 'Shift+CmdOrCtrl+e', defaults)).toEqual({
      ok: true,
      patch: { home: 'CmdOrCtrl+Shift+E' },
    });
    expect(recordVerdict('home', 'CmdOrCtrl+Shift+G', defaults)).toEqual({ ok: true, patch: {} });
  });

  it('refuses a chord without ⌘/Ctrl, a reserved one, and one another command holds', () => {
    expect(recordVerdict('home', 'Shift+E', defaults)).toEqual({ ok: false, reason: 'modifier', chord: 'Shift+E' });
    expect(recordVerdict('home', 'CmdOrCtrl+C', defaults)).toEqual({ ok: false, reason: 'reserved', chord: 'CmdOrCtrl+C' });
    expect(recordVerdict('home', 'CmdOrCtrl+1', defaults)).toEqual({ ok: false, reason: 'reserved', chord: 'CmdOrCtrl+1' });
    expect(recordVerdict('pinSelection', 'CmdOrCtrl+K', defaults)).toEqual({
      ok: false,
      reason: 'taken',
      chord: 'CmdOrCtrl+K',
      takenBy: 'switcher',
    });
  });

  it('records the unread pair from either arrow and validates both halves', () => {
    expect(recordVerdict('nextUnread', 'CmdOrCtrl+Right', defaults)).toEqual({
      ok: true,
      patch: { nextUnread: 'CmdOrCtrl+Right', prevUnread: 'CmdOrCtrl+Left' },
    });
    expect(recordVerdict('prevUnread', 'CmdOrCtrl+Left', defaults)).toEqual({
      ok: true,
      patch: { nextUnread: 'CmdOrCtrl+Right', prevUnread: 'CmdOrCtrl+Left' },
    });
    // = is zoom in: refused through its own half
    expect(recordVerdict('nextUnread', 'CmdOrCtrl+=', defaults)).toEqual({
      ok: false,
      reason: 'reserved',
      chord: 'CmdOrCtrl+=',
    });
    // . pairs with , which is Settings
    expect(recordVerdict('nextUnread', 'CmdOrCtrl+.', defaults)).toEqual({
      ok: false,
      reason: 'reserved',
      chord: 'CmdOrCtrl+,',
    });
    expect(recordVerdict('nextUnread', 'CmdOrCtrl+Shift+G', defaults)).toEqual({
      ok: false,
      reason: 'pair',
      chord: 'CmdOrCtrl+Shift+G',
    });
    expect(recordVerdict('nextUnread', 'Shift+]', defaults)).toEqual({ ok: false, reason: 'modifier', chord: 'Shift+]' });
    expect(recordVerdict('nextUnread', 'CmdOrCtrl+Shift+]', defaults)).toEqual({ ok: true, patch: {} });
  });

  it("never reports the pair's own halves as taken", () => {
    const moved = resolveAccelerators({ nextUnread: 'CmdOrCtrl+Right', prevUnread: 'CmdOrCtrl+Left' });
    expect(recordVerdict('nextUnread', 'CmdOrCtrl+Shift+]', moved)).toEqual({
      ok: true,
      patch: { nextUnread: 'CmdOrCtrl+Shift+]', prevUnread: 'CmdOrCtrl+Shift+[' },
    });
  });
});

describe('normalizeShortcuts', () => {
  it('keeps valid canonical overrides and drops everything else', () => {
    expect(
      normalizeShortcuts({
        home: 'Shift+CmdOrCtrl+e',
        switcher: 'CmdOrCtrl+C', // reserved
        mute: 'Shift+M', // no ⌘
        lock: 42,
        downloads: 'CmdOrCtrl+Shift+E', // same chord as home: later loses
        bogus: 'CmdOrCtrl+Shift+B',
      }),
    ).toEqual({ home: 'CmdOrCtrl+Shift+E' });
    expect(normalizeShortcuts(undefined)).toEqual({});
    expect(normalizeShortcuts('CmdOrCtrl+K')).toEqual({});
    expect(normalizeShortcuts([])).toEqual({});
  });

  it("drops an override that lands on another command's default", () => {
    expect(normalizeShortcuts({ home: 'CmdOrCtrl+K' })).toEqual({});
    expect(normalizeShortcuts({ home: 'CmdOrCtrl+K', switcher: 'CmdOrCtrl+Shift+E' })).toEqual({
      home: 'CmdOrCtrl+K',
      switcher: 'CmdOrCtrl+Shift+E',
    });
  });

  it('keeps the unread pair only whole and only mirrored', () => {
    expect(normalizeShortcuts({ nextUnread: 'CmdOrCtrl+Right' })).toEqual({});
    expect(normalizeShortcuts({ nextUnread: 'CmdOrCtrl+Right', prevUnread: 'CmdOrCtrl+Up' })).toEqual({});
    expect(normalizeShortcuts({ nextUnread: 'CmdOrCtrl+Right', prevUnread: 'CmdOrCtrl+Left' })).toEqual({
      nextUnread: 'CmdOrCtrl+Right',
      prevUnread: 'CmdOrCtrl+Left',
    });
  });
});

describe('resolveAccelerators', () => {
  it('lays overrides over the defaults and ignores unknown ids and blanks', () => {
    const r = resolveAccelerators({ home: 'CmdOrCtrl+Shift+E', switcher: '' });
    expect(r.home).toBe('CmdOrCtrl+Shift+E');
    expect(r.switcher).toBe(ACCELERATORS.switcher);
    expect(r.reload).toEqual(ACCELERATORS.reload);
    expect(resolveAccelerators(undefined)).toEqual({ ...ACCELERATORS });
  });
});
```

In `tests/unit/shortcuts.test.ts` add to the imports `resolveAccelerators` from `'../../src/shared/shortcuts'` and append:

```ts
describe('rebound chords', () => {
  const rebound = resolveAccelerators({ home: 'CmdOrCtrl+Shift+E', nextUnread: 'CmdOrCtrl+Right', prevUnread: 'CmdOrCtrl+Left' });

  it('matches the override and no longer the default', () => {
    const e = { key: 'E', code: 'KeyE', meta: true, shift: true };
    const g = { key: 'G', code: 'KeyG', meta: true, shift: true };
    expect(shellCommandFor(press(e), 'darwin', rebound)).toEqual({ kind: 'home' });
    expect(shellCommandFor(press(g), 'darwin', rebound)).toBeNull();
    expect(shellCommandFor(press(g), 'darwin')).toEqual({ kind: 'home' });
  });

  it('matches arrows, period and Tab by physical key', () => {
    expect(shellCommandFor(press({ key: 'ArrowRight', code: 'ArrowRight', meta: true }), 'darwin', rebound)).toEqual({
      kind: 'unread',
      step: 1,
    });
    expect(shellCommandFor(press({ key: 'ArrowLeft', code: 'ArrowLeft', meta: true }), 'darwin', rebound)).toEqual({
      kind: 'unread',
      step: -1,
    });
    const dots = resolveAccelerators({ switcher: 'CmdOrCtrl+Shift+.' });
    expect(shellCommandFor(press({ key: '>', code: 'Period', meta: true, shift: true }), 'darwin', dots)).toEqual({
      kind: 'switcher',
    });
    const tab = resolveAccelerators({ lock: 'CmdOrCtrl+Alt+Tab' });
    expect(shellCommandFor(press({ key: 'Tab', code: 'Tab', meta: true, alt: true }), 'darwin', tab)).toEqual({
      kind: 'lock',
    });
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `corepack pnpm vitest run tests/unit/shortcut-rules.test.ts tests/unit/shortcuts.test.ts`
Expected: the rules file fails to resolve; the rebound cases fail (the third argument is ignored).

- [ ] **Step 4: `src/main/lib/shortcut-rules.ts`**

```ts
import {
  ACCELERATORS,
  type Accelerators,
  devtoolsAccelerator,
  REBINDABLE,
  type RebindableId,
  type RecordResult,
  resolveAccelerators,
  type ShortcutOverrides,
} from '../../shared/shortcuts';
import { MAX_SERVICE_ACCELERATORS, serviceAccelerator } from './service-accelerator';
import type { KeyInput } from './shortcuts';

/** how long a recording waits for a key before it gives up */
export const RECORD_TIMEOUT_MS = 10_000;

const MODS = ['CmdOrCtrl', 'Ctrl', 'Alt', 'Shift'] as const;
type Mod = (typeof MODS)[number];
const MOD_ALIASES: Record<string, Mod> = {
  CmdOrCtrl: 'CmdOrCtrl',
  CommandOrControl: 'CmdOrCtrl',
  Ctrl: 'Ctrl',
  Control: 'Ctrl',
  Alt: 'Alt',
  Option: 'Alt',
  Shift: 'Shift',
};
/** the keys a chord may end in — what chordFromInput can read off a code */
const KEYS: ReadonlySet<string> = new Set([
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  '[',
  ']',
  '.',
  ',',
  '=',
  '-',
  'Right',
  'Left',
  'Up',
  'Down',
  'PageUp',
  'PageDown',
  'Tab',
  'Space',
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
]);

export interface Chord {
  mods: Mod[];
  key: string;
}

/** The chord's parts, or null when it is not one Goetia can bind: unknown
 *  key, unknown or repeated modifier, nothing at all. */
export function parseChord(accelerator: string): Chord | null {
  if (accelerator === '') return null;
  const parts = accelerator.split('+');
  const rawKey = parts.pop() ?? '';
  const key = /^[a-z]$/i.test(rawKey) ? rawKey.toUpperCase() : rawKey;
  if (!KEYS.has(key)) return null;
  const mods: Mod[] = [];
  for (const p of parts) {
    const m = MOD_ALIASES[p];
    if (!m || mods.includes(m)) return null;
    mods.push(m);
  }
  mods.sort((a, b) => MODS.indexOf(a) - MODS.indexOf(b));
  return { mods, key };
}

const join = (mods: readonly Mod[], key: string) => [...mods, key].join('+');

/** One spelling per chord — `CmdOrCtrl+Shift+G` — so two chords compare by
 *  string. Null when unbindable. */
export function canonical(accelerator: string): string | null {
  const c = parseChord(accelerator);
  return c ? join(c.mods, c.key) : null;
}

const CODE_KEYS: Record<string, string> = {
  BracketRight: ']',
  BracketLeft: '[',
  Period: '.',
  Comma: ',',
  Equal: '=',
  Minus: '-',
  ArrowRight: 'Right',
  ArrowLeft: 'Left',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Tab: 'Tab',
  Space: 'Space',
};

/** The accelerator a keyDown stands for, read off the physical key so a
 *  shifted `}` records `]` and a dead key still records its letter. Null for
 *  a bare modifier, an unmapped key, or the Windows key off macOS. */
export function chordFromInput(input: KeyInput, platform: string): string | null {
  const code = input.code ?? '';
  let key: string | null = null;
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
  else if (/^Digit[0-9]$/.test(code)) key = code.slice(5);
  else if (/^F([1-9]|1[0-2])$/.test(code)) key = code;
  else key = CODE_KEYS[code] ?? null;
  if (!key) return null;
  const mods: Mod[] = [];
  if (platform === 'darwin') {
    if (input.meta) mods.push('CmdOrCtrl');
    if (input.control) mods.push('Ctrl');
  } else {
    if (input.control) mods.push('CmdOrCtrl');
    if (input.meta) return null;
  }
  if (input.alt) mods.push('Alt');
  if (input.shift) mods.push('Shift');
  return join(mods, key);
}

/** OS and edit chords a rebinding must never take from the page or the
 *  system, plus every fixed Goetia chord and the service numbers. */
const RESERVED: ReadonlySet<string> = new Set(
  [
    ...['Q', 'W', 'H', 'M', 'N', 'T', 'Z', 'X', 'C', 'V', 'A', 'P'].map((k) => `CmdOrCtrl+${k}`),
    ...['Q', 'W', 'Z', 'X', 'C', 'V', 'T', 'R'].map((k) => `CmdOrCtrl+Shift+${k}`),
    ACCELERATORS.settings,
    ...ACCELERATORS.reload,
    ACCELERATORS.zoomIn,
    ACCELERATORS.zoomOut,
    ACCELERATORS.zoomReset,
    ACCELERATORS.findService,
    devtoolsAccelerator('darwin'),
    devtoolsAccelerator('win32'),
    ...Array.from({ length: MAX_SERVICE_ACCELERATORS }, (_, i) => serviceAccelerator(i) ?? ''),
  ].map((a) => canonical(a) ?? a),
);

export function isReserved(chord: string): boolean {
  const c = canonical(chord);
  return c === null || RESERVED.has(c);
}

const NEXT_TO_PREV: Record<string, string> = {
  ']': '[',
  '.': ',',
  '=': '-',
  Right: 'Left',
  Down: 'Up',
  PageDown: 'PageUp',
};
const PREV_TO_NEXT: Record<string, string> = Object.fromEntries(
  Object.entries(NEXT_TO_PREV).map(([n, p]) => [p, n]),
);

/** The mirrored pair a chord belongs to, from either side; Tab pairs with
 *  Shift toggled (the browser's tab chords). Null for a key with no opposite. */
export function pairFor(chord: string): { next: string; prev: string } | null {
  const c = parseChord(chord);
  if (!c) return null;
  if (c.key === 'Tab') {
    const without = c.mods.filter((m) => m !== 'Shift');
    const withShift = [...without, 'Shift' as Mod].sort((a, b) => MODS.indexOf(a) - MODS.indexOf(b));
    return { next: join(without, 'Tab'), prev: join(withShift, 'Tab') };
  }
  if (c.key in NEXT_TO_PREV) return { next: join(c.mods, c.key), prev: join(c.mods, NEXT_TO_PREV[c.key]) };
  if (c.key in PREV_TO_NEXT) return { next: join(c.mods, PREV_TO_NEXT[c.key]), prev: join(c.mods, c.key) };
  return null;
}

const PAIR: readonly RebindableId[] = ['nextUnread', 'prevUnread'];

function holderOf(
  canon: string,
  resolved: Accelerators,
  excuse: readonly RebindableId[],
): RebindableId | null {
  for (const id of REBINDABLE) {
    if (excuse.includes(id)) continue;
    if (canonical(resolved[id]) === canon) return id;
  }
  return null;
}

/** The refusal for one canonical chord, or null when it may be bound. */
function refusal(
  chord: string,
  excuse: readonly RebindableId[],
  resolved: Accelerators,
): RecordResult | null {
  const c = parseChord(chord);
  if (!c?.mods.includes('CmdOrCtrl')) return { ok: false, reason: 'modifier', chord };
  const canon = join(c.mods, c.key);
  if (isReserved(canon)) return { ok: false, reason: 'reserved', chord: canon };
  const holder = holderOf(canon, resolved, excuse);
  if (holder) return { ok: false, reason: 'taken', chord: canon, takenBy: holder };
  return null;
}

/** The verdict on recording `chord` for `id` against the table as resolved
 *  now. The unread pair records as one: the opposite is inferred, both halves
 *  are checked with the pair's own slots excused, and both go in the patch. */
export function recordVerdict(id: RebindableId, chord: string, resolved: Accelerators): RecordResult {
  if (PAIR.includes(id)) {
    const c = parseChord(chord);
    if (!c?.mods.includes('CmdOrCtrl')) return { ok: false, reason: 'modifier', chord };
    const pair = pairFor(chord);
    if (!pair) return { ok: false, reason: 'pair', chord: join(c.mods, c.key) };
    const bad = refusal(pair.next, PAIR, resolved) ?? refusal(pair.prev, PAIR, resolved);
    if (bad) return bad;
    if (canonical(resolved.nextUnread) === pair.next && canonical(resolved.prevUnread) === pair.prev) {
      return { ok: true, patch: {} };
    }
    return { ok: true, patch: { nextUnread: pair.next, prevUnread: pair.prev } };
  }
  const bad = refusal(chord, [id], resolved);
  if (bad) return bad;
  const canon = canonical(chord) as string;
  if (canonical(resolved[id]) === canon) return { ok: true, patch: {} };
  return { ok: true, patch: { [id]: canon } };
}

/** Data in — settings.json, a backup, a hand edit — valid overrides out:
 *  strings that parse, carry CmdOrCtrl, are not reserved, do not collide with
 *  another command once resolved (the later id in REBINDABLE order loses),
 *  and the unread pair kept only whole and mirrored. */
export function normalizeShortcuts(raw: unknown): ShortcutOverrides {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const out: ShortcutOverrides = {};
  const used = new Set<string>();
  for (const id of REBINDABLE) {
    const v = r[id];
    if (typeof v !== 'string') continue;
    const c = parseChord(v);
    if (!c?.mods.includes('CmdOrCtrl')) continue;
    const canon = join(c.mods, c.key);
    if (isReserved(canon) || used.has(canon)) continue;
    out[id] = canon;
    used.add(canon);
  }
  const resolved = resolveAccelerators(out);
  for (const id of REBINDABLE) {
    const v = out[id];
    if (v === undefined) continue;
    if (holderOf(v, resolved, PAIR.includes(id) ? PAIR : [id])) delete out[id];
  }
  const n = out.nextUnread;
  const p = out.prevUnread;
  if ((n === undefined) !== (p === undefined) || (n !== undefined && pairFor(n)?.prev !== p)) {
    delete out.nextUnread;
    delete out.prevUnread;
  }
  return out;
}
```

- [ ] **Step 5: `src/main/lib/shortcuts.ts` takes the resolved table**

Change the import to `import { ACCELERATORS, type Accelerators, devtoolsAccelerator } from '../../shared/shortcuts';`. Extend `CODES`:

```ts
// brackets: with Shift held a US layout reports } and {, so only the code
// matches; arrows, Tab and Space report a name for `key` the table never
// spells, so the code is the only match for them too
const CODES: Record<string, string> = {
  '=': 'Equal',
  '-': 'Minus',
  ',': 'Comma',
  '.': 'Period',
  ']': 'BracketRight',
  '[': 'BracketLeft',
  Right: 'ArrowRight',
  Left: 'ArrowLeft',
  Up: 'ArrowUp',
  Down: 'ArrowDown',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Tab: 'Tab',
  Space: 'Space',
};
```

Replace the `FIXED` constant with a function and thread the table through `shellCommandFor`:

```ts
function fixedTable(a: Accelerators): ReadonlyArray<readonly [readonly string[], ShellCommand]> {
  return [
    [[a.home], { kind: 'home' }],
    [[a.pinSelection], { kind: 'pin-selection' }],
    [[a.switcher], { kind: 'switcher' }],
    [[a.nextUnread], { kind: 'unread', step: 1 }],
    [[a.prevUnread], { kind: 'unread', step: -1 }],
    [[a.mute], { kind: 'mute' }],
    [[a.lock], { kind: 'lock' }],
    [[a.settings], { kind: 'settings' }],
    [[a.downloads], { kind: 'downloads' }],
    [a.reload, { kind: 'reload' }],
    [[a.zoomIn], { kind: 'zoom', step: 1 }],
    [[a.zoomOut], { kind: 'zoom', step: -1 }],
    [[a.zoomReset], { kind: 'zoom', step: 0 }],
  ];
}

/** The shell command a key-down inside a service page stands for, or null
 *  when the key is the page's to keep. `accelerators` is the table as the
 *  user has it (resolveAccelerators); the defaults when not given. */
export function shellCommandFor(
  input: KeyInput,
  platform: string,
  accelerators: Accelerators = ACCELERATORS,
): ShellCommand | null {
  if (input.type !== 'keyDown') return null;
  for (const [accs, command] of fixedTable(accelerators)) {
    for (const a of accs) if (matches(input, parse(a, platform))) return command;
  }
  …unchanged below…
```

- [ ] **Step 6: Run, lint, typecheck**

Run: `corepack pnpm biome check --write src tests && corepack pnpm vitest run tests/unit/shortcut-rules.test.ts tests/unit/shortcuts.test.ts && corepack pnpm lint && corepack pnpm typecheck`
Expected: both files pass; lint clean; typecheck clean (nothing consumes `Settings.shortcuts` yet, and `DEFAULT_SETTINGS` gained it).

---

### Task 2: boot and backup normalise it (tests first)

**Files:**

- Modify: `src/main/settings.ts`, `src/main/lib/settings-backup.ts`
- Test: `tests/unit/settings.test.ts`, `tests/unit/settings-backup.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/settings.test.ts` (inside the file's last `describe` block or as a new one at the end):

```ts
describe('shortcuts', () => {
  it('defaults to no overrides and drops what cannot be bound', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    expect(new SettingsStore(dir).get().shortcuts).toEqual({});
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ shortcuts: { home: 'Shift+CmdOrCtrl+e', switcher: 'CmdOrCtrl+C', lock: 7 } }),
    );
    expect(new SettingsStore(dir).get().shortcuts).toEqual({ home: 'CmdOrCtrl+Shift+E' });
  });
});
```

Append to `tests/unit/settings-backup.test.ts`, inside `describe('parseBackup', …)` (after `'never lets a folder path in through downloads'`):

```ts
  it('normalises shortcuts on the way in and drops a non-object outright', () => {
    expect(parseBackup(wrap({ shortcuts: { home: 'CmdOrCtrl+C', switcher: 'CmdOrCtrl+Shift+E' } }))).toEqual({
      ok: true,
      patch: { shortcuts: { switcher: 'CmdOrCtrl+Shift+E' } },
    });
    expect(parseBackup(wrap({ shortcuts: 'CmdOrCtrl+K', theme: 'light' }))).toEqual({
      ok: true,
      patch: { theme: 'light' },
    });
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `corepack pnpm vitest run tests/unit/settings.test.ts tests/unit/settings-backup.test.ts`
Expected: the shortcuts cases fail (`shortcuts` undefined; the key is not allowlisted).

- [ ] **Step 3: Implement**

`src/main/settings.ts` — add `import { normalizeShortcuts } from './lib/shortcut-rules';` and in `normalize`'s returned `settings` object, after `downloads: fillDownloads(raw.downloads),`:

```ts
      shortcuts: normalizeShortcuts(raw.shortcuts),
```

`src/main/lib/settings-backup.ts` — add `import { normalizeShortcuts } from './shortcut-rules';`; add `'shortcuts',` to `BACKUP_KEYS` after `'summonHotkey',`; in `accept`, before `default:`:

```ts
    case 'shortcuts':
      // an object is normalised (an empty one legitimately means "defaults");
      // anything else is dropped, never turned into a reset
      return v && typeof v === 'object' && !Array.isArray(v) ? normalizeShortcuts(v) : undefined;
```

- [ ] **Step 4: Gates**

Run: `corepack pnpm vitest run tests/unit/settings.test.ts tests/unit/settings-backup.test.ts && corepack pnpm lint && corepack pnpm typecheck`
Expected: green.

---

### Task 3: the recorder, the channel, and every consumer reads the resolved table (tests first)

**Files:**

- Create: `src/main/shortcut-recorder.ts`, `tests/unit/shortcut-recorder.test.ts`
- Modify: `src/shared/ipc.ts`, `src/main/ipc-handlers.ts`, `src/main/index.ts`, `src/main/activate.ts`, `src/main/menu.ts`, `src/main/views.ts`
- Test: `tests/unit/activate.test.ts`, `tests/unit/ipc-sender-policy.test.ts`, `tests/unit/lock-ipc-policy.test.ts`

**Interfaces:**

- Produces: `ShortcutRecorder { start(id): Promise<RecordResult>; onInput(e, input): void; cancel(): void; recording(): boolean }`; channel `shortcuts:record` (invoke, `{ id: RebindableId }` → `RecordResult`); `ViewHooks.accelerators(): Accelerators`; `AppContext.recorder`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/shortcut-recorder.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RECORD_TIMEOUT_MS } from '../../src/main/lib/shortcut-rules';
import type { KeyInput } from '../../src/main/lib/shortcuts';
import { ShortcutRecorder } from '../../src/main/shortcut-recorder';
import { resolveAccelerators } from '../../src/shared/shortcuts';

const press = (over: Partial<KeyInput>): KeyInput => ({
  type: 'keyDown',
  key: '',
  code: '',
  control: false,
  meta: false,
  shift: false,
  alt: false,
  ...over,
});

function harness() {
  const recorder = new ShortcutRecorder({ resolved: () => resolveAccelerators({}), platform: 'darwin' });
  const e = { preventDefault: vi.fn() };
  return { recorder, e };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('ShortcutRecorder', () => {
  it('is inert while idle', () => {
    const { recorder, e } = harness();
    recorder.onInput(e, press({ code: 'KeyE', meta: true, shift: true }));
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(recorder.recording()).toBe(false);
  });

  it('swallows every event while recording and resolves on the first full chord', async () => {
    const { recorder, e } = harness();
    const p = recorder.start('home');
    expect(recorder.recording()).toBe(true);
    recorder.onInput(e, press({ type: 'keyDown', code: 'ShiftLeft', shift: true })); // bare modifier
    recorder.onInput(e, press({ type: 'keyUp', code: 'KeyE', meta: true, shift: true })); // key-up
    recorder.onInput(e, press({ code: 'KeyE', meta: true, shift: true }));
    expect(e.preventDefault).toHaveBeenCalledTimes(3);
    await expect(p).resolves.toEqual({ ok: true, patch: { home: 'CmdOrCtrl+Shift+E' } });
    expect(recorder.recording()).toBe(false);
  });

  it('resolves a refusal and goes idle — the pane re-asks', async () => {
    const { recorder, e } = harness();
    const p = recorder.start('pinSelection');
    recorder.onInput(e, press({ key: 'k', code: 'KeyK', meta: true }));
    await expect(p).resolves.toEqual({ ok: false, reason: 'taken', chord: 'CmdOrCtrl+K', takenBy: 'switcher' });
    expect(recorder.recording()).toBe(false);
  });

  it('cancels on Escape, on timeout, on cancel(), and when a second start takes over', async () => {
    const { recorder, e } = harness();
    const a = recorder.start('home');
    recorder.onInput(e, press({ key: 'Escape', code: 'Escape' }));
    await expect(a).resolves.toEqual({ ok: false, reason: 'cancelled' });

    const b = recorder.start('home');
    vi.advanceTimersByTime(RECORD_TIMEOUT_MS);
    await expect(b).resolves.toEqual({ ok: false, reason: 'cancelled' });

    const c = recorder.start('home');
    recorder.cancel();
    await expect(c).resolves.toEqual({ ok: false, reason: 'cancelled' });
    expect(recorder.recording()).toBe(false);

    const d = recorder.start('home');
    const f = recorder.start('lock');
    await expect(d).resolves.toEqual({ ok: false, reason: 'cancelled' });
    recorder.onInput(e, press({ code: 'KeyE', meta: true, shift: true }));
    await expect(f).resolves.toEqual({ ok: true, patch: { lock: 'CmdOrCtrl+Shift+E' } });
  });
});
```

`tests/unit/activate.test.ts` — in `makeCtx` add `recorder: { cancel: vi.fn() },` to the `ctx` object (after `noteActivated: vi.fn(),`) and return it: `return { ctx, views, update, recorder: (ctx as unknown as { recorder: { cancel: ReturnType<typeof vi.fn> } }).recorder };`. Then inside `describe('setOverlayOpen', …)`:

```ts
  it('cancels a pending recording when settings closes, and only then', () => {
    const state = new MainState();
    const { ctx, recorder } = makeCtx(state);
    setOverlayOpen(ctx, 'settingsOpen', true);
    setOverlayOpen(ctx, 'switcherOpen', false);
    expect(recorder.cancel).not.toHaveBeenCalled();
    setOverlayOpen(ctx, 'settingsOpen', false);
    expect(recorder.cancel).toHaveBeenCalledTimes(1);
  });
```

`tests/unit/ipc-sender-policy.test.ts` — after the downloads case:

```ts
  it('refuses shortcuts:record from a service frame', () => {
    expect(
      ipcSenderAllowed({
        channel: 'shortcuts:record',
        fromShell: false,
        senderServiceId: 'zalo',
        payloadServiceId: undefined,
      }),
    ).toBe(false);
    expect(
      ipcSenderAllowed({
        channel: 'shortcuts:record',
        fromShell: true,
        senderServiceId: null,
        payloadServiceId: undefined,
      }),
    ).toBe(true);
  });
```

`tests/unit/lock-ipc-policy.test.ts` — add `'shortcuts:record',` after `'downloads:cancel',`.

- [ ] **Step 2: Run them to verify they fail**

Run: `corepack pnpm vitest run tests/unit/shortcut-recorder.test.ts tests/unit/activate.test.ts tests/unit/ipc-sender-policy.test.ts tests/unit/lock-ipc-policy.test.ts`
Expected: the recorder file fails to resolve; the new activate and policy cases fail.

- [ ] **Step 3: `src/main/shortcut-recorder.ts`**

```ts
import type { Accelerators, RebindableId, RecordResult } from '../shared/shortcuts';
import { chordFromInput, RECORD_TIMEOUT_MS, recordVerdict } from './lib/shortcut-rules';
import type { KeyInput } from './lib/shortcuts';

interface Pending {
  id: RebindableId;
  resolve: (r: RecordResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** One recording at a time, fed from the shell window's before-input-event.
 *  While pending, every key is preventDefault'ed — that is what keeps ⌘K
 *  from opening the switcher through the menu accelerator while the user is
 *  trying to record it, and keeps the renderer from seeing the keydown. The
 *  first full chord ends the recording with a verdict; Escape, the timeout,
 *  cancel() (Settings closing, the lock engaging) or a newer start() end it
 *  as `cancelled`. Electron-free: the caller hands in the event. */
export class ShortcutRecorder {
  private pending: Pending | null = null;

  constructor(private deps: { resolved(): Accelerators; platform: string }) {}

  recording(): boolean {
    return this.pending !== null;
  }

  start(id: RebindableId): Promise<RecordResult> {
    this.cancel();
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.finish({ ok: false, reason: 'cancelled' }), RECORD_TIMEOUT_MS);
      this.pending = { id, resolve, timer };
    });
  }

  onInput(e: { preventDefault(): void }, input: KeyInput): void {
    const p = this.pending;
    if (!p) return;
    e.preventDefault();
    if (input.type !== 'keyDown') return;
    if (input.key === 'Escape') {
      this.finish({ ok: false, reason: 'cancelled' });
      return;
    }
    const chord = chordFromInput(input, this.deps.platform);
    if (!chord) return; // a bare modifier: the chord is still being pressed
    this.finish(recordVerdict(p.id, chord, this.deps.resolved()));
  }

  cancel(): void {
    if (this.pending) this.finish({ ok: false, reason: 'cancelled' });
  }

  private finish(r: RecordResult): void {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    clearTimeout(p.timer);
    p.resolve(r);
  }
}
```

- [ ] **Step 4: Channel and handlers**

`src/shared/ipc.ts` — add `import type { RebindableId, RecordResult } from './shortcuts';` and in `RendererInvoke` after `'downloads:recent'`:

```ts
  /** Settings → Shortcuts: record the next chord for a row. Main reads the
   *  key off the OS event, validates it (lib/shortcut-rules) and writes the
   *  override itself; the pane only shows the verdict. Shell-only. */
  'shortcuts:record': { payload: { id: RebindableId }; result: RecordResult };
```

Add `'shortcuts:record',` to `INVOKE_CHANNELS` (after `'downloads:recent',`) and to `SHELL_ONLY_CHANNELS` (after `'downloads:cancel',`). Not to `LOCKED_ALLOWED_CHANNELS`.

`src/main/ipc-handlers.ts` — imports: `import { isRebindable } from '../shared/shortcuts';` and `import type { ShortcutRecorder } from './shortcut-recorder';`. `AppContext` after `downloads: DownloadManager;`:

```ts
  /** Settings → Shortcuts' one pending recording */
  recorder: ShortcutRecorder;
```

In `applySettingsPatch`, after `if ('summonHotkey' in patch) ctx.summonHotkeyChanged();`:

```ts
  if ('shortcuts' in patch) buildAppMenu(ctx); // the menu bakes its accelerators in
```

After the `downloads:cancel` handler:

```ts
  onInvoke('shortcuts:record', { ok: false, reason: 'cancelled' }, async ({ id }) => {
    if (!isRebindable(id)) return { ok: false, reason: 'cancelled' };
    const result = await ctx.recorder.start(id);
    if (result.ok && Object.keys(result.patch).length > 0) {
      applySettingsPatch(ctx, { shortcuts: { ...ctx.settings.get().shortcuts, ...result.patch } });
    }
    return result;
  });
```

- [ ] **Step 5: Main wiring**

`src/main/index.ts`:

- imports: `import { resolveAccelerators } from '../shared/shortcuts';` and `import { ShortcutRecorder } from './shortcut-recorder';`.
- before `const views = new ServiceViewManager(`:

```ts
    const accelerators = () => resolveAccelerators(settings.get().shortcuts);
    const recorder = new ShortcutRecorder({ resolved: accelerators, platform: process.platform });
```

- in the views hooks object, after `note: (tag, line, id) => diag.note(tag, line, id),`: `accelerators,`.
- the shell window handler becomes:

```ts
    win.webContents.on('before-input-event', (e, input) => {
      // Settings → Shortcuts is listening: the key is the recording's, and
      // neither the menu accelerator nor the renderer may see it
      if (recorder.recording()) {
        recorder.onInput(e, input);
        return;
      }
      // F5 reload while focus is on the shell (menu covers Cmd/Ctrl+R). This
      // path never reaches runShellCommand, so it carries its own lock guard.
      if (state.locked) return;
      if (input.type === 'keyDown' && input.key === 'F5') views.refresh(state.activeId);
    });
```

- in `syncLocked`, first line: `if (lock.locked) recorder.cancel();`.
- in the `ctx` literal after `downloads,`: `recorder,`.

`src/main/views.ts` — `ViewHooks` gains, after `note(…)`:

```ts
  /** the chord table as the user has it (shared/shortcuts resolveAccelerators) */
  accelerators(): Accelerators;
```

(import `type Accelerators` from `'../shared/shortcuts'`), and the interceptor line becomes `const command = shellCommandFor(input, process.platform, this.hooks.accelerators());`.

`src/main/activate.ts` — in `setOverlayOpen`:

```ts
  if (key === 'settingsOpen' && !open) {
    ctx.state.settingsFocus = null;
    ctx.recorder.cancel(); // a recording cannot outlive the pane that asked
  }
```

`src/main/menu.ts` — import `resolveAccelerators` from `'../shared/shortcuts'`; drop `ACCELERATORS` from the `./lib/shortcuts` import (keep `devtoolsAccelerator`); after `const order = …` add `const acc = resolveAccelerators(s.shortcuts);` and replace every `ACCELERATORS.` with `acc.`.

- [ ] **Step 6: Gates**

Run: `corepack pnpm biome check --write src tests && corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: clean; every unit file green.

---

### Task 4: the pane

**Files:**

- Create: `src/renderer/src/components/ShortcutsPane.tsx`
- Modify: `src/renderer/src/components/SettingsView.tsx` (remove `ShortcutGroup`, the `key` helper and the inline Shortcuts pane; mount the component; prune imports)

**Interfaces:**

- Consumes: `shortcuts:record`, `settings:update`, `resolveAccelerators`, `ACCELERATORS`, `SHORTCUT_LABELS`, `REBINDABLE`, `comboLabel`, `devtoolsAccelerator`.
- Produces: test ids `shortcut-cap-<id>`, `shortcut-row-<id>`, `shortcut-reset-<id>` (the pair uses `nextUnread`), `shortcuts-reset-all`.

- [ ] **Step 1: `ShortcutsPane.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import {
  ACCELERATORS,
  type RebindableId,
  REBINDABLE,
  type RecordResult,
  resolveAccelerators,
  SHORTCUT_LABELS,
  devtoolsAccelerator,
} from '../../../shared/shortcuts';
import { comboLabel } from '../../../shared/summon';
import type { Settings } from '../../../shared/types';

const isMac = navigator.platform.startsWith('Mac');
/** platform label for a table chord — '⇧⌘G' here, 'Ctrl+Shift+G' on Windows */
const key = (accelerator: string) => comboLabel(accelerator, isMac);
const MOD = isMac ? '⌘' : 'Ctrl';
const RECORDING = 'Press a shortcut… esc cancels';

type RowSpec = { fixed: string; desc: string } | { ids: readonly RebindableId[]; desc: string };

const NAVIGATE: RowSpec[] = [
  { fixed: `${key('CmdOrCtrl+1')}…9`, desc: 'jump to a service' },
  { ids: ['switcher'], desc: 'quick switcher — services and recent conversations' },
  { ids: ['nextUnread', 'prevUnread'], desc: 'next / previous unread conversation' },
  { ids: ['home'], desc: 'Home — all services and the pinboard' },
  { ids: ['downloads'], desc: "downloads — this session's files" },
  { fixed: key(ACCELERATORS.findService), desc: 'find a service (on Home)' },
  { fixed: 'Esc', desc: 'close this window, or leave Home' },
];
const PINS: RowSpec[] = [
  { ids: ['pinSelection'], desc: 'pin the selected text to the pinboard' },
  { fixed: 'Right-click a message', desc: 'Pin Message — where the site allows our menu' },
  { fixed: 'Drag ⠿ on Home', desc: 'reprioritize — the top pin is in progress' },
];
const PAGE: RowSpec[] = [
  { fixed: `${key(ACCELERATORS.reload[0])} or F5`, desc: 'reload the current service' },
  {
    fixed: `${key(ACCELERATORS.zoomIn)} / ${key(ACCELERATORS.zoomOut)} / ${key(ACCELERATORS.zoomReset)}`,
    desc: 'zoom in / out / actual size (remembered per service)',
  },
  { fixed: key(devtoolsAccelerator(isMac ? 'darwin' : 'win32')), desc: 'developer tools' },
];
const RAIL: RowSpec[] = [
  { fixed: key(ACCELERATORS.settings), desc: 'settings' },
  { ids: ['lock'], desc: 'lock Goetia' },
  { fixed: 'Right-click a tile', desc: 'mute or banish the service' },
  { fixed: 'Drag tiles', desc: 'reorder services' },
];

/** the inline line under a refused chord — the cap keeps listening */
export function refusalLine(r: Extract<RecordResult, { ok: false }>): string {
  const chord = r.chord ? key(r.chord) : 'That';
  const tail = ' — press another, or esc';
  switch (r.reason) {
    case 'modifier':
      return `Needs ${MOD}${tail}`;
    case 'reserved':
      return `${chord} is reserved${tail}`;
    case 'taken':
      return `${chord} is taken by ${r.takenBy ? SHORTCUT_LABELS[r.takenBy] : 'another key'}${tail}`;
    case 'pair':
      return `Needs a key with an opposite: brackets, arrows, Page Up/Down, Tab${tail}`;
    case 'cancelled':
      return '';
  }
}

/** Settings → Shortcuts: the chord table as the user has it. A rebindable
 *  row's chord is a key cap: click, press the new chord, done — main records,
 *  validates and writes (shortcuts:record); this pane only asks and shows the
 *  verdict, and re-asks after a refusal so the cap keeps listening. Reset per
 *  row and for all are ordinary settings writes. */
export default function ShortcutsPane({ settings }: { settings: Settings }) {
  const acc = resolveAccelerators(settings.shortcuts);
  const [active, setActive] = useState<RebindableId | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  // the row a click started; a stale `cancelled` from a superseded recording
  // must not clear the row that took over
  const activeRef = useRef<RebindableId | null>(null);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const record = async (id: RebindableId) => {
    activeRef.current = id;
    setActive(id);
    setRefusal(null);
    for (;;) {
      const r = await window.goetia.invoke('shortcuts:record', { id });
      if (!alive.current || activeRef.current !== id) return;
      if (r.ok || r.reason === 'cancelled') {
        activeRef.current = null;
        setActive(null);
        setRefusal(null);
        return;
      }
      setRefusal(refusalLine(r));
    }
  };
  const update = (shortcuts: Settings['shortcuts']) =>
    window.goetia.send('settings:update', { shortcuts });
  const reset = (ids: readonly RebindableId[]) => {
    const next = { ...settings.shortcuts };
    for (const id of ids) delete next[id];
    update(next);
  };
  const changed = Object.keys(settings.shortcuts).length;

  const group = (title: string, rows: RowSpec[], last = false) => (
    <div className={`py-3 ${last ? '' : 'border-b border-border'}`}>
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-2">
        {title}
      </h3>
      <dl className="grid grid-cols-[minmax(120px,max-content)_1fr_auto] items-center gap-x-4 gap-y-1">
        {rows.map((row) => {
          if ('fixed' in row) {
            return (
              <div key={row.fixed} className="contents">
                <dt className="tabular text-text-1">{row.fixed}</dt>
                <dd className="text-text-2">{row.desc}</dd>
                <dd />
              </div>
            );
          }
          const id = row.ids[0];
          const label = row.ids.map((i) => key(acc[i])).join(' / ');
          const fallback = row.ids.map((i) => key(ACCELERATORS[i])).join(' / ');
          const isActive = active !== null && row.ids.includes(active);
          const differs = row.ids.some((i) => acc[i] !== ACCELERATORS[i]);
          const capClass = isActive
            ? refusal
              ? 'border-danger text-danger'
              : 'border-accent bg-accent/10 text-accent ring-2 ring-accent/25'
            : 'border-border bg-bg-2 text-text-1 hover:border-accent';
          return (
            <div key={id} className="contents" data-testid={`shortcut-row-${id}`}>
              <dt>
                <button
                  type="button"
                  data-testid={`shortcut-cap-${id}`}
                  onClick={() => void record(id)}
                  className={`tabular rounded-ctl border px-2 py-0.5 text-[12px] transition-colors duration-120 ${capClass}`}
                >
                  {isActive && !refusal ? RECORDING : label}
                </button>
              </dt>
              <dd className={isActive && refusal ? 'text-danger' : 'text-text-2'}>
                {isActive && refusal ? refusal : row.desc}
              </dd>
              <dd className="text-right">
                {differs && (
                  <button
                    type="button"
                    data-testid={`shortcut-reset-${id}`}
                    onClick={() => reset(row.ids)}
                    className="whitespace-nowrap text-[11px] text-accent hover:underline"
                  >
                    Reset to {fallback}
                  </button>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );

  const notifications: RowSpec[] = [
    { ids: ['mute'], desc: 'mute / unmute everything' },
    ...(settings.summonHotkey.enabled
      ? [
          {
            fixed: `${comboLabel(settings.summonHotkey.accelerator, isMac)} (system-wide)`,
            desc: 'summon / dismiss Goetia — chosen in General',
          },
        ]
      : []),
  ];

  return (
    <div>
      <p className="pt-3 text-[11px] text-text-2">
        Goetia's keys work inside every chat page, even where the site binds the same chord. Click
        a key to change it — keep the ones you press with the mouse in your other hand on the left
        half.
      </p>
      {group('Navigate', NAVIGATE)}
      {group('Pins', PINS)}
      {group('Service page', PAGE)}
      {group('Notifications', notifications)}
      {group('Rail', RAIL, changed === 0)}
      {changed > 0 && (
        <div className="flex items-center justify-between py-3 text-[11px] text-text-2">
          <span>
            {changed} {changed === 1 ? 'key' : 'keys'} changed from the defaults.
          </span>
          <button
            type="button"
            data-testid="shortcuts-reset-all"
            onClick={() => update({})}
            className="text-accent hover:underline"
          >
            Reset all to defaults
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `SettingsView.tsx`**

Delete the `key` helper (line 104) and the whole `ShortcutGroup` function; delete the inline `{active === 'shortcuts' && ( <Pane title="Shortcuts"> … </Pane> )}` block and replace it with:

```tsx
            {active === 'shortcuts' && (
              <Pane title="Shortcuts">
                <ShortcutsPane settings={s} />
              </Pane>
            )}
```

Add `import ShortcutsPane from './ShortcutsPane';`. Change the shortcuts import to whatever the file still uses — the summon row's `comboLabel` stays; `ACCELERATORS` and `devtoolsAccelerator` should now be unused there, so drop line 3 (biome reports any leftover).

- [ ] **Step 3: Gates**

Run: `corepack pnpm biome check --write src && corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: clean.

---

### Task 5: e2e

**Files:**

- Modify: `tests/e2e/shortcuts.spec.ts`

- [ ] **Step 1: Add the shell-key helper and the test**

After the `chord` helper:

```ts
const cmd = process.platform === 'darwin' ? { meta: true } : { control: true };
const mac = process.platform === 'darwin';

/** A key arriving at the SHELL window's before-input-event — where the
 *  recorder listens while Settings → Shortcuts has a cap pressed. */
async function shellKey(
  app: ElectronApplication,
  key: string,
  code: string,
  mods: { meta?: boolean; control?: boolean; shift?: boolean; alt?: boolean } = {},
): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow }, [k, c, m]) => {
      BrowserWindow.getAllWindows()[0].webContents.emit(
        'before-input-event',
        { preventDefault() {} },
        {
          type: 'keyDown',
          key: k,
          code: c,
          meta: false,
          control: false,
          shift: false,
          alt: false,
          isAutoRepeat: false,
          ...m,
        },
      );
    },
    [key, code, mods] as const,
  );
}

test('shortcuts: a key is rebound by pressing it, the page honours it, Reset all restores', async () => {
  const { app, win } = await launch();
  await win.getByTestId('settings-btn').click();
  await win.getByTestId('settings-nav-shortcuts').click();

  // record: click the cap, press the new chord on the shell window
  const home = win.getByTestId('shortcut-cap-home');
  await expect(home).toHaveText(mac ? '⇧⌘G' : 'Ctrl+Shift+G');
  await home.click();
  await expect(home).toContainText('Press a shortcut');
  await shellKey(app, 'E', 'KeyE', { ...cmd, shift: true });
  await expect(home).toHaveText(mac ? '⇧⌘E' : 'Ctrl+Shift+E');
  await expect(win.getByTestId('shortcut-reset-home')).toContainText(mac ? '⇧⌘G' : 'Ctrl+Shift+G');

  // a collision names its holder and keeps listening; Escape gives up
  const pin = win.getByTestId('shortcut-cap-pinSelection');
  await pin.click();
  await shellKey(app, 'k', 'KeyK', cmd);
  await expect(win.getByTestId('shortcut-row-pinSelection')).toContainText('taken by Quick Switcher');
  await shellKey(app, 'Escape', 'Escape');
  await expect(pin).toHaveText(mac ? '⇧⌘S' : 'Ctrl+Shift+S');

  // the unread pair records from one arrow
  const pair = win.getByTestId('shortcut-cap-nextUnread');
  await pair.click();
  await shellKey(app, 'ArrowRight', 'ArrowRight', cmd);
  await expect(pair).toHaveText(mac ? '⌘→ / ⌘←' : 'Ctrl+→ / Ctrl+←');
  await expect(win.getByTestId('shortcuts-reset-all')).toBeVisible();
  await win.keyboard.press('Escape');

  // inside a service page the new Home chord works and the old one is the page's
  await chord(app, 'E');
  await expect(win.locator('[data-testid="welcome"]')).toBeVisible();
  await win.keyboard.press('Escape'); // Welcome's Escape leaves Home
  await expect(win.locator('[data-testid="welcome"]')).toHaveCount(0);
  await chord(app, 'G');
  await expect(win.locator('[data-testid="welcome"]')).toHaveCount(0);

  // Reset all
  await win.getByTestId('settings-btn').click();
  await win.getByTestId('settings-nav-shortcuts').click();
  await win.getByTestId('shortcuts-reset-all').click();
  await expect(home).toHaveText(mac ? '⇧⌘G' : 'Ctrl+Shift+G');
  await expect(pair).toHaveText(mac ? '⇧⌘] / ⇧⌘[' : 'Ctrl+Shift+] / Ctrl+Shift+[');
  await expect(win.getByTestId('shortcuts-reset-all')).toHaveCount(0);
  await app.close();
});
```

- [ ] **Step 2: Build and run**

Run: `corepack pnpm biome check --write tests && corepack pnpm build && env -u ELECTRON_RUN_AS_NODE npx playwright test tests/e2e/shortcuts.spec.ts --reporter=line`
Expected: 4 passed. If Welcome's Escape does not leave Home in this profile, click the Zalo tile instead (`button[aria-label="Zalo"]` in `[data-testid="rail"]`).

- [ ] **Step 3: Full gates**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: clean.

---

### Task 6: docs

**Files:**

- Modify: the spec's status line; `CLAUDE.md` (the chords bullet); `docs/FEATURES.md` (the Shell shortcuts bullet; Persisted settings list)

- [ ] **Step 1: Edits**

Spec: `Status: approved in brainstorm (user decision, same day, from the mocked artifact \`Goetia Rebindable Keys\`, variant A); not implemented.` → `Status: implemented 2026-09-23.`

`CLAUDE.md`, chords bullet, after `Never add a menu accelerator without a table entry, or it silently dies in whichever service binds it.` insert:

```text
 **Eight chords are the user's** (2026-09-23, user decision; spec `docs/superpowers/specs/2026-09-23-rebindable-shortcuts-design.md`): `settings.shortcuts` holds overrides for `REBINDABLE` (`shared/shortcuts.ts`) and `resolveAccelerators` is the one table the menu, `views.ts`'s interceptor (`ViewHooks.accelerators`) and Settings → Shortcuts read — never read `ACCELERATORS` directly for one of those eight. Recording is main-side (`ShortcutRecorder`, fed from the shell window's `before-input-event`, which it `preventDefault`s wholesale while pending so a menu accelerator cannot fire mid-record); every chord passes `lib/shortcut-rules.ts` — canonical spelling, the reserved set (OS/edit chords, every fixed chord, ⌘1…9), no collision, Next/Previous Unread only as a mirrored pair — and `normalizeShortcuts` runs the same rule over `settings.json` at boot and a backup on import, so an invalid override is dropped, never applied. The fixed chords stay constants.
```

`docs/FEATURES.md`, Shell shortcuts bullet: after the words `both read it) and intercepted in each view's \`before-input-event\`,` insert:

```text
 — eight of them (Quick Switcher, Next/Previous Unread as one mirrored pair, Home, Downloads, Pin Selection, Mute All, Lock) rebindable from Settings → Shortcuts by clicking the key cap and pressing the new chord (main records and validates: reserved, collision and pair rules in `lib/shortcut-rules.ts`; per-key Reset and Reset all; overrides in `settings.shortcuts`, travelling with Settings backup) —
```

Then add `shortcut-rules.test.ts`, `shortcut-recorder.test.ts` and `settings-backup.test.ts` to that bullet's Verified list and `src/main/shortcut-recorder.ts`, `src/main/lib/shortcut-rules.ts` and `ShortcutsPane.tsx` to its Impl list. In the **Persisted settings** bullet add `shortcuts` to the list of keys.

- [ ] **Step 2: Lint the markdown**

Run: `npx markdownlint-cli2 CLAUDE.md docs/FEATURES.md docs/superpowers/specs/2026-09-23-rebindable-shortcuts-design.md docs/superpowers/plans/2026-09-23-rebindable-shortcuts.md`
Expected: `Summary: 0 issues`.

- [ ] **Step 3: Hand off**

Do not commit. Report the files touched, the gate results and ask the user to run `/commit`.
