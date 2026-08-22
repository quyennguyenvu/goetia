/** Whether the taskbar overlay is worth redrawing. Only Windows has one —
 *  applyOverlay discards it everywhere else — and drawing it means a canvas,
 *  a PNG encode and a data URL over IPC, which the shell used to pay on every
 *  state broadcast because the effect keyed on a snapshot object that is new
 *  each time. `lastSent` null redraws once, so a stale overlay gets cleared. */
export function overlayNeedsUpdate(opts: {
  platform: string;
  total: number;
  lastSent: number | null;
}): boolean {
  if (opts.platform !== 'win32') return false;
  return opts.total !== opts.lastSent;
}

export function renderOverlayDataUrl(label: string): string {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#FF4D5E';
  ctx.beginPath();
  ctx.arc(16, 16, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold ${label.length > 1 ? 15 : 18}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 16, 17);
  return c.toDataURL('image/png');
}
