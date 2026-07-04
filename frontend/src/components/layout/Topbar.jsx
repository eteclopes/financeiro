import { useUIStore } from '../../store/uiStore';
import { useMonthStore } from '../../store/monthStore';
import { useThemeStore } from '../../store/themeStore';
import { useAuthStore } from '../../store/authStore';
import { formatMonthLabel } from '../../lib/format';
import { Dropdown } from '../ui/Dropdown';
import { IconMenu, IconSearch, IconBell, IconSun, IconMoon, IconChevronL, IconChevronR } from '../icons';

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

  const month = getSelected();
  const idx   = months.findIndex((m) => String(m.id) === String(selectedId));

  return (
    <header className="sticky top-0 z-10 glass border-b border-border/60 dark:border-white/[0.06] h-16 flex items-center gap-3 px-4 sm:px-6">
      <button onClick={toggle} aria-label="Menu"
        className="h-9 w-9 flex items-center justify-center rounded-xl text-muted hover:text-slate-700 hover:bg-subtle dark:hover:bg-white/5 dark:hover:text-zinc-100 transition-all">
        <IconMenu size={19} />
      </button>

      <h1 className="font-semibold text-slate-900 dark:text-zinc-50 text-lg hidden sm:block truncate">{title}</h1>

      {/* Busca — visual apenas, sem alterar comportamento/navegação atual */}
      <div className="hidden md:flex items-center flex-1 max-w-xs ml-2">
        <div className="relative w-full">
          <IconSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Pesquisar..."
            className="w-full bg-subtle/70 dark:bg-white/5 border border-transparent focus:border-primary/40 rounded-xl pl-9 pr-3 py-2 text-sm
                       text-slate-700 dark:text-zinc-200 placeholder:text-muted outline-none transition-all duration-200 focus:ring-2 focus:ring-primary/15"
          />
        </div>
      </div>

      <div className="flex-1" />

      {month && (
        <div className="flex items-center gap-1 bg-subtle dark:bg-white/5 border border-border dark:border-white/10 rounded-xl px-2 py-1.5">
          <button onClick={() => goToAdjacent(-1)} disabled={idx <= 0}
            className="h-6 w-6 flex items-center justify-center rounded-lg text-muted hover:text-slate-700 hover:bg-white dark:hover:bg-white/10 dark:hover:text-zinc-100 disabled:opacity-30 transition-all">
            <IconChevronL size={14} />
          </button>

          <Dropdown variant="ghost" value={selectedId ?? ''} onChange={(e) => selectMonth(e.target.value)} className="max-w-[140px]">
            {months.map((m) => (
              <option key={m.id} value={m.id}>{formatMonthLabel(m)}</option>
            ))}
          </Dropdown>

          <button onClick={() => goToAdjacent(1)} disabled={idx >= months.length - 1}
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

      <button aria-label="Notificações"
        className="relative h-9 w-9 flex items-center justify-center rounded-xl text-muted hover:text-slate-700 hover:bg-subtle dark:hover:bg-white/5 dark:hover:text-zinc-100 transition-all">
        <IconBell size={18} />
        <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-danger" />
      </button>

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