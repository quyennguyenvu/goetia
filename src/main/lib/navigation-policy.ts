import type { ServiceId } from '../../shared/types';

/** Hosts each service's top-level view may navigate to (its own domain plus
 *  the hosts its login flow bounces through). Anything else opens in the OS
 *  browser instead of loading inside the app with the recipe preload.
 *  VERIFY LIVE per service before enforcing — auth hosts change. */
const ALLOWED_HOSTS: Record<ServiceId, string[]> = {
  messenger: ['www.facebook.com', 'm.facebook.com', 'facebook.com', 'messenger.com'],
  // facebook hosts for the Log-in-with-Facebook bounce
  instagram: [
    'www.instagram.com',
    'instagram.com',
    'accounts.instagram.com',
    'www.facebook.com',
    'facebook.com',
  ],
  telegram: ['web.telegram.org'],
  zalo: ['chat.zalo.me', 'id.zalo.me', 'zalo.me'],
  whatsapp: ['web.whatsapp.com'],
  discord: ['discord.com', 'discordapp.com', 'canary.discord.com'],
  tiktok: ['www.tiktok.com', 'tiktok.com'],
  shopee: ['shopee.vn', 'accounts.shopee.vn'],
};

export function isNavigationAllowed(id: ServiceId, url: string): boolean {
  try {
    const { protocol, host } = new URL(url);
    if (protocol !== 'https:' && protocol !== 'http:') return false;
    return ALLOWED_HOSTS[id].includes(host);
  } catch {
    return false;
  }
}
