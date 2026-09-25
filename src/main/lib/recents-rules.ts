import type { RecentView, ServiceId } from '../../shared/types';
import { conversationFromTitle } from './pin-rules';

/** One conversation the user had on screen. `label` is the row and the
 *  dedupe key; `conversation` is kept apart because it is the one string a
 *  recipe's openConversation can match — absent when the label came from
 *  the page title. `url` is page data until open time validates it. */
export interface RecentEntry {
  id: number;
  serviceId: ServiceId;
  label: string;
  conversation?: string;
  url: string;
  at: number;
}

export const RECENTS_CAP = 50;
/** PIN_CONVERSATION_MAX: the same kind of string, the same bound */
export const RECENT_LABEL_MAX = 80;
export const RECENT_URL_MAX = 2048;
/** the title is clipped before peeling so a brand suffix survives the cut */
export const RECENT_TITLE_MAX = 512;

/** conversation:active as main first sees it — every field page-shaped. */
export interface RawReport {
  conversation: unknown;
  url: unknown;
  title: unknown;
}

export interface CleanReport {
  conversation: string | null;
  url: string;
  title: string;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
const CONTROL = /[\u0000-\u001f\u007f]/g;

const clean = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';

/** Type-check and clip every field; null when the URL is missing or does not
 *  parse — there is nothing to hold a row against then. */
export function sanitizeReport(raw: RawReport): CleanReport | null {
  const url = typeof raw.url === 'string' ? raw.url.slice(0, RECENT_URL_MAX) : '';
  try {
    new URL(url);
  } catch {
    return null;
  }
  const conversation = clean(raw.conversation, RECENT_LABEL_MAX);
  return {
    conversation: conversation === '' ? null : conversation,
    url,
    title: clean(raw.title, RECENT_TITLE_MAX),
  };
}

/** A report counts only from the service on screen. The preload's own focus
 *  check runs in a world the page shares, so this is what keeps a hidden or
 *  hostile page from writing rows the user never looked at. */
export function acceptReport(input: {
  serviceId: ServiceId;
  activeId: ServiceId;
  overlayOpen: boolean;
  windowFocused: boolean;
  disabled: boolean;
}): boolean {
  return (
    input.serviceId === input.activeId &&
    !input.overlayOpen &&
    input.windowFocused &&
    !input.disabled
  );
}

function sameUrl(a: string, b: string): boolean {
  try {
    const x = new URL(a);
    const y = new URL(b);
    const path = (u: URL) => u.pathname.replace(/\/$/, '') + u.hash;
    return x.origin === y.origin && path(x) === path(y);
  } catch {
    return false;
  }
}

/** The row's label, or null when the sighting is not a conversation: no hook
 *  name and either the service's own landing page (Discord's Friends,
 *  WhatsApp's empty list) or a title that names nothing beyond the brand. */
export function recentLabel(input: {
  conversation: string | null;
  title: string;
  url: string;
  serviceUrl: string;
  serviceName: string;
}): { label: string; conversation?: string } | null {
  if (input.conversation) return { label: input.conversation, conversation: input.conversation };
  if (sameUrl(input.url, input.serviceUrl)) return null;
  const label = conversationFromTitle(input.title, input.serviceName).slice(0, RECENT_LABEL_MAX);
  return label === '' ? null : { label };
}

export const conversationKey = (e: Pick<RecentEntry, 'serviceId' | 'label'>): string =>
  `${e.serviceId}\n${e.label}`;

/** Newest first. A known conversation moves to the top with its id kept;
 *  past RECENTS_CAP the oldest row goes. */
export function upsertRecent(
  rows: readonly RecentEntry[],
  sighting: Omit<RecentEntry, 'id'>,
  nextId: () => number,
): RecentEntry[] {
  const key = conversationKey(sighting);
  const prev = rows.find((r) => conversationKey(r) === key);
  const entry: RecentEntry = { ...sighting, id: prev?.id ?? nextId() };
  return [entry, ...rows.filter((r) => conversationKey(r) !== key)].slice(0, RECENTS_CAP);
}

/** Rows from disk: a known service, a non-empty string label, a string url,
 *  a finite `at`, a safe-integer id seen once; RECENTS_CAP newest kept. */
export function restoreRecents(raw: unknown, known: ReadonlySet<string>): RecentEntry[] {
  if (!Array.isArray(raw)) return [];
  const kept: RecentEntry[] = [];
  const seen = new Set<number>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const id = r.id;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1 || seen.has(id)) continue;
    if (typeof r.serviceId !== 'string' || !known.has(r.serviceId)) continue;
    if (typeof r.label !== 'string' || r.label === '' || typeof r.url !== 'string') continue;
    if (typeof r.at !== 'number' || !Number.isFinite(r.at)) continue;
    seen.add(id);
    kept.push({
      id,
      serviceId: r.serviceId as ServiceId,
      label: r.label.slice(0, RECENT_LABEL_MAX),
      ...(typeof r.conversation === 'string' && r.conversation !== ''
        ? { conversation: r.conversation.slice(0, RECENT_LABEL_MAX) }
        : {}),
      url: r.url.slice(0, RECENT_URL_MAX),
      at: r.at,
    });
  }
  return kept.sort((a, b) => b.at - a.at).slice(0, RECENTS_CAP);
}

/** What the switcher gets: hrefless, newest first, the conversation on
 *  screen left out — Enter on it would go nowhere. */
export function recentRows(rows: readonly RecentEntry[], onScreenKey: string | null): RecentView[] {
  return rows
    .filter((r) => onScreenKey === null || conversationKey(r) !== onScreenKey)
    .map((r) => ({ id: r.id, serviceId: r.serviceId, title: r.label, at: r.at }));
}
