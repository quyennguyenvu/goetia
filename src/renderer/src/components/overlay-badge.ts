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
