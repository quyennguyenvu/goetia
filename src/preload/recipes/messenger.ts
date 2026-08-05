import { unreadFromTitle } from './title';
import type { Recipe } from './types';

const FB_BLUE = /rgb\(\s*8,\s*102,\s*255/;

/** facebook.com/messages has no title count and no unread aria-labels
 *  (verified against the live DOM 2026-08-05): unread conversations are
 *  marked visually — bold (700) row text and/or a Facebook-blue dot.
 *  Counts unread conversations, not messages. */
const messenger: Recipe = {
  id: 'messenger',
  intervalMs: 2000,
  count(doc) {
    const win = doc.defaultView;
    const links = [...doc.querySelectorAll("a[href*='/t/']")];
    if (links.length === 0 || !win) {
      return { direct: unreadFromTitle(doc.title), indirect: 0 };
    }
    let direct = 0;
    for (const link of links) {
      let unread = false;
      for (const span of link.querySelectorAll('span')) {
        const weight = Number.parseInt(win.getComputedStyle(span).fontWeight, 10);
        if (weight >= 700) {
          unread = true;
          break;
        }
      }
      if (!unread) {
        for (const el of link.querySelectorAll('div, span')) {
          const style = win.getComputedStyle(el);
          if (style.borderRadius.includes('50%') && FB_BLUE.test(style.backgroundColor)) {
            unread = true;
            break;
          }
        }
      }
      if (unread) direct++;
    }
    return { direct, indirect: 0 };
  },
};
export default messenger;
