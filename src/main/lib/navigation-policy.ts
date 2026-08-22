import type { ServiceId } from '../../shared/types';

/** Hosts each service's top-level view may navigate to (its own domain plus
 *  the hosts its login flow bounces through).
 *
 *  An entry starting with `.` is a suffix: `.slack.com` matches `slack.com`
 *  and any subdomain of it, which is the only way to express per-workspace
 *  hosts like `{team}.slack.com`. Suffixes never match a lookalike —
 *  `evilslack.com` and `slack.com.evil.example` both fail.
 *
 *  This list is necessarily incomplete: tenant SSO and ADFS hosts are
 *  per-organization arbitrary domains and cannot be enumerated. A navigation
 *  it refuses is therefore NOT dead — it is adopted into a hardened contained
 *  window (see ServiceViewManager), which is what makes enforcing this safe
 *  before every service has had a live login pass. */
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
  // per-workspace hosts are {team}.slack.com, so slack needs the suffix form.
  // Google/Apple SSO bounces stay unlisted and reach the contained window.
  slack: ['.slack.com'],
  // teams.live.com is where Microsoft sends personal accounts. Tenant SSO and
  // ADFS hosts are per-organization arbitrary domains — inexpressible here, so
  // they reach the contained window instead.
  teams: ['teams.microsoft.com', '.live.com', '.microsoftonline.com', 'login.microsoft.com'],
};

function hostMatches(host: string, entry: string): boolean {
  if (!entry.startsWith('.')) return host === entry;
  // `.slack.com` covers slack.com itself and any subdomain, and nothing else:
  // endsWith alone would also match `evilslack.com`
  return host === entry.slice(1) || host.endsWith(entry);
}

export function isNavigationAllowed(id: ServiceId, url: string): boolean {
  try {
    const { protocol, host } = new URL(url);
    if (protocol !== 'https:' && protocol !== 'http:') return false;
    return ALLOWED_HOSTS[id].some((entry) => hostMatches(host, entry));
  } catch {
    return false;
  }
}
