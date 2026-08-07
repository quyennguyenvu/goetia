/** Element text with image-rendered emoji restored. Facebook draws emoji in
 *  chat previews as `<img alt="😆">` (sprite variants carry `role="img"` +
 *  aria-label); neither contributes to textContent, so a reaction preview
 *  reads "Reacted  to your message" with the glyph missing. */
export function textWithEmoji(el: Element): string {
  return collect(el).replace(/\s+/gu, ' ').trim();
}

function collect(el: Element): string {
  let out = '';
  for (const node of el.childNodes) {
    if (node.nodeType === 3 /* text */) out += node.nodeValue ?? '';
    else if (node.nodeType === 1 /* element */) {
      const child = node as Element;
      out += collect(child) || glyph(child);
    }
  }
  return out;
}

/** Only where the label stands in for a picture — a bare aria-label elsewhere
 *  names a control ("Close"), and must not leak into message text. */
function glyph(el: Element): string {
  if (el.tagName === 'IMG') return el.getAttribute('alt') ?? '';
  if (el.getAttribute('role') === 'img') return el.getAttribute('aria-label') ?? '';
  return '';
}
