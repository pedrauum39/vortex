'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { criarClienteBrowser } from '@/lib/supabase/client';

const CONFIGURADO = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  async function entrar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEntrando(true);

    const { error } = await criarClienteBrowser().auth.signInWithPassword({
      email,
      password: senha,
    });

    if (error) {
      setErro('E-mail ou senha incorretos.');
      setEntrando(false);
      return;
    }

    router.replace('/');
    router.refresh();
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="text-accent">VORTEX</span>
          </h1>
          <p className="mt-1 text-sm text-texto-fraco">Escala, turnos e invoice do time</p>
        </div>

        {!CONFIGURADO && (
          <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Supabase ainda não configurado. Copie <code>.env.example</code> para{' '}
            <code>.env.local</code> e preencha as chaves.
          </p>
        )}

        <form
          onSubmit={entrar}
          className="rounded-2xl border border-borda bg-superficie p-6 shadow-2xl shadow-black/40"
        >
          <label className="block text-sm text-texto-fraco" htmlFor="email">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-borda bg-fundo px-3 py-2.5 text-sm outline-none focus:border-accent"
          />

          <label className="mt-4 block text-sm text-texto-fraco" htmlFor="senha">
            Senha
          </label>
          <input
            id="senha"
            type="password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-borda bg-fundo px-3 py-2.5 text-sm outline-none focus:border-accent"
          />

          {erro && <p className="mt-4 text-sm text-red-400">{erro}</p>}

          <button
            type="submit"
            disabled={entrando || !CONFIGURADO}
            className="mt-6 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-fundo transition hover:bg-accent-forte disabled:opacity-50"
          >
            {entrando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-texto-fraco">
          Não há auto-cadastro. Peça o acesso ao admin.
        </p>
      </div>
    </main>
  );
}
