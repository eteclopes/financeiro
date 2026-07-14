import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../../store/uiStore';
import { useMonthStore } from '../../store/monthStore';
import { useThemeStore } from '../../store/themeStore';
import { useAuthStore } from '../../store/authStore';
import { formatMonthLabel } from '../../lib/format';
import { alertsApi, searchApi } from '../../lib/services';
import { Dropdown } from '../ui/Dropdown';
import {
  IconMenu, IconSearch, IconBell, IconSun, IconMoon, IconChevronL, IconChevronR,
  IconScale, IconIncome, IconExpense, IconCard, IconGoal,
} from '../icons';

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_TYPE_ICON = { expense: IconExpense, income: IconIncome, debt: IconScale, card: IconCard, goal: IconGoal };
const SEARCH_TYPE_LABEL = { expense: 'Despesa', income: 'Receita', debt: 'Dívida', card: 'Cartão', goal: 'Meta' };
const SEVERITY_DOT = { critical: 'bg-danger', warning: 'bg-warning', info: 'bg-info' };

export function Topbar({ title }) {
  const toggle    = useUIStore((s) => s.toggleSidebar);
  const months    = useMonthStore((s) => s.months);
  const selectedId = useMonthStore((s) => s.selectedMonthId);
  const selectMonth = useMonthStore((s) => s.selectMonth);
  const getSelected = useMonthStore((s) => s.getSelectedMonth);
  const goToAdjacent = useMonthStore((s) => s.goToAdjacent);
  const theme     = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const user      = useAuthStore((s) => s.user);
  const navigate  = useNavigate();

  const month = getSelected();
  const idx   = months.findIndex((m) => String(m.id) === String(selectedId));

  // ---------- Notificações (sino) ----------
  const [alerts, setAlerts] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef(null);

  const loadAlerts = useCallback(async () => {
    if (!selectedId) return;
    try {
      const { data } = await alertsApi.list(selectedId);
      setAlerts(data.alerts ?? []);
    } catch {
      // Sino não é o lugar de mostrar erro de rede — falha silenciosamente
      // e mantém o que já tinha; a Central de Alertas (/insights) já avisa
      // se algo der errado ao carregar de propósito, com toast.
    }
  }, [selectedId]);

  // Recarrega ao trocar de mês e também a cada 60s — alertas dependem de
  // dados que mudam sem o usuário mexer no mês (ex.: uma conta que estava
  // a "5 dias" de vencer passa a "4 dias" com o simples passar do tempo).
  useEffect(() => {
    loadAlerts();
    const interval = setInterval(loadAlerts, 60_000);
    return () => clearInterval(interval);
  }, [loadAlerts]);

  const activeAlerts = alerts.filter((a) => !a.resolvedAt);

  // ---------- Busca global ----------
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setSearchLoading(false); return; }
    setSearchLoading(true);
    // Debounce simples: só busca 300ms depois de parar de digitar. `active`
    // evita aplicar uma resposta que chegou depois de uma busca mais nova
    // (o usuário já apagou/trocou o termo enquanto a requisição voltava).
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const { data } = await searchApi.run(q);
        if (active) setResults(data.results ?? []);
      } catch {
        if (active) setResults([]);
      } finally {
        if (active) setSearchLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => { active = false; clearTimeout(timer); };
  }, [query]);

  function pickResult(r) {
    if (r.monthId) selectMonth(r.monthId);
    navigate(r.tab ? `${r.route}?tab=${r.tab}` : r.route);
    setQuery('');
    setResults([]);
    setSearchOpen(false);
  }

  // Fecha os dois dropdowns ao clicar fora ou apertar Esc — mesmo padrão
  // de interação já usado no componente Dropdown (components/ui/Dropdown.jsx).
  useEffect(() => {
    function handleOutside(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false);
    }
    function handleKey(e) {
      if (e.key === 'Escape') { setNotifOpen(false); setSearchOpen(false); }
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  return (
    <header className="sticky top-0 z-10 glass border-b border-border/60 dark:border-white/[0.06] h-16 flex items-center gap-3 px-4 sm:px-6">
      <button onClick={toggle} aria-label="Menu"
        className="h-9 w-9 flex items-center justify-center rounded-xl text-muted hover:text-slate-700 hover:bg-subtle dark:hover:bg-white/5 dark:hover:text-zinc-100 transition-all">
        <IconMenu size={19} />
      </button>

      <h1 className="font-semibold text-slate-900 dark:text-zinc-50 text-lg hidden sm:block truncate">{title}</h1>

      {/* Busca global — despesas, receitas, dívidas, cartões e metas */}
      <div ref={searchRef} className="hidden md:flex items-center flex-1 max-w-xs ml-2 relative">
        <div className="relative w-full">
          <IconSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <label htmlFor="topbar-search" className="sr-only">Pesquisar</label>
          <input
            id="topbar-search"
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            placeholder="Pesquisar..."
            autoComplete="off"
            className="w-full bg-subtle/70 dark:bg-white/5 border border-transparent focus:border-primary/40 rounded-xl pl-9 pr-3 py-2 text-sm
                       text-slate-700 dark:text-zinc-200 placeholder:text-muted outline-none transition-all duration-200 focus:ring-2 focus:ring-primary/15"
          />
        </div>

        {searchOpen && query.trim().length >= 2 && (
          <div className="absolute top-full left-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-xl border border-border dark:border-white/10
                          bg-white dark:bg-panel-dark shadow-modal py-1.5 z-[100] animate-scale-in origin-top">
            {searchLoading && results.length === 0 ? (
              <p className="px-3.5 py-4 text-sm text-muted text-center">Buscando...</p>
            ) : results.length === 0 ? (
              <p className="px-3.5 py-4 text-sm text-muted text-center">Nada encontrado para "{query.trim()}".</p>
            ) : (
              results.map((r) => {
                const Icon = SEARCH_TYPE_ICON[r.type] ?? IconSearch;
                return (
                  <button
                    key={`${r.type}-${r.id}`}
                    onClick={() => pickResult(r)}
                    className="w-full flex items-start gap-2.5 px-3.5 py-2.5 text-left hover:bg-subtle dark:hover:bg-white/5 transition-colors"
                  >
                    <Icon size={15} className="text-muted mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-slate-800 dark:text-zinc-200 truncate">{r.label}</span>
                        <span className="text-[10px] uppercase tracking-wide text-muted shrink-0">{SEARCH_TYPE_LABEL[r.type]}</span>
                      </div>
                      <p className="text-xs text-muted truncate">{r.subtitle}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      <div className="flex-1" />

      {month && (
        <div className="flex items-center gap-1 bg-subtle dark:bg-white/5 border border-border dark:border-white/10 rounded-xl px-2 py-1.5">
          <button onClick={() => goToAdjacent(-1)} disabled={idx <= 0} aria-label="Mês anterior"
            className="h-6 w-6 flex items-center justify-center rounded-lg text-muted hover:text-slate-700 hover:bg-white dark:hover:bg-white/10 dark:hover:text-zinc-100 disabled:opacity-30 transition-all">
            <IconChevronL size={14} />
          </button>

          <Dropdown variant="ghost" value={selectedId ?? ''} onChange={(e) => selectMonth(e.target.value)} className="max-w-[140px]">
            {months.map((m) => (
              <option key={m.id} value={m.id}>{formatMonthLabel(m)}</option>
            ))}
          </Dropdown>

          <button onClick={() => goToAdjacent(1)} disabled={idx >= months.length - 1} aria-label="Próximo mês"
            className="h-6 w-6 flex items-center justify-center rounded-lg text-muted hover:text-slate-700 hover:bg-white dark:hover:bg-white/10 dark:hover:text-zinc-100 disabled:opacity-30 transition-all">
            <IconChevronR size={14} />
          </button>

          {month.status === 'closed' && (
            <span className="ml-1 text-[10px] bg-slate-100 dark:bg-white/10 text-muted px-2 py-0.5 rounded-full font-medium">
              encerrado
            </span>
          )}
        </div>
      )}

      <div ref={notifRef} className="relative">
        <button
          aria-label="Notificações"
          onClick={() => setNotifOpen((o) => !o)}
          className="relative h-9 w-9 flex items-center justify-center rounded-xl text-muted hover:text-slate-700 hover:bg-subtle dark:hover:bg-white/5 dark:hover:text-zinc-100 transition-all"
        >
          <IconBell size={18} />
          {activeAlerts.length > 0 && (
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-danger ring-2 ring-white dark:ring-panel-dark" />
          )}
        </button>

        {notifOpen && (
          <div className="absolute top-full right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-xl border border-border dark:border-white/10
                          bg-white dark:bg-panel-dark shadow-modal py-1.5 z-[100] animate-scale-in origin-top-right">
            <div className="px-3.5 py-2 border-b border-border dark:border-white/10">
              <p className="text-sm font-semibold text-slate-900 dark:text-zinc-50">Notificações</p>
            </div>
            {activeAlerts.length === 0 ? (
              <p className="px-3.5 py-6 text-sm text-muted text-center">Tudo certo por aqui — nenhum alerta ativo.</p>
            ) : (
              activeAlerts.slice(0, 6).map((a) => (
                <div key={a.id} className="flex items-start gap-2.5 px-3.5 py-2.5 border-b border-border/60 dark:border-white/[0.06] last:border-0">
                  <span className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${SEVERITY_DOT[a.severity] ?? 'bg-info'}`} />
                  <p className="text-sm text-slate-700 dark:text-zinc-300 leading-snug">{a.message}</p>
                </div>
              ))
            )}
            <button
              onClick={() => { setNotifOpen(false); navigate('/insights'); }}
              className="w-full text-center text-sm font-medium text-primary-dark dark:text-primary-light py-2.5 hover:bg-subtle dark:hover:bg-white/5 transition-colors"
            >
              Ver central de alertas
            </button>
          </div>
        )}
      </div>

      <button onClick={toggleTheme} aria-label="Alternar tema"
        className="h-9 w-9 flex items-center justify-center rounded-xl text-muted hover:text-slate-700 hover:bg-subtle dark:hover:bg-white/5 dark:hover:text-zinc-100 transition-all duration-300">
        <span className="transition-transform duration-300" style={{ transform: theme === 'dark' ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          {theme === 'dark' ? <IconMoon size={17} /> : <IconSun size={17} />}
        </span>
      </button>

      <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-border dark:border-white/10">
        <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary to-info flex items-center justify-center text-white font-semibold text-xs shrink-0">
          {user?.name?.[0]?.toUpperCase() ?? 'U'}
        </div>
        <span className="text-sm font-medium text-slate-700 dark:text-zinc-200 max-w-[120px] truncate">{user?.name}</span>
      </div>
    </header>
  );
}
