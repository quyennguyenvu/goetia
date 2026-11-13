import {
  type RebindableId,
  resolveAccelerators,
  type ShortcutOverrides,
} from '../../../shared/shortcuts';
import { comboLabel } from '../../../shared/summon';

/** A rebindable chord as the user has it, for a tooltip or a hint — never the
 *  default spelled out, which names a dead chord once it is rebound. */
export function chordLabel(
  shortcuts: ShortcutOverrides,
  id: RebindableId,
  isMac = navigator.platform.startsWith('Mac'),
): string {
  return comboLabel(resolveAccelerators(shortcuts)[id], isMac);
}
