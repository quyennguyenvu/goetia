import type { ServiceId, ServiceMeta } from './types';

/** Sorted by display name — the shipped default order, and the order Home's
 *  Unbound list always uses. Keep new entries in name order. */
export const SERVICES: ServiceMeta[] = [
  {
    id: 'discord',
    name: 'Discord',
    url: 'https://discord.com/channels/@me',
    color: '#5865F2',
    waitForReady: true,
  },
  // DMs only — land on /direct/inbox, never the feed. Selectors follow
  // Meta's messenger DOM language but are uncalibrated until a live login
  // pass.
  {
    id: 'instagram',
    name: 'Instagram',
    url: 'https://www.instagram.com/direct/inbox/',
    color: '#E4405F',
    waitForReady: true,
  },
  // messenger.com redirects logged-in users into facebook.com — target Messages directly
  {
    id: 'messenger',
    name: 'Messenger',
    url: 'https://www.facebook.com/messages/',
    color: '#0084FF',
    waitForReady: true,
  },
  // the v2 client routes in the hash (#/chat, #/calendar, …), so the chat
  // route belongs in the URL: snapping back from #/calendar is then a
  // fragment navigation Teams' own router serves — no reload, no boot splash.
  {
    id: 'teams',
    name: 'Microsoft Teams',
    url: 'https://teams.microsoft.com/v2/#/chat',
    color: '#6264A7',
    waitForReady: true,
  },
  // buyer chat lives in the mini-chat widget on the shopping site; the
  // recipe css reshapes it to fill the view. Never target /webchat —
  // it hits Shopee's anti-bot wall (verify/captcha, scene=crawler_item)
  { id: 'shopee', name: 'Shopee', url: 'https://shopee.vn/', color: '#EE4D2D', waitForReady: true },
  // the whole client under app.slack.com/client is chat (discord precedent);
  // /client lands on the last-active workspace, the built-in switcher rail
  // covers the rest. Logged out it 302s to the workspace-first signin — the
  // off-host back affordance is what gets a first-timer out of that detour.
  {
    id: 'slack',
    name: 'Slack',
    url: 'https://app.slack.com/client',
    color: '#4A154B',
    waitForReady: true,
  },
  {
    id: 'telegram',
    name: 'Telegram',
    url: 'https://web.telegram.org/k/',
    color: '#26A5E4',
    waitForReady: true,
  },
  // DMs only — land on /messages, not the feed (messenger-style). The
  // recipe's data-e2e hooks are uncalibrated until a live login pass.
  {
    id: 'tiktok',
    name: 'TikTok',
    url: 'https://www.tiktok.com/messages',
    color: '#FE2C55',
    waitForReady: true,
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    url: 'https://web.whatsapp.com/',
    color: '#25D366',
    waitForReady: true,
  },
  // keepRendered: Zalo idles into a "Kích hoạt" modal and unmounts its UI when
  // it believes the tab is hidden — badges freeze and trusted clicks can't
  // reach a hidden view to reactivate it. Never let it think it's hidden.
  {
    id: 'zalo',
    name: 'Zalo',
    url: 'https://chat.zalo.me/',
    color: '#0068FF',
    keepRendered: true,
    waitForReady: true,
  },
];

export function serviceById(id: ServiceId): ServiceMeta {
  const svc = SERVICES.find((s) => s.id === id);
  if (!svc) throw new Error(`unknown service: ${id}`);
  return svc;
}
