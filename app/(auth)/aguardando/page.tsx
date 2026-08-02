import { redirect } from 'next/navigation';
import { repAtual } from '@/lib/auth';
import { criarClienteServidor } from '@/lib/supabase/server';

export default async function Aguardando() {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const rep = await repAtual();
  if (rep) redirect('/');

  return (
    <main className="relative flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-borda bg-superficie p-6 text-center shadow-2xl shadow-black/40">
        <h1 className="text-lg font-medium text-accent">Conta ainda não vinculada</h1>
        <p className="mt-3 text-sm text-texto-fraco">
          Seu login existe, mas ainda não foi ligado a um rep. Manda esse e-mail pro admin
          liberar seu acesso em /admin/reps:
        </p>
        <p className="mt-2 rounded-lg border border-borda bg-fundo px-3 py-2 text-sm font-medium">
          {user.email}
        </p>
        <p className="mt-3 text-xs text-texto-fraco">Assim que ele vincular, é só entrar de novo.</p>
        <form action="/auth/sair" method="post" className="mt-5">
          <button
            type="submit"
            className="rounded-lg border border-borda px-4 py-2 text-sm text-texto-fraco transition hover:border-accent hover:text-texto"
          >
            Sair
          </button>
        </form>
      </div>
    </main>
  );
}
