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
// unread count on zalo alone. The rail and switcher enable everything — a
// half-empty rail makes a poor showcase.
const SURFACES = [
  // a mixed live set so both Home sections carry tiles; the capture then
  // stages one summon and one banishment across them
  { stem: 'welcome', surface: 'welcome', enabled: ['messenger', 'telegram', 'zalo'] },
  {
    stem: 'rail-badges',
    surface: 'rail',
    enabled: [...ALL_SERVICE_IDS],
    muted: ['whatsapp'],
  },
  { stem: 'quick-switcher', surface: 'switcher', enabled: [...ALL_SERVICE_IDS] },
  { stem: 'settings', surface: 'settings', enabled: ['zalo', 'telegram', 'whatsapp'] },
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
