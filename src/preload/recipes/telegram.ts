import { unreadFromTitle } from './title';
import type { Recipe } from './types';

/** web.telegram.org/k — unmuted rows only; positive peerId = person (direct),
 *  negative = group/channel (indirect). Mirrors ferdium-recipes/telegram webK. */
const telegram: Recipe = {
  id: 'telegram',
  intervalMs: 2000,
  count(doc) {
    const rows = [...doc.querySelectorAll<HTMLElement>('.rp:not(.is-muted)')];
    if (rows.length === 0) return { direct: unreadFromTitle(doc.title), indirect: 0 };
    let direct = 0;
    let indirect = 0;
    for (const row of rows) {
      const badge = row.querySelector('.dialog-subtitle-badge');
      const n = Number.parseInt(badge?.textContent ?? '', 10);
      if (!Number.isFinite(n)) continue;
      if (Number(row.dataset.peerId ?? '0') > 0) direct += n;
      else indirect += n;
    }
    return { direct, indirect };
  },
};
export default telegram;
