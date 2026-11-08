import { useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useAuthStore } from '@/store/auth';

/** Taps needed to open the admin panel, and the longest pause between them. */
export const ADMIN_TAPS = 5;
const TAP_GAP_MS = 1500;

/**
 * The admin panel has no visible entry: an admin opens it by tapping their
 * avatar five times in a row. For everyone else the taps do nothing — access
 * is still decided by the backend (`is_admin`) and guarded by AdminRoute.
 */
export function useSecretAdminTap() {
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const navigate = useNavigate();
  const taps = useRef({ count: 0, last: 0 });

  return useCallback(() => {
    if (!isAdmin) return;
    const now = Date.now();
    const state = taps.current;
    state.count = now - state.last > TAP_GAP_MS ? 1 : state.count + 1;
    state.last = now;
    if (state.count >= ADMIN_TAPS) {
      state.count = 0;
      navigate('/admin');
    }
  }, [isAdmin, navigate]);
}
