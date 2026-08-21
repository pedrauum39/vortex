# Troca de time de modelo (períodos por bloco)

Data: 2026-08-14.

## O problema real

`models.bloco` (Time 1/Time 2) é lido **ao vivo** em todo lugar que soma vendas por time: `lib/primarisDb.ts` (`porTime`, `total`, e o bônus de Party/Team addition dos primaris) e o roster do schedule/clock-in. Não existe conceito de "desde quando" — o sistema só sabe o bloco *atual* de cada modelo.

Isso quebra de duas formas:

1. **`porPagina`/`porTime` na tela `/primaris` só olham modelos com `ativa = true`.** Assim que uma modelo desativa (ou seria movida de time, hoje sem suporte nenhum), a página inteira dela some da soma do time — inclusive as vendas que já tinham acontecido naquele mês. O card do time vai a zero mesmo com venda real registrada (foi o que aconteceu com a Issy: Time 1 mostrando `US$ 0,00 / US$ 0,00` com o Pedro, dono do Time 1, tendo vendido `US$ 10.049,50` no mês).
2. **Se a modelo simplesmente trocasse de bloco** (sem esse desenho), toda a história dela — todo mês já fechado — passaria a contar pro time novo, porque `buscarBonusPrimaris`/`buscarVendasDaEmpresa` usam `models.bloco` atual pra decidir de quem é cada venda, sem nenhuma trava por data.

## Visão geral

Uma tabela nova guarda, por modelo, **quando ela pertenceu a cada bloco**. "Trocar de time" e "desativar" passam a fechar o período vigente (fecham "quando ela saiu"); "reativar"/criar abre um novo. Toda soma por time (cards da `/primaris`, meta prorateada, bônus de liderança) passa a resolver o bloco de cada venda **pela data da venda**, não pelo bloco atual da modelo — o resto do site (schedule, clock-in, dropdown do admin) continua lendo `models.bloco` direto, sem mudança nenhuma.

## 1. Banco de dados

Migração `0021_periodos_bloco_modelo.sql`:

```sql
-- Histórico de qual bloco (time) cada modelo pertenceu, ao longo do tempo.
-- Toda modelo sempre tem um período aberto (fim is null) = o time atual.
-- Trocar de time ou desativar fecha o período vigente; reativar/criar abre um novo.
create table model_bloco_periodos (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references models(id) on delete cascade,
  bloco bloco_t not null,
  inicio date not null,
  fim date,
  constraint model_bloco_periodos_ordem check (fim is null or fim >= inicio)
);

-- Só um período aberto por modelo de cada vez.
create unique index model_bloco_periodos_aberto_idx
  on model_bloco_periodos (model_id) where fim is null;

create index model_bloco_periodos_model_idx on model_bloco_periodos (model_id, inicio);

alter table model_bloco_periodos enable row level security;

create policy model_bloco_periodos_select on model_bloco_periodos
  for select to authenticated using (pode_ver());

create policy model_bloco_periodos_write on model_bloco_periodos
  for all to authenticated using (is_admin()) with check (is_admin());

-- Backfill: cada modelo existente ganha um período aberto no bloco atual
-- dela, começando na venda mais antiga já registrada (shift_log_models via
-- shifts, ou turnos_extra) — sem venda nenhuma, começa hoje.
insert into model_bloco_periodos (model_id, bloco, inicio, fim)
select
  m.id,
  m.bloco,
  coalesce(
    least(
      (select min(sh.data) from shift_log_models slm
        join shift_logs sl on sl.id = slm.shift_log_id
        join shifts sh on sh.id = sl.shift_id
        where slm.model_id = m.id),
      (select min(te.data) from turnos_extra te where te.model_id = m.id)
    ),
    current_date
  ),
  null
from models m;
```

`RLS` no mesmo padrão de `shifts`/`turnos_extra`: leitura pra quem `pode_ver()` (admin/primaris/observador), escrita só `is_admin()`.

## 2. Ações — `app/(app)/admin/models/actions.ts`

```ts
/** Fecha o período aberto da modelo (se existir). */
async function fecharPeriodo(supabase, modelId: string, hoje: string) {
  await supabase.from('model_bloco_periodos')
    .update({ fim: hoje })
    .eq('model_id', modelId)
    .is('fim', null);
}

export async function moverTime(id: string) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();
  const hoje = dataBRT();

  const { data: modelo } = await supabase.from('models').select('bloco').eq('id', id).single();
  if (!modelo) throw new Error('Modelo não encontrada.');
  const novoBloco: Bloco = modelo.bloco === 'I' ? 'II' : 'I';

  await fecharPeriodo(supabase, id, hoje);
  const { error: e1 } = await supabase.from('model_bloco_periodos')
    .insert({ model_id: id, bloco: novoBloco, inicio: hoje });
  if (e1) throw new Error(e1.message);

  const { error: e2 } = await supabase.from('models').update({ bloco: novoBloco }).eq('id', id);
  if (e2) throw new Error(e2.message);

  revalidar();
}
```

`definirAtivaModelo` ganha a mesma lógica: `ativa = false` chama `fecharPeriodo()`; `ativa = true` abre um período novo no `bloco` atual da modelo (só se não houver um já aberto — idempotente contra clique duplo).

Sem transação explícita no Supabase JS client (não tem `BEGIN`/`COMMIT` fácil por aqui) — mesmo padrão de risco que `aplicarSlot()` já tem hoje (duas chamadas sequenciais). Se a segunda falhar, fica um período fechado sem o novo aberto; aceitável pro volume de uso (ação manual, rara, admin único) e consistente com o resto do código.

## 3. UI — `app/(app)/admin/models/linha-modelo.tsx`

Botão novo ao lado de renomear/desativar/marcar extra/apagar: **"trocar de time"** (`onClick={() => rodar(() => moverTime(model.id))}`). Sem seletor — só existem dois blocos, o botão manda pro outro. Mesmo padrão dos outros (sem modal, roda na hora).

## 4. `lib/primarisDb.ts` — resolução de bloco por data

Nova função, carrega os períodos uma vez por chamada de `buscarVendasDaEmpresa`:

```ts
type Periodo = { modelId: string; bloco: Bloco; inicio: string; fim: string | null };

function blocoNaData(periodos: Periodo[], modelId: string, data: string): Bloco | null {
  const p = periodos.find(
    (p) => p.modelId === modelId && p.inicio <= data && (p.fim === null || p.fim >= data),
  );
  return p?.bloco ?? null;
}
```

Em `buscarVendasDaEmpresa`, o `modeloBloco` de cada `VendaDeModelo` passa a vir de `blocoNaData(periodos, model_id, diaDoStatement(turno, data))` em vez de `modelo.bloco` (o bloco atual/live). Isso corrige **as duas coisas ao mesmo tempo**, porque as duas dependem do mesmo campo:

- `buscarResumoPrimaris` → `porTime`/`total` (a tela `/primaris`).
- `buscarBonusPrimaris` → Party/Team addition do invoice do GP/KP.

Sem período cobrindo a data (não deveria acontecer depois do backfill, mas defensivo): a venda não entra em nenhum time — mesmo comportamento de hoje quando falta dado.

### Meta prorateada por time (`porTime`, `total`)

Em vez de somar `meta_mensal` de toda modelo `ativa = true` do bloco, para cada modelo eu olho os períodos dela que **cruzam com `[inicio, fim]`** (o mês selecionado) e prorateio pelos dias:

```ts
function metaProrateada(periodos: Periodo[], modelId: string, metaMensal: number, inicio: string, fim: string, diasDoMes: number): Record<Bloco, number> {
  const porBloco = { I: 0, II: 0 };
  for (const p of periodos.filter((p) => p.modelId === modelId)) {
    const de = maxData(p.inicio, inicio);
    const ate = minData(p.fim ?? fim, fim);
    if (de > ate) continue; // período não cruza com o mês
    const dias = diferencaDias(de, ate) + 1;
    porBloco[p.bloco] += arred((metaMensal * dias) / diasDoMes);
  }
  return porBloco;
}
```

`porTime[bloco].meta` = soma de `metaProrateada(...).bloco` de **toda modelo que já existiu** (não só `ativa = true` — uma modelo desativada no meio do mês ainda contribui a meta dos dias em que esteve ativa). `porTime[bloco].vendido` = soma de `vendas` filtrando por `v.modeloBloco === bloco` (já resolvido por data, ver acima). `total` continua sendo a soma dos dois blocos.

`porPagina` (a lista "Por página") **não muda** — continua só `ativa = true`, bloco atual, é o retrato de "como estão as páginas ativas hoje".

### Seção "Histórico"

Nova função `buscarHistoricoModelos(db, inicio, fim)`: busca em `model_bloco_periodos` todo período com `fim` dentro de `[inicio, fim]` (fechado neste mês — trocado ou desativado). Pra cada um, `vendido` = soma de `vendas` (recalculado, mesma função de sempre) filtrando `modeloId` e a data dentro de `[periodo.inicio, periodo.fim]`. Retorna `{ modeloNome, blocoOrigem, blocoDestino: Bloco | null (null = desativada), data: fim, vendido }`, ordenado por data.

`blocoDestino`: se existe um período do mesmo `model_id` com `inicio = periodo.fim` (o período que abriu na mesma data), é o bloco dele; senão `null` (foi desativação, não troca).

## 5. Tela `/primaris` — `app/(app)/primaris/page.tsx`

Nova seção **"Histórico"** abaixo de "Por página", mesmo estilo visual (card escuro, uma linha por evento): nome da modelo, "Time X → Time Y" (ou "Time X → desativada"), data, valor vendido no período. Só aparece quando há pelo menos um evento no mês selecionado; nada quando a lista vem vazia (sem card fantasma).

Segue o `mes` já navegável (`?mes=YYYY-MM`) que a página já usa — troca de mês recarrega a seção junto com o resto.

## Testes

- `metaProrateada()`: unitário — modelo que ficou o mês inteiro num bloco dá a mesma meta de hoje; modelo que trocou no meio do mês reparte proporcional aos dias; período que não cruza com o mês contribui zero.
- `blocoNaData()`: unitário — data dentro do período aberto, dentro de um período fechado, e fora de qualquer período (retorna `null`).
- `buscarVendasDaEmpresa`/`buscarBonusPrimaris`: teste de integração leve — uma venda antes da troca conta pro bloco antigo, uma venda depois conta pro novo, usando `model_bloco_periodos` de teste.
- Migração: conferir que todo `models` existente ganhou exatamente um período aberto após o backfill (`select count(*) from models m left join model_bloco_periodos p on p.model_id = m.id and p.fim is null where p.id is null` deve dar zero linhas).
- Sem teste de UI automatizado (padrão do projeto) — verificação manual: botão "trocar de time" aparece e funciona, card do time reflete a proporção certa, seção Histórico aparece só no mês em que a troca aconteceu.

## Decisões confirmadas

- Mesma modelo, nunca duplica: trocar de time NÃO cria uma modelo nova — é a mesma linha em `models`, só o `bloco` muda, com o histórico guardado à parte em `model_bloco_periodos`.
- "Trocar de time" e "desativar" usam o mesmo mecanismo de fechar período — a diferença é só se abre um novo (trocar) ou não (desativar).
- Seção "Histórico" na `/primaris` é escopada ao mês selecionado (`?mes=`), não é um log permanente na tela — mas o dado por trás (`model_bloco_periodos` + o valor recalculado por período) fica permanente, então dá pra ver "quanto a Issy vendeu no Time 1" a qualquer momento, mesmo navegando pra um mês futuro, filtrando por esse período histórico.
- A troca é sempre "a partir de hoje" (BRT) — sem data retroativa escolhível por enquanto.
- `porPagina` (a lista de páginas ativas) não muda — continua mostrando só modelos `ativa = true` no bloco atual delas. A proração por período vale só pros agregados por time (`porTime`, `total`) e pro bônus de liderança.
- A correção de `buscarBonusPrimaris` (Party/Team addition dos primaris passando a respeitar a data da venda, não o bloco atual) é um efeito colateral direto da mesma mudança em `blocoNaData()` — não é escopo extra, é a mesma causa raiz do problema da tela `/primaris`.
