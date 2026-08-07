import { contextBridge, ipcRenderer } from 'electron';
import type { MainToRenderer } from '../shared/ipc';

type LoadingState = MainToRenderer['loading:state'];

const api = {
  onState(cb: (s: LoadingState) => void): void {
    ipcRenderer.on('loading:state', (_e, s: LoadingState) => cb(s));
  },
};

contextBridge.exposeInMainWorld('goetiaLoading', api);
export type GoetiaLoadingApi = typeof api;
