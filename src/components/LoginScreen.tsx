import { useState, type FormEvent } from 'react';
import { ArrowRight, KeyRound, ShieldCheck, User } from 'lucide-react';
import type { PlayerProfile } from '../types';
import { apiFetch } from '../utils/api';

interface LoginScreenProps {
  onLoginSuccess: (token: string, user: PlayerProfile) => void;
}

export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heroError, setHeroError] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const cleanUser = username.trim().toLowerCase();
    const cleanPin = pin.trim();

    if (!cleanUser) {
      setError('Informe seu nome de usuário.');
      return;
    }
    if (!/^\d{6}$/.test(cleanPin)) {
      setError('A senha numérica deve ter exatamente 6 dígitos.');
      return;
    }

    setLoading(true);
    try {
      const data = await apiFetch<{ token: string; user: PlayerProfile }>(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ username: cleanUser, pin: cleanPin }),
        },
      );
      onLoginSuccess(data.token, data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao entrar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F6F8F7] flex flex-col lg:flex-row">
      {/* Visual editorial panel */}
      <div className="relative lg:w-1/2 min-h-[220px] lg:min-h-screen bg-slate-900 overflow-hidden flex flex-col justify-end">
        {!heroError ? (
          <img
            src="/src/assets/images/futsal_court_hero_1795567439483.jpg"
            alt="Quadra coberta de futebol de salão"
            referrerPolicy="no-referrer"
            onError={() => setHeroError(true)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/50 to-slate-950/20" />
        <div className="relative z-10 p-6 sm:p-10 lg:p-14 max-w-xl">
          <p className="text-xs font-medium tracking-wide text-emerald-300 mb-2">
            Futebol de Salão · Gestão Completa
          </p>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold text-white tracking-tight text-balance leading-tight">
            QuadraLivre
          </h1>
          <p className="mt-3 text-sm sm:text-base text-slate-200 leading-relaxed max-w-md">
            Controle de elenco, fichas de saúde, caixa mensal, sorteio equilibrado de times, placar ao vivo na beira da quadra e votação do craque.
          </p>
        </div>
      </div>

      {/* Login form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 lg:p-16">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
          <div className="mb-6">
            <h2 className="text-2xl font-display font-bold text-slate-900">
              Entrar na pelada
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Acesse com seu login de peladeiro e senha numérica de 6 dígitos.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="login-username"
                className="block text-sm font-medium text-slate-800 mb-1.5"
              >
                Usuário
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="login-username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  placeholder="ex: didi"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full h-12 pl-10 pr-4 rounded-xl border border-slate-300 bg-white text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="login-pin"
                className="block text-sm font-medium text-slate-800 mb-1.5"
              >
                Senha numérica (6 dígitos)
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="login-pin"
                  type="password"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  autoComplete="current-password"
                  placeholder="••••••"
                  value={pin}
                  onChange={(e) =>
                    setPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  className="w-full h-12 pl-10 pr-4 rounded-xl border border-slate-300 bg-white text-slate-900 font-mono text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                />
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:scale-[0.99] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
            >
              <span>{loading ? 'Validando acesso...' : 'Entrar no sistema'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-200">
            <div className="flex items-start gap-2.5 text-xs text-slate-600">
              <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium text-slate-800">
                  Administradores iniciais cadastrados:
                </p>
                <p className="font-mono tabular-nums text-slate-600">
                  didi · senha 123456 &nbsp;|&nbsp; mario · senha 123456
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setUsername('didi');
                      setPin('123456');
                      setError(null);
                    }}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 transition-colors cursor-pointer"
                  >
                    Preencher Didi (Admin)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUsername('mario');
                      setPin('123456');
                      setError(null);
                    }}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 transition-colors cursor-pointer"
                  >
                    Preencher Mário (Admin)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUsername('lucas');
                      setPin('123456');
                      setError(null);
                    }}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 transition-colors cursor-pointer"
                  >
                    Preencher Lucas (Peladeiro)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
