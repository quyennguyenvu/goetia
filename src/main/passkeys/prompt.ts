import { app, type BrowserWindow, dialog, systemPreferences } from 'electron';
import { PASSKEY_CAP } from '../../shared/passkeys';
import type { PasskeyPrompt, Verification } from './authenticator';

/** e2e drives ceremonies headless; a packaged build ignores this entirely,
 *  the way GOETIA_NAV_ENFORCE=off exists only to confirm a suspected bug. */
const AUTO_ACCEPT = !app.isPackaged && process.env.GOETIA_WEBAUTHN_PROMPT === 'accept';

/** Every prompt is native: the service page covers the shell, and a message
 *  box on the window draws over the views. macOS renders promptTouchID as
 *  `"Goetia" is trying to <reason>`. */
const hasTouchId = (): boolean =>
  process.platform === 'darwin' && systemPreferences.canPromptTouchID();

async function biometric(reason: string): Promise<boolean> {
  try {
    await systemPreferences.promptTouchID(reason);
    return true;
  } catch {
    return false; // cancelled, or no finger matched
  }
}

async function ask(
  win: BrowserWindow,
  message: string,
  detail: string,
  ok: string,
): Promise<boolean> {
  const { response } = await dialog.showMessageBox(win, {
    type: 'question',
    message,
    detail,
    buttons: [ok, 'Cancel'],
    defaultId: 0,
    cancelId: 1,
  });
  return response === 0;
}

/** Confirms lending the shared Facebook session to one service. Not a passkey
 *  and not WebAuthn — it is the same local user verification the passkey
 *  prompt uses, asked before a credential moves between partitions. FB_APP_IDS
 *  refuses an attacker's OWN app id but cannot refuse a compromised service
 *  page opening its own real dialog against a seeded jar; this is what makes
 *  that move visible and refusable. */
export function identitySharePrompt(win: BrowserWindow): (serviceName: string) => Promise<boolean> {
  return async (serviceName) => {
    if (AUTO_ACCEPT) return true;
    if (hasTouchId()) return biometric(`share your Facebook login with ${serviceName}`);
    return ask(
      win,
      `Share your Facebook login with ${serviceName}?`,
      'Goetia will lend the session you are signed into in Messenger, for as long as the sign-in window is open.',
      'Share',
    );
  };
}

export function electronPrompt(win: BrowserWindow): PasskeyPrompt {
  const device = process.platform === 'darwin' ? 'Mac' : 'computer';

  const notice = async (message: string, detail: string): Promise<void> => {
    await dialog.showMessageBox(win, { type: 'info', message, detail, buttons: ['OK'] });
  };

  return {
    async confirmCreate(rpId, account): Promise<Verification> {
      if (AUTO_ACCEPT) return 'verified';
      // re-checked per call: a Mac that could not prompt at launch (lid shut,
      // external keyboard) may be able to now, and vice versa
      if (hasTouchId()) return (await biometric(`create a passkey for ${rpId}`)) && 'verified';
      return (
        (await ask(
          win,
          `Create a Goetia passkey for ${rpId}?`,
          `${account} · You'll sign in here with a click instead of a password.`,
          'Create',
        )) && 'presence'
      );
    },
    async confirmGet(rpId, account, afterChooser): Promise<Verification> {
      if (AUTO_ACCEPT) return 'verified';
      if (hasTouchId()) return (await biometric(`sign in to ${rpId}`)) && 'verified';
      // without biometrics, picking the account was presence, not verification
      if (afterChooser) return 'presence';
      return (await ask(win, `Sign in to ${rpId} as ${account}?`, '', 'Sign in')) && 'presence';
    },
    async chooseAccount(rpId, accounts) {
      if (AUTO_ACCEPT) return accounts[0]?.id ?? null;
      const { response } = await dialog.showMessageBox(win, {
        type: 'question',
        message: `Which account on ${rpId}?`,
        // quote the page-supplied labels so a credential named "Cancel" cannot
        // masquerade as the cancel button
        buttons: [...accounts.map((a) => `“${a.label}”`), 'Cancel'],
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
