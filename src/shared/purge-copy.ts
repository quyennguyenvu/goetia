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

export function purgeLoginCopy(name: string): PurgeCopy {
  return {
    title: `Purge the ${name} login?`,
    detail: `Clears its saved login on this device and ends any ${name} call in progress. Your account stays active — nothing is signed out elsewhere.`,
    confirmLabel: 'Purge',
  };
}

export function purgeAllCopy(count: number): PurgeCopy {
  return {
    title: `Purge all ${count} ${count === 1 ? 'login' : 'logins'}?`,
    detail:
      'Clears every saved login on this device — summoned and unbound — and ends any call in progress. Your accounts stay active; nothing is signed out elsewhere.',
    confirmLabel: 'Purge All',
    checkboxLabel: 'Yes, wipe every service',
  };
}
