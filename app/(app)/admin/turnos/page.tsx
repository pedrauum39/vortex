import { ehAdmin, exigirRep } from '@/lib/auth';
import { buscarRegraVigente } from '@/lib/comissaoDb';
import { linhasDoSlot, type LinhaInvoice, type ModeloTrabalhada, type SlotResolvido } from '@/lib/invoice';
import { type EntradaLog } from '@/lib/logEscala';
import { blocoNaData } from '@/lib/periodos';
import { buscarPeriodos } from '@/lib/periodosDb';
import { buscarAnterior } from '@/lib/statementDb';
import { criarClienteAdmin, criarClienteServidor } from '@/lib/supabase/server';
import { dataBRT, segundaDaSemana, somarDias } from '@/lib/tempo';
import type { Bloco, Funcao, Model, Rep, Turno } from '@/lib/tipos';
import { precisaAtencao } from '@/lib/turnoAberto';
import { buscarTurnosExtraAdmin } from '@/lib/turnosExtraDb';
import { FormularioTurno } from './formulario-turno';
import { GradeEscala } from './grade-escala';
import { ListaTurnos } from './lista-turnos';
import { LogAlteracoes } from './log-alteracoes';
import { LinhaTurnoExtraAdmin } from './linha-turno-extra';
import { NavPeriodo } from './nav-periodo';
import type { LinhaShift } from './tipos';

type Busca = { de?: string };

// Sem isto, o Next serve do cache do navegador uma versão antiga da mesma
// URL (?de=...) — ex.: uma semana futura que estava vazia antes de gerar a
// escala continua aparecendo vazia depois, até o cache expirar sozinho.
export const dynamic = 'force-dynamic';

export default async function AdminTurnos({ searchParams }: { searchParams: Promise<Busca> }) {
  const { de } = await searchParams;
  const inicio = de ?? segundaDaSemana(dataBRT());
  const fim = somarDias(inicio, 6);
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(inicio, i));

  // Observador enxerga esta tela (admin/layout já deixou passar), mas nenhum
  // dos controles de escrita abaixo — só admin/primaris de verdade edita.
  const rep = await exigirRep();
  const podeEditar = ehAdmin(rep);

  const supabase = await criarClienteServidor();

  const [
    { data: shiftsData },
    { data: repsData },
    { data: modelsData },
    periodos,
    { data: alteracoesData },
  ] = await Promise.all([
    supabase
      .from('shifts')
      .select(
        'id, data, turno, bloco, funcao, rep_id, origem, reps(nome_curto, cargo, valor_hora), shift_logs(id, rep_id, clock_in_at, clock_out_at, saiu_antes, shift_log_models(model_id, models(nome)), statements(id, model_id, net_total, net_assinaturas, net_gorjetas, net_publicacoes, net_mensagens, net_indicacoes))',
      )
      .gte('data', inicio)
      .lte('data', fim)
      .order('data')
      .order('turno')
      .order('bloco'),
    supabase.from('reps').select('*').order('turno').order('papel'),
    // Sem filtro de ativa: pra corrigir um turno antigo o admin precisa ver
    // quem estava no roster NAQUELA data, mesmo que a modelo já tenha
    // desativado depois (ex.: Issy Black desativou, mas ainda é a modelo
    // certa pra um turno de antes disso). O roster de cada linha é
    // resolvido por data em FormPonto, via blocoNaData(periodos, ...).
    supabase.from('models').select('*').eq('extra', false).order('bloco').order('nome'),
    buscarPeriodos(supabase),
    supabase
      .from('escala_alteracoes')
      .select('id, data, turno, bloco, funcao, criado_em, rep_saiu, rep_entrou, alterado_por')
      .gte('data', inicio)
      .lte('data', fim)
      .order('criado_em', { ascending: false }),
  ]);

  const shifts = (shiftsData ?? []) as unknown as LinhaShift[];
  const reps = (repsData ?? []) as Rep[];
  const models = (modelsData ?? []) as Model[];

  type AlteracaoRow = {
    id: string;
    data: string;
    turno: Turno;
    bloco: Bloco;
    funcao: Funcao;
    criado_em: string;
    rep_saiu: string | null;
    rep_entrou: string | null;
    alterado_por: string | null;
  };
  const repPorId = new Map(reps.map((r) => [r.id, r]));
  const entradasLog: EntradaLog[] = ((alteracoesData ?? []) as AlteracaoRow[]).map((a) => {
    const saiu = a.rep_saiu ? repPorId.get(a.rep_saiu) : null;
    const entrou = a.rep_entrou ? repPorId.get(a.rep_entrou) : null;
    const por = a.alterado_por ? repPorId.get(a.alterado_por) : null;
    return {
      id: a.id,
      criadoEm: a.criado_em,
      data: a.data,
      turno: a.turno,
      bloco: a.bloco,
      funcao: a.funcao,
      repSaiu: saiu?.nome_curto ?? null,
      cargoSaiu: saiu?.cargo ?? null,
      repEntrou: entrou?.nome_curto ?? null,
      cargoEntrou: entrou?.cargo ?? null,
      alteradoPor: por?.nome_curto ?? null,
      modelosDoBloco: models
        .filter((m) => blocoNaData(periodos, m.id, a.data) === a.bloco)
        .map((m) => m.nome),
    };
  });

  const valoresDaGrade: Record<string, string | null> = {};
  for (const s of shifts) {
    valoresDaGrade[`${s.data}|${s.turno}|${s.bloco}|${s.funcao}`] = s.rep_id;
  }

  // Agrupa por slot (data+turno+bloco) para achar o par regular/assist e
  // computar a comissão exatamente como o /invoice faz.
  const porSlot = new Map<string, { regular?: LinhaShift; assist?: LinhaShift }>();
  for (const s of shifts) {
    const chave = `${s.data}|${s.turno}|${s.bloco}`;
    const par = porSlot.get(chave) ?? {};
    par[s.funcao] = s;
    porSlot.set(chave, par);
  }

  const regra = await buscarRegraVigente(supabase, fim);
  const linhasPorShift = new Map<string, LinhaInvoice>();

  // Cada slot resolve os "anterior" das modelos dele em paralelo, e os slots
  // entre si também rodam em paralelo — sequencial aqui (turno a turno,
  // modelo a modelo) era a página mais lenta do site, com a semana inteira
  // esperando um round-trip atrás do outro.
  const slotsResolvidos = await Promise.all(
    [...porSlot.values()].map(async ({ regular, assist }) => {
      const log = regular?.shift_logs[0];
      if (!regular || !log || !regular.reps) return null;

      const anteriores = await Promise.all(
        log.shift_log_models.map(({ model_id }) => buscarAnterior(supabase, regular.turno, regular.data, model_id)),
      );
      const modelos: ModeloTrabalhada[] = log.shift_log_models.map(({ model_id }, i) => {
        const statement = log.statements.find((s) => s.model_id === model_id) ?? null;
        const anterior = anteriores[i];
        return {
          modeloId: model_id,
          statement: statement
            ? {
                assinaturas: Number(statement.net_assinaturas),
                gorjetas: Number(statement.net_gorjetas),
                publicacoes: Number(statement.net_publicacoes),
                mensagens: Number(statement.net_mensagens),
                indicacoes: Number(statement.net_indicacoes),
              }
            : null,
          anterior: anterior.tipo === 'ok' ? anterior.linhas : null,
          anteriorPendente: anterior.tipo === 'pendente',
        };
      });

      const assistLog = assist?.shift_logs[0];

      const slot: SlotResolvido = {
        data: regular.data,
        turno: regular.turno,
        bloco: regular.bloco,
        regular: {
          repId: regular.rep_id!,
          cargo: regular.reps.cargo,
          valorHora: regular.reps.valor_hora,
          clockIn: new Date(log.clock_in_at),
          clockOut: log.clock_out_at ? new Date(log.clock_out_at) : null,
          saiuAntes: log.saiu_antes,
          modelos,
        },
        assist:
          assist?.rep_id && assist.reps && assistLog
            ? {
                repId: assist.rep_id,
                cargo: assist.reps.cargo,
                valorHora: assist.reps.valor_hora,
                clockIn: new Date(assistLog.clock_in_at),
                clockOut: assistLog.clock_out_at ? new Date(assistLog.clock_out_at) : null,
                saiuAntes: assistLog.saiu_antes,
              }
            : null,
      };

      return { slot, regularId: regular.id, assistId: assist?.id };
    }),
  );

  for (const resolvido of slotsResolvidos) {
    if (!resolvido) continue;
    const { slot, regularId, assistId } = resolvido;
    for (const linha of linhasDoSlot(slot, regra, new Date())) {
      const shiftId = linha.funcao === 'regular' ? regularId : assistId;
      if (shiftId) linhasPorShift.set(shiftId, linha);
    }
  }

  const hoje = dataBRT();
  const precisa = (s: LinhaShift) => precisaAtencao(s, hoje, linhasPorShift.get(s.id)?.pendente ?? false);
  const emAtencao = shifts.filter(precisa);
  const concluidos = shifts.filter((s) => !precisa(s));
  const linhasPorShiftObj = Object.fromEntries(linhasPorShift);

  return (
    <div className="space-y-6">
      <NavPeriodo inicio={inicio} fim={fim} />

      {/* key={inicio}: sem isto o React reaproveita a mesma instância do
          componente ao trocar de semana e nunca reinicializa o useState
          interno com os valores novos — a grade fica presa nos valores da
          primeira semana que carregou, pra sempre, não importa a URL. */}
      <GradeEscala key={inicio} dias={dias} reps={reps} valores={valoresDaGrade} podeEditar={podeEditar} />

      <LogAlteracoes entradas={entradasLog} />

      {podeEditar && <FormularioTurno reps={reps} inicio={inicio} />}

      <ListaTurnos
        emAtencao={emAtencao}
        concluidos={concluidos}
        linhasPorShift={linhasPorShiftObj}
        // Todas as modelos, não só as ativas do time do turno — o admin pode
        // simular um ponto que trabalhou modelo de outro time também (mesmo
        // caso do clock-in real), ou corrigir um turno antigo cuja modelo já
        // desativou desde então. O roster de cada linha é resolvido por data.
        models={models}
        periodos={periodos}
        podeEditar={podeEditar}
      />

      <TurnosExtraAdmin inicio={inicio} fim={fim} podeEditar={podeEditar} />
    </div>
  );
}

async function TurnosExtraAdmin({
  inicio,
  fim,
  podeEditar,
}: {
  inicio: string;
  fim: string;
  podeEditar: boolean;
}) {
  const linhas = await buscarTurnosExtraAdmin(criarClienteAdmin(), inicio, fim);
  if (linhas.length === 0) return null;

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-texto-fraco">Turnos extra</p>
      <div className="overflow-x-auto rounded-2xl border border-borda bg-superficie">
        <table className="w-full min-w-[48rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-borda text-left text-texto-fraco">
              <th className="px-4 py-3 font-medium">Dia</th>
              <th className="px-3 py-3 font-medium">Turno</th>
              <th className="px-3 py-3 font-medium">Rep</th>
              <th className="px-3 py-3 font-medium">Modelo</th>
              <th className="px-3 py-3 text-right font-medium">Vendido</th>
              <th className="px-3 py-3 text-right font-medium">Comissão</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <LinhaTurnoExtraAdmin key={l.id} linha={l} podeEditar={podeEditar} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
