import { app, type BrowserWindow, nativeImage } from 'electron';
import type { BadgeSummary } from '../shared/badges';

export function applyBadges(_win: BrowserWindow, summary: BadgeSummary): void {
  if (process.platform === 'darwin') {
    if (summary.total > 0) app.setBadgeCount(summary.total);
    else if (summary.indirectOnly) app.dock?.setBadge('•');
    else app.setBadgeCount(0);
  }
}

/** Windows: overlay PNG rendered by the shell renderer (canvas), applied here. */
export function applyOverlay(win: BrowserWindow, dataUrl: string | null, count: number): void {
  if (process.platform !== 'win32') return;
  if (!dataUrl || count === 0) win.setOverlayIcon(null, '');
  else win.setOverlayIcon(nativeImage.createFromDataURL(dataUrl), `${count} unread`);
}
