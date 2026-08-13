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
  // per-user workspace hosts ({team}.slack.com) and the SSO bounce hosts
  // (Google/Apple) can't be listed statically — needs suffix matching plus a
  // live login pass before the guard can be wired for slack
  slack: ['app.slack.com', 'slack.com', 'www.slack.com'],
  // teams.live.com is where Microsoft sends personal accounts. Tenant SSO/ADFS
  // hosts are per-organization and exact-host matching can't express them —
  // needs a live tenant login before the guard can be wired for teams.
  teams: [
    'teams.microsoft.com',
    'teams.live.com',
    'login.microsoftonline.com',
    'login.microsoft.com',
    'login.live.com',
  ],
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
