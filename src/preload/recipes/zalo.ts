import { unreadFromTitle } from './title';
import type { Recipe } from './types';

/** Zalo renders badge digits as font-icon classes (fa-1 … fa-5_Plus).
 *  Mirrors ferdium-recipes/zalo. */
export function faDigit(className: string): number | 'plus' | null {
  const m = /fa-(\d)(_Plus)?/.exec(className);
  if (!m) return null;
  return m[2] ? 'plus' : Number(m[1]);
}

const zalo: Recipe = {
  id: 'zalo',
  intervalMs: 2000,
  count(doc) {
    const tabBadge = doc.querySelector(
      '[data-translate-title="STR_TAB_MESSAGE"] [class*="leftbar-unread-badge"] .z-noti-badge__content',
    );
    if (!tabBadge) return { direct: unreadFromTitle(doc.title), indirect: 0 };
    const digit = faDigit(tabBadge.className);
    if (typeof digit === 'number') return { direct: digit, indirect: 0 };
    if (digit === null) return { direct: unreadFromTitle(doc.title), indirect: 0 };
    // "5+" tab badge: sum per-conversation badges
    let direct = 0;
    const convs = doc.querySelectorAll(
      '.conv-action__unread-v2 > div:not([class*="--noti-disable"])',
    );
    for (const conv of convs) {
      const d = faDigit(conv.querySelector('.z-noti-badge__content')?.className ?? '');
      direct += typeof d === 'number' ? d : 1;
    }
    return { direct: Math.max(direct, 6), indirect: 0 };
  },
};
export default zalo;
