import type { Counts } from '../../shared/types';
import type { Recipe } from './types';

export function startRecipe(
  recipe: Recipe,
  doc: Document,
  report: (c: Counts) => void,
  reportStale: () => void,
  setIntervalFn: typeof setInterval = setInterval,
): void {
  let last: Counts | null = null;
  let busy = false;
  setIntervalFn(async () => {
    if (busy) return;
    busy = true;
    try {
      const counts = await recipe.count(doc);
      if (!last || counts.direct !== last.direct || counts.indirect !== last.indirect) {
        last = counts;
        report(counts);
      }
    } catch {
      reportStale();
    } finally {
      busy = false;
    }
  }, recipe.intervalMs);
}
