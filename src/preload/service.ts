import { ipcRenderer } from 'electron';
import { serviceById } from '../shared/services';
import type { ServiceId } from '../shared/types';
import { openConversationInPage } from './lib/conversation-open';
import { installNotificationShim } from './lib/notification-shim';
import { installVisibilitySpoof } from './lib/visibility-spoof';
import { installWebAuthnShim } from './lib/webauthn-shim';
import { recipes } from './recipes';
import { startReadyPoll } from './recipes/ready';
import { startRecipe } from './recipes/runner';

const arg = process.argv.find((a) => a.startsWith('--goetia-service='));
const serviceId = (arg?.split('=')[1] ?? '') as ServiceId;
const recipe = recipes[serviceId];

/** A call popup (window.open allowed by call-policy) can inherit this preload.
 *  The popup IS the call surface: no recipes, shims, or keep-alive belong here. */
const inCallPopup = window.opener !== null;

if (!inCallPopup) {
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
  // banner click, lane A: main asks the page to run its own onclick
  ipcRenderer.on('notification:replayClick', (_e, payload: { clickId: number }) =>
    shim.replayClick(payload.clickId),
  );
  // banner or pin click, lane B on a live view: route to the thread in-page.
  // A pin from a URL-less site (WhatsApp, Zalo) carries the conversation's
  // name instead, which the recipe's openConversation turns into a row click
  // — or, where the site ignores synthetic clicks, a point main clicks.
  ipcRenderer.on(
    'notification:openConversation',
    (_e, payload: { href: string; url: string; conversation?: string }) =>
      openConversationInPage(document, payload.href, payload.url, {
        conversation: payload.conversation,
        byName: recipe?.openConversation?.bind(recipe),
        trustedClick: (pt) => ipcRenderer.send('service:trusted-click', { serviceId, ...pt }),
      }),
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
