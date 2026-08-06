import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { SERVICES } from '../src/shared/services.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOGO_DIR = join(ROOT, 'src/renderer/src/assets/logos');
const OUT_DIR = join(ROOT, 'resources/notification-icons');

const CANVAS_PX = 128; // covers 38pt at 3x (macOS) and 48px at 2x (Windows)
const RADIUS_RATIO = 0.34; // ServiceTile: 11px on a 32px tile
const GLYPH_RATIO = 0.56; // ServiceTile: 18px on a 32px tile
const MAC_INSET_RATIO = 28 / 38; // reviewed tile size inside the macOS slot

// Nest the logo file whole so its own viewBox scales into the box we give it —
// no path extraction, nothing to re-parse when a logo is replaced.
function placeGlyph(id, offset, size) {
  const src = readFileSync(join(LOGO_DIR, `${id}.svg`), 'utf8').trim();
  const box = `x="${offset}" y="${offset}" width="${size}" height="${size}"`;
  return src.replace('<svg', `<svg ${box}`);
}

function tileSvg(service, tilePx) {
  const inset = (CANVAS_PX - tilePx) / 2;
  const glyph = tilePx * GLYPH_RATIO;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_PX}"`,
    ` height="${CANVAS_PX}" viewBox="0 0 ${CANVAS_PX} ${CANVAS_PX}">`,
    `<rect x="${inset}" y="${inset}" width="${tilePx}" height="${tilePx}"`,
    ` rx="${tilePx * RADIUS_RATIO}" fill="${service.color}"/>`,
    placeGlyph(service.id, inset + (tilePx - glyph) / 2, glyph),
    '</svg>',
  ].join('');
}

const png = (svg) => new Resvg(svg).render().asPng();

mkdirSync(OUT_DIR, { recursive: true });
for (const service of SERVICES) {
  writeFileSync(join(OUT_DIR, `${service.id}.png`), png(tileSvg(service, CANVAS_PX)));
  writeFileSync(
    join(OUT_DIR, `${service.id}-mac.png`),
    png(tileSvg(service, CANVAS_PX * MAC_INSET_RATIO)),
  );
  console.log(`${service.id}: full-bleed + macOS inset`);
}
