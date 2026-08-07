import type { ServiceId, ServiceMeta } from './types';

export const SERVICES: ServiceMeta[] = [
  // messenger.com redirects logged-in users into facebook.com — target Messages directly
  {
    id: 'messenger',
    name: 'Messenger',
    url: 'https://www.facebook.com/messages/',
    color: '#0084FF',
    waitForReady: true,
  },
  {
    id: 'telegram',
    name: 'Telegram',
    url: 'https://web.telegram.org/k/',
    color: '#26A5E4',
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
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    url: 'https://web.whatsapp.com/',
    color: '#25D366',
    waitForReady: true,
  },
  {
    id: 'discord',
    name: 'Discord',
    url: 'https://discord.com/channels/@me',
    color: '#5865F2',
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
  // buyer chat lives in the mini-chat widget on the shopping site; the
  // recipe css reshapes it to fill the view. Never target /webchat —
  // it hits Shopee's anti-bot wall (verify/captcha, scene=crawler_item)
  { id: 'shopee', name: 'Shopee', url: 'https://shopee.vn/', color: '#EE4D2D', waitForReady: true },
];

export function serviceById(id: ServiceId): ServiceMeta {
  const svc = SERVICES.find((s) => s.id === id);
  if (!svc) throw new Error(`unknown service: ${id}`);
  return svc;
}
