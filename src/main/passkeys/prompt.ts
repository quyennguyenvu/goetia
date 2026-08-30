import { app, type BrowserWindow, dialog, systemPreferences } from 'electron';
import { PASSKEY_CAP } from '../../shared/passkeys';
import type { PasskeyPrompt } from './authenticator';

/** e2e drives ceremonies headless; a packaged build ignores this entirely,
 *  the way GOETIA_NAV_ENFORCE=off exists only to confirm a suspected bug. */
const AUTO_ACCEPT = !app.isPackaged && process.env.GOETIA_WEBAUTHN_PROMPT === 'accept';

/** Every prompt is native: the service page covers the shell, and a message
 *  box on the window draws over the views. macOS renders promptTouchID as
 *  `"Goetia" is trying to <reason>`. */
export function electronPrompt(win: BrowserWindow): PasskeyPrompt {
  const touchId = process.platform === 'darwin' && systemPreferences.canPromptTouchID();
  const device = process.platform === 'darwin' ? 'Mac' : 'computer';

  const biometric = async (reason: string): Promise<boolean> => {
    try {
      await systemPreferences.promptTouchID(reason);
      return true;
    } catch {
      return false; // cancelled, or no finger matched
    }
  };
  const ask = async (message: string, detail: string, ok: string): Promise<boolean> => {
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      message,
      detail,
      buttons: [ok, 'Cancel'],
      defaultId: 0,
      cancelId: 1,
    });
    return response === 0;
  };
  const notice = async (message: string, detail: string): Promise<void> => {
    await dialog.showMessageBox(win, { type: 'info', message, detail, buttons: ['OK'] });
  };

  return {
    async confirmCreate(rpId, account) {
      if (AUTO_ACCEPT) return true;
      if (touchId) return biometric(`create a passkey for ${rpId}`);
      return ask(
        `Create a Goetia passkey for ${rpId}?`,
        `${account} · You'll sign in here with a click instead of a password.`,
        'Create',
      );
    },
    async confirmGet(rpId, account, afterChooser) {
      if (AUTO_ACCEPT) return true;
      if (touchId) return biometric(`sign in to ${rpId}`);
      // without biometrics, picking the account was the confirmation
      if (afterChooser) return true;
      return ask(`Sign in to ${rpId} as ${account}?`, '', 'Sign in');
    },
    async chooseAccount(rpId, accounts) {
      if (AUTO_ACCEPT) return accounts[0]?.id ?? null;
      const { response } = await dialog.showMessageBox(win, {
        type: 'question',
        message: `Which account on ${rpId}?`,
        buttons: [...accounts.map((a) => a.label), 'Cancel'],
        defaultId: 0,
        cancelId: accounts.length,
      });
      return accounts[response]?.id ?? null;
    },
    async noPasskey(rpId) {
      if (AUTO_ACCEPT) return;
      await notice(
        `No Goetia passkey for ${rpId} on this ${device} yet.`,
        'Sign in with your password; when the site offers to create a passkey, accept it.',
      );
    },
    async capReached() {
      if (AUTO_ACCEPT) return;
      await notice(
        `Goetia already holds ${PASSKEY_CAP} passkeys.`,
        'Forget one in Settings → Passkeys to add another.',
      );
    },
  };
}
