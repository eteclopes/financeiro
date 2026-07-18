import { useState, useEffect, useCallback } from 'react';
import { subscriptionsApi, cardsApi, categoriesApi } from '../lib/services';
import { extractErrorMessage } from '../lib/api';
import { formatCurrency } from '../lib/format';
import { Card, Badge, Button, EmptyState, Skeleton } from '../components/ui/index';
import { Modal, FormGroup, Input, Select } from '../components/ui/Modal';
import { CategorySelect } from '../components/ui/CategorySelect';
import { useUIStore } from '../store/uiStore';

const STATUS_V = { active: 'success', paused: 'warning', cancelled: 'danger' };
const STATUS_L = { active: 'Ativa', paused: 'Pausada', cancelled: 'Cancelada' };
const PERIOD_L = { monthly: 'Mensal', annual: 'Anual', custom: 'Personalizado' };
const PM_LABELS = { cash: 'Dinheiro', pix: 'PIX', debit: 'Débito', credit: 'Cartão de Crédito', transfer: 'Transferência' };

const EMPTY_FORM = {
  description: '', value: '', categoryId: '', paymentMethod: 'credit', cardId: '',
  periodicity: 'monthly', customDays: '', nextChargeDate: '', endDate: '',
};

const SUBSCRIPTION_EXAMPLES = [
  'Netflix', 'Spotify', 'Amazon Prime', 'Disney+', 'HBO Max',
  'Adobe Creative Cloud', 'Microsoft 365', 'Google One',
  'Academia', 'Plano de saúde', 'Internet', 'Streaming de música',
];

export default function SubscriptionsPage() {
  const [subs, setSubs] = useState([]);
  const [cards, setCards] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useUIStore((s) => s);

  const [modal, setModal] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, c, cats] = await Promise.all([
        subscriptionsApi.list(),
        cardsApi.list(),
        categoriesApi.list('expense'),
      ]);
      setSubs(s.data.subscriptions ?? []);
      setCards(c.data.cards ?? []);
      setCategories(cats.data.categories ?? []);
    } catch { toast.error('Erro ao carregar assinaturas.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    const today = new Date().toISOString().slice(0, 10);
    setForm({ ...EMPTY_FORM, nextChargeDate: today });
    setModal(true);
  }

  function openEdit(sub) {
    setEditModal(sub);
    setForm({
      description: sub.description,
      value: String(sub.value),
      categoryId: String(sub.categoryId),
      paymentMethod: sub.paymentMethod,
      cardId: sub.cardId ? String(sub.cardId) : '',
      periodicity: sub.periodicity,
      customDays: sub.customDays ? String(sub.customDays) : '',
      nextChargeDate: sub.nextChargeDate?.slice(0, 10) ?? '',
      endDate: sub.endDate?.slice(0, 10) ?? '',
    });
  }

  function f(key, val) { setForm((p) => ({ ...p, [key]: val })); }

  async function handleSave() {
    if (!form.description || !form.value || !form.nextChargeDate) {
      toast.error('Preencha os campos obrigatórios.'); return;
    }
    if (form.paymentMethod === 'credit' && !form.cardId) {
      toast.error('Selecione o cartão de crédito.'); return;
    }
    setSaving(true);
    try {
      const payload = {
        description: form.description,
        value: parseFloat(form.value),
        categoryId: form.categoryId || (categories[0]?.id ?? ''),
        paymentMethod: form.paymentMethod,
        cardId: form.paymentMethod === 'credit' ? form.cardId : null,
        periodicity: form.periodicity,
        customDays: form.periodicity === 'custom' && form.customDays ? parseInt(form.customDays) : null,
        nextChargeDate: form.nextChargeDate,
        endDate: form.endDate || null,
      };
      if (editModal) {
        await subscriptionsApi.update(editModal.id, payload);
        toast.success('Assinatura atualizada.');
        setEditModal(null);
      } else {
        await subscriptionsApi.create(payload);
        toast.success('Assinatura criada.');
        setModal(false);
      }
      load();
    } catch (e) { toast.error(extractErrorMessage(e, 'Erro ao salvar.')); }
    finally { setSaving(false); }
  }

  async function handlePause(sub) {
    setActionLoading(sub.id);
    try {
      await subscriptionsApi.pause(sub.id);
      toast.success(sub.status === 'paused' ? 'Assinatura reativada.' : 'Assinatura pausada.');
      load();
    } catch (e) { toast.error(extractErrorMessage(e, 'Erro.')); }
    finally { setActionLoading(null); }
  }

  async function handleCancel(sub) {
    if (!window.confirm(`Cancelar a assinatura "${sub.description}"? Esta ação não pode ser desfeita.`)) return;
    setActionLoading(sub.id);
    try {
      await subscriptionsApi.cancel(sub.id);
      toast.success('Assinatura cancelada.');
      load();
    } catch (e) { toast.error(extractErrorMessage(e, 'Erro.')); }
    finally { setActionLoading(null); }
  }

  const activeCount = subs.filter(s => s.status === 'active').length;
  const totalMonthly = subs
    .filter(s => s.status === 'active')
    .reduce((acc, s) => {
      const v = Number(s.value);
      if (s.periodicity === 'monthly') return acc + v;
      if (s.periodicity === 'annual') return acc + v / 12;
      return acc + (s.customDays ? v * (30 / s.customDays) : v);
    }, 0);

  function renderForm() {
    return (
      <>
        <FormGroup label="Descrição *">
          <Input value={form.description} onChange={e => f('description', e.target.value)} placeholder="ex: Netflix, Spotify..." maxLength={160} />
          {!form.description && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SUBSCRIPTION_EXAMPLES.slice(0, 6).map(ex => (
                <button key={ex} type="button" onClick={() => f('description', ex)}
                  className="text-xs bg-subtle dark:bg-white/5 text-muted hover:text-slate-700 dark:hover:text-zinc-200 border border-border dark:border-white/10 px-2 py-1 rounded-lg transition-colors">
                  {ex}
                </button>
              ))}
            </div>
          )}
        </FormGroup>

        <div className="grid grid-cols-2 gap-3">
          <FormGroup label="Valor *">
            <Input type="number" min="0.01" step="0.01" value={form.value} onChange={e => f('value', e.target.value)} placeholder="0,00" />
          </FormGroup>
          <FormGroup label="Periodicidade">
            <Select value={form.periodicity} onChange={e => f('periodicity', e.target.value)}>
              <option value="monthly">Mensal</option>
              <option value="annual">Anual</option>
              <option value="custom">Personalizado</option>
            </Select>
          </FormGroup>
        </div>

        {form.periodicity === 'custom' && (
          <FormGroup label="Intervalo (dias)">
            <Input type="number" min="1" value={form.customDays} onChange={e => f('customDays', e.target.value)} placeholder="ex: 15" />
          </FormGroup>
        )}

        <FormGroup label="Categoria">
          <CategorySelect
            categories={categories}
            value={form.categoryId}
            onChange={v => f('categoryId', v)}
          />
        </FormGroup>

        <FormGroup label="Forma de pagamento">
          <Select value={form.paymentMethod} onChange={e => f('paymentMethod', e.target.value)}>
            <option value="credit">Cartão de Crédito</option>
            <option value="pix">PIX</option>
            <option value="debit">Débito</option>
            <option value="cash">Dinheiro</option>
            <option value="transfer">Transferência</option>
          </Select>
        </FormGroup>

        {form.paymentMethod === 'credit' && (
          <FormGroup label="Cartão *">
            <Select value={form.cardId} onChange={e => f('cardId', e.target.value)}>
              <option value="">Selecione o cartão</option>
              {cards.filter(c => c.active).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </FormGroup>
        )}

        <div className="grid grid-cols-2 gap-3">
          <FormGroup label="Próxima cobrança *">
            <Input type="date" value={form.nextChargeDate} onChange={e => f('nextChargeDate', e.target.value)} />
          </FormGroup>
          <FormGroup label="Encerramento (opcional)">
            <Input type="date" value={form.endDate} onChange={e => f('endDate', e.target.value)} />
          </FormGroup>
        </div>
      </>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        {[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-50">Assinaturas</h2>
          <p className="text-sm text-muted mt-0.5">
            {activeCount} ativa{activeCount !== 1 ? 's' : ''} · Custo mensal estimado: {formatCurrency(totalMonthly)}
          </p>
        </div>
        <Button onClick={openCreate} size="sm">+ Nova assinatura</Button>
      </div>

      {/* Lista */}
      {subs.length === 0 ? (
        <EmptyState
          title="Nenhuma assinatura"
          description="Adicione suas assinaturas recorrentes como Netflix, Spotify, academia, etc."
          action={<Button onClick={openCreate}>Adicionar assinatura</Button>}
        />
      ) : (
        <div className="space-y-3">
          {subs.map(sub => (
            <Card key={sub.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-slate-800 dark:text-zinc-100 truncate">{sub.description}</p>
                    <Badge variant={STATUS_V[sub.status]}>{STATUS_L[sub.status]}</Badge>
                    {sub.category && (
                      <span className="text-[11px] bg-subtle dark:bg-white/5 text-muted px-2 py-0.5 rounded-full">{sub.category.name}</span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                    <span className="font-semibold text-slate-700 dark:text-zinc-200 text-base">{formatCurrency(Number(sub.value))}</span>
                    <span>· {PERIOD_L[sub.periodicity]}</span>
                    <span>· {PM_LABELS[sub.paymentMethod]}{sub.card ? ` (${sub.card.name})` : ''}</span>
                    <span>· Próxima: {new Date(sub.nextChargeDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</span>
                    {sub.endDate && <span>· Encerra: {new Date(sub.endDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</span>}
                  </div>
                </div>

                {sub.status !== 'cancelled' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="ghost" size="xs" onClick={() => openEdit(sub)} disabled={!!actionLoading}>
                      Editar
                    </Button>
                    <Button
                      variant="ghost" size="xs"
                      onClick={() => handlePause(sub)}
                      disabled={actionLoading === sub.id}
                    >
                      {sub.status === 'paused' ? 'Reativar' : 'Pausar'}
                    </Button>
                    <Button
                      variant="danger" size="xs"
                      onClick={() => handleCancel(sub)}
                      disabled={actionLoading === sub.id}
                    >
                      Cancelar
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal criar */}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Nova assinatura"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(false)}>Cancelar</Button>
            <Button onClick={handleSave} loading={saving}>Salvar</Button>
          </>
        }
      >
        {renderForm()}
      </Modal>

      {/* Modal editar */}
      <Modal
        open={!!editModal}
        onClose={() => setEditModal(null)}
        title="Editar assinatura"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditModal(null)}>Cancelar</Button>
            <Button onClick={handleSave} loading={saving}>Salvar</Button>
          </>
        }
      >
        {renderForm()}
      </Modal>
    </div>
  );
}
