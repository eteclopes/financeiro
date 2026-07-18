/**
 * ProGate — componente de bloqueio de funcionalidade Pro.
 *
 * Uso:
 *   <ProGate feature="simuladores">
 *     <SimulatorPage />
 *   </ProGate>
 *
 *   <ProGate feature="cartões extras" inline>
 *     <Button>Adicionar cartão</Button>
 *   </ProGate>
 *
 * Quando inline=true: renderiza o filho com overlay de cadeado ao invés de
 * substituir toda a área por um card de upgrade.
 */
import { useIsPro, usePlanStore } from '../../store/planStore';
import { useState } from 'react';
import { UpgradeModal } from './UpgradeModal';

const FEATURE_DESCRIPTIONS = {
  simuladores:    'Simule compras, cenários "e se?" e tome decisões financeiras mais inteligentes.',
  'cartões extras': 'Cadastre quantos cartões quiser e acompanhe todas as faturas em um só lugar.',
  relatorios:     'Acesse relatórios avançados, tendências e análise comportamental completa.',
  historico:      'Visualize todo o histórico financeiro sem limitações de período.',
  metas:          'Crie metas ilimitadas e acompanhe seu progresso com gráficos detalhados.',
  assinaturas:    'Gerencie assinaturas recorrentes e monitore gastos automáticos.',
  default:        'Esta funcionalidade é exclusiva do Plano Pro.',
};

export function ProGate({ children, feature = 'default', inline = false }) {
  const isPro = useIsPro();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  if (isPro) return children;

  const description = FEATURE_DESCRIPTIONS[feature] ?? FEATURE_DESCRIPTIONS.default;

  if (inline) {
    return (
      <>
        <div className="relative" onClick={() => setUpgradeOpen(true)}>
          <div className="pointer-events-none select-none opacity-40 blur-[1px]">{children}</div>
          <div className="absolute inset-0 flex items-center justify-center cursor-pointer">
            <div className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
              🔒 Pro
            </div>
          </div>
        </div>
        <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} feature={feature} />
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center animate-fade-in">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-4xl shadow-xl mb-6">
          ⭐
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-zinc-50 mb-2">
          Funcionalidade Pro
        </h2>
        <p className="text-muted max-w-sm mb-8 leading-relaxed">{description}</p>

        <div className="flex flex-col sm:flex-row gap-3">
          <button onClick={() => setUpgradeOpen(true)}
            className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-2xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all">
            ⭐ Fazer Upgrade — Pro
          </button>
          <button onClick={() => window.history.back()}
            className="px-6 py-3 border border-border dark:border-white/10 text-muted rounded-2xl hover:bg-subtle dark:hover:bg-white/5 transition-colors">
            Voltar
          </button>
        </div>
      </div>
      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} feature={feature} />
    </>
  );
}
