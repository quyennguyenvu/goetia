import type { ServiceId } from '../../shared/types';

export interface CallPopupRule {
  host: string;
  pathPrefix: string;
}

/** Popup URLs that ARE a service's call surface — the only window.open
 *  targets allowed to open as in-app call windows. Seeded from known web
 *  client behavior; VERIFY LIVE per service before trusting a pattern.
 *  Empty list = the service calls in-page or not at all. */
export const CALL_POPUPS: Record<ServiceId, CallPopupRule[]> = {
  messenger: [
    { host: 'www.messenger.com', pathPrefix: '/videocall' },
    { host: 'www.messenger.com', pathPrefix: '/groupcall' },
    { host: 'www.facebook.com', pathPrefix: '/groupcall' },
  ],
  whatsapp: [],
  instagram: [],
  telegram: [],
  discord: [],
  // zalo and teams may pop call/meeting windows — characterize during the
  // live pass and fill these in
  zalo: [],
  teams: [],
  tiktok: [],
  shopee: [],
  slack: [],
};

/** Sibling origins whose getUserMedia/getDisplayMedia is the service's call
 *  surface (media and display-capture only, never notifications).
 *  VERIFY LIVE. */
export const CALL_ORIGINS: Record<ServiceId, string[]> = {
  messenger: ['https://www.facebook.com'],
  whatsapp: [],
  instagram: [],
  telegram: [],
  discord: [],
  zalo: [],
  teams: ['https://teams.live.com', 'https://teams.microsoft.com'],
  tiktok: [],
  shopee: [],
  slack: [],
};

export function isCallPopup(id: ServiceId, url: string): boolean {
  try {
    const { protocol, host, pathname } = new URL(url);
    if (protocol !== 'https:') return false;
    return CALL_POPUPS[id].some((r) => r.host === host && pathname.startsWith(r.pathPrefix));
  } catch {
    return false;
  }
}

/** Messenger opens its call popup as `about:blank` and script-navigates it to
 *  the call URL afterward (verified live 2026-08-16), so an https-only match
 *  can never admit it. A blank popup is allowed only for services that declare
 *  call popups at all; the wiring polices every later navigation. */
export function isBlankCallPopup(id: ServiceId, url: string): boolean {
  return (url === 'about:blank' || url === '') && CALL_POPUPS[id].length > 0;
}
