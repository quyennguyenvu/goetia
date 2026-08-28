import type { Counts } from '../../shared/types';
import { nameMatches } from '../lib/conversation-open';
import { visiblyPresent } from './ready';
import { unreadFromTitle } from './title';
import type { Recipe } from './types';

export interface WhatsAppChat {
  unreadCount?: number;
  archive?: boolean;
  muteExpiration?: number;
  isAutoMuted?: boolean;
}

/** Mirrors ferdium-recipes/whatsapp: unread from the page's own chat DB,
 *  muted chats count as indirect. */
export function countWhatsAppChats(chats: WhatsAppChat[]): Counts {
  let direct = 0;
  let indirect = 0;
  for (const chat of chats) {
    const unread = chat.unreadCount ?? 0;
    if (unread <= 0 || chat.archive) continue;
    if ((chat.muteExpiration ?? 0) !== 0 || chat.isAutoMuted) indirect += unread;
    else direct += unread;
  }
  return { direct, indirect };
}

let db: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (db) return resolve(db);
    if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') {
      return resolve(null);
    }
    indexedDB
      .databases()
      .then((dbs) => {
        if (!dbs.some((d) => d.name === 'model-storage')) return resolve(null);
        const req = indexedDB.open('model-storage');
        req.onsuccess = () => {
          db = req.result;
          db.onversionchange = () => {
            db?.close();
            db = null;
          };
          resolve(db);
        };
        req.onerror = () => resolve(null);
      })
      .catch(() => resolve(null));
  });
}

function readChats(database: IDBDatabase): Promise<WhatsAppChat[]> {
  return new Promise((resolve, reject) => {
    const store = database.transaction('chat', 'readonly').objectStore('chat');
    const q = store.getAll();
    q.onsuccess = () => resolve(q.result as WhatsAppChat[]);
    q.onerror = () => reject(q.error);
  });
}

/** The open chat's name, from the conversation header's chat-title span
 *  (live DOM, 2026-08-27 dump). It carries no title attribute — the
 *  span[title] beside it is the member list, which is what the first cut
 *  pinned. web.whatsapp.com has no per-thread URL and titles itself only
 *  "WhatsApp", so this is the one handle a pin can keep. */
export function whatsAppConversation(doc: Document): string | null {
  const span =
    doc.querySelector('#main header [data-testid="conversation-info-header-chat-title"]') ??
    doc.querySelector('#main header [role="button"] span[dir="auto"]');
  const name = span?.textContent?.trim() ?? '';
  return name === '' ? null : name;
}

/** Click the chat-list row named `name`. Rows are role=row grid cells whose
 *  name is the span[title] in cell-frame-title; the message preview beneath
 *  is a span[title] too, so the search is scoped to the title cell. The
 *  press is replayed as mousedown → mouseup → click on the name itself: the
 *  handler may sit on any wrapper between it and the row, and a bubbling
 *  event crosses all of them. False when no row carries the name (scrolled
 *  out of the virtual list, archived, renamed) — the caller decides then. */
export function openWhatsAppConversation(doc: Document, name: string): boolean {
  for (const row of doc.querySelectorAll('#pane-side [role="row"], #pane-side [role="listitem"]')) {
    const span =
      row.querySelector('[data-testid="cell-frame-title"] span[title]') ??
      row.querySelector('span[dir="auto"][title]');
    if (!span || !nameMatches(span.getAttribute('title')?.trim() ?? '', name)) continue;
    for (const type of ['mousedown', 'mouseup', 'click']) {
      span.dispatchEvent(
        new MouseEvent(type, { bubbles: true, cancelable: true, view: doc.defaultView }),
      );
    }
    return true;
  }
  return false;
}

const whatsapp: Recipe = {
  id: 'whatsapp',
  intervalMs: 2000,
  conversation: whatsAppConversation,
  openConversation: openWhatsAppConversation,
  // #pane-side (chat-list pane) mounts only after the logo+progress boot
  // screen finishes
  ready(doc) {
    return visiblyPresent(doc, doc.querySelector('#pane-side'));
  },
  async count(doc) {
    const database = await openDb();
    if (!database) return { direct: unreadFromTitle(doc.title), indirect: 0 };
    return countWhatsAppChats(await readChats(database));
  },
};
export default whatsapp;
