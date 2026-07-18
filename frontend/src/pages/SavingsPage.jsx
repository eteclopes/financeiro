import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { savingsApi } from '../lib/services';
import { extractErrorMessage } from '../lib/api';
import { formatCurrency, formatShortDate } from '../lib/format';
import { Card, CardHeader, Badge, Button, EmptyState } from '../components/ui/index';
import { Modal, ConfirmDialog, FormGroup, Input, Select } from '../components/ui/Modal';
import { useUIStore } from '../store/uiStore';
import { useThemeStore } from '../store/themeStore';

function CustomTooltip({ active, payload, label }) {
  const theme = useThemeStore((s) => s.theme);
  if (!active || !payload?.length) return null;
  return (
    <div className={`rounded-xl p-3 shadow-modal text-xs border ${theme === 'dark' ? 'bg-panel-dark border-white/10' : 'bg-white border-border'}`}>
      <p className="text-muted mb-1">{label}</p>
      <p className="font-bold text-primary-dark dark:text-primary-light">{formatCurrency(payload[0]?.value)}</p>
    </div>
  );
}

const ORIGIN_LABELS = { from_balance: 'Do saldo', external: 'Externo' };

export default function SavingsPage() {
  const [data, setData]       = useState({ balance: 0, transactions: [], stats: null });
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(null); // 'deposit' | 'withdraw'
  const [form, setForm]       = useState({ value:'', date: new Date().toISOString().slice(0,10), observation:'', origin:'from_balance' });
  const [saving, setSaving]   = useState(false);
  const [editTxModal, setEditTxModal] = useState(null);
  const [editTxForm, setEditTxForm]   = useState({ value:'', date:'', observation:'' });
  const [deleteTxTarget, setDeleteTxTarget] = useState(null);
  const [deletingTx, setDeletingTx]   = useState(false);
  const toast = useUIStore((s) => s);
  const theme = useThemeStore((s) => s.theme);
  const gridStroke = theme === 'dark' ? 'rgba(255,255,255,0.06)' : '#F1F5F9';
  const axisColor  = theme === 'dark' ? '#71717A' : '#94A3B8';

  const load = async () => {
    setLoading(true);
    try { const r = await savingsApi.get(); setData(r.data); }
    catch { toast.error('Erro ao carregar reserva.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  function openModal(type) {
    setModal(type);
    setForm({ value:'', date: new Date().toISOString().slice(0,10), observation:'', origin:'from_balance' });
  }

  async function handle() {
    if (!form.value || parseFloat(form.value) <= 0) { toast.error('Informe um valor válido.'); return; }
    setSaving(true);
    try {
      if (modal === 'deposit') {
        await savingsApi.deposit({ value: parseFloat(form.value), date: form.date, observation: form.observation, origin: form.origin });
      } else {
        await savingsApi.withdraw({ value: parseFloat(form.value), date: form.date, observation: form.observation });
      }
      toast.success(modal === 'deposit' ? 'Depósito realizado!' : 'Retirada realizada!');
      setModal(null); load();
    } catch (e) { toast.error(extractErrorMessage(e, 'Erro.')); }
    finally { setSaving(false); }
  }

  function openEditTx(t) {
    setEditTxForm({ value: String(t.value), date: new Date(t.transactionDate).toISOString().slice(0,10), observation: t.observation ?? '' });
    setEditTxModal(t);
  }

  async function saveEditTx() {
    if (!editTxForm.value || parseFloat(editTxForm.value) <= 0) { toast.error('Informe um valor válido.'); return; }
    setSaving(true);
    try {
      await savingsApi.update(editTxModal.id, { value: parseFloat(editTxForm.value), date: editTxForm.date, observation: editTxForm.observation || undefined });
      toast.success('Lançamento atualizado!'); setEditTxModal(null); load();
    } catch (e) { toast.error(extractErrorMessage(e, 'Erro ao atualizar.')); }
    finally { setSaving(false); }
  }

  async function handleDeleteTx() {
    setDeletingTx(true);
    try {
      await savingsApi.delete(deleteTxTarget.id);
      toast.success('Lançamento excluído.'); setDeleteTxTarget(null); load();
    } catch (e) { toast.error(extractErrorMessage(e, 'Erro ao excluir.')); }
    finally { setDeletingTx(false); }
  }

  const chartData = [...(data.transactions ?? [])].reverse().map((t) => ({
    label: formatShortDate(t.transactionDate),
    saldo: Number(t.balanceAfter),
  }));

  const stats = data.stats;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Hero card */}
      <div className="bg-gradient-to-br from-primary to-primary-dark rounded-3xl p-6 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white rounded-full translate-y-1/2 -translate-x-1/2" />
        </div>
        <div className="relative">
          <p className="text-white/70 text-sm font-medium mb-1">Saldo Guardado</p>
          <p className="text-5xl font-bold font-mono tabular-nums mb-4">{formatCurrency(data.balance)}</p>
          <p className="text-white/60 text-xs mb-6">Reserva financeira separada do fluxo mensal</p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => openModal('withdraw')}
              className="bg-white/10 border-white/30 text-white hover:bg-white/20 flex-1 justify-center">
              − Retirar
            </Button>
            <Button onClick={() => openModal('deposit')}
              className="bg-white text-primary-dark hover:bg-white/90 flex-1 justify-center font-bold">
              + Depositar
            </Button>
          </div>
        </div>
      </div>

      {/* Cards de estatísticas — Item 6 */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-4 text-center">
            <p className="text-xs text-muted mb-1">Total reservado</p>
            <p className="text-2xl font-bold font-mono text-primary-dark dark:text-primary-light">{formatCurrency(stats.totalReserved)}</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-xs text-muted mb-1">Saiu do saldo</p>
            <p className="text-2xl font-bold font-mono text-warning-dark dark:text-warning-light">{formatCurrency(stats.fromBalance)}</p>
            <p className="text-[11px] text-muted mt-0.5">Descontado do fluxo mensal</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-xs text-muted mb-1">Valor externo</p>
            <p className="text-2xl font-bold font-mono text-info-dark dark:text-info-light">{formatCurrency(stats.external)}</p>
            <p className="text-[11px] text-muted mt-0.5">Já guardado fora da conta</p>
          </Card>
        </div>
      )}

      {/* Gráfico */}
      {chartData.length > 1 && (
        <Card>
          <CardHeader title="Evolução da Reserva" />
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ left: -20 }}>
                <defs>
                  <linearGradient id="saldoGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="saldo" stroke="#10B981" strokeWidth={2.5} fill="url(#saldoGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Histórico */}
      <Card padding={false}>
        <div className="px-5 py-4 border-b border-border dark:border-white/[0.06]">
          <h3 className="font-semibold text-slate-900 dark:text-zinc-50">Histórico de Movimentações</h3>
          <p className="text-xs text-muted mt-0.5">Só o lançamento mais recente pode ser editado ou excluído.</p>
        </div>
        {loading ? <div className="p-5 space-y-3">{Array.from({length:4}).map((_,i)=><div key={i} className="h-10 shimmer-bg rounded-xl" />)}</div>
          : data.transactions.length === 0
            ? <EmptyState icon="🏦" title="Sem movimentações" description="Faça o primeiro depósito para começar sua reserva de emergência." />
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-subtle/60 dark:bg-white/[0.03]"><tr>
                    {['Tipo','Origem','Valor','Saldo após','Data','Observação',''].map(h=>(
                      <th key={h} className="table-header">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody className="divide-y divide-border/60 dark:divide-white/[0.06]">
                    {data.transactions.map((t, idx) => (
                      <tr key={t.id} className="hover:bg-subtle/40 dark:hover:bg-white/[0.03] transition-colors">
                        <td className="table-cell">
                          <Badge variant={t.type==='deposit'?'success':'danger'}>{t.type==='deposit'?'Depósito':'Retirada'}</Badge>
                        </td>
                        <td className="table-cell">
                          {t.type === 'deposit' ? (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.origin === 'external' ? 'bg-info-subtle text-info-dark' : 'bg-warning-subtle text-warning-dark'}`}>
                              {ORIGIN_LABELS[t.origin] ?? t.origin}
                            </span>
                          ) : <span className="text-muted text-xs">—</span>}
                        </td>
                        <td className={`table-cell font-mono tabular-nums font-bold ${t.type==='deposit'?'text-primary-dark dark:text-primary-light':'text-danger-dark dark:text-danger-light'}`}>
                          {t.type==='deposit'?'+':'-'}{formatCurrency(t.value)}
                        </td>
                        <td className="table-cell font-mono tabular-nums text-slate-600 dark:text-zinc-400">{formatCurrency(t.balanceAfter)}</td>
                        <td className="table-cell text-muted">{formatShortDate(t.transactionDate)}</td>
                        <td className="table-cell text-muted">{t.observation ?? '—'}</td>
                        <td className="table-cell">
                          {idx === 0 && (
                            <div className="flex items-center gap-2 justify-end">
                              <Button size="sm" variant="ghost" onClick={() => openEditTx(t)}>Editar</Button>
                              <Button size="sm" variant="ghost" className="text-danger" onClick={() => setDeleteTxTarget(t)}>Excluir</Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </Card>

      {/* Modal Depositar */}
      <Modal open={modal === 'deposit'} onClose={() => setModal(null)} title="Depositar na Reserva" size="sm">
        <div className="space-y-4">
          {/* Item 6: Origem do valor */}
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-zinc-300 mb-2">Origem do valor</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { val:'from_balance', label:'Retirar do saldo', desc:'Desconta do saldo da conta', icon:'💰' },
                { val:'external',     label:'Já guardado fora', desc:'Apenas registra na reserva', icon:'🏦' },
              ].map(opt => (
                <button key={opt.val} type="button"
                  onClick={() => setForm({...form, origin: opt.val})}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    form.origin === opt.val
                      ? 'border-primary bg-primary-subtle dark:bg-primary/10'
                      : 'border-border dark:border-white/10 hover:border-primary/40'
                  }`}>
                  <p className="text-sm font-medium text-slate-800 dark:text-zinc-100">{opt.icon} {opt.label}</p>
                  <p className="text-[11px] text-muted mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
            {form.origin === 'from_balance' && (
              <p className="text-xs text-warning-dark bg-warning-subtle border border-warning/20 rounded-xl p-2.5 mt-2">
                ⚠ Este valor será descontado do saldo disponível do mês.
              </p>
            )}
            {form.origin === 'external' && (
              <p className="text-xs text-info-dark bg-info-subtle border border-info/20 rounded-xl p-2.5 mt-2">
                ℹ Apenas registra na reserva. O saldo da conta não é alterado.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormGroup label="Valor" required><Input type="number" min="0" step="0.01" value={form.value} onChange={(e) => setForm({...form,value:e.target.value})} autoFocus /></FormGroup>
            <FormGroup label="Data"><Input type="date" value={form.date} onChange={(e) => setForm({...form,date:e.target.value})} /></FormGroup>
          </div>
          <FormGroup label="Observação"><Input value={form.observation} onChange={(e) => setForm({...form,observation:e.target.value})} placeholder="Opcional" /></FormGroup>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setModal(null)}>Cancelar</Button>
            <Button onClick={handle} loading={saving}>Depositar</Button>
          </div>
        </div>
      </Modal>

      {/* Modal Retirar */}
      <Modal open={modal === 'withdraw'} onClose={() => setModal(null)} title="Retirar da Reserva" size="sm">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormGroup label="Valor" required><Input type="number" min="0" step="0.01" value={form.value} onChange={(e) => setForm({...form,value:e.target.value})} autoFocus /></FormGroup>
            <FormGroup label="Data"><Input type="date" value={form.date} onChange={(e) => setForm({...form,date:e.target.value})} /></FormGroup>
          </div>
          <FormGroup label="Observação"><Input value={form.observation} onChange={(e) => setForm({...form,observation:e.target.value})} placeholder="Opcional" /></FormGroup>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setModal(null)}>Cancelar</Button>
            <Button variant="danger" onClick={handle} loading={saving}>Retirar</Button>
          </div>
        </div>
      </Modal>

      {/* Editar último lançamento */}
      <Modal open={!!editTxModal} onClose={() => setEditTxModal(null)} title={`Editar ${editTxModal?.type==='deposit'?'Depósito':'Retirada'}`} size="sm">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormGroup label="Valor" required><Input type="number" min="0" step="0.01" value={editTxForm.value} onChange={(e) => setEditTxForm({...editTxForm,value:e.target.value})} autoFocus /></FormGroup>
            <FormGroup label="Data"><Input type="date" value={editTxForm.date} onChange={(e) => setEditTxForm({...editTxForm,date:e.target.value})} /></FormGroup>
          </div>
          <FormGroup label="Observação"><Input value={editTxForm.observation} onChange={(e) => setEditTxForm({...editTxForm,observation:e.target.value})} placeholder="Opcional" /></FormGroup>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setEditTxModal(null)}>Cancelar</Button>
            <Button onClick={saveEditTx} loading={saving}>Salvar Alteração</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTxTarget}
        onClose={() => setDeleteTxTarget(null)}
        onConfirm={handleDeleteTx}
        loading={deletingTx}
        title="Excluir lançamento"
        confirmLabel="Excluir"
        description={`Excluir este ${deleteTxTarget?.type==='deposit'?'depósito':'saque'} de ${formatCurrency(deleteTxTarget?.value ?? 0)}? O saldo guardado volta a ser o que era antes dele.`}
      />
    </div>
  );
}
