import { contextBridge, ipcRenderer } from 'electron';
import { R2M_CHANNELS, type RendererToMain } from '../shared/ipc';
import type { ShellState } from '../shared/types';

const allowed = new Set<string>(R2M_CHANNELS);

const api = {
  send<C extends keyof RendererToMain>(channel: C, payload: RendererToMain[C]): void {
    if (allowed.has(channel)) ipcRenderer.send(channel, payload);
  },
  onState(cb: (s: ShellState) => void): () => void {
    const listener = (_e: unknown, s: ShellState) => cb(s);
    ipcRenderer.on('shell:state', listener);
    return () => {
      ipcRenderer.removeListener('shell:state', listener);
    };
  },
};

contextBridge.exposeInMainWorld('goetia', api);
export type GoetiaApi = typeof api;
