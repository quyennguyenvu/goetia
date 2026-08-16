import { ipcRenderer } from 'electron';
import { serviceById } from '../shared/services';
import type { ServiceId } from '../shared/types';
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

  installNotificationShim(window, (title, body) =>
    ipcRenderer.send('notification:fired', { serviceId, title, body, synthetic: false }),
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
      ({ title, body }) =>
        ipcRenderer.send('notification:fired', { serviceId, title, body, synthetic: true }),
      // chat only: page-initiated navigation, no IPC surface needed
      () => window.location.assign(serviceById(serviceId).url),
    );
    startReadyPoll(recipe, document, () => ipcRenderer.send('service:ready', { serviceId }));
  });
}
