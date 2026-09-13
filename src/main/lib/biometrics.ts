import { systemPreferences } from 'electron';

/** Re-checked per call rather than cached: a Mac that could not prompt with
 *  the lid shut may be able to a moment later, and vice versa. */
export const hasTouchId = (): boolean =>
  process.platform === 'darwin' && systemPreferences.canPromptTouchID();

/** macOS renders this as `"Goetia" is trying to <reason>`. Touch ID accepts
 *  any finger enrolled on the machine — see the app-lock spec's threat model
 *  before treating a true here as "the owner". */
export async function biometric(reason: string): Promise<boolean> {
  try {
    await systemPreferences.promptTouchID(reason);
    return true;
  } catch {
    return false; // cancelled, or no finger matched
  }
}
