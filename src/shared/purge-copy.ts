/** Copy for the two purge confirms. Process-agnostic: the confirm is an
 *  in-app modal (a native dialog cannot disable its button until the
 *  acknowledgement is ticked), so the renderer is what reads these. */
export interface PurgeCopy {
  title: string;
  detail: string;
  confirmLabel: string;
  /** present only where the action is heavy enough to gate on it */
  checkboxLabel?: string;
}

/** Purge clears the session, never the credential: a passkey is a saved
 *  login the way a saved password is, and it stays behind Touch ID. */
const PASSKEYS_KEPT = ' Goetia passkeys are kept — forget them in Settings → Passkeys.';

export function purgeLoginCopy(name: string): PurgeCopy {
  return {
    title: `Purge the ${name} login?`,
    detail: `Clears its saved login on this device and ends any ${name} call in progress. Your account stays active — nothing is signed out elsewhere.${PASSKEYS_KEPT}`,
    confirmLabel: 'Purge',
  };
}

export function purgeAllCopy(count: number): PurgeCopy {
  return {
    title: `Purge all ${count} ${count === 1 ? 'login' : 'logins'}?`,
    detail: `Clears every saved login on this device — summoned and unbound — and ends any call in progress. Your accounts stay active; nothing is signed out elsewhere.${PASSKEYS_KEPT}`,
    confirmLabel: 'Purge All',
    checkboxLabel: 'Yes, wipe every service',
  };
}
