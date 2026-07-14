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

  // Recarrega só a LISTA de meses (ex.: depois de fechar um mês, que cria
  // o mês seguinte no banco) sem tocar em `selectedMonthId`. Existe
  // separado de `initialize()` de propósito: `initialize()` é para o
  // carregamento inicial do app, onde faz sentido apontar para "o mês de
  // hoje" (GET /months/current, resolvido pela data real do calendário) —
  // mas reusar `initialize()` depois de fechar um mês tinha um problema
  // sutil: ele definia `selectedMonthId` para "hoje" (que pode não ser o
  // mês recém-criado, ex.: se o usuário fecha um mês adiantado ou
  // atrasado em relação à data real) e SÓ DEPOIS disso o código corrigia
  // manualmente para o mês certo — funcionava, mas deixava uma janela onde
  // o estado global apontava, ainda que brevemente, para o mês errado.
  // Buscar a lista sem mexer no mês selecionado remove essa janela por
  // completo: quem fecha o mês decide o próximo `selectedMonthId`
  // diretamente (com `selectMonth`), sem passar por um valor errado antes.
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
}));
