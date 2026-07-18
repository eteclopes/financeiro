/**
 * TutorialDriver — tutorial interativo com Driver.js
 * Item 7 do prompt: onboarding moderno com overlay, animações e progresso.
 *
 * - Inicia automaticamente no primeiro acesso (flag no localStorage).
 * - Pode ser re-executado pelo botão nas Configurações.
 * - Navega entre rotas automaticamente conforme o passo.
 * - Não bloqueia uso do app (botão "Pular" sempre disponível).
 */
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTutorialStore } from '../../store/tutorialStore';

const FIRST_ACCESS_KEY = 'financas-tutorial-done-v2';

const STEPS = [
  // ── DASHBOARD ──────────────────────────────────────────────────────────────
  {
    route: '/',
    element: '#sidebar-logo',
    popover: {
      title: '👋 Bem-vindo ao FinanceHub!',
      description: 'Este tutorial vai apresentar todas as funcionalidades em poucos minutos. Você pode pular a qualquer momento e rever pelo botão nas Configurações.',
    },
  },
  {
    route: '/',
    element: '#dashboard-saldo',
    popover: {
      title: '💰 Saldo Disponível',
      description: 'Seu saldo real — receitas menos despesas pagas. Atualizado instantaneamente a cada pagamento registrado.',
      side: 'bottom',
    },
  },
  {
    route: '/',
    element: '#month-switcher',
    popover: {
      title: '📅 Navegação por Mês',
      description: 'Troque de mês pelas setas ou pelo seletor. O sistema lembra exatamente onde você estava — nunca volta para a data do computador.',
      side: 'bottom',
    },
  },
  // ── RECEITAS ───────────────────────────────────────────────────────────────
  {
    route: '/incomes',
    element: 'body',
    popover: {
      title: '💵 Receitas',
      description: 'Registre todo dinheiro que entra: salário, freelances, bônus, rendimentos. As receitas constroem a base do seu saldo mensal.',
      side: 'right',
    },
  },
  // ── DESPESAS ───────────────────────────────────────────────────────────────
  {
    route: '/expenses',
    element: 'body',
    popover: {
      title: '📋 Despesas — 3 tipos',
      description: '<b>Prioridade</b>: dívidas e parcelamentos.<br><b>Fixas</b>: cobranças todo mês (internet, streaming…).<br><b>Variáveis</b>: gastos eventuais do dia a dia.',
      side: 'right',
    },
  },
  {
    route: '/expenses',
    element: 'body',
    popover: {
      title: '📌 Despesas Fixas + Cartão',
      description: 'Agora você pode vincular uma despesa fixa a um cartão de crédito. Ela vai para a fatura — não desconta do saldo enquanto a fatura não for paga!',
      side: 'right',
    },
  },
  {
    route: '/expenses',
    element: 'body',
    popover: {
      title: '🎯 Parcelas com ajuste automático',
      description: 'Pagou R$260 numa parcela de R$200? A próxima cai para R$140. Pagou R$150? A próxima vai para R$250. Tudo automático.',
      side: 'right',
    },
  },
  // ── BLOQUEIO DE SALDO ─────────────────────────────────────────────────────
  {
    route: '/expenses',
    element: 'body',
    popover: {
      title: '🛡️ Proteção de Saldo',
      description: 'O sistema nunca deixa o saldo ficar negativo. Se o pagamento for maior que o saldo disponível, ele é bloqueado e você é avisado com uma mensagem clara.',
      side: 'right',
    },
  },
  // ── CARTÕES ────────────────────────────────────────────────────────────────
  {
    route: '/cards',
    element: 'body',
    popover: {
      title: '💳 Cartões de Crédito',
      description: 'Cadastre seus cartões e acompanhe as faturas. Compras no cartão só saem do saldo quando a fatura for paga.',
      side: 'right',
    },
  },
  // ── ASSINATURAS ────────────────────────────────────────────────────────────
  {
    route: '/subscriptions',
    element: 'body',
    popover: {
      title: '🔄 Assinaturas',
      description: 'Netflix, Spotify, academia, planos de saúde… Cadastre uma vez e o sistema controla as cobranças recorrentes. Pode pausar ou cancelar quando quiser.',
      side: 'right',
    },
  },
  // ── RESERVA ────────────────────────────────────────────────────────────────
  {
    route: '/savings',
    element: 'body',
    popover: {
      title: '🏦 Reserva Financeira',
      description: 'Guarde para emergências. Escolha "Retirar do saldo" (desconta da conta) ou "Já guardado fora" (só registra). Veja o quanto saiu de cada origem.',
      side: 'right',
    },
  },
  // ── METAS ──────────────────────────────────────────────────────────────────
  {
    route: '/goals',
    element: 'body',
    popover: {
      title: '🎯 Metas',
      description: 'Defina objetivos financeiros: viagem, carro, imóvel. Acompanhe o progresso e veja quanto falta para cada meta.',
      side: 'right',
    },
  },
  // ── PLANEJAMENTO ───────────────────────────────────────────────────────────
  {
    route: '/planning',
    element: 'body',
    popover: {
      title: '📅 Planejamento Mensal',
      description: 'Defina orçamentos por categoria. O sistema alerta quando você se aproxima ou ultrapassa o limite definido.',
      side: 'right',
    },
  },
  // ── RELATÓRIOS ─────────────────────────────────────────────────────────────
  {
    route: '/reports',
    element: 'body',
    popover: {
      title: '📈 Relatórios',
      description: 'Gastos por categoria, evolução mensal, comparativos históricos e projeções. Identifique padrões e tome decisões mais inteligentes.',
      side: 'right',
    },
  },
  // ── CONFIGURAÇÕES ──────────────────────────────────────────────────────────
  {
    route: '/settings',
    element: 'body',
    popover: {
      title: '⚙️ Configurações & Perfil',
      description: 'Personalize o tema, gerencie categorias, configure alertas e exporte seus dados. O botão "Ver tutorial novamente" fica aqui para consultas futuras.',
      side: 'right',
    },
  },
  // ── FIM ────────────────────────────────────────────────────────────────────
  {
    route: '/',
    element: 'body',
    popover: {
      title: '✅ Tudo pronto!',
      description: 'Você está pronto para usar o FinanceHub! Comece adicionando uma receita e suas despesas do mês. Boa jornada financeira! 🚀',
      side: 'over',
    },
  },
];

export function TutorialDriver() {
  const { active, stop } = useTutorialStore();
  const navigate = useNavigate();
  const driverRef = useRef(null);

  useEffect(() => {
    if (!active) {
      driverRef.current?.destroy();
      driverRef.current = null;
      return;
    }
    startTutorial();
    return () => {
      driverRef.current?.destroy();
      driverRef.current = null;
    };
  }, [active]);

  async function startTutorial() {
    const [{ driver }, _css] = await Promise.all([
      import('driver.js'),
      import('driver.js/dist/driver.css'),
    ]);

    const steps = STEPS.map((s, i) => ({
      element: s.element,
      popover: {
        ...s.popover,
        description: s.popover.description,
        showButtons: ['next', 'previous', 'close'],
      },
    }));

    const drv = driver({
      showProgress: true,
      progressText: '{{current}} de {{total}}',
      nextBtnText: 'Próximo →',
      prevBtnText: '← Voltar',
      doneBtnText: '✓ Concluir',
      allowClose: true,
      overlayOpacity: 0.72,
      smoothScroll: true,
      stagePadding: 8,
      stageRadius: 12,
      popoverClass: 'driverjs-theme',
      steps,
      onHighlightStarted: async (element, step, opts) => {
        const idx = opts.state.activeIndex;
        const targetRoute = STEPS[idx]?.route;
        if (targetRoute && window.location.pathname !== targetRoute) {
          navigate(targetRoute);
          await new Promise((r) => setTimeout(r, 350));
        }
      },
      onDestroyStarted: () => {
        drv.destroy();
        stop();
        localStorage.setItem(FIRST_ACCESS_KEY, '1');
      },
    });

    drv.drive();
    driverRef.current = drv;
  }

  return null;
}

/** Inicia automaticamente no primeiro acesso */
export function useAutoTutorial() {
  const start = useTutorialStore((s) => s.start);
  useEffect(() => {
    const done = localStorage.getItem(FIRST_ACCESS_KEY);
    if (!done) {
      const t = setTimeout(start, 900);
      return () => clearTimeout(t);
    }
  }, [start]);
}
