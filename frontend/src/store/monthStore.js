import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { monthsApi } from '../lib/services';

/**
 * Store de mês com PERSISTÊNCIA LOCAL.
 *
 * CORREÇÃO DO BUG DE DATA:
 * Antes: initialize() sempre chamava GET /months/current que usava new Date()
 * no servidor, forçando o mês da data real do PC a cada reload.
 *
 * Agora:
 * 1. O selectedMonthId é persistido no localStorage.
 * 2. Ao inicializar, carregamos a lista de meses e usamos o ID persistido.
 * 3. Se não há ID persistido (primeiro acesso), usamos o último mês aberto
 *    retornado pela API (que agora retorna o mais recente, não o do calendário).
 * 4. A data do PC nunca mais interfere na seleção do mês.
 */
export const useMonthStore = create(
  persist(
    (set, get) => ({
      months: [],
      selectedMonthId: null,
      status: 'idle',

      async initialize() {
        set({ status: 'loading' });
        try {
          // Carrega lista de meses E o "mês atual" do servidor (último aberto)
          const [current, list] = await Promise.all([
            monthsApi.current(),
            monthsApi.list(),
          ]);

          const chronological = [...(list.data.months ?? [])].sort((a, b) =>
            a.year === b.year ? a.month - b.month : a.year - b.year
          );

          const { selectedMonthId: persistedId } = get();

          // Se há um ID persistido e ele existe na lista, mantemos ele.
          // Caso contrário (primeiro acesso ou mês deletado), usamos o atual da API.
          const persistedExists = persistedId &&
            chronological.some((m) => String(m.id) === String(persistedId));

          const resolvedId = persistedExists
            ? persistedId
            : current.data.month.id;

          set({ months: chronological, selectedMonthId: resolvedId, status: 'ready' });
        } catch {
          set({ status: 'error' });
        }
      },

      // Recarrega só a LISTA sem tocar em selectedMonthId
      async refreshMonths() {
        try {
          const list = await monthsApi.list();
          const chronological = [...(list.data.months ?? [])].sort((a, b) =>
            a.year === b.year ? a.month - b.month : a.year - b.year
          );
          set({ months: chronological });
          return chronological;
        } catch {
          return get().months;
        }
      },

      selectMonth(monthId) { set({ selectedMonthId: monthId }); },

      goToAdjacent(direction) {
        const { months, selectedMonthId } = get();
        const index = months.findIndex((m) => String(m.id) === String(selectedMonthId));
        const next = index + direction;
        if (next < 0 || next >= months.length) return;
        set({ selectedMonthId: months[next].id });
      },

      getSelectedMonth() {
        const { months, selectedMonthId } = get();
        return months.find((m) => String(m.id) === String(selectedMonthId)) ?? null;
      },
    }),
    {
      name: 'financas-month-store',
      partialState: (state) => ({ selectedMonthId: state.selectedMonthId }),
    }
  )
);
