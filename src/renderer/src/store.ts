import { create } from 'zustand';
import type { ShellState } from '../../shared/types';

interface ShellStore {
  state: ShellState | null;
  setState(s: ShellState): void;
  /** set when the user opens Settings expecting to land on Updates */
  focusSection: 'updates' | null;
  setFocusSection(s: 'updates' | null): void;
  /** Home board's staged edit differs from the live summoned order —
   *  published by Welcome, read by the rail at drag end */
  homeDirty: boolean;
  setHomeDirty(dirty: boolean): void;
  /** bumped when another surface (the rail prompt) discards the board's
   *  staged edit; Welcome reseeds when it changes */
  homeDiscardTick: number;
  discardHomeDraft(): void;
}

export const useShell = create<ShellStore>((set) => ({
  state: null,
  setState: (s) => set({ state: s }),
  focusSection: null,
  setFocusSection: (focusSection) => set({ focusSection }),
  homeDirty: false,
  setHomeDirty: (homeDirty) => set({ homeDirty }),
  homeDiscardTick: 0,
  discardHomeDraft: () => set((s) => ({ homeDiscardTick: s.homeDiscardTick + 1 })),
}));

export function connectShell(): () => void {
  return window.goetia.onState((s) => {
    document.documentElement.dataset.theme = s.theme;
    useShell.getState().setState(s);
  });
}
