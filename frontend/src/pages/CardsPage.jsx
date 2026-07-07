import { useState, useEffect, useCallback } from 'react';
import { cardsApi, categoriesApi } from '../lib/services';
import { formatCurrency, formatShortDate } from '../lib/format';
import { Card, CardHeader, Badge, Button, EmptyState, ProgressBar } from '../components/ui/index';
import { Modal, FormGroup, Input, Select } from '../components/ui/Modal';
import { CategorySelect } from '../components/ui/CategorySelect';
import { useUIStore } from '../store/uiStore';

const COLORS = ['#10B981','#3B82F6','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#EC4899'];
const STATUS_V = { open:'info', closed:'warning', paid:'success' };
const STATUS_L = { open:'Aberta', closed:'Fechada', paid:'Paga' };

export default function CardsPage() {
  const [cards, setCards]     = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loadingInv, setLoadingInv] = useState(false);
  const [tab, setTab] = useState('invoices');

  const [cardModal, setCardModal]   = useState(false);
  const [purchaseModal, setPurchaseModal] = useState(false);
  const [payTarget, setPayTarget]   = useState(null);
  const [saving, setSaving]         = useState(false);
  const [paying, setPaying]         = useState(false);
  const [invMethod, setInvMethod]   = useState('pix');

  const [cardForm, setCardForm] = useState({ name:'', color: COLORS[0], limitValue:'', closingDay:'20', dueDay:'27' });
  const [purchaseForm, setPurchaseForm] = useState({ description:'', categoryId:'', totalValue:'', installmentsCount:'1', purchaseDate: new Date().toISOString().slice(0,10) });

  const toast = useUIStore((s) => s);

  const loadCards = useCallback(async () => {
    setLoading(true);
    try {
      const [c, cats] = await Promise.all([cardsApi.list(), categoriesApi.list('expense')]);
      setCards(c.data.cards ?? []);
      setCategories(cats.data.categories ?? []);
      if (!selected && c.data.cards?.length > 0) setSelected(c.data.cards[0]);
    } catch { toast.error('Erro ao carregar cartões.'); }
    finally { setLoading(false); }
  }, []);

  const loadInvoices = useCallback(async () => {
    if (!selected) return;
    setLoadingInv(true);
    try { const r = await cardsApi.listInvoices(selected.id); setInvoices(r.data.invoices ?? []); }
    catch { toast.error('Erro ao carregar faturas.'); }
    finally { setLoadingInv(false); }
  }, [selected]);

  useEffect(() => { loadCards(); }, [loadCards]);
  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  async function saveCard() {
    if (!cardForm.name || !cardForm.limitValue) { toast.error('Preencha nome e limite.'); return; }
    setSaving(true);
    try {
      await cardsApi.create({ ...cardForm, limitValue: parseFloat(cardForm.limitValue), closingDay: parseInt(cardForm.closingDay), dueDay: parseInt(cardForm.dueDay) });
      toast.success('Cartão criado!'); setCardModal(false); loadCards();
    } catch (e) { toast.error(e?.response?.data?.error?.message ?? 'Erro.'); }
    finally { setSaving(false); }
  }

  async function savePurchase() {
    if (!selected || !purchaseForm.description || !purchaseForm.totalValue) { toast.error('Preencha os campos obrigatórios.'); return; }
    setSaving(true);
    try {
      const cat = purchaseForm.categoryId || (categories[0]?.id ?? '');
      await cardsApi.createPurchase(selected.id, { ...purchaseForm, totalValue: parseFloat(purchaseForm.totalValue), installmentsCount: parseInt(purchaseForm.installmentsCount), categoryId: String(cat) });
      toast.success('Compra registrada!'); setPurchaseModal(false); loadCards(); loadInvoices();
    } catch (e) { toast.error(e?.response?.data?.error?.message ?? 'Erro.'); }
    finally { setSaving(false); }
  }

  async function payInvoice() {
    setPaying(true);
    try {
      await cardsApi.payInvoice(payTarget.id, { paymentMethod: invMethod });
      toast.success('Fatura paga com sucesso!'); setPayTarget(null); loadInvoices(); loadCards();
    } catch (e) { toast.error(e?.response?.data?.error?.message ?? 'Erro.'); }
    finally { setPaying(false); }
  }

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">{Array.from({length:3}).map((_,i)=><div key={i} className="h-44 shimmer-bg rounded-3xl" />)}</div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-xl text-slate-900 dark:text-zinc-50">Cartões de Crédito</h2>
          <p className="text-sm text-muted mt-0.5">{cards.length} cartão(ões) cadastrado(s)</p>
        </div>
        <Button onClick={() => setCardModal(true)}>+ Novo Cartão</Button>
      </div>

      {cards.length === 0 ? (
        <Card><EmptyState icon="💳" title="Nenhum cartão cadastrado" description="Adicione um cartão para controlar gastos e faturas."
          action={<Button onClick={() => setCardModal(true)}>Adicionar cartão</Button>} /></Card>
      ) : (
        <>
          {/* Cards visuais */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cards.map((card) => {
              const pct = Math.min(Math.round((card.usedLimit / Number(card.limitValue)) * 100), 100);
              const isSelected = String(selected?.id) === String(card.id);
              return (
                <button key={card.id} onClick={() => setSelected(card)} className={`text-left rounded-3xl p-5 text-white transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${isSelected ? 'ring-2 ring-white/50 ring-offset-2 ring-offset-bg shadow-xl' : 'shadow-md'}`}
                  style={{ background: `linear-gradient(135deg, ${card.color ?? '#10B981'}, ${card.color ?? '#10B981'}99)` }}>
                  <div className="flex justify-between items-start mb-4">
                    <p className="font-bold text-lg">{card.name}</p>
                    <span className="text-white/60 text-xs bg-white/10 px-2 py-1 rounded-lg">
                      Fecha d{card.closingDay}
                    </span>
                  </div>
                  <p className="font-mono text-2xl font-bold mb-1">{formatCurrency(card.availableLimit)}</p>
                  <p className="text-white/60 text-xs mb-3">disponível de {formatCurrency(card.limitValue)}</p>
                  <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                    <div className="h-full bg-white rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-white/60 text-xs mt-1 text-right">{pct}% utilizado</p>
                </button>
              );
            })}
          </div>

          {/* Detalhe do cartão selecionado */}
          {selected && (
            <Card padding={false}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-border dark:border-white/[0.06] flex-wrap gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-zinc-50">{selected.name}</h3>
                  <p className="text-xs text-muted mt-0.5">
                    Fecha dia {selected.closingDay} · Vence dia {selected.dueDay} · Limite {formatCurrency(selected.limitValue)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <div className="flex gap-1 bg-subtle dark:bg-white/5 p-1 rounded-xl">
                    {['invoices'].map((t) => (
                      <button key={t} onClick={() => setTab(t)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${tab===t?'bg-white dark:bg-panel-dark shadow text-slate-900 dark:text-zinc-50':'text-muted'}`}>
                        Faturas
                      </button>
                    ))}
                  </div>
                  <Button size="sm" onClick={() => { setPurchaseForm({ description:'', categoryId:'', totalValue:'', installmentsCount:'1', purchaseDate: new Date().toISOString().slice(0,10) }); setPurchaseModal(true); }}>
                    + Compra
                  </Button>
                </div>
              </div>

              {loadingInv ? (
                <div className="p-5 space-y-3">{Array.from({length:3}).map((_,i)=><div key={i} className="h-10 shimmer-bg rounded-xl" />)}</div>
              ) : invoices.length === 0 ? (
                <EmptyState icon="🧾" title="Sem faturas" description="As faturas serão geradas automaticamente conforme você registrar compras." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-subtle/60 dark:bg-white/[0.03]"><tr>
                      {['Referência','Fechamento','Vencimento','Total','Status',''].map(h=><th key={h} className="table-header">{h}</th>)}
                    </tr></thead>
                    <tbody className="divide-y divide-border/60 dark:divide-white/[0.06]">
                      {invoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-subtle/40 dark:hover:bg-white/[0.03] transition-colors">
                          <td className="table-cell font-semibold text-slate-800 dark:text-zinc-200">{String(inv.referenceMonth).padStart(2,'0')}/{inv.referenceYear}</td>
                          <td className="table-cell text-muted">{formatShortDate(inv.closingDate)}</td>
                          <td className="table-cell text-muted">{formatShortDate(inv.dueDate)}</td>
                          <td className="table-cell font-mono tabular-nums font-bold text-slate-800 dark:text-zinc-200">{formatCurrency(inv.totalValue)}</td>
                          <td className="table-cell"><Badge variant={STATUS_V[inv.status]}>{STATUS_L[inv.status]}</Badge></td>
                          <td className="table-cell">
                            {inv.status !== 'paid' && (
                              <Button size="sm" onClick={() => { setPayTarget(inv); setInvMethod('pix'); }}>Pagar</Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </>
      )}

      {/* Modal Novo Cartão */}
      <Modal open={cardModal} onClose={() => setCardModal(false)} title="Novo Cartão" size="sm">
        <div className="space-y-4">
          <FormGroup label="Nome do cartão" required><Input value={cardForm.name} onChange={(e) => setCardForm({...cardForm,name:e.target.value})} placeholder="Ex: Nubank, Inter..." autoFocus /></FormGroup>
          <FormGroup label="Limite de crédito" required><Input type="number" min="0" step="0.01" value={cardForm.limitValue} onChange={(e) => setCardForm({...cardForm,limitValue:e.target.value})} /></FormGroup>
          <div className="grid grid-cols-2 gap-3">
            <FormGroup label="Dia de fechamento"><Input type="number" min="1" max="31" value={cardForm.closingDay} onChange={(e) => setCardForm({...cardForm,closingDay:e.target.value})} /></FormGroup>
            <FormGroup label="Dia de vencimento"><Input type="number" min="1" max="31" value={cardForm.dueDay} onChange={(e) => setCardForm({...cardForm,dueDay:e.target.value})} /></FormGroup>
          </div>
          <FormGroup label="Cor do cartão">
            <div className="flex gap-2 flex-wrap mt-1">
              {COLORS.map((c) => (
                <button key={c} onClick={() => setCardForm({...cardForm,color:c})}
                  className={`h-9 w-9 rounded-xl transition-all hover:scale-110 ${cardForm.color===c?'ring-2 ring-offset-2 ring-slate-400 scale-110':''}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </FormGroup>
          <div className="flex gap-3 justify-end pt-1">
            <Button variant="outline" onClick={() => setCardModal(false)}>Cancelar</Button>
            <Button onClick={saveCard} loading={saving}>Criar Cartão</Button>
          </div>
        </div>
      </Modal>

      {/* Modal Nova Compra */}
      <Modal open={purchaseModal} onClose={() => setPurchaseModal(false)} title={`Nova Compra — ${selected?.name}`}>
        <div className="space-y-4">
          <FormGroup label="Descrição" required><Input value={purchaseForm.description} onChange={(e) => setPurchaseForm({...purchaseForm,description:e.target.value})} placeholder="Ex: Tênis, Notebook..." autoFocus /></FormGroup>
          <FormGroup label="Categoria">
            <CategorySelect
              value={purchaseForm.categoryId}
              onChange={(e) => setPurchaseForm({...purchaseForm,categoryId:e.target.value})}
              categories={categories}
              type="expense"
              onCategoryCreated={(cat) => setCategories((prev) => [...prev, cat])}
            />
          </FormGroup>
          <div className="grid grid-cols-3 gap-3">
            <FormGroup label="Valor total" required><Input type="number" min="0" step="0.01" value={purchaseForm.totalValue} onChange={(e) => setPurchaseForm({...purchaseForm,totalValue:e.target.value})} /></FormGroup>
            <FormGroup label="Parcelas"><Input type="number" min="1" max="48" value={purchaseForm.installmentsCount} onChange={(e) => setPurchaseForm({...purchaseForm,installmentsCount:e.target.value})} /></FormGroup>
            <FormGroup label="Data"><Input type="date" value={purchaseForm.purchaseDate} onChange={(e) => setPurchaseForm({...purchaseForm,purchaseDate:e.target.value})} /></FormGroup>
          </div>
          {purchaseForm.totalValue && parseInt(purchaseForm.installmentsCount) > 0 && (
            <div className="bg-primary-subtle border border-primary/20 rounded-xl p-3 text-sm">
              <span className="text-primary-dark font-medium">{purchaseForm.installmentsCount}x de </span>
              <span className="font-mono font-bold text-primary-dark">{formatCurrency(parseFloat(purchaseForm.totalValue||0)/parseInt(purchaseForm.installmentsCount||1))}</span>
            </div>
          )}
          <div className="flex gap-3 justify-end pt-1">
            <Button variant="outline" onClick={() => setPurchaseModal(false)}>Cancelar</Button>
            <Button onClick={savePurchase} loading={saving}>Registrar Compra</Button>
          </div>
        </div>
      </Modal>

      {/* Modal Pagar Fatura */}
      <Modal open={!!payTarget} onClose={() => setPayTarget(null)} title="Pagar Fatura" size="sm">
        {payTarget && (
          <div className="space-y-4">
            <div className="bg-subtle dark:bg-white/[0.04] rounded-2xl p-4">
              <p className="text-xs text-muted mb-1">Valor total da fatura</p>
              <p className="text-3xl font-bold font-mono text-slate-900 dark:text-zinc-50">{formatCurrency(payTarget.totalValue)}</p>
              <p className="text-xs text-muted mt-1">{String(payTarget.referenceMonth).padStart(2,'0')}/{payTarget.referenceYear}</p>
            </div>
            <FormGroup label="Forma de pagamento">
              <Select value={invMethod} onChange={(e) => setInvMethod(e.target.value)}>
                {[['pix','PIX'],['debit','Débito'],['transfer','Transferência'],['cash','Dinheiro']].map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </Select>
            </FormGroup>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setPayTarget(null)}>Cancelar</Button>
              <Button onClick={payInvoice} loading={paying}>Confirmar Pagamento</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}