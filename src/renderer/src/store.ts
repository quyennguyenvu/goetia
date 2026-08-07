import { create } from 'zustand';
import type { ShellState } from '../../shared/types';

interface ShellStore {
  state: ShellState | null;
  setState(s: ShellState): void;
}

export const useShell = create<ShellStore>((set) => ({
  state: null,
  setState: (s) => set({ state: s }),
}));

export function connectShell(): () => void {
  return window.goetia.onState((s) => {
    document.documentElement.dataset.theme = s.theme;
    useShell.getState().setState(s);
  });
}
