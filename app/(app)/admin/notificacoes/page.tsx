import { ehAdmin, exigirRep } from '@/lib/auth';
import { estaEncerrada } from '@/lib/notificacoes';
import { buscarNotificacoesAdmin } from '@/lib/notificacoesDb';
import { criarClienteServidor } from '@/lib/supabase/server';
import { dataBRT } from '@/lib/tempo';
import { FormNotificacao } from './form-notificacao';
import { ListaNotificacoes } from './lista-notificacoes';

export default async function AdminNotificacoes() {
  const rep = await exigirRep();
  const podeEditar = ehAdmin(rep);
  const supabase = await criarClienteServidor();
  const hoje = dataBRT();

  const [notificacoes, { data: repsData }] = await Promise.all([
    buscarNotificacoesAdmin(supabase),
    // Só reps com login de verdade (auth_user_id) podem ser alvo — os 3
    // reps sintéticos de cover nunca logam, então nunca aparecem aqui.
    supabase.from('reps').select('id, nome_curto').not('auth_user_id', 'is', null).order('nome_curto'),
  ]);

  const reps = (repsData ?? []) as { id: string; nome_curto: string }[];

  const ativas = notificacoes.filter((n) => !estaEncerrada(n, hoje, n.destinatarios));
  const encerradas = notificacoes.filter((n) => estaEncerrada(n, hoje, n.destinatarios));

  return (
    <div className="space-y-6">
      {podeEditar && <FormNotificacao reps={reps} />}
      <ListaNotificacoes ativas={ativas} encerradas={encerradas} podeEditar={podeEditar} />
    </div>
  );
}
