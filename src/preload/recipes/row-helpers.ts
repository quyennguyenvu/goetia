/** Replay a press — mousedown → mouseup → click — on `target`. A row's
 *  handler may sit on any wrapper above the element, and a bubbling event
 *  crosses all of them. */
export function press(doc: Document, target: Element): void {
  for (const type of ['mousedown', 'mouseup', 'click']) {
    target.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true, view: doc.defaultView }),
    );
  }
}

/** How long a scrolled page is given to render before its rows are read. */
export const SCROLL_SETTLE_MS = 60;

/** A wait of `ms`: the default `settle` of every bounded wait a recipe does. */
export const sleep = (ms: number) => (): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Look for a row in a virtualized list — only the rows in view exist in the
 *  DOM — by walking it from the top a page at a time, each page given a
 *  moment to render, until `find` answers or the bottom is reached. Bounded
 *  by `maxPages`, so a miss costs seconds, not a hang, and a miss puts the
 *  list back where it was. */
export async function walkPages<T>(
  scroller: HTMLElement,
  find: () => T | null | false,
  maxPages: number,
  settle: () => Promise<void> = sleep(SCROLL_SETTLE_MS),
): Promise<T | null> {
  const start = scroller.scrollTop;
  scroller.scrollTop = 0;
  for (let page = 0; page < maxPages; page++) {
    await settle();
    const found = find();
    if (found) return found;
    const before = scroller.scrollTop;
    scroller.scrollTop = before + scroller.clientHeight;
    if (scroller.scrollTop === before) break; // the bottom
  }
  scroller.scrollTop = start;
  return null;
}

/** Whether a row's centre lies within the pane: a trusted click at the centre
 *  of a row past the edge would land on a neighbour. */
export function inside(r: DOMRect, pane: DOMRect): boolean {
  const cy = r.y + r.height / 2;
  return cy >= pane.y && cy <= pane.y + pane.height;
}

/** Whitespace collapsed and trimmed (sites join names with NBSP and newlines). */
export const flat = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
