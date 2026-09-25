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
    const withShift = [...without, 'Shift' as Mod].sort(
      (a, b) => MODS.indexOf(a) - MODS.indexOf(b),
    );
    return { next: join(without, 'Tab'), prev: join(withShift, 'Tab') };
  }
  if (c.key in NEXT_TO_PREV) {
    return { next: join(c.mods, c.key), prev: join(c.mods, NEXT_TO_PREV[c.key]) };
  }
  if (c.key in PREV_TO_NEXT) {
    return { next: join(c.mods, PREV_TO_NEXT[c.key]), prev: join(c.mods, c.key) };
  }
  return null;
}

const PAIR: readonly RebindableId[] = ['nextConversation', 'prevConversation'];

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

/** The refusal for one chord, or null when it may be bound. */
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
 *  now. The conversation pair records as one: the opposite is inferred, both halves
 *  are checked with the pair's own slots excused, and both go in the patch. */
export function recordVerdict(
  id: RebindableId,
  chord: string,
  resolved: Accelerators,
): RecordResult {
  if (PAIR.includes(id)) {
    const c = parseChord(chord);
    if (!c?.mods.includes('CmdOrCtrl')) return { ok: false, reason: 'modifier', chord };
    const pair = pairFor(chord);
    if (!pair) return { ok: false, reason: 'pair', chord: join(c.mods, c.key) };
    const bad = refusal(pair.next, PAIR, resolved) ?? refusal(pair.prev, PAIR, resolved);
    if (bad) return bad;
    if (
      canonical(resolved.nextConversation) === pair.next &&
      canonical(resolved.prevConversation) === pair.prev
    ) {
      return { ok: true, patch: {} };
    }
    return { ok: true, patch: { nextConversation: pair.next, prevConversation: pair.prev } };
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
 *  and the conversation pair kept only whole and mirrored. */
export function normalizeShortcuts(raw: unknown): ShortcutOverrides {
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
  const n = out.nextConversation;
  const p = out.prevConversation;
  if ((n === undefined) !== (p === undefined) || (n !== undefined && pairFor(n)?.prev !== p)) {
    delete out.nextConversation;
    delete out.prevConversation;
  }
  return out;
}
