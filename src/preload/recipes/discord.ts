import { visiblyPresent } from './ready';
import { unreadFromTitle } from './title';
import type { Recipe } from './types';

const discord: Recipe = {
  id: 'discord',
  intervalMs: 2000,
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
