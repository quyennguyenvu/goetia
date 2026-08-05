import { describe, expect, it } from 'vitest';
import { chromeUserAgent } from '../../src/main/lib/ua';

describe('chromeUserAgent', () => {
  it('strips Electron and app tokens', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) goetia/0.1.0 Chrome/126.0.0.0 Electron/31.0.0 Safari/537.36';
    const out = chromeUserAgent(ua);
    expect(out).not.toContain('Electron');
    expect(out).not.toContain('goetia');
    expect(out).toContain('Chrome/126.0.0.0');
    expect(out).not.toMatch(/ {2,}/);
  });
});
