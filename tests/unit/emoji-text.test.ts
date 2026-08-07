// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { textWithEmoji } from '../../src/preload/recipes/emoji-text';

function el(html: string): Element {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host;
}

describe('textWithEmoji', () => {
  it('substitutes an <img> emoji with its alt glyph', () => {
    expect(textWithEmoji(el('Reacted <img alt="😆" src="emoji.php"> to your message'))).toBe(
      'Reacted 😆 to your message',
    );
  });

  it('substitutes a sprite span via role=img aria-label', () => {
    expect(textWithEmoji(el('<span role="img" aria-label="❤️"></span> nice'))).toBe('❤️ nice');
  });

  it('ignores aria-label on controls, which names the control not the message', () => {
    expect(textWithEmoji(el('hey <button aria-label="Close"></button>'))).toBe('hey');
  });

  it('prefers real text over a label on the same element', () => {
    expect(textWithEmoji(el('<span role="img" aria-label="smile">ok</span>'))).toBe('ok');
  });

  it('collapses layout whitespace', () => {
    expect(textWithEmoji(el('<span>  a\n  </span><span>  b </span>'))).toBe('a b');
  });

  it('is empty for an element with no text', () => {
    expect(textWithEmoji(el('<span></span>'))).toBe('');
  });
});
