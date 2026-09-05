import { visiblyPresent } from './ready';
import { unreadFromTitle } from './title';
import type { Recipe } from './types';

// Chat only, discord-shaped: everything under app.slack.com/client is chat,
// so there is no chatPaths containment and the css below is cosmetic.
// Selectors follow Slack's long-stable BEM classes and data-qa hooks. The
// unread selectors are UNCALIBRATED until a live login pass; the thread
// hooks (flexpane root, sidebar row, reply bar) come from a 2026-09-05 live
// snapshot, and the click mechanism awaits the same pass. Slack notifies
// in-page via HTML5 Notification, so no synthNotification.

const FLEXPANE = '[data-qa="threads_flexpane"]';
const THREAD_ROOT = `${FLEXPANE} .c-message_kit__thread_message--root[data-msg-ts][data-msg-channel-id]`;
const THREAD_ROUTE = /^\/client\/([A-Z0-9]+)\/([A-Z0-9]+)\/thread\/([A-Z0-9]+)-(\d+\.\d+)\/?$/;

/** The canonical thread form and nothing else: `/client/<T>/<C>/thread/<C>-<ts>`
 *  on app.slack.com, the thread's channel equal to the route's. Workspace-host
 *  permalinks are not a pin form (spec, 2026-09-05). */
export function parseSlackThreadUrl(
  url: string,
): { team: string; channel: string; ts: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.origin !== 'https://app.slack.com') return null;
  const m = THREAD_ROUTE.exec(u.pathname);
  if (!m || m[2] !== m[3]) return null;
  return { team: m[1], channel: m[2], ts: m[4] };
}

/** The open thread as its canonical URL, read from the flexpane's root
 *  message; the team id comes from the document path (`/client/<T>/…`), which
 *  Slack does keep in the address bar. `anchor` is the live selection's anchor
 *  node (defaults to the document's selection): a selection outside the
 *  flexpane belongs to the channel pane, so the pin is the channel's. */
export function slackThreadUrl(
  doc: Document,
  anchor: Node | null | undefined = doc.getSelection?.()?.anchorNode,
): string | null {
  const root = doc.querySelector(THREAD_ROOT);
  if (!root) return null;
  const team = /^\/client\/([A-Z0-9]+)(?:\/|$)/.exec(doc.location?.pathname ?? '')?.[1];
  if (!team) return null;
  if (anchor && !doc.querySelector(FLEXPANE)?.contains(anchor)) return null;
  const channel = root.getAttribute('data-msg-channel-id') ?? '';
  const ts = root.getAttribute('data-msg-ts') ?? '';
  if (!/^[A-Z0-9]+$/.test(channel) || !/^\d+\.\d+$/.test(ts)) return null;
  return `https://app.slack.com/client/${team}/${channel}/thread/${channel}-${ts}`;
}

/** A channel switch renders the pane over a few frames; each wait is one
 *  settle, and the cap keeps a root that lives outside the virtualized pane
 *  from stalling the lane chain. */
export const SLACK_SETTLE_MS = 250;
export const SLACK_MAX_WAITS = 8;

const rootInPane = (doc: Document, channel: string, ts: string) =>
  doc.querySelector(
    `.p-message_pane_message__message[data-qa="message_container"][data-msg-channel-id="${channel}"][data-msg-ts="${ts}"]`,
  );

const flexpaneShows = (doc: Document, channel: string, ts: string) =>
  doc.querySelector(
    `${FLEXPANE} .c-message_kit__thread_message--root[data-msg-channel-id="${channel}"][data-msg-ts="${ts}"]`,
  ) !== null;

/** Open a canonical thread URL in-page: nothing to do if the flexpane already
 *  shows the root; otherwise click the channel row (unless selected), wait
 *  bounded for the root message to render in the channel pane, and click its
 *  View thread control. False on any other URL shape, a missing row, a root
 *  outside the virtualized pane, or a root with no reply bar — the caller's
 *  next lane is a full load that lands in the channel, today's behaviour. */
export async function openSlackThread(
  doc: Document,
  url: string,
  opts: { settle?: () => Promise<void>; maxWaits?: number } = {},
): Promise<boolean> {
  const t = parseSlackThreadUrl(url);
  if (!t) return false;
  if (flexpaneShows(doc, t.channel, t.ts)) return true;
  const row = doc.querySelector(
    `.p-channel_sidebar__channel[data-qa-channel-sidebar-channel-id="${t.channel}"]`,
  ) as HTMLElement | null;
  if (!row) return false;
  const selected = row.getAttribute('data-qa-channel-sidebar-channel-is-selected') === 'true';
  if (!selected) row.click();
  const settle = opts.settle ?? (() => new Promise<void>((r) => setTimeout(r, SLACK_SETTLE_MS)));
  const maxWaits = opts.maxWaits ?? SLACK_MAX_WAITS;
  let root = rootInPane(doc, t.channel, t.ts);
  for (let i = 0; !root && i < maxWaits; i++) {
    await settle();
    root = rootInPane(doc, t.channel, t.ts);
  }
  const view = root?.querySelector('[data-qa="reply_bar_view_thread"]') as HTMLElement | null;
  if (!view) return false;
  view.click();
  return true;
}

const slack: Recipe = {
  id: 'slack',
  intervalMs: 2000,
  conversationUrl: (doc) => slackThreadUrl(doc),
  openUrl: openSlackThread,
  // upsell banners + non-chat tab-rail destinations. The rail items carry no
  // stable class, only (locale-sensitive) aria-labels — a no-op in other
  // locales is acceptable for cosmetics. None of these exist on login pages.
  css: `
    .p-channel_sidebar__banner--upgrade,
    [data-qa="upgrade_banner"],
    [data-qa*="upsell"],
    .p-tab_rail [aria-label="Canvases"],
    .p-tab_rail [aria-label="Files"],
    .p-tab_rail [aria-label="Automations"],
    .p-tab_rail [aria-label="Templates"] {
      display: none !important;
    }
  `,
  // Slack's "loading your workspace" splash covers the client while it boots
  ready(doc) {
    return visiblyPresent(
      doc,
      doc.querySelector('.p-channel_sidebar, [data-qa="workspace_sidebar"]'),
    );
  },
  count(doc) {
    const sidebar = doc.querySelector('.p-channel_sidebar') ?? doc;
    const badges = [...sidebar.querySelectorAll('.c-mention_badge')]
      .map((el) => Number.parseInt(el.textContent ?? '', 10))
      .filter((n) => Number.isFinite(n));
    const direct =
      badges.length > 0 ? badges.reduce((a, b) => a + b, 0) : unreadFromTitle(doc.title);
    // unread channels without a mention badge; badge rows already counted above
    const indirect = [
      ...sidebar.querySelectorAll(
        '.p-channel_sidebar__channel--unread:not(.p-channel_sidebar__channel--muted)',
      ),
    ].filter((el) => !el.querySelector('.c-mention_badge')).length;
    return { direct, indirect };
  },
};
export default slack;
