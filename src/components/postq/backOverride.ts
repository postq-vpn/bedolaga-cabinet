import { useEffect, useRef } from 'react';
import { create } from 'zustand';

/**
 * One «Назад» for the whole cabinet: the header's BackButton on the web and the
 * native button in Telegram. A screen with its own inner steps (the purchase
 * wizard, an open support ticket, a photo opened over the chat) doesn't draw a
 * second back control — it hands its step-back to this store, and both buttons
 * call it instead of history.
 *
 * Handlers stack: a photo viewer opened over a ticket takes «Назад» while it's
 * open, and the ticket's own step-back is back in charge once it closes.
 */
type Handler = () => void;

interface BackOverrideState {
  stack: Handler[];
  /** The handler «Назад» runs now (the top of the stack), or null. */
  handler: Handler | null;
  push: (handler: Handler) => void;
  remove: (handler: Handler) => void;
}

export const useBackOverride = create<BackOverrideState>((set) => ({
  stack: [],
  handler: null,
  push: (handler) =>
    set((s) => {
      const stack = [...s.stack, handler];
      return { stack, handler };
    }),
  remove: (handler) =>
    set((s) => {
      const stack = s.stack.filter((h) => h !== handler);
      return { stack, handler: stack[stack.length - 1] ?? null };
    }),
}));

/** While `enabled`, «Назад» runs `onBack` instead of leaving the page. */
export function useBackHandler(enabled: boolean, onBack: () => void): void {
  const ref = useRef(onBack);
  ref.current = onBack;
  const push = useBackOverride((s) => s.push);
  const remove = useBackOverride((s) => s.remove);
  useEffect(() => {
    if (!enabled) return;
    const handler = () => ref.current();
    push(handler);
    return () => remove(handler);
  }, [enabled, push, remove]);
}
