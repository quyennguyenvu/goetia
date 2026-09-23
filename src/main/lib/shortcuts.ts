import { ACCELERATORS, type Accelerators, devtoolsAccelerator } from '../../shared/shortcuts';
import { MAX_SERVICE_ACCELERATORS, serviceAccelerator } from './service-accelerator';

/** The table lives in shared/shortcuts.ts so Settings can render it; this
 *  module is the main-side half. A page receives a key before the menu does
 *  and may swallow it (Discord bound the old ⌘⇧H), so a chord that belongs
 *  to the shell has to be taken before dispatch in `before-input-event` —
 *  and preventDefault there suppresses the menu accelerator as well, which is
 *  why the interceptor runs the command itself (`commands.ts`). */
export { ACCELERATORS, devtoolsAccelerator };

export type ShellCommand =
  | { kind: 'home' }
  | { kind: 'pin-selection' }
  | { kind: 'switcher' }
  | { kind: 'mute' }
  | { kind: 'lock' }
  | { kind: 'settings' }
  | { kind: 'downloads' }
  | { kind: 'reload' }
  | { kind: 'devtools' }
  | { kind: 'zoom'; step: 1 | -1 | 0 }
  | { kind: 'unread'; step: 1 | -1 }
  | { kind: 'service'; index: number };

/** The slice of Electron's `Input` the matcher reads — structural, so this
 *  module stays electron-free and unit-testable. */
export interface KeyInput {
  type: string;
  key: string;
  code?: string;
  control: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
  isAutoRepeat?: boolean;
}

interface Chord {
  control: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
  /** lowercased character, compared against input.key */
  key: string;
  /** physical key, compared against input.code — for layouts whose
   *  character under the modifiers is not the label (dead keys, ¡ for 1) */
  code: string;
}

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

function parse(accelerator: string, platform: string): Chord {
  const parts = accelerator.split('+');
  const key = parts.pop() ?? '';
  const chord: Chord = {
    control: false,
    meta: false,
    shift: false,
    alt: false,
    key: key.toLowerCase(),
    code: /^[A-Za-z]$/.test(key)
      ? `Key${key.toUpperCase()}`
      : /^[0-9]$/.test(key)
        ? `Digit${key}`
        : (CODES[key] ?? key),
  };
  for (const mod of parts) {
    if (mod === 'CmdOrCtrl' || mod === 'CommandOrControl') {
      if (platform === 'darwin') chord.meta = true;
      else chord.control = true;
    } else if (mod === 'Cmd' || mod === 'Command' || mod === 'Super' || mod === 'Meta') {
      chord.meta = true;
    } else if (mod === 'Ctrl' || mod === 'Control') chord.control = true;
    else if (mod === 'Shift') chord.shift = true;
    else if (mod === 'Alt' || mod === 'Option') chord.alt = true;
  }
  return chord;
}

function matches(input: KeyInput, chord: Chord): boolean {
  if (
    input.control !== chord.control ||
    input.meta !== chord.meta ||
    input.shift !== chord.shift ||
    input.alt !== chord.alt
  ) {
    return false;
  }
  return input.key.toLowerCase() === chord.key || (input.code ?? '') === chord.code;
}

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
  if (matches(input, parse(devtoolsAccelerator(platform), platform))) return { kind: 'devtools' };
  for (let index = 0; index < MAX_SERVICE_ACCELERATORS; index++) {
    const a = serviceAccelerator(index);
    if (a && matches(input, parse(a, platform))) return { kind: 'service', index };
  }
  return null;
}
