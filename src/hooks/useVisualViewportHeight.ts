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

// ─── Predicting the keyboard ────────────────────────────────────────────────
// iOS reports the new visualViewport only once the keyboard has finished
// sliding in, so a layout that waits for it moves up a beat late. The keyboard
// height is remembered (per device, it barely changes) and used the moment a
// field is focused; the real value replaces it when it arrives.

const KB_KEY = 'rd-keyboard-height';
/** Below this the viewport hasn't shrunk for the keyboard yet. */
const MIN_KEYBOARD = 120;

let rememberedKeyboard: number | null = null;
function readRemembered(): number | null {
  if (rememberedKeyboard !== null) return rememberedKeyboard;
  try {
    const v = Number(localStorage.getItem(KB_KEY));
    if (v > MIN_KEYBOARD) rememberedKeyboard = v;
  } catch {
    // storage unavailable — the guess below covers it
  }
  return rememberedKeyboard;
}
function remember(height: number): void {
  if (Math.abs(height - (rememberedKeyboard ?? 0)) < 2) return;
  rememberedKeyboard = height;
  try {
    localStorage.setItem(KB_KEY, String(height));
  } catch {
    // fine: kept for this session only
  }
}

/**
 * Visible height while the on-screen keyboard is open — available at once on
 * focus (from the remembered keyboard height; first time ever, ~42% of the
 * screen, a typical phone keyboard with suggestions), then the measured one.
 * null when the keyboard is closed or there's no visualViewport.
 */
export function useKeyboardVisibleHeight(keyboardOpen: boolean): number | null {
  const visible = useVisualViewportHeight();
  if (!keyboardOpen || visible === null || typeof window === 'undefined') return null;
  const full = window.innerHeight;
  const keyboard = full - visible;
  if (keyboard > MIN_KEYBOARD) {
    remember(keyboard);
    return visible;
  }
  return full - (readRemembered() ?? Math.round(full * 0.42));
}
