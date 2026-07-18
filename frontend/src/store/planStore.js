import { create } from 'zustand';
import { api } from '../lib/api';

/**
 * Store global do plano do usuário.
 * Alimentado pelo bootstrap do authStore e pelo billingApi.
 *
 * isPro = true → acesso completo
 * isPro = false → limites do plano free aplicados no frontend
 * (o backend também valida — nunca confiar só no frontend)
 */
export const usePlanStore = create((set, get) => ({
  plan: 'free',
  isPro: false,
  planExpiresAt: null,
  cancelAtPeriodEnd: false,
  prices: { monthly: { amount: 19.90 }, annual: { amount: 179.00 } },
  loading: false,

  async fetchPlan() {
    set({ loading: true });
    try {
      const { data } = await api.get('/billing/plan');
      set({
        plan: data.plan,
        isPro: data.isPro,
        planExpiresAt: data.planExpiresAt,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd,
        prices: data.prices ?? get().prices,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  // Chamado pelo authStore após login/bootstrap
  syncFromUser(user) {
    if (!user) return;
    set({ plan: user.plan ?? 'free', isPro: user.isPro ?? false, planExpiresAt: user.planExpiresAt ?? null });
  },
}));

/** Hook de conveniência: retorna se o usuário é Pro */
export function useIsPro() {
  return usePlanStore((s) => s.isPro);
}
