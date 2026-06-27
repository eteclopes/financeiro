import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Button } from '../components/ui/index';
import { FormGroup, Input } from '../components/ui/Modal';

export default function LoginPage() {
  const navigate  = useNavigate();
  const login     = useAuthStore((s) => s.login);
  const clearError = useAuthStore((s) => s.clearError);
  const error     = useAuthStore((s) => s.error);
  const status    = useAuthStore((s) => s.status);
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    clearError();
    const ok = await login(email.trim().toLowerCase(), password);
    if (ok) navigate('/dashboard', { replace: true });
  }

  return (
    <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-8 shadow-modal">
      <h1 className="text-2xl font-bold text-white mb-1">Bem-vindo de volta</h1>
      <p className="text-slate-400 text-sm mb-7">Entre na sua conta para continuar</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <FormGroup label={<span className="text-slate-300">E-mail</span>} htmlFor="email">
          <input id="email" type="email" required value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@email.com"
            className="w-full bg-white/10 border border-white/20 text-white placeholder:text-slate-500 rounded-xl px-4 py-3 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all" />
        </FormGroup>

        <FormGroup label={<span className="text-slate-300">Senha</span>} htmlFor="password">
          <input id="password" type="password" required value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full bg-white/10 border border-white/20 text-white placeholder:text-slate-500 rounded-xl px-4 py-3 text-sm focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all" />
        </FormGroup>

        {error && (
          <div className="bg-danger/20 border border-danger/30 text-red-300 text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        <Button type="submit" loading={status === 'loading'} className="w-full justify-center py-3 text-base">
          Entrar
        </Button>
      </form>

      <div className="mt-6 flex items-center justify-between text-sm">
        <Link to="/register" className="text-slate-400 hover:text-primary transition-colors">
          Criar conta
        </Link>
        <Link to="/forgot-password" className="text-slate-400 hover:text-primary transition-colors">
          Esqueci a senha
        </Link>
      </div>
    </div>
  );
}
