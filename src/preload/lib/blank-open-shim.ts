/** Zalo opens every chat link as `window.open()` and assigns the URL to the
 *  handle afterwards (read from its bundle 2026-09-30). Main's deny path only
 *  ever sees `about:blank`, and the null handle is Zalo's "popup blocked"
 *  toast. So a blank open gets a stand-in with the surface those callers touch
 *  — `opener`, `location`, `close()` — and the URL assigned to it goes to
 *  `hand`. No window is ever created; an open with a real URL is untouched. */
export function installBlankOpenShim(
  win: Window & typeof globalThis,
  hand: (url: string) => void,
): void {
  const realOpen = win.open;
  const handOff = (value: unknown): void => {
    try {
      hand(new URL(String(value), win.location.href).href);
    } catch {
      // unparseable: nothing a browser could open either
    }
  };
  win.open = ((...args: Parameters<typeof win.open>) => {
    const url = args[0] === undefined ? '' : String(args[0]);
    if (url !== '' && url !== 'about:blank') return realOpen.apply(win, args);
    let closed = false;
    const location = {
      get href() {
        return 'about:blank';
      },
      set href(value: string) {
        handOff(value);
      },
      assign: handOff,
      replace: handOff,
      toString: () => 'about:blank',
    };
    return {
      opener: win,
      get closed() {
        return closed;
      },
      close() {
        closed = true;
      },
      get location() {
        return location;
      },
      set location(value: unknown) {
        handOff(value);
      },
    } as unknown as Window;
  }) as typeof win.open;
}
