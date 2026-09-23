import { describe, expect, it } from 'vitest';
import { extensionChip, formatBytes, formatProgress } from '../../src/shared/format';

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

describe('formatBytes', () => {
  it('picks the unit and keeps one decimal only under ten', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(812 * KB)).toBe('812 KB');
    expect(formatBytes(3.1 * MB)).toBe('3.1 MB');
    expect(formatBytes(77 * MB)).toBe('77 MB');
    expect(formatBytes(2.5 * GB)).toBe('2.5 GB');
  });
});

describe('formatProgress', () => {
  it("shares the total's unit, and says so far with no total", () => {
    expect(formatProgress(48 * MB, 77 * MB)).toBe('48 of 77 MB');
    expect(formatProgress(300 * KB, 3.1 * MB)).toBe('0.3 of 3.1 MB');
    expect(formatProgress(48 * MB, 0)).toBe('48 MB so far');
  });
});

describe('extensionChip', () => {
  it('upper-cases the extension, clipped to four, FILE when there is none', () => {
    expect(extensionChip('photo.jpg')).toBe('JPG');
    expect(extensionChip('x.jpeg')).toBe('JPEG');
    expect(extensionChip('archive.tar.gz')).toBe('GZ');
    expect(extensionChip('x.webarchive')).toBe('WEBA');
    expect(extensionChip('README')).toBe('FILE');
    expect(extensionChip('.env')).toBe('FILE');
  });
});
