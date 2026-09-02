/**
 * The capture matrix: one entry per PNG committed to docs/media.
 * Pure data — the interaction for each `surface` lives in capture-media.mjs.
 */

/** Must match SERVICES in src/shared/services.ts (locked by a unit test). */
export const ALL_SERVICE_IDS = [
  'messenger',
  'instagram',
  'telegram',
  'zalo',
  'whatsapp',
  'discord',
  'tiktok',
  'shopee',
  'slack',
  'teams',
];

export const THEMES = ['light', 'dark'];

// zalo is enabled wherever a badge is needed: --goetia-e2e injects the fake
// unread count on zalo alone. The rail and switcher enable NINE_UP — a
// half-empty rail makes a poor showcase, but all ten would be trimmed to the
// summon cap at boot and the trim toast would photobomb the shot.
const NINE_UP = ALL_SERVICE_IDS.filter((id) => id !== 'teams');

/** Fixed timestamps keep the rendered dates identical run to run. */
const AUG = (day) => Date.UTC(2026, 7, day, 9);

/** Seeded pins.json for the pins shot — fictional content only. Discord is
 *  left unbound in that shot, so its pin renders dimmed (survives banish). */
const DEMO_PINS = [
  {
    id: 1,
    serviceId: 'slack',
    text: 'Deploy freeze starts Friday 5pm — get the hotfix reviewed before then',
    note: 'review by Thu',
    conversation: '#release',
    href: 'https://app.slack.com/client/T000/C000',
    at: AUG(28),
  },
  {
    id: 2,
    serviceId: 'whatsapp',
    text: 'Landlord: contract renewal needs signing this weekend',
    note: '',
    conversation: 'Minh Anh',
    href: 'https://web.whatsapp.com/',
    at: AUG(27),
  },
  {
    id: 3,
    serviceId: 'zalo',
    text: 'Chốt số liệu tháng 8 trước thứ Năm nhé',
    note: '',
    conversation: 'Nhóm Sale',
    href: 'https://chat.zalo.me/',
    at: AUG(26),
  },
  {
    id: 4,
    serviceId: 'discord',
    text: 'Session moved to Sunday 8pm, bring the new character sheets',
    note: '',
    conversation: '#tabletop',
    href: 'https://discord.com/channels/@me',
    at: AUG(24),
  },
];

/** Seeded passkeys.json for the passkeys shot. Display never decrypts, so the
 *  privateKey field only has to be a non-empty string; the base64url fields
 *  must decode (parsePasskeys drops malformed records). All fictional. */
const DEMO_PASSKEYS = [
  {
    id: 'ZGVtby1mYWNlYm9vaw',
    rpId: 'facebook.com',
    userHandle: 'dXNlci0x',
    userName: 'alex@example.com',
    displayName: 'Alex Tran',
    privateKey: 'demo-not-a-real-key',
    publicKeyCose: 'AAAA',
    createdIn: 'messenger',
    createdAt: AUG(2),
    lastUsedAt: AUG(30),
  },
  {
    id: 'ZGVtby1zbGFjaw',
    rpId: 'slack.com',
    userHandle: 'dXNlci0y',
    userName: 'alex@example.com',
    displayName: 'Alex Tran',
    privateKey: 'demo-not-a-real-key',
    publicKeyCose: 'AAAA',
    createdIn: 'slack',
    createdAt: AUG(9),
    lastUsedAt: AUG(29),
  },
  {
    id: 'ZGVtby10aWt0b2s',
    rpId: 'tiktok.com',
    userHandle: 'dXNlci0z',
    userName: 'alex@example.com',
    displayName: 'Alex Tran',
    privateKey: 'demo-not-a-real-key',
    publicKeyCose: 'AAAA',
    createdIn: 'tiktok',
    createdAt: AUG(15),
    lastUsedAt: AUG(15),
  },
];

const SURFACES = [
  // a mixed live set so both Home sections carry tiles; the capture then
  // stages one summon and one banishment across them
  { stem: 'welcome', surface: 'welcome', enabled: ['messenger', 'telegram', 'zalo'] },
  {
    stem: 'rail-badges',
    surface: 'rail',
    enabled: NINE_UP,
    muted: ['whatsapp'],
  },
  { stem: 'quick-switcher', surface: 'switcher', enabled: NINE_UP },
  { stem: 'settings', surface: 'settings', enabled: ['zalo', 'telegram', 'whatsapp'] },
  // discord stays unbound so its pin shows the dimmed banished state
  { stem: 'pins', surface: 'pins', enabled: ['slack', 'whatsapp', 'zalo'], pins: DEMO_PINS },
  {
    stem: 'passkeys',
    surface: 'passkeys',
    enabled: ['messenger', 'slack', 'tiktok'],
    passkeys: DEMO_PASSKEYS,
  },
  { stem: 'waking', surface: 'waking', enabled: ['zalo'] },
];

export const SHOTS = THEMES.flatMap((theme) => SURFACES.map((s) => ({ ...s, theme })));

/** The settings.json seeded into a shot's throwaway profile. */
export function settingsFor(shot) {
  const flags = (ids) => Object.fromEntries(ALL_SERVICE_IDS.map((id) => [id, ids.includes(id)]));
  return {
    theme: shot.theme,
    railPosition: 'top',
    disabled: flags(ALL_SERVICE_IDS.filter((id) => !shot.enabled.includes(id))),
    muted: flags(shot.muted ?? []),
    // Defaults to true for every service, which loads a hidden view per
    // enabled service at startup. That makes captures slow *and* races the
    // badge shot: zalo's runner reports {0,0} for the logged-out page and
    // wipes the count --goetia-e2e injects. With no view there is no runner,
    // so the injected badge simply stays put.
    neverHibernate: flags([]),
  };
}
