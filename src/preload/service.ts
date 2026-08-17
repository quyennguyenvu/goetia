import { ipcRenderer } from 'electron';
import { serviceById } from '../shared/services';
import type { ServiceId } from '../shared/types';
import { openConversationInPage } from './lib/conversation-open';
import { installNotificationShim } from './lib/notification-shim';
import { installVisibilitySpoof } from './lib/visibility-spoof';
import { installWebAuthnBlock } from './lib/webauthn-block';
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

  // every service: Electron can't complete a passkey, so no page may offer one
  installWebAuthnBlock(window);

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
  // banner click, lane B on a live view: route to the thread in-page
  ipcRenderer.on('notification:openConversation', (_e, payload: { href: string; url: string }) =>
    openConversationInPage(document, payload.href, payload.url),
  );

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
      (pt) => ipcRenderer.send('service:keepalive-click', { serviceId, ...pt }),
      ({ title, body, href }) =>
        ipcRenderer.send('notification:fired', { serviceId, title, body, synthetic: true, href }),
      // chat only: page-initiated navigation, no IPC surface needed
      () => window.location.assign(serviceById(serviceId).url),
    );
    startReadyPoll(recipe, document, () => ipcRenderer.send('service:ready', { serviceId }));
  });
}
