import { visiblyPresent } from './ready';
import { unreadFromTitle } from './title';
import type { Recipe } from './types';

const discord: Recipe = {
  id: 'discord',
  intervalMs: 2000,
  // chat only: strip the store-front out of the chat app (calibrated
  // 2026-08-07). data-list-item-id suffixes are locale- and build-proof:
  // Nitro/Shop/Quests rows in the DM list, Discover + app-download in the
  // guild rail. Everything else (friends, servers, channels) is chat.
  css: `
    li:has([data-list-item-id$="___nitro"]),
    li:has([data-list-item-id$="___shop"]),
    li:has([data-list-item-id$="___quests"]),
    [data-list-item-id="guildsnav___guild-discover-button"],
    [data-list-item-id="guildsnav___app-download-button"] {
      display: none !important;
    }
  `,
  // the guild nav (stable data-list-id) mounts only after discord's splash
  ready(doc) {
    return visiblyPresent(doc, doc.querySelector('[data-list-id="guildsnav"]'));
  },
  count(doc) {
    const badges = [...doc.querySelectorAll('[class*="lowerBadge_"] [class*="numberBadge_"]')]
      .map((el) => Number.parseInt(el.textContent ?? '', 10))
      .filter((n) => Number.isFinite(n));
    const direct =
      badges.length > 0 ? badges.reduce((a, b) => a + b, 0) : unreadFromTitle(doc.title);
    const indirect = doc.title.includes('• Discord') ? 1 : 0;
    return { direct, indirect };
  },
};
export default discord;
