import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Dev serves loading.html straight from source, where loading.css only
 *  arrives via the JS module import — after first paint. A viewBox-only
 *  SVG defaults to full body width, so without inline critical styles the
 *  portal flashes huge and uncentered on every dev launch. */
describe('loading.html critical first-paint styles', () => {
  const html = readFileSync(join(__dirname, '../../src/renderer/loading.html'), 'utf8');
  const head = html.slice(0, html.indexOf('<body'));

  it('carries an inline <style> in <head>', () => {
    expect(head).toMatch(/<style>/);
  });

  it('sizes the portal before loading.css arrives', () => {
    const style = head.slice(head.indexOf('<style>'), head.indexOf('</style>'));
    expect(style).toMatch(/\.portal\s*{[^}]*width:\s*128px/);
    expect(style).toMatch(/\.stage\s*{[^}]*justify-content:\s*center/);
  });
});
