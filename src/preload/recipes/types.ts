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
  /** The subtree `count()` reads, so the runner can skip a tick entirely while
   *  nothing in it has changed. Worth declaring only for an expensive count()
   *  — a cheap one is not worth an observer. Return null while the surface is
   *  absent (logged out, still booting) and every tick counts, as before.
   *  Correctness never rests on this: the runner forces a recount every
   *  FORCE_RECOUNT_TICKS regardless, and watches the title separately. */
  watch?(doc: Document): Node | null;
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
  /** Name of the conversation open right now, for sites whose URL and title
   *  carry no thread identity (WhatsApp, Zalo) — a pin's row label and the
   *  only handle `openConversation` can use. Cheap and synchronous; null
   *  when no thread is open. */
  conversation?(doc: Document): string | null;
  /** Open the named conversation in-page. `true`: done (its chat-list row
   *  was clicked). A point: the row is on screen at these view coordinates
   *  but the site ignores synthetic clicks (Zalo, like its keepAlive), so
   *  main must click there. `false`: no row carries the name — the caller
   *  falls back to the URL. May be async: a virtualized list has to be
   *  scrolled before a row below the fold exists (WhatsApp); keep it bounded. */
  openConversation?(
    doc: Document,
    name: string,
  ): boolean | { x: number; y: number } | Promise<boolean | { x: number; y: number }>;
  /** The open thread as its canonical in-service URL, for sites whose address
   *  bar never names the thread (Slack keeps a thread in the flexpane while
   *  the URL stays on the channel). A pin captured here carries this instead
   *  of the document URL; a landed replay teaches a recents row this instead
   *  of location.href. Cheap and synchronous; null when no thread is open, and
   *  null when the live selection sits outside the thread surface — that
   *  selection belongs to the channel, not the thread. Declared together with
   *  `openUrl` (recipes.test.ts enforces the pair). */
  conversationUrl?(doc: Document): string | null;
  /** Open a `conversationUrl`-shaped URL in-page. `true`: the thread is on
   *  screen. `false`: a miss (unknown URL shape, the channel row is gone, the
   *  root message is outside the virtualized pane) and the caller moves to the
   *  next lane. May be async; keep every wait bounded. */
  openUrl?(doc: Document, url: string): boolean | Promise<boolean>;
  /** The page to load when this document is the site's logged-OUT shell — a
   *  surface with no sign-in form in sight (TikTok's /messages logged out is
   *  the feed nav plus an empty DM drawer). Return the login URL only for that
   *  shell; null while signed in, on the login page itself, and on captcha or
   *  checkpoint pages, or the runner would fight the site's own flow. Sites
   *  whose logged-out page already is a form (Slack) declare nothing — every
   *  service otherwise starts on `url` (2026-08-13 decision). The runner
   *  navigates once per document; the site's own redirect brings the user back. */
  loginUrl?(doc: Document): string | null;
}
