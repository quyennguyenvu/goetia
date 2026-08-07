import type { Counts } from '../../shared/types';
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

const whatsapp: Recipe = {
  id: 'whatsapp',
  intervalMs: 2000,
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
