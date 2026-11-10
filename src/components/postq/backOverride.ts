import { useEffect, useRef } from 'react';
import { create } from 'zustand';

/**
 * One «Назад» for the whole cabinet: the header's BackButton on the web and the
 * native button in Telegram. A screen with its own inner steps (the purchase
 * wizard, an open support ticket) doesn't draw a second back control — it hands
 * its step-back to this store, and both buttons call it instead of history.
 */
interface BackOverrideState {
  handler: (() => void) | null;
  set: (handler: (() => void) | null) => void;
}

export const useBackOverride = create<BackOverrideState>((set) => ({
  handler: null,
  set: (handler) => set({ handler }),
}));

/** While `enabled`, «Назад» runs `onBack` instead of leaving the page. */
export function useBackHandler(enabled: boolean, onBack: () => void): void {
  const ref = useRef(onBack);
  ref.current = onBack;
  const set = useBackOverride((s) => s.set);
  useEffect(() => {
    if (!enabled) return;
    const handler = () => ref.current();
    set(handler);
    return () => {
      // Only clear our own handler (another screen may have taken over).
      if (useBackOverride.getState().handler === handler) set(null);
    };
  }, [enabled, set]);
}
