import { PIN_NOTE_MAX, PIN_TEXT_MAX } from '../../shared/pins';
import type { PinView, ServiceId } from '../../shared/types';

export interface Pin {
  id: number;
  serviceId: ServiceId;
  /** the captured selection — the "message" */
  text: string;
  /** the user's brief description, '' until edited */
  note: string;
  /** the conversation the message was pinned in — see conversationFromTitle */
  conversation: string;
  /** document URL at pin time; validated only at open time */
  href: string;
  at: number;
}

export const PIN_CONVERSATION_MAX = 80;

/** Brand suffixes sites append to document.title; the conversation is what
 *  is left once they go. Case-insensitive, matched as a whole trailing
 *  segment after ` - `, ` | ` or ` • `. */
const BRAND_SEGMENTS = [
  'slack',
  'discord',
  'microsoft teams',
  'tiktok',
  'instagram',
  'messenger',
  'facebook',
  'zalo',
  'whatsapp',
  'telegram',
  'telegram web',
  'shopee',
  'shopee chat',
];

/** Titles that name only the site or a landing section, never a thread. */
const GENERIC_TITLES = new Set([
  'chat',
  'chats',
  'messages',
  'inbox',
  'direct',
  'home',
  'telegram web',
]);

/** The conversation a message was pinned in, read off the page title. Sites
 *  put the open thread there with unread markers in front and their brand
 *  behind — "(2) #release - Ticketbox - Slack", "@An | Server - Discord",
 *  "Mẹ | Microsoft Teams". Best-effort by construction: a service whose title
 *  is only its own name (WhatsApp, Telegram, Messenger on most threads)
 *  yields '', and the row simply shows no conversation. Never throws. */
export function conversationFromTitle(title: string, serviceName: string): string {
  let t = title.replace(/\s+/g, ' ').trim();
  t = t.replace(/^(\(\d+\)|[•*])\s*/, ''); // unread markers
  const brands = [...BRAND_SEGMENTS, serviceName.toLowerCase()];
  const isBrand = (s: string) => brands.includes(s.trim().toLowerCase());
  // peel brand segments off either end, keeping the separators in between:
  // "#release | Ticketbox - Discord" → "#release | Ticketbox",
  // "Zalo - Nhóm Sale" → "Nhóm Sale"
  const sep = '\\s[-|•]\\s';
  let prev: string;
  do {
    prev = t;
    for (const b of brands) {
      const esc = b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      t = t.replace(new RegExp(`${sep}${esc}$`, 'i'), '');
      t = t.replace(new RegExp(`^${esc}${sep}`, 'i'), '');
    }
  } while (t !== prev);
  // Slack keeps the workspace as a second segment; the thread is the first
  if (serviceName.toLowerCase() === 'slack') t = t.split(/\s[-|•]\s/)[0];
  const out = t.trim();
  if (out === '' || isBrand(out) || GENERIC_TITLES.has(out.toLowerCase())) return '';
  return clampText(out, PIN_CONVERSATION_MAX);
}

/** Collapse whitespace, trim, cap with an ellipsis — a selection can span a
 *  whole thread, and a pin row has one line. */
export function clampText(raw: string, max: number): string {
  const flat = raw.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** A reorder is a permutation of the current ids or it is ignored: a stale
 *  renderer must never drop or duplicate a pin. */
export function isPermutation(ids: readonly number[], current: readonly number[]): boolean {
  if (ids.length !== current.length) return false;
  const seen = new Set(ids);
  return seen.size === ids.length && current.every((id) => seen.has(id));
}

/** Tolerant loader for pins.json: anything not a well-formed pin is dropped,
 *  as is a pin for a service no longer in the catalog. Ids stay unique. */
export function parsePins(raw: unknown, known: ReadonlySet<string>): Pin[] {
  if (!Array.isArray(raw)) return [];
  const out: Pin[] = [];
  const ids = new Set<number>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const r = entry as Record<string, unknown>;
    if (typeof r.id !== 'number' || !Number.isInteger(r.id) || r.id <= 0 || ids.has(r.id)) continue;
    if (typeof r.serviceId !== 'string' || !known.has(r.serviceId)) continue;
    if (typeof r.text !== 'string' || typeof r.href !== 'string') continue;
    const text = clampText(r.text, PIN_TEXT_MAX);
    if (text === '') continue;
    ids.add(r.id);
    out.push({
      id: r.id,
      serviceId: r.serviceId as ServiceId,
      text,
      note: typeof r.note === 'string' ? clampText(r.note, PIN_NOTE_MAX) : '',
      conversation:
        typeof r.conversation === 'string' ? clampText(r.conversation, PIN_CONVERSATION_MAX) : '',
      href: r.href,
      at: typeof r.at === 'number' && Number.isFinite(r.at) ? r.at : 0,
    });
  }
  return out;
}

/** Renderer rows: display fields and the opaque id — never the href. */
export function pinViews(pins: readonly Pin[]): PinView[] {
  return pins.map(({ id, serviceId, text, note, conversation, at }) => ({
    id,
    serviceId,
    text,
    note,
    conversation,
    at,
  }));
}
