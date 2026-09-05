import type { LoadKind } from './types';

/** The cover's words, in one place. `null` (a begin() that forgot its
 *  kind) reads as a wake so the cover never renders empty. */
export function wakeCaption(kind: LoadKind | null, serviceName: string): string {
  switch (kind) {
    case 'reload':
      return `Reloading ${serviceName}…`;
    case 'restart':
      return `Restarting ${serviceName}…`;
    case 'purge':
      return `Signing out of ${serviceName}…`;
    case 'hand-back':
      return `Signing in to ${serviceName}…`;
    default:
      return `Waking ${serviceName}…`;
  }
}
