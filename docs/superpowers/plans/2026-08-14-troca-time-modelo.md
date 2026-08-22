# Troca de Time de Modelo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o admin trocar uma modelo de time (ou desativar) sem que a atribuição histórica de vendas mude retroativamente — o card do time e o bônus de liderança dos primaris passam a respeitar a data da venda, não o bloco atual da modelo.

**Architecture:** Tabela nova `model_bloco_periodos` guarda, por modelo, quais blocos ela ocupou e quando. Funções puras (`lib/periodos.ts`) resolvem "qual bloco numa data" e "meta prorateada por dias" a partir dessa lista — sem tocar em banco. `lib/primarisDb.ts` (camada que já busca do Supabase) passa a usar essas funções em vez do `models.bloco` ao vivo. `models.bloco` continua sendo a única fonte pro resto do site (schedule, clock-in) — nada mais muda lá.

**Tech Stack:** Next.js App Router (Server Actions), Supabase Postgres (migração SQL direta via MCP), TypeScript, Vitest.

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-08-14-troca-time-modelo-design.md` — qualquer dúvida de comportamento, essa é a fonte.
- Nenhuma comissão/valor fica congelado em gravação — sempre recalculado a partir de `shift_log_models`/`statements`/`turnos_extra`, igual o resto do sistema.
- `porPagina` (lista "Por página" na `/primaris`) não muda — continua só `ativa = true`, bloco atual.
- A troca de time é sempre "a partir de hoje" (BRT, via `dataBRT()`) — sem data retroativa escolhível.
- Antes de commitar qualquer mudança de código: `npm run typecheck && npm run lint && npm test && npm run build` (os 4, sempre — ver `workspace-vortex.md`).
- Depois do push: confirmar pelo Vercel MCP (`list_deployments`) que o deploy chegou a `READY` antes de dizer que está no ar.

---

### Task 1: Migração — tabela `model_bloco_periodos`

**Files:**
- Create: `supabase/migrations/0021_periodos_bloco_modelo.sql`

**Interfaces:**
- Produces: tabela `model_bloco_periodos(id uuid, model_id uuid, bloco bloco_t, inicio date, fim date nullable)`, índice único parcial `model_bloco_periodos_aberto_idx` (garante no máximo um período aberto por modelo), políticas RLS `model_bloco_periodos_select`/`model_bloco_periodos_write`. Todo `models` existente ganha uma linha com `fim is null`.

- [ ] **Step 1: Escrever a migração**

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

- [ ] **Step 2: Aplicar a migração no projeto Supabase**

Usar o MCP do Supabase: `apply_migration` com `project_id = 'vbyvpjtmayavtvfhpgax'`, `name = 'periodos_bloco_modelo'`, `query` = o SQL do Step 1.

- [ ] **Step 3: Verificar o backfill**

Rodar via `execute_sql`:

```sql
select count(*) from models m
left join model_bloco_periodos p on p.model_id = m.id and p.fim is null
where p.id is null;
```

Esperado: `0` (toda modelo tem exatamente um período aberto).

```sql
select m.nome, p.bloco, p.inicio, p.fim from models m
join model_bloco_periodos p on p.model_id = m.id
order by m.nome;
```

Conferir visualmente que `p.bloco` bate com `m.bloco` de cada linha, e que `inicio` é uma data plausível (não `current_date` pra modelo que claramente já vendeu, como a Issy).

- [ ] **Step 4: Checar advisors**

Rodar `get_advisors` (`type: 'security'`) no projeto — confirmar que a tabela nova não aparece com RLS ausente nem política solta.

- [ ] **Step 5: Baixar a migração pro repo local**

O arquivo `supabase/migrations/0021_periodos_bloco_modelo.sql` já foi escrito no Step 1 — commitar junto com o restante do código nesta mesma leva (não precisa de commit isolado, ver Task 8).

---

### Task 2: `lib/tempo.ts` — `diferencaDias`

**Files:**
- Modify: `lib/tempo.ts`
- Test: `lib/tempo.test.ts` (novo arquivo)

**Interfaces:**
- Produces: `diferencaDias(a: string, b: string): number` — dias entre duas datas `'YYYY-MM-DD'` (`b - a`, pode ser negativo).

- [ ] **Step 1: Escrever o teste**

Criar `lib/tempo.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { diferencaDias } from './tempo';

describe('diferencaDias', () => {
  test('mesma data dá zero', () => {
    expect(diferencaDias('2026-08-14', '2026-08-14')).toBe(0);
  });

  test('conta dias corridos, ignorando fuso', () => {
    expect(diferencaDias('2026-08-14', '2026-08-20')).toBe(6);
  });

  test('data depois é negativo', () => {
    expect(diferencaDias('2026-08-20', '2026-08-14')).toBe(-6);
  });

  test('atravessa virada de mês', () => {
    expect(diferencaDias('2026-08-30', '2026-09-02')).toBe(3);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- tempo.test.ts`
Expected: FAIL — `diferencaDias is not a function` (ou erro de import).

- [ ] **Step 3: Implementar**

Em `lib/tempo.ts`, logo depois de `somarDias` (linha 94-97):

```ts
/** Diferença em dias entre duas datas 'YYYY-MM-DD' (b - a). Aritmética em UTC puro, sem fuso. */
export function diferencaDias(a: string, b: string): number {
  const [anoA, mesA, diaA] = a.split('-').map(Number);
  const [anoB, mesB, diaB] = b.split('-').map(Number);
  const msA = Date.UTC(anoA, mesA - 1, diaA);
  const msB = Date.UTC(anoB, mesB - 1, diaB);
  return Math.round((msB - msA) / 86400000);
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- tempo.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/tempo.ts lib/tempo.test.ts
git commit -m "lib/tempo: adiciona diferencaDias, base pra proração por período"
```

---

### Task 3: `lib/periodos.ts` — funções puras de período/bloco

**Files:**
- Create: `lib/periodos.ts`
- Create: `lib/periodos.test.ts`

**Interfaces:**
- Consumes: `diferencaDias` (Task 2, `lib/tempo.ts`), `Bloco` (`lib/tipos.ts`).
- Produces: `type Periodo = { modeloId: string; bloco: Bloco; inicio: string; fim: string | null }`, `blocoNaData(periodos: Periodo[], modeloId: string, data: string): Bloco | null`, `diasDeCruzamento(periodo: { inicio: string; fim: string | null }, inicio: string, fim: string): number`, `metaProrateada(periodos: Periodo[], modeloId: string, metaMensal: number, inicio: string, fim: string, diasDoMes: number): Record<Bloco, number>`.

- [ ] **Step 1: Escrever os testes**

Criar `lib/periodos.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { blocoNaData, diasDeCruzamento, metaProrateada, type Periodo } from './periodos';

const periodosIssy: Periodo[] = [
  { modeloId: 'issy', bloco: 'I', inicio: '2026-07-01', fim: '2026-08-15' },
  { modeloId: 'issy', bloco: 'II', inicio: '2026-08-15', fim: null },
];

describe('blocoNaData', () => {
  test('data dentro do período fechado antigo', () => {
    expect(blocoNaData(periodosIssy, 'issy', '2026-08-10')).toBe('I');
  });

  test('data dentro do período aberto atual', () => {
    expect(blocoNaData(periodosIssy, 'issy', '2026-08-20')).toBe('II');
  });

  test('data exatamente na virada pertence ao período novo (início inclusivo)', () => {
    expect(blocoNaData(periodosIssy, 'issy', '2026-08-15')).toBe('II');
  });

  test('sem período cobrindo a data devolve null', () => {
    expect(blocoNaData(periodosIssy, 'issy', '2026-06-01')).toBeNull();
  });

  test('modelo desconhecida devolve null', () => {
    expect(blocoNaData(periodosIssy, 'outra', '2026-08-10')).toBeNull();
  });
});

describe('diasDeCruzamento', () => {
  test('período que cobre o mês inteiro dá todos os dias do mês', () => {
    const periodo = { inicio: '2026-01-01', fim: null };
    expect(diasDeCruzamento(periodo, '2026-08-01', '2026-08-31')).toBe(31);
  });

  test('período que fecha no meio do mês', () => {
    const periodo = { inicio: '2026-01-01', fim: '2026-08-15' };
    expect(diasDeCruzamento(periodo, '2026-08-01', '2026-08-31')).toBe(15);
  });

  test('período que abre no meio do mês', () => {
    const periodo = { inicio: '2026-08-15', fim: null };
    expect(diasDeCruzamento(periodo, '2026-08-01', '2026-08-31')).toBe(17);
  });

  test('período fora do mês não cruza — zero', () => {
    const periodo = { inicio: '2026-06-01', fim: '2026-06-30' };
    expect(diasDeCruzamento(periodo, '2026-08-01', '2026-08-31')).toBe(0);
  });
});

describe('metaProrateada', () => {
  test('modelo que ficou o mês inteiro no mesmo bloco dá a meta cheia nele', () => {
    const periodos: Periodo[] = [{ modeloId: 'capri', bloco: 'II', inicio: '2026-01-01', fim: null }];
    const resultado = metaProrateada(periodos, 'capri', 31000, '2026-08-01', '2026-08-31', 31);
    expect(resultado).toEqual({ I: 0, II: 31000 });
  });

  test('modelo que trocou de bloco no meio do mês reparte proporcional', () => {
    // Trocou no dia 16 (15 dias em I, 16 dias em II, mês de 31 dias).
    const periodos: Periodo[] = [
      { modeloId: 'issy', bloco: 'I', inicio: '2026-01-01', fim: '2026-08-16' },
      { modeloId: 'issy', bloco: 'II', inicio: '2026-08-16', fim: null },
    ];
    const resultado = metaProrateada(periodos, 'issy', 31000, '2026-08-01', '2026-08-31', 31);
    expect(resultado.I).toBeCloseTo((31000 * 15) / 31, 2);
    expect(resultado.II).toBeCloseTo((31000 * 16) / 31, 2);
    expect(resultado.I + resultado.II).toBeCloseTo(31000, 2);
  });

  test('modelo sem período cruzando o mês dá meta zero nos dois blocos', () => {
    const periodos: Periodo[] = [{ modeloId: 'x', bloco: 'I', inicio: '2026-01-01', fim: '2026-03-01' }];
    expect(metaProrateada(periodos, 'x', 10000, '2026-08-01', '2026-08-31', 31)).toEqual({ I: 0, II: 0 });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- periodos.test.ts`
Expected: FAIL — módulo `./periodos` não existe.

- [ ] **Step 3: Implementar**

Criar `lib/periodos.ts`:

```ts
// Resolve qual bloco (time) uma modelo pertencia numa data específica, a
// partir do histórico de model_bloco_periodos — usado pra atribuir vendas
// antigas ao time de quando elas aconteceram, não ao time atual da modelo.

import { diferencaDias } from './tempo';
import type { Bloco } from './tipos';

const arred = (valor: number) => Math.round(valor * 100) / 100;

export type Periodo = {
  modeloId: string;
  bloco: Bloco;
  inicio: string; // 'YYYY-MM-DD'
  fim: string | null; // null = período aberto (time atual)
};

/** O bloco que a modelo pertencia numa data, ou null se nenhum período cobre. */
export function blocoNaData(periodos: Periodo[], modeloId: string, data: string): Bloco | null {
  const periodo = periodos.find(
    (p) => p.modeloId === modeloId && p.inicio <= data && (p.fim === null || p.fim >= data),
  );
  return periodo?.bloco ?? null;
}

const maxData = (a: string, b: string) => (a > b ? a : b);
const minData = (a: string, b: string) => (a < b ? a : b);

/** Quantos dias (inclusive) de um período caem dentro de [inicio, fim]. Zero se não cruza. */
export function diasDeCruzamento(
  periodo: { inicio: string; fim: string | null },
  inicio: string,
  fim: string,
): number {
  const de = maxData(periodo.inicio, inicio);
  const ate = minData(periodo.fim ?? fim, fim);
  if (de > ate) return 0;
  return diferencaDias(de, ate) + 1;
}

/**
 * Reparte a meta mensal de uma modelo entre os blocos que ela pertenceu
 * dentro de [inicio, fim], proporcional aos dias em cada um.
 */
export function metaProrateada(
  periodos: Periodo[],
  modeloId: string,
  metaMensal: number,
  inicio: string,
  fim: string,
  diasDoMes: number,
): Record<Bloco, number> {
  const porBloco: Record<Bloco, number> = { I: 0, II: 0 };
  if (diasDoMes <= 0) return porBloco;

  for (const periodo of periodos.filter((p) => p.modeloId === modeloId)) {
    const dias = diasDeCruzamento(periodo, inicio, fim);
    if (dias === 0) continue;
    porBloco[periodo.bloco] = arred(porBloco[periodo.bloco] + (metaMensal * dias) / diasDoMes);
  }
  return porBloco;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- periodos.test.ts`
Expected: PASS (13 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/periodos.ts lib/periodos.test.ts
git commit -m "lib/periodos: funções puras de bloco-por-data e meta prorateada"
```

---

### Task 4: `lib/primarisDb.ts` — atribuição por data + Histórico

**Files:**
- Modify: `lib/primarisDb.ts`

**Interfaces:**
- Consumes: `blocoNaData`, `metaProrateada`, `type Periodo` (Task 3, `lib/periodos.ts`).
- Produces: `buscarPeriodos(db): Promise<Periodo[]>` (nova, não exportada — uso interno do módulo), `VendaDeModelo.modeloBloco` agora resolvido pela data da venda, `ResumoPrimaris.porTime`/`.total` prorateados, `type EventoHistorico = { modeloNome: string; blocoOrigem: Bloco; blocoDestino: Bloco | null; data: string; vendido: number }`, `buscarHistoricoModelos(db, inicio, fim): Promise<EventoHistorico[]>`.

- [ ] **Step 1: Adicionar `buscarPeriodos` e trocar a resolução de bloco em `buscarVendasDaEmpresa`**

No topo de `lib/primarisDb.ts`, adicionar o import:

```ts
import { blocoNaData, metaProrateada, type Periodo } from './periodos';
```

Adicionar a função (antes de `buscarVendasDaEmpresa`, depois dos tipos existentes em torno da linha 49):

```ts
async function buscarPeriodos(db: SupabaseClient): Promise<Periodo[]> {
  const { data } = await db.from('model_bloco_periodos').select('model_id, bloco, inicio, fim');
  return ((data ?? []) as { model_id: string; bloco: Bloco; inicio: string; fim: string | null }[]).map((p) => ({
    modeloId: p.model_id,
    bloco: p.bloco,
    inicio: p.inicio,
    fim: p.fim,
  }));
}
```

Dentro de `buscarVendasDaEmpresa` (linha 70), logo depois da busca de `shiftsData` (linha 87), buscar os períodos:

```ts
const periodos = await buscarPeriodos(db);
```

No loop principal (por volta da linha 115-123), trocar `modeloBloco: modelo.bloco` por:

```ts
const dia = diaDoStatement(shift.turno, shift.data);
const bloco = blocoNaData(periodos, model_id, dia);
if (bloco === null) continue; // defensivo: sem período cobrindo, não atribui a nenhum time

vendas.push({
  repId: shift.rep_id,
  repCargo: shift.reps.cargo,
  modeloId: model_id,
  modeloBloco: bloco,
  turno: shift.turno,
  vendidoTotal: totalDasLinhas(delta),
  vendidoComissionavel: baseComissao(delta),
});
```

No loop de `turnos_extra` (por volta da linha 155-176), mesma troca — `modeloBloco: e.models.bloco` vira:

```ts
const dia = diaDoStatement(e.turno, e.data);
const bloco = blocoNaData(periodos, e.model_id, dia);
if (bloco === null) continue;

vendas.push({
  repId: e.rep_id,
  repCargo: e.reps.cargo,
  modeloId: e.model_id,
  modeloBloco: bloco,
  turno: e.turno,
  vendidoTotal: totalDasLinhas(delta),
  vendidoComissionavel: baseComissao(delta),
});
```

Isso já corrige `buscarBonusPrimaris` de graça, porque ela consome `v.modeloBloco` de `buscarVendasDaEmpresa` sem nenhuma outra mudança.

- [ ] **Step 2: Atualizar `buscarResumoPrimaris` — buscar todas as modelos, prorateando `porTime`**

Trocar a busca de `modelsData` (linha 217-222) de `.eq('ativa', true)` pra buscar todas, e derivar a lista ativa separadamente:

```ts
const [vendas, { data: repsData }, { data: modelsData }, periodos] = await Promise.all([
  buscarVendasDaEmpresa(db, inicio, fim),
  db.from('reps').select('id, nome_curto, cargo').eq('ativo', true).order('nome_curto'),
  db.from('models').select('id, nome, bloco, meta_mensal, ativa').order('bloco').order('nome'),
  buscarPeriodos(db),
]);

const reps = (repsData ?? []) as { id: string; nome_curto: string; cargo: Cargo }[];
const models = (modelsData ?? []) as { id: string; nome: string; bloco: Bloco; meta_mensal: number; ativa: boolean }[];
const modelsAtivos = models.filter((m) => m.ativa);
const metaPorModelo = new Map(modelsAtivos.map((m) => [m.id, m.meta_mensal]));
```

Trocar toda referência a `models` dentro de `porPagina` (linha 262) por `modelsAtivos` — o resto do bloco (`vendidoPorModelo`, `projecaoDoMes`, etc.) fica igual, só troca a fonte:

```ts
const porPagina: ResumoPagina[] = modelsAtivos.map((m) => {
  ...
```

Trocar o bloco de `porTime` (linha 277-283) inteiro por:

```ts
const porTime = {} as ResumoPrimaris['porTime'];
for (const bloco of ['I', 'II'] as Bloco[]) {
  const vendido = arred(
    vendas.filter((v) => v.modeloBloco === bloco).reduce((s, v) => s + v.vendidoTotal, 0),
  );
  const meta = arred(
    models.reduce((s, m) => s + metaProrateada(periodos, m.id, m.meta_mensal, inicio, fim, diasDoMes)[bloco], 0),
  );
  porTime[bloco] = { vendido, meta, percentual: percentualAtingido(vendido, meta) };
}
```

`total` (linha 285-286) continua igual — já soma `porTime.I` + `porTime.II`, que agora já vêm prorateados.

- [ ] **Step 3: Adicionar `buscarHistoricoModelos`**

No final do arquivo, depois de `buscarResumoPrimaris` (antes do bloco de `buscarBonusPrimaris`):

```ts
export type EventoHistorico = {
  modeloNome: string;
  blocoOrigem: Bloco;
  blocoDestino: Bloco | null; // null = desativada, sem período novo aberto
  data: string; // data em que o período fechou
  vendido: number;
};

/** Trocas de time / desativações que fecharam um período dentro de [inicio, fim]. */
export async function buscarHistoricoModelos(
  db: SupabaseClient,
  inicio: string,
  fim: string,
): Promise<EventoHistorico[]> {
  const { data: periodosData } = await db
    .from('model_bloco_periodos')
    .select('model_id, bloco, inicio, fim, models(nome)')
    .not('fim', 'is', null)
    .gte('fim', inicio)
    .lte('fim', fim)
    .order('fim');

  type LinhaPeriodoFechado = {
    model_id: string;
    bloco: Bloco;
    inicio: string;
    fim: string;
    models: { nome: string } | null;
  };
  const fechados = (periodosData ?? []) as unknown as LinhaPeriodoFechado[];
  if (fechados.length === 0) return [];

  const modeloIds = [...new Set(fechados.map((p) => p.model_id))];
  const { data: todosData } = await db
    .from('model_bloco_periodos')
    .select('model_id, bloco, inicio, fim')
    .in('model_id', modeloIds);
  const todos = (todosData ?? []) as { model_id: string; bloco: Bloco; inicio: string; fim: string | null }[];

  const eventos: EventoHistorico[] = [];
  for (const periodo of fechados) {
    if (!periodo.models) continue;
    const destino = todos.find((t) => t.model_id === periodo.model_id && t.inicio === periodo.fim);
    const vendasDoPeriodo = await buscarVendasDaEmpresa(db, periodo.inicio, periodo.fim);
    const vendido = arred(
      vendasDoPeriodo
        .filter((v) => v.modeloId === periodo.model_id)
        .reduce((s, v) => s + v.vendidoTotal, 0),
    );
    eventos.push({
      modeloNome: periodo.models.nome,
      blocoOrigem: periodo.bloco,
      blocoDestino: destino ? destino.bloco : null,
      data: periodo.fim,
      vendido,
    });
  }
  return eventos;
}
```

- [ ] **Step 4: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS — nenhum teste existente de `primarisDb.ts` quebra (não há `primarisDb.test.ts`, mas conferir que `meta.test.ts`, `statement.test.ts` etc. continuam verdes, já que `lib/statement.ts` não foi tocado).

Run: `npm run typecheck`
Expected: sem erro — checar com atenção o tipo de retorno de `.select('model_id, bloco, inicio, fim, models(nome)')` (Supabase pode devolver `models` como array em vez de objeto; se o `typecheck` reclamar, ajustar o tipo `LinhaPeriodoFechado.models` pra `{ nome: string }[] | null` e usar `periodo.models[0]?.nome` — mesma armadilha já documentada em `workspace-vortex.md` armadilha #2).

- [ ] **Step 5: Commit**

```bash
git add lib/primarisDb.ts
git commit -m "lib/primarisDb: atribui venda ao bloco de quando aconteceu, não ao atual"
```

---

### Task 5: Server actions — `moverTime` e `desativar`/`reativar` fecham/abrem período

**Files:**
- Modify: `app/(app)/admin/models/actions.ts`

**Interfaces:**
- Consumes: `dataBRT` (`lib/tempo.ts`), `Bloco` (`lib/tipos.ts`).
- Produces: `moverTime(id: string): Promise<void>`, `definirAtivaModelo` com o novo comportamento de período.

- [ ] **Step 1: Importar `dataBRT` e `Bloco`**

No topo de `app/(app)/admin/models/actions.ts`, ajustar o import existente de tipos e adicionar:

```ts
import { dataBRT } from '@/lib/tempo';
import type { Bloco } from '@/lib/tipos';
```

(o arquivo já importa `type { Bloco }` de `@/lib/tipos` na linha 6 — só adicionar o import de `dataBRT`.)

- [ ] **Step 2: Adicionar `fecharPeriodo` e `moverTime`**

Depois de `revalidar()` (linha 18) e antes de `criarModelo` (linha 20):

```ts
/** Fecha o período aberto da modelo, se existir. */
async function fecharPeriodo(
  supabase: Awaited<ReturnType<typeof criarClienteServidor>>,
  modelId: string,
  hoje: string,
) {
  const { error } = await supabase
    .from('model_bloco_periodos')
    .update({ fim: hoje })
    .eq('model_id', modelId)
    .is('fim', null);
  if (error) throw new Error(error.message);
}

/** Abre um período novo pra modelo no bloco dado, a partir de hoje. */
async function abrirPeriodo(
  supabase: Awaited<ReturnType<typeof criarClienteServidor>>,
  modelId: string,
  bloco: Bloco,
  hoje: string,
) {
  const { error } = await supabase
    .from('model_bloco_periodos')
    .insert({ model_id: modelId, bloco, inicio: hoje });
  if (error) throw new Error(error.message);
}
```

Depois de `criarModelo` (linha 28), antes de `definirExtra`:

```ts
/** Troca a modelo pro outro time: fecha o período atual e abre um novo no
 * bloco oposto. Todo o histórico de venda de antes fica atribuído ao time
 * antigo (ver lib/periodos.ts blocoNaData). */
export async function moverTime(id: string) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();
  const hoje = dataBRT();

  const { data: modelo, error: erroBusca } = await supabase
    .from('models')
    .select('bloco')
    .eq('id', id)
    .single();
  if (erroBusca || !modelo) throw new Error('Modelo não encontrada.');

  const novoBloco: Bloco = modelo.bloco === 'I' ? 'II' : 'I';

  await fecharPeriodo(supabase, id, hoje);
  await abrirPeriodo(supabase, id, novoBloco, hoje);

  const { error } = await supabase.from('models').update({ bloco: novoBloco }).eq('id', id);
  if (error) throw new Error(error.message);

  revalidar();
}
```

- [ ] **Step 3: Atualizar `definirAtivaModelo`**

Substituir a função inteira (linhas 52-60) por:

```ts
export async function definirAtivaModelo(id: string, ativa: boolean) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();
  const hoje = dataBRT();

  if (ativa) {
    const { data: aberto } = await supabase
      .from('model_bloco_periodos')
      .select('id')
      .eq('model_id', id)
      .is('fim', null)
      .maybeSingle();
    if (!aberto) {
      const { data: modelo } = await supabase.from('models').select('bloco').eq('id', id).single();
      if (modelo) await abrirPeriodo(supabase, id, modelo.bloco, hoje);
    }
  } else {
    await fecharPeriodo(supabase, id, hoje);
  }

  const { error } = await supabase.from('models').update({ ativa }).eq('id', id);
  if (error) throw new Error(error.message);

  revalidar();
}
```

- [ ] **Step 4: Verificar manualmente contra o banco**

Não há teste automatizado pra Server Actions neste projeto (padrão já estabelecido). Verificação: `npm run typecheck` passa sem erro nesse arquivo.

Run: `npm run typecheck`
Expected: sem erro em `app/(app)/admin/models/actions.ts`.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/admin/models/actions.ts"
git commit -m "admin/models: ação de trocar de time; desativar/reativar fecham e reabrem período"
```

---

### Task 6: Botão "trocar de time" em `admin/models`

**Files:**
- Modify: `app/(app)/admin/models/linha-modelo.tsx`

**Interfaces:**
- Consumes: `moverTime` (Task 5, `./actions`).

- [ ] **Step 1: Importar `moverTime`**

Na linha 5-12 do import existente de `./actions`, adicionar `moverTime` à lista:

```ts
import {
  apagarModelo,
  criarModelo,
  definirAtivaModelo,
  definirExtra,
  definirMetaMensal,
  moverTime,
  renomearModelo,
} from './actions';
```

- [ ] **Step 2: Adicionar o botão**

Dentro do `<div className="inline-flex gap-3">` (linha 101-134), entre o botão "desativar/reativar" (linha 105-112) e o de "marcar extra" (linha 113-120):

```tsx
<button
  type="button"
  disabled={pendente}
  onClick={() => rodar(() => moverTime(model.id))}
  className="text-xs text-texto-fraco hover:text-texto disabled:opacity-50"
>
  trocar de time
</button>
```

- [ ] **Step 3: Rodar typecheck e lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erro.

- [ ] **Step 4: Verificação visual no browser**

`npm run dev`, abrir `/admin/models` logado como admin. Confirmar: botão "trocar de time" aparece em cada linha, ao lado dos outros. Clicar numa modelo de teste (não usar a Issy/Capri de produção nesse teste manual — se não houver modelo de teste, criar uma via "Adicionar modelo" no time I, mover pro time II, conferir que ela aparece na coluna certa depois do `router.refresh()`, e depois apagar essa modelo de teste — ela nunca teve statement, então `apagarModelo` funciona limpo).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/admin/models/linha-modelo.tsx"
git commit -m "admin/models: botão trocar de time na linha da modelo"
```

---

### Task 7: Seção "Histórico" em `/primaris`

**Files:**
- Modify: `app/(app)/primaris/page.tsx`

**Interfaces:**
- Consumes: `buscarHistoricoModelos`, `type EventoHistorico` (Task 4, `@/lib/primarisDb`).

- [ ] **Step 1: Importar e buscar o histórico**

Ajustar o import de `@/lib/primarisDb` (linha 5):

```ts
import { buscarHistoricoModelos, buscarResumoPrimaris, type EventoHistorico, type ResumoPagina } from '@/lib/primarisDb';
```

Depois de `const resumo = await buscarResumoPrimaris(...)` (linha 34), buscar o histórico em paralelo desde o início (mover os dois pra `Promise.all`):

```ts
const [resumo, historico] = await Promise.all([
  buscarResumoPrimaris(criarClienteAdmin(), inicio, fim),
  buscarHistoricoModelos(criarClienteAdmin(), inicio, fim),
]);
```

- [ ] **Step 2: Renderizar a seção**

Depois da seção "Por página" (fecha em torno da linha 122, antes do `</div>` final do componente), adicionar:

```tsx
{historico.length > 0 && (
  <section>
    <h2 className="mb-2 text-sm font-medium text-texto-fraco">Histórico</h2>
    <div className="overflow-x-auto rounded-2xl border border-borda bg-superficie">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-borda text-left text-texto-fraco">
            <th className="px-4 py-3 font-medium">Modelo</th>
            <th className="px-3 py-3 font-medium">Mudança</th>
            <th className="px-3 py-3 font-medium">Data</th>
            <th className="px-4 py-3 text-right font-medium">Vendido no período</th>
          </tr>
        </thead>
        <tbody>
          {historico.map((evento, i) => (
            <LinhaHistorico key={i} evento={evento} />
          ))}
        </tbody>
      </table>
    </div>
  </section>
)}
```

Adicionar o componente `LinhaHistorico` no final do arquivo, depois de `LinhaPagina`:

```tsx
function LinhaHistorico({ evento }: { evento: EventoHistorico }) {
  const destino = evento.blocoDestino === null ? 'desativada' : NOME_TIME[evento.blocoDestino];
  return (
    <tr className="border-b border-borda last:border-0">
      <td className="px-4 py-3">{evento.modeloNome}</td>
      <td className="px-3 py-3 text-texto-fraco">
        {NOME_TIME[evento.blocoOrigem]} → {destino}
      </td>
      <td className="px-3 py-3 text-texto-fraco">{diaLegivel(evento.data)}</td>
      <td className="px-4 py-3 text-right font-medium">{dinheiro(evento.vendido)}</td>
    </tr>
  );
}
```

Adicionar o import de `diaLegivel` (junto com os outros imports de `@/lib/tempo`, linha 7):

```ts
import { diaLegivel, limitesDoMes, mesAtual, mesLegivel, somarMeses } from '@/lib/tempo';
```

- [ ] **Step 3: Rodar typecheck e lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erro.

- [ ] **Step 4: Verificação visual no browser**

Reaproveitar a modelo de teste do Task 6 (criar de novo se já apagou): trocar de time, ir em `/primaris` no mês atual, confirmar que a seção "Histórico" aparece com a linha "Time X → Time Y", data de hoje, e vendido `US$ 0,00` (modelo de teste sem venda). Navegar pro mês anterior (←) e confirmar que a seção some (evento não caiu dentro daquele mês). Apagar a modelo de teste no final.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/primaris/page.tsx"
git commit -m "primaris: seção Histórico de trocas de time do mês"
```

---

### Task 8: Verificação final e deploy

**Files:** nenhum novo — só rodar os checks e publicar.

- [ ] **Step 1: Rodar os 4 checks**

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Expected: os quatro passam limpos. Qualquer erro, voltar pra task correspondente e corrigir antes de seguir.

- [ ] **Step 2: Conferir manualmente o caso real da Issy**

Em `/admin/models`, clicar "trocar de time" na Issy (Time 1 → Time 2, o motivo original desta sessão). Ir em `/primaris`, mês atual: conferir que "Time 1 · Vortex I" não mostra mais `US$ 0,00 / US$ 0,00` — mostra a meta prorateada pelos dias em que ela ainda estava lá, e o vendido dela até a data da troca. "Time 2 · Vortex II" ganha a parte proporcional dali pra frente. A seção "Histórico" mostra a linha da troca com o valor vendido no período em Time 1.

- [ ] **Step 3: Push**

```bash
git push origin main
```

- [ ] **Step 4: Confirmar o deploy**

Usar o MCP da Vercel (`list_deployments`, projeto `vortex`, team `vortex-f5a9`) até o deploy mais recente aparecer como `READY`. Se falhar, puxar `get_deployment_build_logs` pra achar o erro antes de reportar qualquer coisa como "no ar".
