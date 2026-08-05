/** Present a plain Chrome UA — WhatsApp/Google login flows block unknown tokens. */
export function chromeUserAgent(ua: string): string {
  return ua
    .replace(/\s?(goetia|Electron)\/\S+/gi, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}
