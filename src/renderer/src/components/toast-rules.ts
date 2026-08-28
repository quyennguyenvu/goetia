export const TOAST_MS = 8000;

/** Announce a version once. `lastToasted` is the shell's own memory, so a
 *  re-broadcast of unchanged state is a no-op. */
export function shouldToast(announce: string | null, lastToasted: string | null): boolean {
  return announce !== null && announce !== lastToasted;
}

/** Names the services the summon cap banished at startup. Null when none. */
export function capTrimMessage(names: string[]): string | null {
  if (names.length === 0) return null;
  const list =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  const verb = names.length === 1 ? 'was' : 'were';
  const it = names.length === 1 ? 'it' : 'them';
  return `${list} ${verb} banished — nine services is the maximum. Summon ${it} back any time from Home.`;
}

/** Acknowledges a completed purge sweep. Null at zero: a cancelled sweep
 *  returns the same { purged: 0 } a rejected sender would, and neither
 *  deserves a toast. */
export function purgeToastMessage(count: number): string | null {
  if (count === 0) return null;
  return `Purged ${count} ${count === 1 ? 'login' : 'logins'}.`;
}

/** Done and unpin remove the same pin; the copy tells the intents apart. */
export function pinRemovedMessage(kind: 'done' | 'unpin'): string {
  return kind === 'done' ? 'Done — nice.' : 'Unpinned.';
}
