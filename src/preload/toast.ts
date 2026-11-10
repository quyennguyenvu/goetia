import { contextBridge, ipcRenderer } from 'electron';
import type { MainToRenderer } from '../shared/ipc';

type Toast = MainToRenderer['toast:show'];
type Reply = 'enter' | 'leave' | 'dismiss' | 'reveal';

// main mints one port per toast, so a reply can only travel on the newest;
// the port stays on this side of the bridge
let port: MessagePort | null = null;
let latest: Toast | null = null;
let listener: ((t: Toast) => void) | null = null;

ipcRenderer.on('toast:show', (e, t: Toast) => {
  port?.close();
  port = e.ports[0] ?? null;
  latest = t;
  listener?.(t);
});

const api = {
  /** the page's one subscriber; a toast that beat it here is replayed */
  onToast(cb: (t: Toast) => void): void {
    listener = cb;
    if (latest) cb(latest);
  },
  reply(kind: Reply): void {
    port?.postMessage(kind);
  },
};

contextBridge.exposeInMainWorld('goetiaToast', api);
export type GoetiaToastApi = typeof api;
