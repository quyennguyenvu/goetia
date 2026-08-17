/** Lane B on a live view: click the thread's own anchor so the SPA routes
 *  in-page — no reload, no waking cover. The anchor is the newest-unread
 *  row the recipe just extracted, so it is almost always still in the chat
 *  list; if it left the DOM, fall back to a full navigation. */
export function openConversationInPage(
  doc: Document,
  href: string,
  url: string,
  assign: (url: string) => void = (u) => doc.defaultView?.location.assign(u),
): void {
  for (const a of doc.querySelectorAll('a[href]')) {
    if (a.getAttribute('href') === href) {
      (a as HTMLElement).click();
      return;
    }
  }
  assign(url);
}
