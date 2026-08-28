import { ACCELERATORS, devtoolsAccelerator } from '../../shared/shortcuts';
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
  | { kind: 'settings' }
  | { kind: 'reload' }
  | { kind: 'devtools' }
  | { kind: 'zoom'; step: 1 | -1 | 0 }
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

const CODES: Record<string, string> = { '=': 'Equal', '-': 'Minus', ',': 'Comma' };

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

const FIXED: ReadonlyArray<readonly [readonly string[], ShellCommand]> = [
  [[ACCELERATORS.home], { kind: 'home' }],
  [[ACCELERATORS.pinSelection], { kind: 'pin-selection' }],
  [[ACCELERATORS.switcher], { kind: 'switcher' }],
  [[ACCELERATORS.mute], { kind: 'mute' }],
  [[ACCELERATORS.settings], { kind: 'settings' }],
  [ACCELERATORS.reload, { kind: 'reload' }],
  [[ACCELERATORS.zoomIn], { kind: 'zoom', step: 1 }],
  [[ACCELERATORS.zoomOut], { kind: 'zoom', step: -1 }],
  [[ACCELERATORS.zoomReset], { kind: 'zoom', step: 0 }],
];

/** The shell command a key-down inside a service page stands for, or null
 *  when the key is the page's to keep. */
export function shellCommandFor(input: KeyInput, platform: string): ShellCommand | null {
  if (input.type !== 'keyDown') return null;
  for (const [accelerators, command] of FIXED) {
    for (const a of accelerators) if (matches(input, parse(a, platform))) return command;
  }
  if (matches(input, parse(devtoolsAccelerator(platform), platform))) return { kind: 'devtools' };
  for (let index = 0; index < MAX_SERVICE_ACCELERATORS; index++) {
    const a = serviceAccelerator(index);
    if (a && matches(input, parse(a, platform))) return { kind: 'service', index };
  }
  return null;
}
