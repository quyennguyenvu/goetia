// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { offChatLinkUrl } from '../../src/preload/lib/off-chat-link';

const messenger = {
  serviceUrl: 'https://www.facebook.com/messages/',
  chatPaths: ['/messages', '/messenger_media'],
};
const inChat = 'https://www.facebook.com/messages/t/1594439527295802/';

function target(html: string, selector: string): Element {
  document.documentElement.innerHTML = `<body>${html}</body>`;
  const el = document.querySelector(selector);
  if (!el) throw new Error(`no ${selector}`);
  return el;
}

describe('offChatLinkUrl', () => {
  // the report: a facebook.com/share link inside a Messenger thread is the
  // service's own origin, so no host rule can refuse it — it just navigated
  it('sends a same-origin link that leaves chat to the browser', () => {
    const a = target('<a href="/share/p/19GVUbgAT4/?mibextid=wwXIfr">post</a>', 'a');
    expect(offChatLinkUrl({ target: a, here: inChat, ...messenger })).toBe(
      'https://www.facebook.com/share/p/19GVUbgAT4/?mibextid=wwXIfr',
    );
  });

  it('finds the anchor a click landed inside', () => {
    const el = target('<a href="/reel/?s=tab"><span><b id="deep">x</b></span></a>', '#deep');
    expect(offChatLinkUrl({ target: el, here: inChat, ...messenger })).toBe(
      'https://www.facebook.com/reel/?s=tab',
    );
  });

  it('sends a cross-origin link to the browser too', () => {
    const a = target('<a href="https://youtu.be/abc">clip</a>', 'a');
    expect(offChatLinkUrl({ target: a, here: inChat, ...messenger })).toBe('https://youtu.be/abc');
  });

  it('leaves a link that stays inside the chat surface to the page', () => {
    for (const href of ['/messages/t/999/', '/messages/e2ee/t/1/', '/messenger_media/?id=2']) {
      const a = target(`<a href="${href}">thread</a>`, 'a');
      expect(offChatLinkUrl({ target: a, here: inChat, ...messenger }), href).toBeNull();
    }
  });

  // the guard that keeps sign-in working: a login, checkpoint or captcha page
  // is never on a chat path, so nothing on one is ever taken out of the app
  it('never diverts while the document is outside chat', () => {
    const a = target('<a href="/checkpoint/1501092823525282/">continue</a>', 'a');
    const here = 'https://www.facebook.com/login/?next=%2Fmessages%2F';
    expect(offChatLinkUrl({ target: a, here, ...messenger })).toBeNull();
  });

  it('leaves a download to Chromium', () => {
    const a = target('<a href="https://scontent.example/x.jpg" download>save</a>', 'a');
    expect(offChatLinkUrl({ target: a, here: inChat, ...messenger })).toBeNull();
  });

  // window.open already routes these: setWindowOpenHandler decides between the
  // browser, a call popup and a sign-in popup, and this must not pre-empt it
  it('leaves a targeted anchor to the window-open handler', () => {
    const a = target('<a href="https://example.com/" target="_blank">out</a>', 'a');
    expect(offChatLinkUrl({ target: a, here: inChat, ...messenger })).toBeNull();
  });

  it('ignores non-links, in-page anchors and non-web schemes', () => {
    expect(
      offChatLinkUrl({
        target: target('<button>go</button>', 'button'),
        here: inChat,
        ...messenger,
      }),
    ).toBeNull();
    expect(
      offChatLinkUrl({ target: target('<a href="#top">top</a>', 'a'), here: inChat, ...messenger }),
    ).toBeNull();
    expect(
      offChatLinkUrl({
        target: target('<a href="mailto:a@b.c">mail</a>', 'a'),
        here: inChat,
        ...messenger,
      }),
    ).toBeNull();
    expect(offChatLinkUrl({ target: null, here: inChat, ...messenger })).toBeNull();
  });

  // a chat-only site is all app: same-origin stays in, and the service URL's
  // own path cannot stand in for chatPaths — Discord's is /channels/@me, so
  // every other server's channel would read as off-chat and be thrown out
  it('does nothing for a service that declares no chatPaths', () => {
    const discord = { serviceUrl: 'https://discord.com/channels/@me', chatPaths: undefined };
    const here = 'https://discord.com/channels/@me';
    expect(
      offChatLinkUrl({
        target: target('<a href="/channels/123/456/789">jump</a>', 'a'),
        here,
        ...discord,
      }),
    ).toBeNull();
  });
});
