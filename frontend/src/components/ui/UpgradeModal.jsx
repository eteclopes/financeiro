/**
 * UpgradeModal — modal de upgrade para Plano Pro.
 * Mostra preços, benefícios e botão de checkout.
 * Se o backend não tiver Stripe configurado, mostra instruções de contato.
 */
import { useState } from 'react';
import { usePlanStore } from '../../store/planStore';
import { api } from '../../lib/api';
import { formatCurrency } from '../../lib/format';

const BENEFITS_FREE = [
  { label: 'Controle de receitas e despesas', ok: true },
  { label: 'Até 2 cartões de crédito',        ok: true },
  { label: 'Reserva financeira',              ok: true },
  { label: 'Metas financeiras',               ok: true },
  { label: 'Assinaturas recorrentes',         ok: true },
  { label: 'Simuladores de compras',          ok: false },
  { label: 'Simulador "E Se?"',               ok: false },
  { label: 'Cartões ilimitados',              ok: false },
  { label: 'Relatórios avançados',            ok: false },
  { label: 'Análise comportamental',          ok: false },
  { label: 'Histórico completo',              ok: false },
];

export function UpgradeModal({ open, onClose }) {
  const prices    = usePlanStore((s) => s.prices);
  const [interval, setInterval] = useState('monthly');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);

  if (!open) return null;

  const price = prices[interval];
  const annualMonthly = prices.annual?.amount ? (prices.annual.amount / 12).toFixed(2) : null;

  async function handleCheckout() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post('/billing/checkout', { interval });
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else if (data.notConfigured) {
        setError('O sistema de pagamento ainda não foi configurado. Entre em contato com o suporte para fazer o upgrade.');
      }
    } catch {
      setError('Erro ao iniciar o checkout. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-panel-dark rounded-3xl shadow-modal border border-border dark:border-white/10 w-full max-w-lg overflow-hidden animate-scale-in">

        {/* Header gradiente */}
        <div className="bg-gradient-to-br from-amber-400 to-orange-500 p-6 text-white text-center">
          <div className="text-4xl mb-2">⭐</div>
          <h2 className="text-2xl font-bold">Plano Pro</h2>
          <p className="text-white/80 text-sm mt-1">Desbloqueie todo o potencial do FinançasPro</p>
        </div>

        <div className="p-6 space-y-5">
          {/* Seletor mensal / anual */}
          <div className="flex gap-2 bg-subtle dark:bg-white/[0.04] p-1 rounded-xl">
            {[
              { key:'monthly', label:'Mensal' },
              { key:'annual',  label:`Anual ${annualMonthly ? `— R$ ${annualMonthly}/mês` : ''}` },
            ].map(opt => (
              <button key={opt.key} onClick={() => setInterval(opt.key)}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${interval === opt.key ? 'bg-white dark:bg-white/10 text-amber-600 shadow-sm' : 'text-muted'}`}>
                {opt.label}
              </button>
            ))}
          </div>

          {/* Preço */}
          <div className="text-center">
            <p className="text-5xl font-bold text-slate-900 dark:text-zinc-50">
              {formatCurrency(price?.amount ?? 0)}
            </p>
            <p className="text-muted text-sm mt-1">{interval === 'monthly' ? 'por mês' : 'por ano'}</p>
            {interval === 'annual' && <p className="text-xs text-primary-dark font-medium mt-1">Economize ~25% em relação ao mensal</p>}
          </div>

          {/* Benefícios */}
          <ul className="space-y-2">
            {BENEFITS_FREE.map((b, i) => (
              <li key={i} className="flex items-center gap-2.5 text-sm">
                <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${b.ok ? 'bg-primary/10 text-primary-dark' : 'bg-amber-100 dark:bg-amber-500/10 text-amber-600'}`}>
                  {b.ok ? '✓' : '⭐'}
                </span>
                <span className={b.ok ? 'text-muted' : 'text-slate-800 dark:text-zinc-200 font-medium'}>{b.label}</span>
                {!b.ok && <span className="text-[10px] bg-amber-100 dark:bg-amber-500/10 text-amber-700 px-1.5 py-0.5 rounded-full font-bold ml-auto">PRO</span>}
              </li>
            ))}
          </ul>

          {error && <p className="text-xs text-danger bg-danger-subtle border border-danger/20 rounded-xl p-3">{error}</p>}

          <button onClick={handleCheckout} disabled={loading}
            className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-2xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0">
            {loading ? 'Aguarde...' : `✨ Assinar Plano Pro — ${formatCurrency(price?.amount ?? 0)}${interval === 'monthly' ? '/mês' : '/ano'}`}
          </button>

          <p className="text-center text-xs text-muted">Cancele a qualquer momento · Sem multas</p>
        </div>

        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors">✕</button>
      </div>
    </div>
  );
}
