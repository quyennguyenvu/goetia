import type { Counts, ServiceId } from '../../shared/types';

export interface Recipe {
  id: ServiceId;
  intervalMs: number;
  /** Injected into the page on load — cosmetic fixes (hide site chrome, etc). */
  css?: string;
  /** Extract unread counts from the live page. Throwing marks counts stale. */
  count(doc: Document): Counts | Promise<Counts>;
  /** Report viewport coordinates needing a trusted click to keep the session
   *  alive (e.g. Zalo's idle-deactivation modal), or null when healthy.
   *  In-page synthetic clicks are untrusted and ignored — main must click. */
  keepAlive?(doc: Document): { x: number; y: number } | null;
  /** Build a notification for the newest unread conversation. For sites that
   *  never notify in-page (facebook.com delegates to browser push, which
   *  Electron doesn't support) — the runner calls this when the direct count
   *  rises while the page is unfocused. */
  synthNotification?(doc: Document): { title: string; body: string } | null;
}
