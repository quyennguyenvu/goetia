import { create } from 'zustand';
import type { ShellState } from '../../shared/types';

interface ShellStore {
  state: ShellState | null;
  setState(s: ShellState): void;
  /** set when the user opens Settings expecting to land on Updates */
  focusSection: 'updates' | null;
  setFocusSection(s: 'updates' | null): void;
}

export const useShell = create<ShellStore>((set) => ({
  state: null,
  setState: (s) => set({ state: s }),
  focusSection: null,
  setFocusSection: (focusSection) => set({ focusSection }),
}));

export function connectShell(): () => void {
  return window.goetia.onState((s) => {
    document.documentElement.dataset.theme = s.theme;
    useShell.getState().setState(s);
  });
}
