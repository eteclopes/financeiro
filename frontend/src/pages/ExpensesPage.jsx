import { useState, useEffect, useCallback } from 'react';
import { useMonthStore } from '../store/monthStore';
import { expensesApi, debtsApi, categoriesApi, cardsApi, subscriptionsApi } from '../lib/services';
import { extractErrorMessage } from '../lib/api';
import { formatCurrency, formatShortDate } from '../lib/format';
import { Card, Badge, Button, EmptyState, Skeleton, TabGroup } from '../components/ui/index';
import { Modal, ConfirmDialog, FormGroup, Input, Select } from '../components/ui/Modal';
import { CategorySelect } from '../components/ui/CategorySelect';
import { useUIStore } from '../store/uiStore';

const PM_LABELS  = { cash:'Dinheiro', pix:'PIX', debit:'Débito', credit:'Cartão de Crédito', transfer:'Transferência' };
const STATUS_V   = { pending:'warning', partial:'info', paid:'success', late:'danger', settled:'success' };
const STATUS_L   = { pending:'Pendente', partial:'Parcial', paid:'Pago', late:'Atrasado', settled:'Quitado' };
const SUB_STATUS = { active:'success', paused:'warning', cancelled:'danger' };
const SUB_LABEL  = { active:'Ativa', paused:'Pausada', cancelled:'Cancelada' };
const PERIOD_L   = { monthly:'Mensal', annual:'Anual', custom:'Personalizado' };

function todayStr() { return new Date().toISOString().slice(0, 10); }

export default function ExpensesPage() {
  const selectedMonthId = useMonthStore((s) => s.selectedMonthId);

  // ── sub-aba dentro de "Fixas": 'expenses' | 'subscriptions'
  const [tab, setTab]         = useState('priority');
  const [fixedSubTab, setFixedSubTab] = useState('expenses'); // sub-aba da aba Fixas

  const [expenses,      setExpenses]      = useState([]);
  const [debts,         setDebts]         = useState([]);
  const [categories,    setCategories]    = useState([]);
  const [cards,         setCards]         = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const toast = useUIStore((s) => s);

  // ── Pagamento ──
  const [payModal,   setPayModal]   = useState(null);
  const [payAmount,  setPayAmount]  = useState('');
  const [payMethod,  setPayMethod]  = useState('pix');
  const [paying,     setPaying]     = useState(false);

  // ── Nova / editar despesa variável ──
  const [varModal,     setVarModal]     = useState(false);
  const [varForm,      setVarForm]      = useState({ description:'', value:'', categoryId:'', date: todayStr(), paymentMethod:'pix', paid:true });
  const [editVarModal, setEditVarModal] = useState(null);
  const [editVarForm,  setEditVarForm]  = useState({ description:'', value:'', categoryId:'', dueDate:'', observation:'' });

  // ── Nova / editar despesa fixa ──
  const [fixModal,     setFixModal]     = useState(false);
  const [fixForm,      setFixForm]      = useState({ description:'', value:'', categoryId:'', dueDay:'10', paymentMethod:'pix', cardId:'' });
  const [editFixModal, setEditFixModal] = useState(null);
  const [editFixForm,  setEditFixForm]  = useState({ description:'', value:'', dueDay:'', paymentMethod:'pix', cardId:'' });

  // ── Nova / editar dívida ──
  const [debtModal,     setDebtModal]     = useState(false);
  const [debtForm,      setDebtForm]      = useState({ description:'', categoryId:'', totalValue:'', installmentsCount:'1', flexiblePayment:false, dueDay:'10' });
  const [editDebtModal, setEditDebtModal] = useState(null);
  const [editDebtForm,  setEditDebtForm]  = useState({ description:'', categoryId:'', dueDay:'', flexiblePayment:false });

  // ── Nova / editar assinatura ──
  const EMPTY_SUB = { description:'', value:'', categoryId:'', paymentMethod:'credit', cardId:'', periodicity:'monthly', customDays:'', nextChargeDate: todayStr(), endDate:'' };
  const [subModal,     setSubModal]     = useState(false);
  const [subForm,      setSubForm]      = useState(EMPTY_SUB);
  const [editSubModal, setEditSubModal] = useState(null);

  // ── Delete / saving ──
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting,     setDeleting]     = useState(false);
  const [saving,       setSaving]       = useState(false);

  // ─────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!selectedMonthId) return;
    setLoading(true);
    try {
      const [exp, dbt, cats, cds, subs] = await Promise.all([
        expensesApi.list(selectedMonthId),
        debtsApi.list(),
        categoriesApi.list('expense'),
        cardsApi.list(),
        subscriptionsApi.list(),
      ]);
      setExpenses(exp.data.expenses ?? []);
      setDebts(dbt.data.debts ?? []);
      setCategories(cats.data.categories ?? []);
      setCards(cds.data.cards ?? []);
      setSubscriptions(subs.data.subscriptions ?? []);
    } catch { toast.error('Erro ao carregar despesas.'); }
    finally  { setLoading(false); }
  }, [selectedMonthId]);

  useEffect(() => { load(); }, [load]);

  const activeCards = cards.filter(c => c.active);
  const fixedExpenses = expenses.filter(e => e.type === 'fixed');
  const activeSubs = subscriptions.filter(s => s.status !== 'cancelled').length;

  const tabs = [
    { value:'priority', label:'Prioridade', count: expenses.filter(e=>e.type==='priority').length },
    { value:'fixed',    label:'Fixas',      count: fixedExpenses.length },
    { value:'variable', label:'Variáveis',  count: expenses.filter(e=>e.type==='variable').length },
  ];

  // ── Handlers pagamento ──────────────────────────────────────────
  function openPay(e) { setPayModal(e); setPayAmount(String(e.value)); setPayMethod('pix'); }

  async function handlePay() {
    if (!payAmount || parseFloat(payAmount) <= 0) { toast.error('Informe um valor válido.'); return; }
    setPaying(true);
    try {
      await expensesApi.pay(payModal.id, { amount: parseFloat(payAmount), paymentMethod: payMethod });
      toast.success('Pagamento registrado com sucesso.');
      setPayModal(null); load();
    } catch (e) { toast.error(extractErrorMessage(e, 'Erro ao pagar.')); }
    finally { setPaying(false); }
  }

  // ── Handlers variável ───────────────────────────────────────────
  async function saveVariable() {
    if (!varForm.description || !varForm.value) { toast.error('Preencha descrição e valor.'); return; }
    setSaving(true);
    try {
      const cat = varForm.categoryId || (categories[0]?.id ?? '');
      await expensesApi.createVariable({ ...varForm, value: parseFloat(varForm.value), categoryId: String(cat), monthId: selectedMonthId });
      toast.success('Despesa variável criada.'); setVarModal(false); load();
    } catch (e) { toast.error(extractErrorMessage(e, 'Erro.')); }
    finally { setSaving(false); }
  }

  async function saveEditVariable() {
    if (!editVarForm.description || !editVarForm.value) { toast.error('Preencha descrição e valor.'); return; }
    setSaving(true);
    try {
      await expensesApi.update(editVarModal.id, {
        description: editVarForm.description, value: parseFloat(editVarForm.value),
        categoryId: String(editVarForm.categoryId), dueDate: editVarForm.dueDate,
        observation: editVarForm.observation || undefined,
      });
      toast.success('Despesa atualizada.'); setEditVarModal(null); load();
    } catch (e) { toast.error(extractErrorMessage(e, 'Erro.')); }
    finally { setSaving(false); }
  }

  async function handleDeleteVariable(expense) {
    setDeleting(true);
    try { await expensesApi.delete(expense.id); toast.success('Despesa removida.'); setDeleteTarget(null); load(); }
    catch (e) { toast.error(extractErrorMessage(e, 'Erro.')); }
    finally { setDeleting(false); }
  }

  // ── Handlers fixa ───────────────────────────────────────────────
  async function saveFixed() {
    if (!fixForm.description || !fixForm.value) { toast.error('Preencha descrição e valor.'); return; }
    if (fixForm.paymentMethod === 'credit' && !fixForm.cardId) { toast.error('Selecione o cartão.'); return; }
    setSaving(true);
    try {
      const cat = fixForm.categoryId || (categories[0]?.id ?? '');
      await expensesApi.createFixed({ ...fixForm, value: parseFloat(fixForm.value), dueDay: parseInt(fixForm.dueDay), categoryId: String(cat), monthId: selectedMonthId, cardId: fixForm.paymentMethod === 'credit' ? fixForm.cardId : null });
      toast.success('Despesa fixa criada.'); setFixModal(false); load();
    } catch (e) { toast.error(extractErrorMessage(e, 'Erro.')); }
    finally { setSaving(false); }
  }

  async function saveEditFixed() {
    if (!editFixForm.description || !editFixForm.value) { toast.error('Preencha os campos.'); return; }
    if (editFixForm.paymentMethod === 'credit' && !editFixForm.cardId) { toast.error('Selecione o cartão.'); return; }
    setSaving(true);
    try {
      await expensesApi.updateFixedTemplate(editFixModal.fixedTemplateId, { description: editFixForm.description, value: parseFloat(editFixForm.value), dueDay: parseInt(editFixForm.dueDay), paymentMethod: editFixForm.paymentMethod, cardId: editFixForm.paymentMethod === 'credit' ? editFixForm.cardId : null });
      toast.success('Despesa fixa atualizada.'); setEditFixModal(null); load();
    } catch (e) { toast.error(extractErrorMessage(e, 'Erro.')); }
    finally { setSaving(false); }
  }

  async function handleDeleteFixed(expense) {
    setSaving(true);
    try {
      if (expense.fixedTemplateId) { await expensesApi.deleteFixedTemplate(expense.fixedTemplateId); toast.success('Despesa fixa removida.'); }
      else { await expensesApi.delete(expense.id); toast.success('Despesa removida.'); }
      setDeleteTarget(null); load();
    } catch (e) { toast.error(extractErrorMessage(e, 'Erro.')); }
    finally { setSaving(false); }
  }

  // ── Handlers dívida ─────────────────────────────────────────────
  async function saveDebt() {
    if (!debtForm.description || !debtForm.totalValue) { toast.error('Preencha descrição e valor total.'); return; }
    setSaving(true);
    try {
      const cat = debtForm.categoryId || (categories[0]?.id ?? '');
      await debtsApi.create({ ...debtForm, totalValue: parseFloat(debtForm.totalValue), installmentsCount: parseInt(debtForm.installmentsCount), dueDay: parseInt(debtForm.dueDay), categoryId: String(cat), monthId: selectedMonthId });
      toast.success('Dívida criada.'); setDebtModal(false); load();
    } catch (e) { toast.error(extractErrorMessage(e, 'Erro.')); }
    finally { setSaving(false); }
  }

  async function saveEditDebt() {
    if (!editDebtForm.description) { toast.error('Preencha a descrição.'); return; }
    setSaving(true);
    try {
      await debtsApi.update(editDebtModal.id, { description: editDebtForm.description, categoryId: String(editDebtForm.categoryId), dueDay: parseInt(editDebtForm.dueDay), flexiblePayment: editDebtForm.flexiblePayment });
      toast.success('Dívida atualizada.'); setEditDebtModal(null); load();
    } catch (e) { toast.error(extractErrorMessage(e, 'Erro.')); }
    finally { setSaving(false); }
  }

  async function handleDeleteDebt(debt) {
    setDeleting(true);
    try { await debtsApi.delete(debt.id); toast.success('Dívida removida.'); setDeleteTarget(null); load(); }
    catch (e) { toast.error(extractErrorMessage(e, 'Erro.')); }
    finally { setDeleting(false); }
  }

  // ── Handlers assinatura ─────────────────────────────────────────
  async function saveSubscription() {
    if (!subForm.description || !subForm.value || !subForm.nextChargeDate) { toast.error('Preencha os campos obrigatórios.'); return; }
    if (subForm.paymentMethod === 'credit' && !subForm.cardId) { toast.error('Selecione o cartão.'); return; }
    setSaving(true);
    try {
      const cat = subForm.categoryId || (categories[0]?.id ?? '');
      const payload = { ...subForm, value: parseFloat(subForm.value), categoryId: String(cat), cardId: subForm.paymentMethod === 'credit' ? subForm.cardId : null, customDays: subForm.periodicity === 'custom' && subForm.customDays ? parseInt(subForm.customDays) : null, endDate: subForm.endDate || null };
      if (editSubModal) {
        await subscriptionsApi.update(editSubModal.id, payload);
        toast.success('Assinatura atualizada.'); setEditSubModal(null);
      } else {
        await subscriptionsApi.create(payload);
        toast.success('Assinatura criada.'); setSubModal(false);
      }
      load();
    } catch (e) { toast.error(extractErrorMessage(e, 'Erro.')); }
    finally { setSaving(false); }
  }

  async function handlePauseSub(sub) {
    try {
      await subscriptionsApi.pause(sub.id);
      toast.success(sub.status === 'paused' ? 'Assinatura reativada.' : 'Assinatura pausada.');
      load();
    } catch (e) { toast.error(extractErrorMessage(e, 'Erro.')); }
  }

  async function handleCancelSub(sub) {
    if (!window.confirm(`Cancelar "${sub.description}"? Esta ação não pode ser desfeita.`)) return;
    try { await subscriptionsApi.cancel(sub.id); toast.success('Assinatura cancelada.'); load(); }
    catch (e) { toast.error(extractErrorMessage(e, 'Erro.')); }
  }

  // ── Componente reutilizável: forma de pagamento ─────────────────
  function PaymentMethodFields({ form, setForm }) {
    return (
      <>
        <FormGroup label="Forma de pagamento">
          <Select value={form.paymentMethod} onChange={(e) => setForm({...form, paymentMethod: e.target.value, cardId: ''})}>
            {Object.entries(PM_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </FormGroup>
        {form.paymentMethod === 'credit' && (
          <FormGroup label="Cartão de crédito" required>
            <Select value={form.cardId} onChange={(e) => setForm({...form, cardId: e.target.value})}>
              <option value="">Selecione o cartão...</option>
              {activeCards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            {activeCards.length === 0 && <p className="text-xs text-warning mt-1">Nenhum cartão ativo. Cadastre em Cartões.</p>}
          </FormGroup>
        )}
      </>
    );
  }

  // ── Botão de adicionar (contextual) ────────────────────────────
  const addButton = (
    <Button size="sm" onClick={() => {
      if (tab === 'variable') { setVarForm({ description:'', value:'', categoryId:'', date: todayStr(), paymentMethod:'pix', paid:true }); setVarModal(true); }
      if (tab === 'fixed' && fixedSubTab === 'expenses') { setFixForm({ description:'', value:'', categoryId:'', dueDay:'10', paymentMethod:'pix', cardId:'' }); setFixModal(true); }
      if (tab === 'fixed' && fixedSubTab === 'subscriptions') { setSubForm(EMPTY_SUB); setSubModal(true); }
      if (tab === 'priority') { setDebtForm({ description:'', categoryId:'', totalValue:'', installmentsCount:'1', flexiblePayment:false, dueDay:'10' }); setDebtModal(true); }
    }}>
      + {tab === 'variable' ? 'Nova Despesa' : tab === 'fixed' && fixedSubTab === 'subscriptions' ? 'Nova Assinatura' : tab === 'fixed' ? 'Nova Fixa' : 'Nova Dívida'}
    </Button>
  );

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="font-bold text-xl text-slate-900 dark:text-zinc-50">Despesas</h2>
        {addButton}
      </div>

      <TabGroup tabs={tabs} value={tab} onChange={(v) => { setTab(v); setFixedSubTab('expenses'); }} />

      {/* ── Sub-abas dentro de Fixas ── */}
      {tab === 'fixed' && (
        <div className="flex gap-1 bg-subtle dark:bg-white/[0.03] border border-border dark:border-white/[0.06] rounded-xl p-1 w-fit">
          {[
            { key:'expenses',      label:'Despesas Fixas', count: fixedExpenses.length },
            { key:'subscriptions', label:'Assinaturas',    count: activeSubs },
          ].map(opt => (
            <button key={opt.key} onClick={() => setFixedSubTab(opt.key)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                fixedSubTab === opt.key
                  ? 'bg-white dark:bg-white/[0.08] text-slate-900 dark:text-zinc-50 shadow-sm'
                  : 'text-muted hover:text-slate-700 dark:hover:text-zinc-300'
              }`}>
              {opt.label}
              <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-semibold ${fixedSubTab === opt.key ? 'bg-primary/10 text-primary-dark' : 'bg-subtle dark:bg-white/[0.06] text-muted'}`}>
                {opt.count}
              </span>
            </button>
          ))}
        </div>
      )}

      <Card padding={false}>
        {loading ? (
          <div className="p-5 space-y-3">{Array.from({length:4}).map((_,i) => <Skeleton key={i} className="h-12" />)}</div>

        ) : tab === 'priority' ? (
          expenses.filter(e => e.type === 'priority').length === 0
            ? <EmptyState icon="🎯" title="Nenhuma dívida prioritária" description="Adicione dívidas ou parcelamentos clicando no botão acima." action={addButton} />
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-subtle/60 dark:bg-white/[0.03]">
                    <tr>{['Descrição','Parcela','Pago','Saldo Devedor','Vencimento','Status','Ações'].map(h => <th key={h} className="table-header">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 dark:divide-white/[0.06]">
                    {expenses.filter(e => e.type === 'priority').map((e) => {
                      const debt = debts.find(d => String(d.id) === String(e.debtId));
                      const alreadyPaid = ['paid','settled'].includes(e.status);
                      return (
                        <tr key={e.id} className="hover:bg-subtle/40 dark:hover:bg-white/[0.03] transition-colors">
                          <td className="table-cell font-semibold text-slate-800 dark:text-zinc-200">{e.description}</td>
                          <td className="table-cell font-mono tabular-nums">{formatCurrency(e.value)}</td>
                          <td className="table-cell font-mono tabular-nums text-primary-dark">{formatCurrency(e.paidAmount)}</td>
                          <td className="table-cell font-mono tabular-nums text-danger-dark font-semibold">{debt ? formatCurrency(debt.remainingBalance) : '—'}</td>
                          <td className="table-cell text-muted">{formatShortDate(e.dueDate)}</td>
                          <td className="table-cell"><Badge variant={STATUS_V[e.status] ?? 'default'}>{STATUS_L[e.status] ?? e.status}</Badge></td>
                          <td className="table-cell">
                            <div className="flex items-center gap-2">
                              {!alreadyPaid && <Button size="sm" onClick={() => openPay(e)}>Pagar</Button>}
                              {alreadyPaid && <span className="text-xs text-primary-dark font-medium">✓ Pago</span>}
                              {debt && (<>
                                <Button size="sm" variant="ghost" onClick={() => { setEditDebtModal(debt); setEditDebtForm({ description: debt.description, categoryId: String(debt.categoryId), dueDay: String(debt.dueDay), flexiblePayment: !!debt.flexiblePayment }); }}>Editar</Button>
                                <Button size="sm" variant="ghost" className="text-danger" onClick={() => setDeleteTarget({ ...debt, _type:'debt' })}>Remover</Button>
                              </>)}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )

        ) : tab === 'fixed' && fixedSubTab === 'expenses' ? (
          fixedExpenses.length === 0
            ? <EmptyState icon="📌" title="Nenhuma despesa fixa" description="Adicione despesas que se repetem todo mês: internet, aluguel, plano de saúde..." action={addButton} />
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-subtle/60 dark:bg-white/[0.03]">
                    <tr>{['Descrição','Categoria','Valor','Pagamento','Vencimento','Status','Ações'].map(h => <th key={h} className="table-header">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 dark:divide-white/[0.06]">
                    {fixedExpenses.map((e) => (
                      <tr key={e.id} className="hover:bg-subtle/40 dark:hover:bg-white/[0.03] transition-colors">
                        <td className="table-cell font-semibold text-slate-800 dark:text-zinc-200">{e.description}</td>
                        <td className="table-cell text-muted">{e.category?.name}</td>
                        <td className="table-cell font-mono tabular-nums">{formatCurrency(e.value)}</td>
                        <td className="table-cell text-xs">
                          {e.fixedTemplate?.paymentMethod === 'credit'
                            ? `💳 ${cards.find(c => String(c.id) === String(e.fixedTemplate?.cardId))?.name ?? 'Cartão'}`
                            : PM_LABELS[e.fixedTemplate?.paymentMethod] ?? '—'}
                        </td>
                        <td className="table-cell text-muted">{formatShortDate(e.dueDate)}</td>
                        <td className="table-cell"><Badge variant={STATUS_V[e.status] ?? 'default'}>{STATUS_L[e.status] ?? e.status}</Badge></td>
                        <td className="table-cell">
                          <div className="flex items-center gap-2">
                            {!['paid','settled'].includes(e.status) && <Button size="sm" onClick={() => openPay(e)}>Pagar</Button>}
                            <Button size="sm" variant="ghost" onClick={() => { setEditFixModal(e); setEditFixForm({ description: e.description, value: String(e.value), dueDay: String(e.dueDate ? new Date(e.dueDate).getUTCDate() : '10'), paymentMethod: e.fixedTemplate?.paymentMethod ?? 'pix', cardId: e.fixedTemplate?.cardId ? String(e.fixedTemplate.cardId) : '' }); }}>Editar</Button>
                            <Button size="sm" variant="ghost" className="text-danger" onClick={() => setDeleteTarget({ ...e, _type:'fixed' })}>Remover</Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )

        ) : tab === 'fixed' && fixedSubTab === 'subscriptions' ? (
          // ── Tabela de Assinaturas ──
          subscriptions.length === 0
            ? <EmptyState icon="🔄" title="Nenhuma assinatura" description="Adicione Netflix, Spotify, academia, planos e qualquer cobrança recorrente." action={addButton} />
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-subtle/60 dark:bg-white/[0.03]">
                    <tr>{['Descrição','Valor','Periodicidade','Pagamento','Próx. cobrança','Status','Ações'].map(h => <th key={h} className="table-header">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 dark:divide-white/[0.06]">
                    {subscriptions.map((s) => (
                      <tr key={s.id} className="hover:bg-subtle/40 dark:hover:bg-white/[0.03] transition-colors">
                        <td className="table-cell">
                          <p className="font-semibold text-slate-800 dark:text-zinc-200">{s.description}</p>
                          {s.category && <p className="text-[11px] text-muted">{s.category.name}</p>}
                        </td>
                        <td className="table-cell font-mono tabular-nums font-semibold">{formatCurrency(Number(s.value))}</td>
                        <td className="table-cell text-muted">{PERIOD_L[s.periodicity]}</td>
                        <td className="table-cell text-xs">
                          {s.paymentMethod === 'credit'
                            ? `💳 ${s.card?.name ?? 'Cartão'}`
                            : PM_LABELS[s.paymentMethod] ?? '—'}
                        </td>
                        <td className="table-cell text-muted">
                          {new Date(s.nextChargeDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                          {s.endDate && <p className="text-[11px]">até {new Date(s.endDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</p>}
                        </td>
                        <td className="table-cell"><Badge variant={SUB_STATUS[s.status]}>{SUB_LABEL[s.status]}</Badge></td>
                        <td className="table-cell">
                          {s.status !== 'cancelled' && (
                            <div className="flex items-center gap-2">
                              <Button size="sm" variant="ghost" onClick={() => { setEditSubModal(s); setSubForm({ description: s.description, value: String(s.value), categoryId: String(s.categoryId), paymentMethod: s.paymentMethod, cardId: s.cardId ? String(s.cardId) : '', periodicity: s.periodicity, customDays: s.customDays ? String(s.customDays) : '', nextChargeDate: s.nextChargeDate?.slice(0,10) ?? '', endDate: s.endDate?.slice(0,10) ?? '' }); }}>Editar</Button>
                              <Button size="sm" variant="ghost" onClick={() => handlePauseSub(s)}>{s.status === 'paused' ? 'Reativar' : 'Pausar'}</Button>
                              <Button size="sm" variant="ghost" className="text-danger" onClick={() => handleCancelSub(s)}>Cancelar</Button>
                            </div>
                          )}
                          {s.status === 'cancelled' && <span className="text-xs text-muted">Cancelada</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )

        ) : (
          // ── Variáveis ──
          expenses.filter(e => e.type === 'variable').length === 0
            ? <EmptyState icon="📋" title="Nenhuma despesa variável" description="Adicione gastos eventuais do dia a dia." action={addButton} />
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-subtle/60 dark:bg-white/[0.03]">
                    <tr>{['Descrição','Categoria','Valor','Data','Forma','Status','Ações'].map(h => <th key={h} className="table-header">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 dark:divide-white/[0.06]">
                    {expenses.filter(e => e.type === 'variable').map((e) => (
                      <tr key={e.id} className="hover:bg-subtle/40 dark:hover:bg-white/[0.03] transition-colors">
                        <td className="table-cell font-semibold text-slate-800 dark:text-zinc-200">{e.description}</td>
                        <td className="table-cell text-muted">{e.category?.name}</td>
                        <td className="table-cell font-mono tabular-nums">{formatCurrency(e.value)}</td>
                        <td className="table-cell text-muted">{formatShortDate(e.dueDate)}</td>
                        <td className="table-cell"><Badge>{PM_LABELS[e.paymentMethod] ?? e.paymentMethod}</Badge></td>
                        <td className="table-cell"><Badge variant={STATUS_V[e.status] ?? 'default'}>{STATUS_L[e.status] ?? e.status}</Badge></td>
                        <td className="table-cell">
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="ghost" onClick={() => { setEditVarModal(e); setEditVarForm({ description: e.description, value: String(e.value), categoryId: e.categoryId != null ? String(e.categoryId) : '', dueDate: e.dueDate ? new Date(e.dueDate).toISOString().slice(0,10) : '', observation: e.observation ?? '' }); }}>Editar</Button>
                            <Button size="sm" variant="ghost" className="text-danger" onClick={() => setDeleteTarget({ ...e, _type:'variable' })}>Excluir</Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
        )}
      </Card>

      {/* ════════════ MODAIS ════════════ */}

      {/* Pagamento */}
      <Modal open={!!payModal} onClose={() => setPayModal(null)} title="Registrar Pagamento" size="sm">
        {payModal && (
          <div className="space-y-4">
            <div className="bg-subtle dark:bg-white/[0.04] rounded-2xl p-4">
              <p className="text-xs text-muted mb-1">Despesa</p>
              <p className="font-semibold text-slate-900 dark:text-zinc-50">{payModal.description}</p>
              <p className="text-sm text-muted mt-1">Valor: <span className="font-mono font-semibold">{formatCurrency(payModal.value)}</span></p>
            </div>
            <FormGroup label="Valor pago" required>
              <Input type="number" min="0" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
            </FormGroup>
            <FormGroup label="Forma de pagamento">
              <Select value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                {Object.entries(PM_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </FormGroup>
            {payModal.type === 'priority' && (
              <p className="text-xs text-info bg-info-subtle p-3 rounded-xl border border-info/20">
                💡 Pagar mais reduz a próxima parcela. Pagar menos aumenta. Ajuste automático.
              </p>
            )}
            <div className="flex gap-3 justify-end pt-1">
              <Button variant="outline" onClick={() => setPayModal(null)}>Cancelar</Button>
              <Button onClick={handlePay} loading={paying}>Confirmar Pagamento</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Nova despesa variável */}
      <Modal open={varModal} onClose={() => setVarModal(false)} title="Nova Despesa Variável">
        <div className="space-y-4">
          <FormGroup label="Descrição" required><Input value={varForm.description} onChange={e => setVarForm({...varForm,description:e.target.value})} placeholder="Ex: Mercado, Lanche..." autoFocus /></FormGroup>
          <div className="grid grid-cols-2 gap-3">
            <FormGroup label="Valor" required><Input type="number" min="0" step="0.01" value={varForm.value} onChange={e => setVarForm({...varForm,value:e.target.value})} /></FormGroup>
            <FormGroup label="Data" required><Input type="date" value={varForm.date} onChange={e => setVarForm({...varForm,date:e.target.value})} /></FormGroup>
          </div>
          <FormGroup label="Categoria"><CategorySelect value={varForm.categoryId} onChange={e => setVarForm({...varForm,categoryId:e.target.value})} categories={categories} type="expense" onCategoryCreated={cat => setCategories(p => [...p, cat])} /></FormGroup>
          <PaymentMethodFields form={varForm} setForm={setVarForm} />
          <label className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
            <input type="checkbox" checked={varForm.paid} onChange={e => setVarForm({...varForm,paid:e.target.checked})} className="w-4 h-4 rounded accent-primary" />
            <span className="text-slate-700 dark:text-zinc-300">Já foi pago</span>
          </label>
          <div className="flex gap-3 justify-end pt-1">
            <Button variant="outline" onClick={() => setVarModal(false)}>Cancelar</Button>
            <Button onClick={saveVariable} loading={saving}>Salvar</Button>
          </div>
        </div>
      </Modal>

      {/* Editar despesa variável */}
      <Modal open={!!editVarModal} onClose={() => setEditVarModal(null)} title="Editar Despesa Variável" size="sm">
        <div className="space-y-4">
          <FormGroup label="Descrição" required><Input value={editVarForm.description} onChange={e => setEditVarForm({...editVarForm,description:e.target.value})} autoFocus /></FormGroup>
          <div className="grid grid-cols-2 gap-3">
            <FormGroup label="Valor" required><Input type="number" min="0" step="0.01" value={editVarForm.value} onChange={e => setEditVarForm({...editVarForm,value:e.target.value})} /></FormGroup>
            <FormGroup label="Data" required><Input type="date" value={editVarForm.dueDate} onChange={e => setEditVarForm({...editVarForm,dueDate:e.target.value})} /></FormGroup>
          </div>
          <FormGroup label="Categoria"><CategorySelect value={editVarForm.categoryId} onChange={e => setEditVarForm({...editVarForm,categoryId:e.target.value})} categories={categories} type="expense" onCategoryCreated={cat => setCategories(p => [...p, cat])} /></FormGroup>
          <FormGroup label="Observação" hint="opcional"><Input value={editVarForm.observation} onChange={e => setEditVarForm({...editVarForm,observation:e.target.value})} /></FormGroup>
          <div className="flex gap-3 justify-end pt-1">
            <Button variant="outline" onClick={() => setEditVarModal(null)}>Cancelar</Button>
            <Button onClick={saveEditVariable} loading={saving}>Salvar Alteração</Button>
          </div>
        </div>
      </Modal>

      {/* Nova despesa fixa */}
      <Modal open={fixModal} onClose={() => setFixModal(false)} title="Nova Despesa Fixa">
        <div className="space-y-4">
          <p className="text-xs bg-info-subtle text-info-dark p-3 rounded-xl border border-info/20">ℹ Despesas fixas são geradas automaticamente todo mês ao fechar o período.</p>
          <FormGroup label="Descrição" required><Input value={fixForm.description} onChange={e => setFixForm({...fixForm,description:e.target.value})} placeholder="Ex: Internet, Plano de saúde..." autoFocus /></FormGroup>
          <div className="grid grid-cols-2 gap-3">
            <FormGroup label="Valor mensal" required><Input type="number" min="0" step="0.01" value={fixForm.value} onChange={e => setFixForm({...fixForm,value:e.target.value})} /></FormGroup>
            <FormGroup label="Dia de vencimento" required><Input type="number" min="1" max="31" value={fixForm.dueDay} onChange={e => setFixForm({...fixForm,dueDay:e.target.value})} /></FormGroup>
          </div>
          <FormGroup label="Categoria"><CategorySelect value={fixForm.categoryId} onChange={e => setFixForm({...fixForm,categoryId:e.target.value})} categories={categories} type="expense" onCategoryCreated={cat => setCategories(p => [...p, cat])} /></FormGroup>
          <PaymentMethodFields form={fixForm} setForm={setFixForm} />
          {fixForm.paymentMethod === 'credit' && <p className="text-xs text-info bg-info-subtle p-3 rounded-xl border border-info/20">💳 Vai para a fatura do cartão. O saldo só é descontado quando a fatura for paga.</p>}
          <div className="flex gap-3 justify-end pt-1">
            <Button variant="outline" onClick={() => setFixModal(false)}>Cancelar</Button>
            <Button onClick={saveFixed} loading={saving}>Criar Despesa Fixa</Button>
          </div>
        </div>
      </Modal>

      {/* Editar despesa fixa */}
      <Modal open={!!editFixModal} onClose={() => setEditFixModal(null)} title="Editar Despesa Fixa" size="sm">
        <div className="space-y-4">
          <p className="text-xs bg-warning-subtle text-warning-dark p-3 rounded-xl border border-warning/20">⚠ A alteração afeta apenas os <strong>próximos meses</strong>.</p>
          <FormGroup label="Descrição" required><Input value={editFixForm.description} onChange={e => setEditFixForm({...editFixForm,description:e.target.value})} /></FormGroup>
          <div className="grid grid-cols-2 gap-3">
            <FormGroup label="Novo valor" required><Input type="number" min="0" step="0.01" value={editFixForm.value} onChange={e => setEditFixForm({...editFixForm,value:e.target.value})} /></FormGroup>
            <FormGroup label="Dia vencimento"><Input type="number" min="1" max="31" value={editFixForm.dueDay} onChange={e => setEditFixForm({...editFixForm,dueDay:e.target.value})} /></FormGroup>
          </div>
          <PaymentMethodFields form={editFixForm} setForm={setEditFixForm} />
          <div className="flex gap-3 justify-end pt-1">
            <Button variant="outline" onClick={() => setEditFixModal(null)}>Cancelar</Button>
            <Button onClick={saveEditFixed} loading={saving}>Salvar Alteração</Button>
          </div>
        </div>
      </Modal>

      {/* Nova / editar assinatura */}
      {[{ open: subModal, onClose: () => setSubModal(false), title: 'Nova Assinatura', onSave: saveSubscription },
        { open: !!editSubModal, onClose: () => setEditSubModal(null), title: 'Editar Assinatura', onSave: saveSubscription }
      ].map(({ open, onClose, title, onSave }, idx) => (
        <Modal key={idx} open={open} onClose={onClose} title={title}>
          <div className="space-y-4">
            <FormGroup label="Descrição" required><Input value={subForm.description} onChange={e => setSubForm({...subForm,description:e.target.value})} placeholder="Ex: Netflix, Spotify, Academia..." autoFocus={idx===0} /></FormGroup>
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Valor" required><Input type="number" min="0" step="0.01" value={subForm.value} onChange={e => setSubForm({...subForm,value:e.target.value})} /></FormGroup>
              <FormGroup label="Periodicidade">
                <Select value={subForm.periodicity} onChange={e => setSubForm({...subForm,periodicity:e.target.value})}>
                  <option value="monthly">Mensal</option>
                  <option value="annual">Anual</option>
                  <option value="custom">Personalizado</option>
                </Select>
              </FormGroup>
            </div>
            {subForm.periodicity === 'custom' && (
              <FormGroup label="Intervalo (dias)"><Input type="number" min="1" value={subForm.customDays} onChange={e => setSubForm({...subForm,customDays:e.target.value})} placeholder="Ex: 15" /></FormGroup>
            )}
            <FormGroup label="Categoria"><CategorySelect value={subForm.categoryId} onChange={e => setSubForm({...subForm,categoryId:e.target.value})} categories={categories} type="expense" onCategoryCreated={cat => setCategories(p => [...p, cat])} /></FormGroup>
            <PaymentMethodFields form={subForm} setForm={setSubForm} />
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Próxima cobrança" required><Input type="date" value={subForm.nextChargeDate} onChange={e => setSubForm({...subForm,nextChargeDate:e.target.value})} /></FormGroup>
              <FormGroup label="Encerramento (opcional)"><Input type="date" value={subForm.endDate} onChange={e => setSubForm({...subForm,endDate:e.target.value})} /></FormGroup>
            </div>
            <div className="flex gap-3 justify-end pt-1">
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={onSave} loading={saving}>Salvar</Button>
            </div>
          </div>
        </Modal>
      ))}

      {/* Nova dívida */}
      <Modal open={debtModal} onClose={() => setDebtModal(false)} title="Nova Dívida / Parcelamento">
        <div className="space-y-4">
          <FormGroup label="Descrição" required><Input value={debtForm.description} onChange={e => setDebtForm({...debtForm,description:e.target.value})} placeholder="Ex: Empréstimo, Financiamento..." autoFocus /></FormGroup>
          <FormGroup label="Categoria"><CategorySelect value={debtForm.categoryId} onChange={e => setDebtForm({...debtForm,categoryId:e.target.value})} categories={categories} type="expense" onCategoryCreated={cat => setCategories(p => [...p, cat])} /></FormGroup>
          <div className="grid grid-cols-3 gap-3">
            <FormGroup label="Valor total" required><Input type="number" min="0" step="0.01" value={debtForm.totalValue} onChange={e => setDebtForm({...debtForm,totalValue:e.target.value})} /></FormGroup>
            <FormGroup label="Nº parcelas" required><Input type="number" min="1" max="360" value={debtForm.installmentsCount} onChange={e => setDebtForm({...debtForm,installmentsCount:e.target.value})} /></FormGroup>
            <FormGroup label="Dia venc." required><Input type="number" min="1" max="31" value={debtForm.dueDay} onChange={e => setDebtForm({...debtForm,dueDay:e.target.value})} /></FormGroup>
          </div>
          {debtForm.totalValue && debtForm.installmentsCount && parseInt(debtForm.installmentsCount) > 0 && (
            <div className="bg-primary-subtle border border-primary/20 rounded-xl p-3 text-sm">
              <span className="text-primary-dark font-medium">Parcela mensal: </span>
              <span className="font-mono font-bold text-primary-dark">{formatCurrency(parseFloat(debtForm.totalValue)/parseInt(debtForm.installmentsCount))}</span>
            </div>
          )}
          <label className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
            <input type="checkbox" checked={debtForm.flexiblePayment} onChange={e => setDebtForm({...debtForm,flexiblePayment:e.target.checked})} className="w-4 h-4 rounded accent-primary" />
            <div>
              <span className="text-slate-700 dark:text-zinc-300 font-medium">Aceitar pagamento parcial</span>
              <p className="text-xs text-muted">O valor extra/faltante ajusta automaticamente a próxima parcela</p>
            </div>
          </label>
          <div className="flex gap-3 justify-end pt-1">
            <Button variant="outline" onClick={() => setDebtModal(false)}>Cancelar</Button>
            <Button onClick={saveDebt} loading={saving}>Criar Dívida</Button>
          </div>
        </div>
      </Modal>

      {/* Editar dívida */}
      <Modal open={!!editDebtModal} onClose={() => setEditDebtModal(null)} title="Editar Dívida" size="sm">
        <div className="space-y-4">
          <p className="text-xs bg-info-subtle text-info-dark p-3 rounded-xl border border-info/20">ℹ Valor total e número de parcelas não podem ser alterados.</p>
          <FormGroup label="Descrição" required><Input value={editDebtForm.description} onChange={e => setEditDebtForm({...editDebtForm,description:e.target.value})} /></FormGroup>
          <FormGroup label="Categoria"><CategorySelect value={editDebtForm.categoryId} onChange={e => setEditDebtForm({...editDebtForm,categoryId:e.target.value})} categories={categories} type="expense" onCategoryCreated={cat => setCategories(p => [...p, cat])} /></FormGroup>
          <FormGroup label="Dia de vencimento"><Input type="number" min="1" max="31" value={editDebtForm.dueDay} onChange={e => setEditDebtForm({...editDebtForm,dueDay:e.target.value})} /></FormGroup>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
            <input type="checkbox" checked={editDebtForm.flexiblePayment} onChange={e => setEditDebtForm({...editDebtForm,flexiblePayment:e.target.checked})} className="w-4 h-4 rounded accent-primary" />
            <div>
              <span className="text-slate-700 dark:text-zinc-300 font-medium">Aceitar pagamento parcial</span>
              <p className="text-xs text-muted">O valor extra/faltante ajusta a próxima parcela automaticamente</p>
            </div>
          </label>
          <div className="flex gap-3 justify-end pt-1">
            <Button variant="outline" onClick={() => setEditDebtModal(null)}>Cancelar</Button>
            <Button onClick={saveEditDebt} loading={saving}>Salvar Alteração</Button>
          </div>
        </div>
      </Modal>

      {/* Confirm delete */}
      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget?._type === 'fixed')    return handleDeleteFixed(deleteTarget);
          if (deleteTarget?._type === 'debt')     return handleDeleteDebt(deleteTarget);
          if (deleteTarget?._type === 'variable') return handleDeleteVariable(deleteTarget);
        }}
        loading={deleting || saving}
        title={deleteTarget?._type === 'fixed' ? 'Remover despesa fixa' : deleteTarget?._type === 'debt' ? 'Remover dívida' : 'Excluir despesa'}
        description={
          deleteTarget?._type === 'fixed'    ? `"${deleteTarget?.description}" será removida e não gerada nos próximos meses.` :
          deleteTarget?._type === 'debt'     ? `A dívida "${deleteTarget?.description}" será encerrada. Histórico pago é preservado.` :
          `Excluir "${deleteTarget?.description}"? Esta ação não pode ser desfeita.`
        }
        confirmLabel="Confirmar" />
    </div>
  );
}
