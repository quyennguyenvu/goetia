import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The toast layer is a third Goetia page, so it holds the shell's CSP and
 *  carries no script of its own in the markup. */
describe('toast.html', () => {
  const html = readFileSync(join(__dirname, '../../src/renderer/toast.html'), 'utf8');

  it('keeps the renderer CSP', () => {
    for (const directive of [
      "default-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-src 'none'",
    ]) {
      expect(html).toContain(directive);
    }
  });

  it('loads its script from a file, never inline', () => {
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toContain('src="/src/toast.ts"');
  });

  // the card must not flash empty before the first toast arrives
  it('starts with the card hidden', () => {
    expect(html).toMatch(/id="toast"[^>]*\bhidden\b/);
  });
});
