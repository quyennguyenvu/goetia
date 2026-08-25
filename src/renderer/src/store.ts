import { create } from 'zustand';
import type { ServiceId, ShellState } from '../../shared/types';

/** What PurgeConfirm is asking about: one service, or the whole sweep. */
export type PurgeRequest =
  | { kind: 'one'; id: ServiceId; name: string }
  | { kind: 'all'; count: number };

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
  /** the purge sweep's one-shot acknowledgement — set by Welcome from the
   *  invoke result, rendered by PurgeToast. Renderer-local on purpose: a
   *  one-shot event has no business in every later ShellState broadcast. */
  purgeToast: string | null;
  setPurgeToast(message: string | null): void;
  /** the open purge confirm, or null. Renderer-local: main is handed an
   *  already-confirmed decision, never the question. */
  purgeConfirm: PurgeRequest | null;
  setPurgeConfirm(request: PurgeRequest | null): void;
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
  purgeToast: null,
  setPurgeToast: (purgeToast) => set({ purgeToast }),
  purgeConfirm: null,
  setPurgeConfirm: (purgeConfirm) => set({ purgeConfirm }),
}));

export function connectShell(): () => void {
  return window.goetia.onState((s) => {
    document.documentElement.dataset.theme = s.theme;
    useShell.getState().setState(s);
  });
}
