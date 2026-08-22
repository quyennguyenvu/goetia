import { contextBridge, ipcRenderer } from 'electron';
import {
  INVOKE_CHANNELS,
  R2M_CHANNELS,
  type RendererInvoke,
  type RendererToMain,
} from '../shared/ipc';
import type { ShellState } from '../shared/types';

const allowed = new Set<string>(R2M_CHANNELS);
const invokable = new Set<string>(INVOKE_CHANNELS);

const api = {
  /** A static process fact, so it is exposed once rather than carried in every
   *  state broadcast. The shell needs it to skip work only Windows consumes. */
  platform: process.platform as string,
  send<C extends keyof RendererToMain>(channel: C, payload: RendererToMain[C]): void {
    if (allowed.has(channel)) ipcRenderer.send(channel, payload);
  },
  invoke<C extends keyof RendererInvoke>(channel: C): Promise<RendererInvoke[C]['result']> {
    if (!invokable.has(channel)) return Promise.reject(new Error(`blocked channel: ${channel}`));
    return ipcRenderer.invoke(channel) as Promise<RendererInvoke[C]['result']>;
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
