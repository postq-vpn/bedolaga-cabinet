import { create } from 'zustand';
import { useAuthStore } from '@/store/auth';

/**
 * The postq redesign is behind a switch while it's being rolled out.
 *
 * - An admin turns it on in the admin panel («Новый дизайн кабинета»). The
 *   choice is stored in this browser only (localStorage), there is no backend
 *   setting for it yet.
 * - It shows only to admins: a signed-in non-admin always gets the current
 *   design even on a browser where the switch is on. The login page has no
 *   user yet, so there the switch alone decides (it's on only in browsers where
 *   an admin turned it on).
 *
 * Every redesigned module is split into `X.postq.tsx` (new) and
 * `X.legacy.tsx` (upstream), and `X.tsx` picks one with `usePostqDesign()`.
 * The postq stylesheet is scoped to `html.postq` (see PostqDesignClass).
 */

const STORAGE_KEY = 'postq-design';

function readFlag(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

interface PostqDesignState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

export const usePostqDesignStore = create<PostqDesignState>((set) => ({
  enabled: readFlag(),
  setEnabled: (enabled) => {
    try {
      if (enabled) localStorage.setItem(STORAGE_KEY, '1');
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage unavailable: the switch lasts until reload.
    }
    set({ enabled });
  },
}));

/**
 * Forces one design regardless of the switch. The test setup sets it to true
 * (the suite covers the redesign); a test can set it to false for upstream.
 */
declare global {
  var __POSTQ_DESIGN_OVERRIDE__: boolean | undefined;
}

/**
 * After a reload the session is restored before the server confirms the admin
 * role, and for that moment the old design flashed. The last confirmed answer
 * is kept here and used until the new one arrives.
 */
const ADMIN_HINT_KEY = 'postq-design-admin';
let adminHint = false;
try {
  adminHint = localStorage.getItem(ADMIN_HINT_KEY) === '1';
} catch {
  // Storage unavailable: no hint, the old behaviour.
}
// Optional call: unit tests often mock the auth store as a bare selector.
useAuthStore.subscribe?.((st) => {
  if (!st.adminChecked || st.isAdmin === adminHint) return;
  adminHint = st.isAdmin;
  try {
    if (st.isAdmin) localStorage.setItem(ADMIN_HINT_KEY, '1');
    else localStorage.removeItem(ADMIN_HINT_KEY);
  } catch {
    // ignore
  }
});

function decide(
  enabled: boolean,
  isAuthenticated: boolean,
  isAdmin: boolean,
  adminChecked: boolean,
): boolean {
  const override = globalThis.__POSTQ_DESIGN_OVERRIDE__;
  if (override !== undefined) return override;
  const admin = adminChecked ? isAdmin : isAdmin || adminHint;
  return enabled && (admin || !isAuthenticated);
}

/** Whether the redesign is shown right now (reactive). */
export function usePostqDesign(): boolean {
  const enabled = usePostqDesignStore((s) => s.enabled);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const adminChecked = useAuthStore((s) => s.adminChecked);
  return decide(enabled, isAuthenticated, isAdmin, adminChecked);
}

/** Same, outside React (plain functions, adapters). */
export function isPostqDesign(): boolean {
  const override = globalThis.__POSTQ_DESIGN_OVERRIDE__;
  if (override !== undefined) return override;
  const { isAuthenticated, isAdmin, adminChecked } = useAuthStore.getState();
  return decide(usePostqDesignStore.getState().enabled, isAuthenticated, isAdmin, adminChecked);
}
