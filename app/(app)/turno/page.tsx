import Link from 'next/link';
import { ehAdmin, exigirRep } from '@/lib/auth';
import { buscarRegraVigente } from '@/lib/comissaoDb';
import { linhasDoSlot, type ModeloTrabalhada, type SlotResolvido } from '@/lib/invoice';
import { metaDiariaDaPagina } from '@/lib/meta';
import { buscarMetasDoRep, buscarRecordeDoRep, buscarResumosDoRep } from '@/lib/metaDb';
import { diaDoStatement } from '@/lib/statement';
import { buscarAnterior } from '@/lib/statementDb';
import { criarClienteAdmin, criarClienteServidor } from '@/lib/supabase/server';
import {
  dataBRT,
  diaLegivel,
  diasNoMes,
  horaBRT,
  limitesDoMes,
  mesAtual,
  mesLegivel,
  somarDias,
  somarMeses,
} from '@/lib/tempo';
import { HORARIOS, TURNOS, rotuloTurno, type Bloco, type Cargo, type Funcao, type Model, type Turno } from '@/lib/tipos';
import {
  MINUTOS_DE_ANTECEDENCIA,
  dataDoTurnoAtual,
  horasDoTurno,
  janelaDoTurno,
  podeIniciar,
} from '@/lib/turno';
import { precisaAtencao } from '@/lib/turnoAberto';
import { buscarTurnosExtraDoRep } from '@/lib/turnosExtraDb';
import { HistoricoTurnos, type LinhaHistorico } from './historico-turnos';
import { Painel } from './painel';
import { TurnoExtra } from './turno-extra';

const dinheiro = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });

type TurnoDoDia = {
  id: string;
  data: string;
  turno: Turno;
  bloco: Bloco;
  funcao: Funcao;
  shift_logs: {
    id: string;
    clock_in_at: string;
    clock_out_at: string | null;
    saiu_antes: boolean;
    shift_log_models: { model_id: string; models: { nome: string } }[];
  }[];
};

export default async function TurnoPage({
  searchParams,
}: {
  searchParams: Promise<{ turno?: string; data?: string; mes?: string; aba?: string }>;
}) {
  const rep = await exigirRep();
  const { turno: turnoEscolhido, data: dataEscolhida, mes: mesParam, aba = 'meus' } = await searchParams;
  const supabase = await criarClienteServidor();

  const CAMPOS_TURNO =
    'id, data, turno, bloco, funcao, shift_logs(id, clock_in_at, clock_out_at, saiu_antes, shift_log_models(model_id, models(nome)))';
  const CAMPOS_STATEMENTS =
    'statements(model_id, net_assinaturas, net_gorjetas, net_publicacoes, net_mensagens, net_indicacoes)';
  const CAMPOS_TURNO_COM_STATEMENTS = `id, data, turno, bloco, funcao, shift_logs(id, clock_in_at, clock_out_at, saiu_antes, shift_log_models(model_id, models(nome)), ${CAMPOS_STATEMENTS})`;

  const hoje = dataBRT();

  // Não assume que o turno do rep hoje é o turno cadastrado no perfil dele —
  // o admin pode ter escalado alguém num turno diferente do de costume, e
  // isso precisa aparecer aqui igual. Cada turno tem sua própria regra de
  // qual dia é "hoje" (o T6/T1 cruza a meia-noite), então checa os três.
  const candidatas = [...new Set(TURNOS.map((t) => dataDoTurnoAtual(t)))];

  const mesAtualStr = mesAtual();
  const { inicio: inicioMesAtual, fim: fimMesAtual } = limitesDoMes(mesAtualStr);

  const [{ data: paraIniciar }, { data: emAberto }, { data: todosAntigos }, { data: doMesComoRegular }] =
    await Promise.all([
    supabase
      .from('shifts')
      .select(CAMPOS_TURNO)
      // rep_id explícito: o RLS filtra o rep comum, mas o admin enxerga tudo —
      // sem isto ele cairia no turno de outra pessoa.
      .eq('rep_id', rep.id)
      .in('data', candidatas),
    // Turno que já foi iniciado e ainda não foi fechado, não importa a data —
    // sem isto, um T6/T1 de ontem que passou das 5h (fim da janela oficial)
    // sumia da lista de candidatos assim que a data "atual" do T6/T1 virava
    // pra hoje à noite, e o rep não conseguia mais achar o turno aberto pra
    // finalizar, só o próximo (ainda nem começado). shift_logs!inner força
    // o join a exigir log — sem isso o filtro em clock_out_at não restringe
    // pra quem nem começou o turno ainda.
    supabase
      .from('shifts')
      .select(
        'id, data, turno, bloco, funcao, shift_logs!inner(id, clock_in_at, clock_out_at, saiu_antes, shift_log_models(model_id, models(nome)))',
      )
      .eq('rep_id', rep.id)
      .is('shift_logs.clock_out_at', null),
    // Turno que nunca foi aberto e a data já passou — pra achar quais, sem um
    // filtro de "não tem log nenhum" confiável no PostgREST (armadilha #18),
    // busca todo o histórico do rep (leve, uma query só) e filtra por
    // shift_logs vazio abaixo. Escopo do próprio rep, então mesmo sem limite
    // de data isso nunca vira uma lista grande de verdade.
    supabase.from('shifts').select(CAMPOS_TURNO).eq('rep_id', rep.id).lt('data', hoje),
    // Turno já fechado, mas com comissão pendente (statement faltando) — só
    // o mês atual, igual todo o resto do sistema que lida com comissão (ver
    // decisão "TODOS os invoices viraram mensais"). Ir além disso reabriria
    // o mesmo tipo de lentidão corrigido na sessão de 25/08: resolver
    // buscarAnterior() por modelo é caro, e esta é a página mais acessada.
    supabase
      .from('shifts')
      .select(CAMPOS_TURNO_COM_STATEMENTS)
      .eq('rep_id', rep.id)
      .eq('funcao', 'regular')
      .gte('data', somarDias(inicioMesAtual, -1))
      .lte('data', fimMesAtual),
  ]);

  // Pode haver mais de um turno "atual" ao mesmo tempo (ex.: admin escalou um
  // extra além do turno de costume no mesmo dia, ou tem um em aberto pra
  // fechar e outro pra começar) — precisa de escolha, não de pegar o
  // primeiro às cegas.
  const porId = new Map<string, TurnoDoDia>();
  for (const t of (paraIniciar ?? []) as unknown as TurnoDoDia[]) {
    if (t.data === dataDoTurnoAtual(t.turno)) porId.set(t.id, t);
  }
  for (const t of (emAberto ?? []) as unknown as TurnoDoDia[]) {
    porId.set(t.id, t);
  }
  // Prioritários: só o de hoje (por turno) + o que estiver em aberto. É o
  // conjunto usado pra decidir automaticamente qual turno mostrar — não deve
  // mudar por causa dos extras abaixo, senão um turno velho pendente passaria
  // à frente do turno de hoje sem o rep escolher isso explicitamente.
  const candidatosPrioritarios = [...porId.values()].sort((a, b) =>
    a.data < b.data ? -1 : a.data > b.data ? 1 : 0,
  );
  // O turno de HOJE nunca pode ficar escondido atrás de um turno velho aberto
  // — iniciar e finalizar são independentes um do outro, cada um só depende
  // da própria janela de horário (podeIniciar/finalizarTurno não olham pra
  // nenhum outro turno). Um turno de ontem esquecido aberto some da tela
  // enquanto ninguém troca de aba pra ele — e ninguém troca de aba pra algo
  // que nem sabe que existe.
  const hojeCandidatos = ((paraIniciar ?? []) as unknown as TurnoDoDia[]).filter(
    (t) => t.data === dataDoTurnoAtual(t.turno),
  );

  // Extras pras abas: mesmo critério de "precisa de atenção" do admin/turnos
  // (lib/turnoAberto.ts) — turno nunca aberto com a data já passada, ou
  // turno fechado com comissão pendente (só o mês atual, ver comentário
  // acima da query).
  const regraVigente = await buscarRegraVigente(supabase, fimMesAtual);
  const clienteAdmin = criarClienteAdmin();

  const doMesFiltrado = (
    (doMesComoRegular ?? []) as unknown as (TurnoDoDia & {
      shift_logs: (TurnoDoDia['shift_logs'][number] & {
        statements: { model_id: string; net_assinaturas: number; net_gorjetas: number; net_publicacoes: number; net_mensagens: number; net_indicacoes: number }[];
      })[];
    })[]
  ).filter((s) => diaDoStatement(s.turno, s.data) >= inicioMesAtual && diaDoStatement(s.turno, s.data) <= fimMesAtual);

  const pendentesDoMes = (
    await Promise.all(
      doMesFiltrado
        .filter((s) => s.shift_logs[0])
        .map(async (s) => {
          const log = s.shift_logs[0];
          const anteriores = await Promise.all(
            log.shift_log_models.map(({ model_id }) => buscarAnterior(clienteAdmin, s.turno, s.data, model_id)),
          );
          const modelos: ModeloTrabalhada[] = log.shift_log_models.map(({ model_id }, i) => {
            const statement = log.statements.find((st) => st.model_id === model_id) ?? null;
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

          const slot: SlotResolvido = {
            data: s.data,
            turno: s.turno,
            bloco: s.bloco,
            regular: {
              repId: rep.id,
              cargo: rep.cargo,
              valorHora: rep.valor_hora,
              clockIn: new Date(log.clock_in_at),
              clockOut: log.clock_out_at ? new Date(log.clock_out_at) : null,
              saiuAntes: log.saiu_antes,
              modelos,
            },
            assist: null,
          };

          const linha = linhasDoSlot(slot, regraVigente, new Date())[0];
          return precisaAtencao(s, hoje, linha?.pendente ?? false) ? s : null;
        }),
    )
  ).filter((s): s is NonNullable<typeof s> => s !== null);

  for (const t of (todosAntigos ?? []) as unknown as TurnoDoDia[]) {
    if (t.shift_logs.length === 0 && precisaAtencao(t, hoje) && !porId.has(t.id)) porId.set(t.id, t);
  }
  for (const s of pendentesDoMes) {
    if (!porId.has(s.id)) porId.set(s.id, s as unknown as TurnoDoDia);
  }
  const candidatosParaAbas = [...porId.values()].sort((a, b) =>
    a.data < b.data ? -1 : a.data > b.data ? 1 : 0,
  );

  const turno =
    // Escolha explícita (clique numa aba) pode mirar num dos extras também,
    // não só nos prioritários. Casa por turno E data — pode haver mais de
    // uma aba do mesmo tipo (ex.: 3 T6/T1 em dias diferentes), e casar só
    // pelo turno sempre resolvia pra primeira da lista, travando o clique
    // nas outras abas do mesmo tipo.
    candidatosParaAbas.find((t) =>
      dataEscolhida ? t.turno === turnoEscolhido && t.data === dataEscolhida : t.turno === turnoEscolhido,
    ) ??
    // Sem escolha explícita, o turno de HOJE sempre vem primeiro — em
    // andamento (precisa fechar) antes do que ainda nem começou, mas
    // qualquer um dos dois na frente de um turno velho aberto de outro dia.
    hojeCandidatos.find((t) => t.shift_logs[0] && !t.shift_logs[0].clock_out_at) ??
    hojeCandidatos[0] ??
    // Só sobra pra um turno velho aberto quando não há NADA de hoje — aí sim
    // ele é o próximo passo de verdade, não uma trava escondendo o de hoje.
    candidatosPrioritarios.find((t) => t.shift_logs[0] && !t.shift_logs[0].clock_out_at) ??
    candidatosPrioritarios.find((t) => t.shift_logs[0]) ??
    candidatosPrioritarios[0];
  const data = turno ? turno.data : dataDoTurnoAtual(rep.turno);
  const turnoDoSlot = turno?.turno ?? rep.turno;

  const [{ data: models }, { data: modelosExtras }] = await Promise.all([
    supabase.from('models').select('*').eq('ativa', true).eq('extra', false).order('nome'),
    supabase.from('models').select('*').eq('ativa', true).eq('extra', true).order('nome'),
  ]);

  // Meta diária de cada página nesse turno: meta mensal da página, repartida
  // pelo percentual fixo do turno (42/28/30%) e pelos dias do mês — mesma
  // conta de lib/meta.ts usada no dashboard e em /admin/reps/[id].
  const diasDoMes = diasNoMes(data.slice(0, 7));
  const metasDiarias: Record<string, number> = {};
  for (const m of (models ?? []) as Model[]) {
    metasDiarias[m.id] = metaDiariaDaPagina(m.meta_mensal, turnoDoSlot, diasDoMes);
  }

  const log = turno?.shift_logs[0];

  // Só importa pro regular: pré-marca "teve assistente" no fechamento quando
  // o turno já tem alguém escalado E de fato trabalhando no papel de
  // assistente. Cliente admin de propósito — o assistente é outro rep, e a
  // RLS comum não deixa o regular ler o shift de outra pessoa.
  let temAssistente = false;
  if (turno && turno.funcao === 'regular') {
    const { data: assistShift } = await criarClienteAdmin()
      .from('shifts')
      .select('rep_id, shift_logs(id)')
      .eq('data', turno.data)
      .eq('turno', turno.turno)
      .eq('bloco', turno.bloco)
      .eq('funcao', 'assist')
      .maybeSingle();
    temAssistente = !!(assistShift?.rep_id && (assistShift.shift_logs as { id: string }[] | null)?.length);
  }

  const mes = mesParam ?? mesAtual();
  const { inicio: inicioMes, fim: fimMes } = limitesDoMes(mes);
  const diasDoMesHistorico = diasNoMes(mes);

  const [metas, recorde, resumos] = await Promise.all([
    buscarMetasDoRep(criarClienteAdmin(), rep.id, inicioMes, fimMes, diasDoMesHistorico),
    buscarRecordeDoRep(criarClienteAdmin(), rep.id),
    buscarResumosDoRep(criarClienteAdmin(), rep.id, inicioMes, fimMes),
  ]);

  const historico: LinhaHistorico[] = metas.linhas
    .filter((l) => l.trabalhado)
    .map((l) => {
      const resumo = resumos.get(`${l.data}|${l.turno}`);
      return { ...l, resumo: resumo?.resumo ?? null, assistNome: resumo?.assistNome ?? null };
    });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Turnos</h1>
        <p className="mt-1 text-sm text-texto-fraco">
          {diaLegivel(data)} · {rotuloTurno(turnoDoSlot)} · {HORARIOS[turnoDoSlot].inicio}–
          {HORARIOS[turnoDoSlot].fim}
        </p>
      </div>

      <div className="flex gap-1 border-b border-borda">
        {[
          { chave: 'meus', rotulo: 'Meu turno' },
          { chave: 'extra', rotulo: 'Turno Extra' },
        ].map(({ chave, rotulo }) => (
          <Link
            key={chave}
            href={`/turno?aba=${chave}`}
            className={`-mb-px border-b-2 px-4 py-2 text-sm transition ${
              aba === chave
                ? 'border-accent text-accent'
                : 'border-transparent text-texto-fraco hover:text-texto'
            }`}
          >
            {rotulo}
          </Link>
        ))}
      </div>

      {aba === 'extra' ? (
        <>
          <TurnoExtra repId={rep.id} modelosExtras={(modelosExtras ?? []) as Model[]} />
          <TurnosExtraHistorico repId={rep.id} cargo={rep.cargo} mes={mes} />
        </>
      ) : (
        <>
          {candidatosParaAbas.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {candidatosParaAbas.map((c) => (
                <Link
                  key={c.id}
                  href={`/turno?turno=${c.turno}&data=${c.data}`}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${
                    turno?.id === c.id
                      ? 'border-accent bg-accent-fraco text-accent'
                      : 'border-borda text-texto-fraco hover:text-texto'
                  }`}
                >
                  {diaLegivel(c.data)} · {rotuloTurno(c.turno)}
                  {c.funcao === 'assist' && ' · Assistant'}
                </Link>
              ))}
            </div>
          )}

          {!turno ? (
            <div className="rounded-2xl border border-borda bg-superficie p-10 text-center">
              <p className="text-texto-fraco">Você não tem turno agora.</p>
            </div>
          ) : (
            <Painel
              turno={{
                id: turno.id,
                bloco: turno.bloco,
                tipo: turnoDoSlot,
                assist: turno.funcao === 'assist',
                data: diaLegivel(data),
              }}
              log={
                log
                  ? {
                      id: log.id,
                      entrada: horaBRT(new Date(log.clock_in_at)),
                      saida: log.clock_out_at ? horaBRT(new Date(log.clock_out_at)) : null,
                      modelos: log.shift_log_models.map((m) => ({ id: m.model_id, nome: m.models.nome })),
                      horas: horasDoTurno(
                        turnoDoSlot,
                        data,
                        new Date(log.clock_in_at),
                        log.clock_out_at ? new Date(log.clock_out_at) : null,
                        log.saiu_antes,
                      ),
                    }
                  : null
              }
              // Todas as modelos ativas (menos as "extra"), não só as do time
              // do turno — o rep pode ter feito uma modelo de outro time
              // (ex.: cobrindo alguém), e precisa poder marcar isso mesmo
              // fora do roster padrão.
              models={(models ?? []) as Model[]}
              metasDiarias={metasDiarias}
              temAssistente={temAssistente}
              repId={rep.id}
              // Admin (e primaris) ignora a janela dos 15 minutos — precisa
              // testar o fluxo (OCR, comissão) sem esperar a hora certa do turno.
              podeIniciar={ehAdmin(rep) || podeIniciar(turnoDoSlot, data)}
              abreAs={horaBRT(
                new Date(
                  janelaDoTurno(turnoDoSlot, data).inicio.getTime() - MINUTOS_DE_ANTECEDENCIA * 60_000,
                ),
              )}
            />
          )}

          <section className="rounded-2xl border border-borda bg-superficie p-6">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-medium">Histórico de turnos</h2>
              <div className="ml-auto flex items-center gap-1 text-sm">
                <Link
                  href={`/turno?mes=${somarMeses(mes, -1)}`}
                  className="rounded-lg border border-borda px-2.5 py-1.5 text-texto-fraco hover:text-texto"
                >
                  ←
                </Link>
                <span className="px-2 capitalize text-texto-fraco">{mesLegivel(mes)}</span>
                <Link
                  href={`/turno?mes=${somarMeses(mes, 1)}`}
                  className="rounded-lg border border-borda px-2.5 py-1.5 text-texto-fraco hover:text-texto"
                >
                  →
                </Link>
              </div>
            </div>

            {historico.length === 0 ? (
              <p className="mt-4 text-sm text-texto-fraco">Nenhum turno trabalhado neste mês.</p>
            ) : (
              <HistoricoTurnos historico={historico} recorde={recorde} />
            )}
          </section>
        </>
      )}
    </div>
  );
}

async function TurnosExtraHistorico({ repId, cargo, mes }: { repId: string; cargo: Cargo; mes: string }) {
  const { inicio, fim } = limitesDoMes(mes);
  const linhas = await buscarTurnosExtraDoRep(criarClienteAdmin(), repId, cargo, inicio, fim);

  return (
    <section className="rounded-2xl border border-borda bg-superficie p-6">
      <h2 className="text-lg font-medium">Turnos extra do mês</h2>
      {linhas.length === 0 ? (
        <p className="mt-4 text-sm text-texto-fraco">Nenhum turno extra lançado neste mês.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-borda text-left text-texto-fraco">
                <th className="px-3 py-2.5 font-medium">Data</th>
                <th className="px-3 py-2.5 font-medium">Turno</th>
                <th className="px-3 py-2.5 font-medium">Modelo</th>
                <th className="px-3 py-2.5 text-right font-medium">Vendido</th>
                <th className="px-3 py-2.5 text-right font-medium">Comissão</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id} className="border-b border-borda last:border-0">
                  <td className="px-3 py-3">{diaLegivel(l.data)}</td>
                  <td className="px-3 py-3 text-texto-fraco">{rotuloTurno(l.turno)}</td>
                  <td className="px-3 py-3 text-accent">{l.modeloNome}</td>
                  <td className="px-3 py-3 text-right">{dinheiro(l.vendido)}</td>
                  <td className="px-3 py-3 text-right font-medium">{dinheiro(l.comissao)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
