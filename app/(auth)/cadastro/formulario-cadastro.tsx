'use client';

import Link from 'next/link';
import { useState } from 'react';
import { criarClienteBrowser } from '@/lib/supabase/client';
import { CampoSenha } from '../campo-senha';
import { reivindicarNome } from './actions';

const CONFIGURADO = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
const OUTRO = 'outro';

type Resultado = { tipo: 'vinculado' } | { tipo: 'manual'; aviso?: string } | null;

export function FormularioCadastro({ reps }: { reps: { id: string; nome_curto: string }[] }) {
  const [nomeId, setNomeId] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [resultado, setResultado] = useState<Resultado>(null);

  async function criar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setCriando(true);

    const { error } = await criarClienteBrowser().auth.signUp({ email, password: senha });
    if (error) {
      setErro(error.message);
      setCriando(false);
      return;
    }

    if (nomeId && nomeId !== OUTRO) {
      try {
        await reivindicarNome(nomeId);
        setResultado({ tipo: 'vinculado' });
      } catch (e) {
        setResultado({
          tipo: 'manual',
          aviso: e instanceof Error ? e.message : 'Não deu para vincular automaticamente.',
        });
      }
    } else {
      setResultado({ tipo: 'manual' });
    }

    setCriando(false);
  }

  if (resultado?.tipo === 'vinculado') {
    return (
      <Cartao titulo="Tudo pronto">
        <p className="mt-3 text-sm text-texto-fraco">
          Sua conta já está vinculada ao seu nome no time — pode entrar direto.
        </p>
        <Link
          href="/login"
          className="mt-5 inline-block rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-fundo hover:bg-accent-forte"
        >
          Ir para o login
        </Link>
      </Cartao>
    );
  }

  if (resultado?.tipo === 'manual') {
    return (
      <Cartao titulo="Conta criada">
        {resultado.aviso && (
          <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {resultado.aviso}
          </p>
        )}
        <p className="mt-3 text-sm text-texto-fraco">Manda esse e-mail pro admin liberar seu acesso:</p>
        <p className="mt-2 rounded-lg border border-borda bg-fundo px-3 py-2 text-sm font-medium">{email}</p>
        <p className="mt-3 text-xs text-texto-fraco">
          Sem isso ainda não dá pra entrar — o login só funciona depois que ele vincular sua conta.
        </p>
        <Link href="/login" className="mt-5 inline-block text-sm text-accent hover:underline">
          Ir para o login
        </Link>
      </Cartao>
    );
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="text-accent">VORTEX</span>
          </h1>
          <p className="mt-1 text-sm text-texto-fraco">Criar conta</p>
        </div>

        {!CONFIGURADO && (
          <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Supabase ainda não configurado. Copie <code>.env.example</code> para{' '}
            <code>.env.local</code> e preencha as chaves.
          </p>
        )}

        <form
          onSubmit={criar}
          className="rounded-2xl border border-borda bg-superficie p-6 shadow-2xl shadow-black/40"
        >
          <label className="block text-sm text-texto-fraco" htmlFor="nome">
            Quem é você?
          </label>
          <select
            id="nome"
            required
            value={nomeId}
            onChange={(e) => setNomeId(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-borda bg-fundo px-3 py-2.5 text-sm outline-none focus:border-accent"
          >
            <option value="" disabled>
              Selecione seu nome
            </option>
            {reps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome_curto}
              </option>
            ))}
            <option value={OUTRO}>Outro</option>
          </select>

          <label className="mt-4 block text-sm text-texto-fraco" htmlFor="email">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="não precisa ser real — ex: seunome@vortex.local"
            className="mt-1.5 w-full rounded-lg border border-borda bg-fundo px-3 py-2.5 text-sm outline-none focus:border-accent"
          />

          <label className="mt-4 block text-sm text-texto-fraco" htmlFor="senha">
            Senha
          </label>
          <CampoSenha id="senha" value={senha} onChange={setSenha} minLength={6} />

          {erro && <p className="mt-4 text-sm text-red-400">{erro}</p>}

          <button
            type="submit"
            disabled={criando || !CONFIGURADO}
            className="mt-6 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-fundo transition hover:bg-accent-forte disabled:opacity-50"
          >
            {criando ? 'Criando…' : 'Criar conta'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-texto-fraco">
          Já tem conta?{' '}
          <Link href="/login" className="text-accent hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </main>
  );
}

function Cartao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-borda bg-superficie p-6 text-center shadow-2xl shadow-black/40">
        <h1 className="text-lg font-medium text-accent">{titulo}</h1>
        {children}
      </div>
    </main>
  );
}
