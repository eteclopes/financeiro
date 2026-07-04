import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { categoriesApi } from '../lib/services';
import { Card, CardHeader, Badge, Button } from '../components/ui/index';
import { FormGroup, Input, Select } from '../components/ui/Modal';
import { useUIStore } from '../store/uiStore';

export default function SettingsPage() {
  const user  = useAuthStore((s) => s.user);
  const toast = useUIStore((s) => s);
  const [catType, setCatType]     = useState('expense');
  const [categories, setCategories] = useState([]);
  const [catName, setCatName]     = useState('');
  const [savingCat, setSavingCat] = useState(false);

  async function loadCats() {
    try { const r = await categoriesApi.list(catType); setCategories(r.data.categories ?? []); }
    catch { toast.error('Erro ao carregar categorias.'); }
  }

  useEffect(() => { loadCats(); }, [catType]);

  async function saveCategory() {
    if (!catName.trim()) { toast.error('Informe o nome da categoria.'); return; }
    setSavingCat(true);
    try {
      await categoriesApi.create({ name: catName.trim(), type: catType });
      toast.success('Categoria criada!'); setCatName(''); loadCats();
    } catch (e) { toast.error(e?.response?.data?.error?.message ?? 'Erro.'); }
    finally { setSavingCat(false); }
  }

  async function deleteCategory(id) {
    try { await categoriesApi.delete(id); toast.success('Categoria removida.'); loadCats(); }
    catch (e) { toast.error(e?.response?.data?.error?.message ?? 'Categoria em uso ou não encontrada.'); }
  }

  const userCats    = categories.filter((c) => c.userId != null);
  const defaultCats = categories.filter((c) => c.userId == null);

  return (
    <div className="space-y-5 max-w-2xl animate-fade-in">
      <h2 className="font-bold text-xl text-slate-900 dark:text-zinc-50">Configurações</h2>

      {/* Perfil */}
      <Card>
        <CardHeader title="Perfil" />
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 bg-gradient-to-br from-primary to-primary-dark rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-md shrink-0">
            {user?.name?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div>
            <p className="font-bold text-slate-900 dark:text-zinc-50 text-lg">{user?.name}</p>
            <p className="text-sm text-muted">{user?.email}</p>
            <Badge variant="success" className="mt-1.5">Conta ativa</Badge>
          </div>
        </div>
      </Card>

      {/* Senha */}
      <Card>
        <CardHeader title="Alterar Senha" subtitle="A troca exige verificação por e-mail por segurança." />
        <div className="bg-info-subtle dark:bg-info/10 border border-info/20 rounded-xl p-4 text-sm text-info-dark dark:text-info-light mb-4">
          ℹ Para alterar sua senha, use a opção <strong>"Esqueci minha senha"</strong> na tela de login. Um link de redefinição será enviado para <strong>{user?.email}</strong>.
        </div>
        <Button variant="outline" onClick={() => window.location.href = '/forgot-password'}>
          Ir para redefinição de senha →
        </Button>
      </Card>

      {/* Categorias personalizadas */}
      <Card>
        <CardHeader title="Categorias Personalizadas" />

        <div className="flex gap-1 bg-subtle dark:bg-white/5 p-1 rounded-xl w-fit mb-5">
          {[['expense','Despesas'],['income','Receitas']].map(([t,l]) => (
            <button key={t} onClick={() => setCatType(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${catType===t?'bg-white dark:bg-panel-dark shadow text-slate-900 dark:text-zinc-50':'text-muted hover:text-slate-700 dark:hover:text-zinc-200'}`}>
              {l}
            </button>
          ))}
        </div>

        {/* Nova categoria */}
        <div className="flex gap-2 mb-5">
          <Input value={catName} onChange={(e) => setCatName(e.target.value)}
            placeholder={`Nome da nova categoria de ${catType === 'expense' ? 'despesa' : 'receita'}...`}
            className="flex-1"
            onKeyDown={(e) => e.key === 'Enter' && saveCategory()} />
          <Button onClick={saveCategory} loading={savingCat}>Criar</Button>
        </div>

        {/* Suas categorias */}
        {userCats.length > 0 && (
          <div className="mb-5">
            <p className="text-xs font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-wider mb-2">Suas categorias</p>
            <div className="flex flex-wrap gap-2">
              {userCats.map((cat) => (
                <div key={cat.id} className="flex items-center gap-1 bg-subtle dark:bg-white/[0.04] border border-border dark:border-white/10 rounded-xl pl-3 pr-1.5 py-1.5">
                  <span className="text-sm text-slate-700 dark:text-zinc-300 font-medium">{cat.name}</span>
                  <button onClick={() => deleteCategory(cat.id)}
                    className="h-5 w-5 rounded-lg hover:bg-danger-muted dark:hover:bg-danger/15 text-muted hover:text-danger flex items-center justify-center text-sm transition-colors ml-1">
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Categorias padrão */}
        <div>
          <p className="text-xs font-bold text-slate-500 dark:text-zinc-500 uppercase tracking-wider mb-2">Categorias padrão do sistema</p>
          <div className="flex flex-wrap gap-2">
            {defaultCats.map((cat) => (
              <span key={cat.id} className="text-xs bg-white dark:bg-panel-dark border border-border dark:border-white/10 text-muted px-3 py-1.5 rounded-xl font-medium">
                {cat.name}
              </span>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}