import type { LoadKind, ServiceId } from '../../shared/types';

/** Which views have a load pending that main itself asked for — create, a
 *  hibernation wake, reload, refresh, a dead view's banner open, a contained
 *  window's hand-back — and which kind, so the waking cover can name it. The
 *  cover is for exactly those: the view has nothing (or nothing current) to
 *  show. A cross-document navigation the page made on its own — the in-page
 *  route's fallback load, a site's own full-page thread switch, a login
 *  redirect — is a plain navigation over a live document, and covering it
 *  made a 1-2s reboot look like a cold start (Messenger, reported 2026-09-04
 *  and again 2026-09-05). One mark per view, claimed by the first main-frame
 *  navigation after it; a second mark replaces the first, since the later
 *  load is the one that navigation belongs to. */
export class MainLoads {
  private pending = new Map<ServiceId, LoadKind>();

  mark(id: ServiceId, kind: LoadKind): void {
    this.pending.set(id, kind);
  }

  /** The kind of the load main requested, once per mark; null for a
   *  navigation nobody asked for. */
  claim(id: ServiceId): LoadKind | null {
    const kind = this.pending.get(id) ?? null;
    this.pending.delete(id);
    return kind;
  }

  forget(id: ServiceId): void {
    this.pending.delete(id);
  }
}
