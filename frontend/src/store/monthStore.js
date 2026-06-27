import { create } from 'zustand';
import { monthsApi } from '../lib/services';

export const useMonthStore = create((set, get) => ({
  months: [],
  selectedMonthId: null,
  status: 'idle',

  async initialize() {
    set({ status: 'loading' });
    try {
      const [current, list] = await Promise.all([monthsApi.current(), monthsApi.list()]);
      const chronological = [...(list.data.months ?? [])].sort((a, b) =>
        a.year === b.year ? a.month - b.month : a.year - b.year
      );
      set({ months: chronological, selectedMonthId: current.data.month.id, status: 'ready' });
    } catch {
      set({ status: 'error' });
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
}));
