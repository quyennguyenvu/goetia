import type { ServiceId } from '../../shared/types';

/** Which views have a load pending that main itself asked for — create, a
 *  hibernation wake, reload, refresh, a dead view's banner open, a contained
 *  window's hand-back. The waking cover is for exactly those: the view has
 *  nothing (or nothing current) to show. A cross-document navigation the
 *  page made on its own — the in-page route's fallback load, a site's own
 *  full-page thread switch, a login redirect — is a plain navigation over a
 *  live document, and covering it made a 1-2s reboot look like a cold start
 *  (Messenger, reported 2026-09-04 and again 2026-09-05). One mark per view,
 *  claimed by the first main-frame navigation after it. */
export class MainLoads {
  private pending = new Set<ServiceId>();

  mark(id: ServiceId): void {
    this.pending.add(id);
  }

  /** True once per mark: this navigation is the load main requested. */
  claim(id: ServiceId): boolean {
    return this.pending.delete(id);
  }

  forget(id: ServiceId): void {
    this.pending.delete(id);
  }
}
