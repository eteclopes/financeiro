import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Button } from '../components/ui/index';

export default function RegisterPage() {
  const navigate  = useNavigate();
  const register  = useAuthStore((s) => s.register);
  const clearError = useAuthStore((s) => s.clearError);
  const error     = useAuthStore((s) => s.error);
  const status    = useAuthStore((s) => s.status);
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');

  const inputClass = "w-full bg-white/10 border border-white/20 text-white placeholder:text-slate-500 rounded-xl px-4 py-3 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all";

  async function handleSubmit(e) {
    e.preventDefault();
    clearError();
    const ok = await register(name.trim(), email.trim().toLowerCase(), password);
    if (ok) navigate('/dashboard', { replace: true });
  }

  return (
    <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-8 shadow-modal">
      <h1 className="text-2xl font-bold text-white mb-1">Criar conta</h1>
      <p className="text-slate-400 text-sm mb-7">Comece a controlar suas finanças hoje</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="sr-only">Nome completo</label>
          <input id="name" name="name" type="text" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" autoComplete="name" className={inputClass} />
        </div>
        <div>
          <label htmlFor="email" className="sr-only">E-mail</label>
          <input id="email" name="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" autoComplete="email" className={inputClass} />
        </div>
        <div>
          <label htmlFor="password" className="sr-only">Senha (mínimo 8 caracteres, com letras e números)</label>
          <input id="password" name="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres (letras e números)" autoComplete="new-password" className={inputClass} />
        </div>

        {error && (
          <div role="alert" className="bg-danger/20 border border-danger/30 text-red-300 text-sm px-4 py-3 rounded-xl">{error}</div>
        )}

        <Button type="submit" loading={status === 'loading'} className="w-full justify-center py-3 text-base">
          Criar conta
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-400">
        Já tem conta?{' '}
        <Link to="/login" className="text-primary hover:text-primary-light transition-colors font-medium">Entrar</Link>
      </p>
    </div>
  );
}
