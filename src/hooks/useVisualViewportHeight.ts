import { useSyncExternalStore } from 'react';

/**
 * Height of the part of the screen that is actually visible (above the
 * on-screen keyboard), in px; null where the browser has no visualViewport.
 *
 * In the Telegram WebView on iOS (and Safari) the keyboard doesn't shrink
 * `100dvh` — it slides over the page, so anything sized to the screen ends up
 * under it. visualViewport is the one value that follows the keyboard.
 */
function subscribe(listener: () => void): () => void {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  if (!vv) return () => {};
  vv.addEventListener('resize', listener);
  return () => vv.removeEventListener('resize', listener);
}

const getSnapshot = (): number | null =>
  typeof window !== 'undefined' && window.visualViewport
    ? Math.round(window.visualViewport.height)
    : null;

const getServerSnapshot = (): number | null => null;

export function useVisualViewportHeight(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// ─── The keyboard, as the screen actually shows it ──────────────────────────
// Focus is not a keyboard signal on iOS: the keyboard can be swiped away while
// the field keeps focus. Only a visualViewport that really shrank says the
// keyboard is up. (Guessing its height on focus to beat iOS's late resize
// event was tried and misplaced the chat — don't.)

/** Below this the viewport hasn't shrunk for a keyboard. */
const MIN_KEYBOARD = 120;

/**
 * Visible height above the on-screen keyboard while it's actually open;
 * null when it's closed (even with a focused field) or there's no visualViewport.
 */
export function useKeyboardVisibleHeight(enabled: boolean): number | null {
  const visible = useVisualViewportHeight();
  if (!enabled || visible === null || typeof window === 'undefined') return null;
  return window.innerHeight - visible > MIN_KEYBOARD ? visible : null;
}
