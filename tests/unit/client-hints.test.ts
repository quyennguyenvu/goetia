import { describe, expect, it } from 'vitest';
import { clientHintHeaders } from '../../src/main/lib/client-hints';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.7871.212 Safari/537.36';

describe('clientHintHeaders', () => {
  it('advertises a Google Chrome brand at the UA major version', () => {
    const h = clientHintHeaders(UA, 'darwin');
    expect(h['Sec-CH-UA']).toContain('"Google Chrome";v="150"');
    expect(h['Sec-CH-UA']).toContain('"Chromium";v="150"');
  });

  it('maps the platform label and is not mobile', () => {
    expect(clientHintHeaders(UA, 'darwin')['Sec-CH-UA-Platform']).toBe('"macOS"');
    expect(clientHintHeaders(UA, 'win32')['Sec-CH-UA-Platform']).toBe('"Windows"');
    expect(clientHintHeaders(UA, 'linux')['Sec-CH-UA-Platform']).toBe('"Linux"');
    expect(clientHintHeaders(UA, 'darwin')['Sec-CH-UA-Mobile']).toBe('?0');
  });

  it('falls back to a plausible version when the UA has none', () => {
    expect(clientHintHeaders('Mozilla/5.0 nonsense', 'darwin')['Sec-CH-UA']).toContain('v="150"');
  });
});
