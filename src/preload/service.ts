import { ipcRenderer } from 'electron';
import type { OpenLane, OpenRequest } from '../shared/ipc';
import { serviceById } from '../shared/services';
import type { ServiceId } from '../shared/types';
import { openConversationInPage } from './lib/conversation-open';
import { installNotificationShim } from './lib/notification-shim';
import { offChatLinkUrl } from './lib/off-chat-link';
import { installVisibilitySpoof } from './lib/visibility-spoof';
import { installWebAuthnShim } from './lib/webauthn-shim';
import { recipes } from './recipes';
import { startReadyPoll } from './recipes/ready';
import { startRecipe } from './recipes/runner';

const arg = process.argv.find((a) => a.startsWith('--goetia-service='));
const serviceId = (arg?.split('=')[1] ?? '') as ServiceId;
const recipe = recipes[serviceId];

/** A popup the view was allowed to open (a call guest, a sign-in dialog) can
 *  inherit this preload, and so can any subframe a chat site embeds (ads,
 *  widgets, embeds). Both are their own surface: no recipes, shims, keep-alive
 *  or IPC belong anywhere but the view's own top document — a subframe with the
 *  shim would get an unthrottled OS-banner and keep-alive-click primitive. */
const inSubcontext = window.opener !== null || window !== window.top;

/** How long a replayed banner onclick is given to push its route. */
const REPLAY_SETTLE_MS = 300;

if (!inSubcontext) {
  if (serviceById(serviceId).keepRendered) installVisibilitySpoof(window);

  // every service: passkeys are Goetia's own software authenticator in main;
  // the flag is off when main has no keyring to keep a key under
  installWebAuthnShim(window, {
    enabled: process.argv.includes('--goetia-webauthn=on'),
    bridge: {
      create: (options) => ipcRenderer.invoke('webauthn:create', { serviceId, options }),
      get: (options) => ipcRenderer.invoke('webauthn:get', { serviceId, options }),
    },
  });

  // --- Notification interception -----------------------------------------
  // Runs before page scripts (unisolated preload), so the page only ever sees
  // the shim. Notifications surface as native OS notifications via main.

  const shim = installNotificationShim(window, (title, body, clickId) =>
    ipcRenderer.send('notification:fired', { serviceId, title, body, synthetic: false, clickId }),
  );
  // banner, recents row or pin click on a live view: route to the thread
  // in-page, replay → recipe row click → anchor → full load, each lane
  // handing over only on a miss (see openConversationInPage). The answer
  // goes back on the port main sent along — which lane landed and where the
  // document is now — so main can log a miss and remember a landed URL.
  ipcRenderer.on('notification:openConversation', (e, req: OpenRequest) => {
    const port = e.ports[0];
    void openConversationInPage(document, req, {
      replay: (clickId) => shim.replayClick(clickId),
      byName: recipe?.openConversation?.bind(recipe),
      trustedClick: (pt) => ipcRenderer.send('service:trusted-click', { serviceId, ...pt }),
    })
      // a recipe opener that throws on a changed DOM is a miss, not silence
      .catch((): OpenLane => 'miss')
      .then(async (lane) => {
        // the replayed onclick routes through the SPA's own router; give it a
        // beat so the URL reported is the thread's, not the one before
        if (lane === 'replay') await new Promise((r) => setTimeout(r, REPLAY_SETTLE_MS));
        port?.postMessage({ lane, url: window.location.href });
        port?.close();
      });
  });

  // Chat only: a link out of the chat surface belongs in a browser, not in
  // this view. Capture phase and stopPropagation, so the site's own router
  // never sees the click — Messenger routes facebook.com/share/p/… in place,
  // and no host rule can refuse the service's own origin. Trusted clicks
  // only: a page-synthesized one gains nothing it cannot already do through
  // window.open, and this way our own row clicks can never be diverted.
  // on window, not document: capture runs window → document → target, so a
  // site listener on window would otherwise get to stopPropagation first
  window.addEventListener(
    'click',
    (e) => {
      if (!e.isTrusted || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // browser's own
      const url = offChatLinkUrl({
        target: e.target,
        here: window.location.href,
        serviceUrl: serviceById(serviceId).url,
        chatPaths: recipe?.chatPaths,
      });
      if (!url) return;
      e.preventDefault();
      e.stopPropagation();
      ipcRenderer.send('service:openExternal', { serviceId, url });
    },
    true,
  );

  // Main reads the open conversation's name through executeJavaScript at pin
  // time. Frozen and non-enumerable: the page cannot swap it, and all it
  // does is read the page's own DOM through the recipe.
  Object.defineProperty(window, '__goetia', {
    value: Object.freeze({
      conversation: (): string | null => recipe?.conversation?.(document) ?? null,
    }),
    enumerable: false,
    writable: false,
    configurable: false,
  });

  // --- Unread-count recipe -------------------------------------------------

  window.addEventListener('DOMContentLoaded', () => {
    if (!recipe) return;
    if (recipe.css) {
      const style = document.createElement('style');
      style.textContent = recipe.css;
      (document.head ?? document.documentElement).appendChild(style);
    }
    startRecipe(
      recipe,
      document,
      (c) => ipcRenderer.send('unread:update', { serviceId, ...c }),
      () => ipcRenderer.send('unread:stale', { serviceId }),
      (pt) => ipcRenderer.send('service:trusted-click', { serviceId, ...pt }),
      ({ title, body, href }) =>
        ipcRenderer.send('notification:fired', { serviceId, title, body, synthetic: true, href }),
      // chat only: page-initiated navigation, no IPC surface needed. No url =
      // snap back to the service URL; a url = the recipe's login page for a
      // logged-out shell (see Recipe.loginUrl).
      (url?: string) => window.location.assign(url ?? serviceById(serviceId).url),
    );
    startReadyPoll(recipe, document, () => ipcRenderer.send('service:ready', { serviceId }));
  });
}
