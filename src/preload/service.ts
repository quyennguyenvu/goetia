import { ipcRenderer } from 'electron';
import type { ServiceId } from '../shared/types';
import { recipes } from './recipes';
import { startRecipe } from './recipes/runner';

const arg = process.argv.find((a) => a.startsWith('--goetia-service='));
const serviceId = (arg?.split('=')[1] ?? '') as ServiceId;
const recipe = recipes[serviceId];

// --- Notification interception -------------------------------------------
// Runs before page scripts (unisolated preload), so the page only ever sees
// this wrapper. Notifications surface as native OS notifications via main.

function forwardNotification(title: string, body: string): void {
  ipcRenderer.send('notification:fired', { serviceId, title, body });
}

class GoetiaNotification {
  static permission: NotificationPermission = 'granted';
  static requestPermission(): Promise<NotificationPermission> {
    return Promise.resolve('granted');
  }
  onclick: unknown = null;
  onshow: unknown = null;
  onerror: unknown = null;
  onclose: unknown = null;
  constructor(title: string, options?: NotificationOptions) {
    forwardNotification(title, typeof options?.body === 'string' ? options.body : '');
  }
  close(): void {}
  addEventListener(): void {}
  removeEventListener(): void {}
  dispatchEvent(): boolean {
    return false;
  }
}

// biome-ignore lint/suspicious/noExplicitAny: intentionally replacing a page global
(window as any).Notification = GoetiaNotification;

// --- Unread-count recipe ---------------------------------------------------

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
  );
});
