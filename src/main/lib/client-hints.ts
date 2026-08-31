/** Low-entropy UA client hints Chrome sends on every secure request. Electron
 *  sends none — a Chrome UA string with no `Sec-CH-UA` header is a plain
 *  embedded/automated-browser tell, which is what trips Google's OAuth
 *  "this browser may not be secure" wall (identity popups, live pass
 *  2026-08-31). We restore them so an in-app sign-in dialog looks like Chrome.
 *  The `Not;A=Brand` entry is GREASE — a deliberately meaningless brand
 *  servers must ignore; only `Google Chrome` matters. */
export function clientHintHeaders(ua: string, platform: NodeJS.Platform): Record<string, string> {
  const major = ua.match(/Chrome\/(\d+)/)?.[1] ?? '150';
  const label = platform === 'darwin' ? 'macOS' : platform === 'win32' ? 'Windows' : 'Linux';
  return {
    'Sec-CH-UA': `"Chromium";v="${major}", "Google Chrome";v="${major}", "Not;A=Brand";v="24"`,
    'Sec-CH-UA-Mobile': '?0',
    'Sec-CH-UA-Platform': `"${label}"`,
  };
}
