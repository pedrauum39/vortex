import { notFound, redirect } from 'next/navigation';
import { ehAdmin, exigirRep } from '@/lib/auth';
import { buscarPlanejamentos } from '@/lib/planejamentoDb';
import { criarClienteServidor } from '@/lib/supabase/server';
import { dataBRT } from '@/lib/tempo';
import { rotuloTurno, type Bloco, type Turno } from '@/lib/tipos';
import { Planejador } from './planejador';

type Busca = { rep?: string };

// Sem isto, o Next serve do cache do navegador uma versão antiga da mesma
// URL — trocar de aba/rep não pegaria até o cache expirar sozinho.
export const dynamic = 'force-dynamic';

/**
 * "Planejar turno" — bloco de notas do rep pra preparar mass messages antes
 * do turno. Sem `?rep=`, é o próprio (leitura e escrita). Com `?rep=<id>`,
 * é admin/primaris olhando o de outro rep — só leitura, nunca edita por cima.
 */
export default async function PlanejarTurno({ searchParams }: { searchParams: Promise<Busca> }) {
  const rep = await exigirRep();
  const { rep: repParam } = await searchParams;

  const alvoId = repParam ?? rep.id;
  const podeEditar = alvoId === rep.id;
  if (!podeEditar && !ehAdmin(rep)) redirect('/');

  const supabase = await criarClienteServidor();

  const { data: alvoData } = await supabase
    .from('reps')
    .select('id, nome_curto')
    .eq('id', alvoId)
    .maybeSingle();
  if (!alvoData) notFound();

  const [abas, { data: modelsData }] = await Promise.all([
    buscarPlanejamentos(supabase, alvoId),
    supabase.from('models').select('id, nome, bloco, ativa').eq('extra', false).order('nome'),
  ]);

  const todosModelos = (modelsData ?? []) as { id: string; nome: string; bloco: Bloco; ativa: boolean }[];
  const modelosAtivas = todosModelos.filter((m) => m.ativa).map((m) => ({ id: m.id, nome: m.nome }));

  // O atalho "turno já escalado" só faz sentido pra quem está editando o
  // próprio — poupa escolher data+modelo na mão pros turnos que já tem.
  let turnosEscalados: { data: string; rotulo: string; modelos: { id: string; nome: string }[] }[] = [];
  if (podeEditar) {
    const hoje = dataBRT();
    const rosterPorBloco = new Map<Bloco, { id: string; nome: string }[]>();
    for (const m of todosModelos) {
      if (!m.ativa) continue;
      const lista = rosterPorBloco.get(m.bloco) ?? [];
      lista.push({ id: m.id, nome: m.nome });
      rosterPorBloco.set(m.bloco, lista);
    }

    const { data: shiftsData } = await supabase
      .from('shifts')
      .select('data, turno, bloco, shift_logs(shift_log_models(models(id, nome)))')
      .eq('rep_id', rep.id)
      .gte('data', hoje)
      .order('data')
      .limit(30);

    type LinhaShift = {
      data: string;
      turno: Turno;
      bloco: Bloco;
      shift_logs: { shift_log_models: { models: { id: string; nome: string } }[] }[];
    };
    turnosEscalados = ((shiftsData ?? []) as unknown as LinhaShift[]).map((s) => {
      const doLog = s.shift_logs[0]?.shift_log_models.map((m) => m.models) ?? [];
      const modelos = doLog.length > 0 ? doLog : (rosterPorBloco.get(s.bloco) ?? []);
      return { data: s.data, rotulo: rotuloTurno(s.turno), modelos };
    });
  }

  return (
    <Planejador
      podeEditar={podeEditar}
      nomeAlvo={alvoData.nome_curto}
      abasIniciais={abas}
      todosModelos={todosModelos.map((m) => ({ id: m.id, nome: m.nome }))}
      modelosAtivas={modelosAtivas}
      turnosEscalados={turnosEscalados}
    />
  );
}
