import { visiblyPresent } from './ready';
import { unreadFromTitle } from './title';
import type { Recipe } from './types';

// A thread beside its channel: `/channels/<guild>/<parent>/threads/<thread>`.
// Opened full-window it is `/channels/<guild>/<thread>`, indistinguishable
// from a channel by URL — only the split form names the parent, so only it is
// minted; the opener takes both, since neither has an anchor to click.
const THREAD_ROUTE = /^\/channels\/(\d+)\/(\d+)\/threads\/(\d+)\/?$/;
const ITEM_ROUTE = /^\/channels\/(\d+)\/(\d+)\/?$/;

export function parseDiscordThreadUrl(
  url: string,
): { guild: string; parent: string; thread: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.origin !== 'https://discord.com') return null;
  const m = THREAD_ROUTE.exec(u.pathname);
  return m ? { guild: m[1], parent: m[2], thread: m[3] } : null;
}

/** `/channels/<guild>/<id>`: a channel, or a thread opened full-window. */
export function parseDiscordItemUrl(url: string): { guild: string; id: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.origin !== 'https://discord.com') return null;
  const m = ITEM_ROUTE.exec(u.pathname);
  return m ? { guild: m[1], id: m[2] } : null;
}

/** The document URL while a thread is open in the split view — the one form
 *  that carries the parent channel — else null (the pin keeps the document
 *  URL, which is then a channel or a full-screen thread the anchor lane and
 *  the load lane already handle). */
export function discordThreadUrl(doc: Document): string | null {
  const href = doc.location?.href ?? '';
  return parseDiscordThreadUrl(href) ? href : null;
}

export const DISCORD_SETTLE_MS = 250;
export const DISCORD_MAX_WAITS = 8;

/** The Open Thread accessory on the thread's root message: a Discord thread
 *  takes its starter message's id, and the accessory container is keyed by
 *  that id (live 2026-09-06). The only in-page way into a thread the sidebar
 *  does not list. */
const accessoryFor = (doc: Document, thread: string) =>
  doc.querySelector(
    `#message-accessories-${thread} [aria-roledescription="Open Thread Button"], #message-accessories-${thread} [role="button"]`,
  ) as HTMLElement | null;

/** The channel list's own row for a channel or thread: an anchor for a
 *  channel, a role=button div for a thread — which is why the anchor lane
 *  never reaches a thread. */
const sidebarItem = (doc: Document, id: string) =>
  doc.querySelector(`[data-list-item-id="channels___${id}"]`) as HTMLElement | null;

const showing = (here: string, guild: string, id: string) =>
  here === `/channels/${guild}/${id}` ||
  (here.startsWith(`/channels/${guild}/`) && here.endsWith(`/threads/${id}`));

/** Every message list item is id'd `chat-messages-<channel>-<message>`, in the
 *  channel pane and the thread pane alike — the one id-keyed proof that a
 *  channel or thread is actually rendered. */
const rendersMessagesOf = (doc: Document, id: string) =>
  doc.querySelector(`[id^="chat-messages-${id}-"]`) !== null;

/** Last resort for a thread with nothing to click (Discord lists only some
 *  threads in the sidebar, and the full-window URL names no parent): push the
 *  route and fire popstate, which Discord's router handles exactly like the
 *  browser's back button. Trusted only once the thread's messages render;
 *  otherwise the entry is popped again so the address bar never lies about a
 *  view that did not change, and the caller falls to the load lane. */
async function routeInPage(
  doc: Document,
  path: string,
  id: string,
  settle: () => Promise<void>,
  maxWaits: number,
): Promise<boolean> {
  const win = doc.defaultView;
  if (!win) return false;
  win.history.pushState({}, '', path);
  win.dispatchEvent(new win.PopStateEvent('popstate', { state: {} }));
  for (let i = 0; i < maxWaits; i++) {
    if (rendersMessagesOf(doc, id)) return true;
    await settle();
  }
  if (rendersMessagesOf(doc, id)) return true;
  win.history.back();
  return false;
}

/** Open a thread URL in-page. Nothing to do if the document already shows
 *  the thread (split or full-window). The full-window form `/channels/<g>/<id>`
 *  is opened by clicking the sidebar item for that id, if listed. The split
 *  form switches to the parent channel through its sidebar anchor when it is
 *  not current, waits bounded for the root message to render, and clicks its
 *  Open Thread accessory, falling back to the thread's sidebar row. False on
 *  any other URL shape or when nothing clickable exists — the load lane then
 *  reloads into the thread, today's behaviour. */
export async function openDiscordThread(
  doc: Document,
  url: string,
  opts: { settle?: () => Promise<void>; maxWaits?: number } = {},
): Promise<boolean> {
  const here = doc.location?.pathname ?? '';
  const item = parseDiscordItemUrl(url);
  const t = item ? null : parseDiscordThreadUrl(url);
  if (!item && !t) return false;
  const guild = item?.guild ?? t?.guild ?? '';
  const id = item?.id ?? t?.thread ?? '';
  if (showing(here, guild, id)) return true;
  const settle = opts.settle ?? (() => new Promise<void>((r) => setTimeout(r, DISCORD_SETTLE_MS)));
  const maxWaits = opts.maxWaits ?? DISCORD_MAX_WAITS;
  if (item) {
    const row = sidebarItem(doc, item.id);
    if (row) {
      row.click();
      return true;
    }
  } else if (t) {
    let accessory = accessoryFor(doc, t.thread);
    if (!accessory) {
      const channel = doc.querySelector(
        `a[href="/channels/${t.guild}/${t.parent}"]`,
      ) as HTMLElement | null;
      if (channel && here !== `/channels/${t.guild}/${t.parent}`) channel.click();
      for (let i = 0; channel && !accessory && i < maxWaits; i++) {
        await settle();
        accessory = accessoryFor(doc, t.thread);
      }
    }
    if (accessory) {
      accessory.click();
      return true;
    }
    // the root is outside the virtualized list; an active thread is still
    // listed in the sidebar under its parent
    const row = sidebarItem(doc, t.thread);
    if (row) {
      row.click();
      return true;
    }
  }
  return routeInPage(doc, new URL(url).pathname, id, settle, maxWaits);
}

const discord: Recipe = {
  id: 'discord',
  intervalMs: 2000,
  conversationUrl: discordThreadUrl,
  openUrl: openDiscordThread,
  // chat only: strip the store-front out of the chat app (calibrated
  // 2026-08-07). data-list-item-id suffixes are locale- and build-proof:
  // Nitro/Shop/Quests rows in the DM list, Discover + app-download in the
  // guild rail. Everything else (friends, servers, channels) is chat.
  css: `
    li:has([data-list-item-id$="___nitro"]),
    li:has([data-list-item-id$="___shop"]),
    li:has([data-list-item-id$="___quests"]),
    [data-list-item-id="guildsnav___guild-discover-button"],
    [data-list-item-id="guildsnav___app-download-button"] {
      display: none !important;
    }
  `,
  // the guild nav (stable data-list-id) mounts only after discord's splash
  ready(doc) {
    return visiblyPresent(doc, doc.querySelector('[data-list-id="guildsnav"]'));
  },
  count(doc) {
    const badges = [...doc.querySelectorAll('[class*="lowerBadge_"] [class*="numberBadge_"]')]
      .map((el) => Number.parseInt(el.textContent ?? '', 10))
      .filter((n) => Number.isFinite(n));
    const direct =
      badges.length > 0 ? badges.reduce((a, b) => a + b, 0) : unreadFromTitle(doc.title);
    const indirect = doc.title.includes('• Discord') ? 1 : 0;
    return { direct, indirect };
  },
};
export default discord;
