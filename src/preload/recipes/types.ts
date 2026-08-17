import type { Counts, ServiceId } from '../../shared/types';

export interface Recipe {
  id: ServiceId;
  intervalMs: number;
  /** Injected into the page on load — cosmetic fixes (hide site chrome, etc). */
  css?: string;
  /** Prefixes of `pathname + hash` that count as "in chat", for sites that are
   *  more than chat (facebook, tiktok, teams). Once a document has been on a
   *  chat path, SPA routing off all of them — a profile link, a feed CTA — makes
   *  the runner navigate back to the service URL (chat only, rate-limited).
   *  Documents that never reach a chat path (login flows) are never snapped.
   *  The hash is part of the match so hash-routed clients can declare
   *  `/v2/#/chat`; path-only prefixes are unaffected by it. */
  chatPaths?: string[];
  /** Extract unread counts from the live page. Throwing marks counts stale. */
  count(doc: Document): Counts | Promise<Counts>;
  /** Chat UI is rendered and usable — ends the shell's waking cover
   *  early. Absent: did-finish-load is the ready signal instead
   *  (ServiceMeta.waitForReady mirrors this). */
  ready?(doc: Document): boolean;
  /** Site chrome the static `css` cannot express (hash-classed nav rails,
   *  role=button icons) — the runner sets display:none on each returned
   *  element every tick, so an SPA re-render is re-hidden within one
   *  interval. Must be cheap, synchronous, and never return the chat
   *  surface or an ancestor of it. Cosmetic only; `chatPaths` contains. */
  hideChrome?(doc: Document): Element[];
  /** Report viewport coordinates needing a trusted click to keep the session
   *  alive (e.g. Zalo's idle-deactivation modal), or null when healthy.
   *  In-page synthetic clicks are untrusted and ignored — main must click. */
  keepAlive?(doc: Document): { x: number; y: number } | null;
  /** Build a notification for the newest unread conversation. For sites that
   *  never notify in-page (facebook.com delegates to browser push, which
   *  Electron doesn't support) — the runner calls this when the direct count
   *  rises while the page is unfocused. `href`: the conversation's own link,
   *  so the banner click can land on the thread (validated in main). */
  synthNotification?(doc: Document): { title: string; body: string; href?: string } | null;
}
