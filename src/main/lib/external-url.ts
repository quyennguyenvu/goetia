/** Only web links may be handed to the OS; file:/smb:/custom schemes from a
 *  hostile page's window.open are dropped. */
export function isSafeExternalUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}
