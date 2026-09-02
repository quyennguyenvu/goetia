import type { ServiceId } from '../../shared/types';
import { hostMatches } from './host-match';

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
export const ALLOWED_HOSTS: Record<ServiceId, string[]> = {
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

export function isNavigationAllowed(id: ServiceId, url: string): boolean {
  try {
    const { protocol, host } = new URL(url);
    // https only: every listed host is HTTPS/HSTS in practice, so a downgrade
    // to http is a redirect worth containing (into the hardened window), never
    // keeping in the unsandboxed view
    if (protocol !== 'https:') return false;
    return ALLOWED_HOSTS[id].some((entry) => hostMatches(host, entry));
  } catch {
    return false;
  }
}

/** Whether a navigation the view reported must be diverted to the contained
 *  window. Only the top-level document is the view's concern — it is what runs
 *  unsandboxed with the recipe preload. Subframes are never contained: a login
 *  page embeds third-party frames no list could name (device fingerprinting,
 *  captchas, Microsoft's passkey ceremony), and `will-redirect` reports their
 *  redirects too — cancelling one broke the Teams passkey sign-in and opened
 *  the frame's URL as a blank window (2026-08-29). */
export function shouldContainNavigation(id: ServiceId, url: string, isMainFrame: boolean): boolean {
  return isMainFrame && !isNavigationAllowed(id, url);
}
