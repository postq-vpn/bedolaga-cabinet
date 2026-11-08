import { create } from 'zustand';

/**
 * Which action owns the accent on the dashboard. While another action there is
 * the one to take (activate the trial, connect the first device), the top-up
 * buttons — the balance card and the phone header's balance widget — step down
 * to the soft style. The dashboard sets it; it resets when the dashboard leaves.
 */
interface DashboardAccentState {
  softTopUp: boolean;
  setSoftTopUp: (soft: boolean) => void;
}

export const useDashboardAccent = create<DashboardAccentState>((set) => ({
  softTopUp: false,
  setSoftTopUp: (softTopUp) => set({ softTopUp }),
}));
