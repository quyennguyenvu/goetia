import { join } from 'node:path';
import { type BrowserWindow, WebContentsView } from 'electron';
import type { MainToRenderer } from '../shared/ipc';

type LoadingState = MainToRenderer['loading:state'];

// --bg-0 per theme: the view's own background, so no white flash can
// appear before the page paints
const BG = { light: '#f7f8fa', dark: '#0f1115' } as const;

export class LoadingOverlay {
  private view: WebContentsView;
  private visible = false;
  private pending: LoadingState | null = null;

  constructor(
    private win: BrowserWindow,
    initialTheme: 'light' | 'dark',
  ) {
    this.view = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, '../preload/loading.cjs'),
        contextIsolation: true,
        sandbox: true,
      },
    });
    this.view.setBackgroundColor(BG[initialTheme]);
    this.view.setVisible(false);
    const wc = this.view.webContents;
    // loaded hidden at startup so the first show paints instantly;
    // re-send the last state in case update() raced the page load
    wc.on('did-finish-load', () => {
      if (this.pending) wc.send('loading:state', this.pending);
    });
    if (process.env.ELECTRON_RENDERER_URL) {
      wc.loadURL(`${process.env.ELECTRON_RENDERER_URL}/loading.html`);
    } else {
      wc.loadFile(join(__dirname, '../renderer/loading.html'));
    }
  }

  setBounds(bounds: { x: number; y: number; width: number; height: number }): void {
    this.view.setBounds(bounds);
  }

  update(state: LoadingState): void {
    this.pending = state;
    this.view.setBackgroundColor(BG[state.theme]);
    this.view.webContents.send('loading:state', state);
  }

  /** Re-adds at the top of the z-order every time (same trick as
   *  activate()), so it stays above a just-re-added service view. */
  show(): void {
    this.win.contentView.addChildView(this.view);
    this.view.setVisible(true);
    this.visible = true;
  }

  /** Re-assert top z-order after a service view was re-stacked above us
   *  (activate() runs after the broadcast that showed the overlay). */
  raise(): void {
    if (this.visible) this.show();
  }

  hide(): void {
    if (!this.visible) return;
    this.view.setVisible(false);
    this.visible = false;
  }
}
