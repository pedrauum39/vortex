# Turno Extra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "turno independente"/"página externa" system (embedded inside the normal clock-in/out flow) with an isolated "Turno Extra" tab in `/turno`, plus a separate "em aberto" vs "concluídos" split in `/admin/turnos`.

**Architecture:** New dedicated table `turnos_extra`, decoupled from `shifts`/`shift_logs`/`statements`. The normal turno pipeline (`buscarAnterior()`, `models` picker in clock-in) goes back to its pre-06/08 simplicity. A new `lib/turnosExtraDb.ts` handles all reads/writes for the new table, feeding into `lib/primarisDb.ts` (meta/bônus) and a new UI section wherever it needs to surface.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Supabase (Postgres + RLS + Storage), Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-18-turno-extra-design.md` — every task below implements a piece of it.
- pt-BR naming throughout (variables, labels, commit messages) — matches 100% of the existing codebase.
- No comments explaining WHAT code does — only WHY, and only when non-obvious (existing project convention, see `CLAUDE.md`).
- Money values: 2 decimals, `Math.round(x * 100) / 100` (see `lib/statement.ts`'s `arred`/`centavos` pattern) — reuse, don't reinvent.
- **Refinement vs. spec:** the spec's section 7 says `lib/metaDb.ts` (`buscarMetasDoRep`) also merges `turnos_extra`. This plan narrows that: `buscarMetasDoRep()` stays untouched (it's specifically "did the rep hit their SCHEDULED quota", and merging risks double-counting/regressing well-tested code). Turno Extra entries get their own display section in `/turno`, with their own % computed inline where rendered (not inside `metaDb.ts`). The page-level meta (Kaylin's own meta in `/primaris`) and the leadership bonus — the two things the user explicitly asked for — are fully covered by the `lib/primarisDb.ts` merge (Task 9). Flagged here so it's visible, not silently diverged.

---

### Task 1: Migration — rename `models.independente` → `extra`, drop `models.externa` and `statements.anterior_manual`

**Files:**
- Create: `supabase/migrations/0019_turno_extra_schema.sql`

**Interfaces:**
- Produces: `models.extra boolean not null default false` (same data as today's `independente` — Kaylin stays `true`). `models.externa` and `statements.anterior_manual` no longer exist.

- [ ] **Step 1: Write the migration**

```sql
-- Redesenho do "turno independente"/"página externa" como "Turno Extra"
-- (docs/superpowers/specs/2026-08-18-turno-extra-design.md). A lógica de
-- pular a cadeia automática sai do fluxo normal de clock-in/out e vai pra
-- uma tabela própria (turnos_extra, migração seguinte) — estas colunas
-- ficam mortas.

alter table models rename column independente to extra;
alter table models drop column externa;
alter table statements drop column anterior_manual;
```

- [ ] **Step 2: Apply via Supabase MCP**

Run `mcp__75bf43be-48a3-4dd8-b1f7-9f53cc565bb8__apply_migration` with `name: "turno_extra_schema"` and the SQL above (project id from `workspace-vortex.md`: `vbyvpjtmayavtvfhpgax`).

- [ ] **Step 3: Verify**

Run `mcp__75bf43be-48a3-4dd8-b1f7-9f53cc565bb8__execute_sql`: `select nome, extra from models where nome = 'Kaylin';` — expect `extra = true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0019_turno_extra_schema.sql
git commit -m "Migração: models.independente vira extra, apaga externa e anterior_manual"
```

---

### Task 2: Migration — create `turnos_extra` table + RLS

**Files:**
- Create: `supabase/migrations/0020_tabela_turnos_extra.sql`

**Interfaces:**
- Produces: table `turnos_extra` with columns `id, rep_id, data, turno, model_id, nome_livre, net_assinaturas, net_gorjetas, net_publicacoes, net_mensagens, net_indicacoes, anterior (jsonb), imagem_atual_path, ocr_atual_raw, imagem_anterior_path, ocr_anterior_raw, criado_em`. RLS: rep reads/writes own rows, `pode_ver()` reads all, `is_admin()` deletes.

- [ ] **Step 1: Write the migration**

```sql
-- Tabela dedicada pro "Turno Extra" (docs/superpowers/specs/2026-08-18-
-- turno-extra-design.md) — nunca passa por shifts/shift_logs/statements,
-- de propósito: é ad-hoc (o rep digita dia/turno na hora, sem escala) e
-- pode ser sobre uma modelo sem cadastro nenhum (nome_livre).

create table turnos_extra (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references reps(id),
  data date not null,
  turno turno_t not null,
  model_id uuid references models(id),
  nome_livre text,
  net_assinaturas numeric not null default 0,
  net_gorjetas numeric not null default 0,
  net_publicacoes numeric not null default 0,
  net_mensagens numeric not null default 0,
  net_indicacoes numeric not null default 0,
  anterior jsonb,
  imagem_atual_path text,
  ocr_atual_raw jsonb,
  imagem_anterior_path text,
  ocr_anterior_raw jsonb,
  criado_em timestamptz not null default now(),
  constraint turnos_extra_modelo_check check (
    (model_id is not null and nome_livre is null) or (model_id is null and nome_livre is not null)
  )
);

alter table turnos_extra enable row level security;

create policy turnos_extra_select on turnos_extra for select to authenticated
  using (rep_id = current_rep_id() or pode_ver());

create policy turnos_extra_insert on turnos_extra for insert to authenticated
  with check (rep_id = current_rep_id() or is_admin());

create policy turnos_extra_delete on turnos_extra for delete to authenticated
  using (is_admin());
```

- [ ] **Step 2: Apply via Supabase MCP**

Run `apply_migration` with `name: "tabela_turnos_extra"`.

- [ ] **Step 3: Verify RLS is enabled**

`execute_sql`: `select relrowsecurity from pg_class where relname = 'turnos_extra';` — expect `true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0020_tabela_turnos_extra.sql
git commit -m "Migração: cria tabela turnos_extra com RLS"
```

---

### Task 3: `lib/tipos.ts` — rename `Model.independente`→`extra`, drop `Model.externa`, add `TurnoExtra` type

**Files:**
- Modify: `lib/tipos.ts:52-65`

**Interfaces:**
- Produces: `Model.extra: boolean` (no more `independente`/`externa`); `export type TurnoExtra = { id: string; repId: string; data: string; turno: Turno; modeloId: string | null; nomeLivre: string | null; atual: LinhasNet; anterior: LinhasNet | null }`.

- [ ] **Step 1: Edit the `Model` type**

```ts
/** Uma modelo (perfil de conteúdo) do roster de um dos dois times. */
export type Model = {
  id: string;
  nome: string;
  bloco: Bloco;
  ativa: boolean;
  meta_mensal: number;
  /** Sem cadeia de desconto confiável (ex.: Kaylin) — nunca aparece no
   * clock-in normal, só é reportada pela aba "Turno Extra" (turnos_extra). */
  extra: boolean;
};
```

- [ ] **Step 2: Add `TurnoExtra` type** (near `Statement`, same file)

```ts
import type { LinhasNet } from './statement';

/** Um lançamento da aba "Turno Extra" — nunca passa por shifts/statements. */
export type TurnoExtra = {
  id: string;
  repId: string;
  data: string;
  turno: Turno;
  /** Preenchido = modelo do roster (ex. Kaylin). Null junto com nomeLivre preenchido = modelo de fora. */
  modeloId: string | null;
  nomeLivre: string | null;
  atual: LinhasNet;
  /** Null só quando turno = T6T1 (primeiro turno do dia, sem "anterior"). */
  anterior: LinhasNet | null;
};
```

- [ ] **Step 3: `npx tsc --noEmit`** — expect errors in every file that still references `.independente`/`.externa`. That's the checklist for the remaining tasks; don't fix them here.

- [ ] **Step 4: Commit**

```bash
git add lib/tipos.ts
git commit -m "tipos: Model.independente vira extra, remove externa, adiciona TurnoExtra"
```

---

### Task 4: `lib/statementDb.ts` — simplify back to pre-06/08

**Files:**
- Modify: `lib/statementDb.ts` (whole file)

**Interfaces:**
- Produces: `buscarAnterior(db, turno, data, modeloId): Promise<Anterior>` — same signature as always, but no `independente` short-circuit. `resolverAnterior()` is deleted.

- [ ] **Step 1: Rewrite the file**

```ts
// Busca do statement anterior na cadeia, contra o banco. Compartilhado entre a
// tela do turno, o invoice e o admin — todos precisam da mesma regra de "quem
// vem antes na cadeia do dia", agora por modelo: um turno "double" tem um
// statement por modelo, e cada modelo tem sua própria cadeia.

import type { SupabaseClient } from '@supabase/supabase-js';
import { turnoAnterior, type LinhasNet } from './statement';
import type { Turno } from './tipos';

/**
 * `primeiro` abre o dia e vale o statement inteiro. `pendente` é o turno
 * anterior que ainda não mandou o print — descontar zero aí inflaria o valor
 * deste turno, então o cálculo fica em aberto até o print chegar.
 */
export type Anterior =
  | { tipo: 'primeiro' }
  | { tipo: 'pendente' }
  | { tipo: 'ok'; linhas: LinhasNet };

/**
 * As linhas net do statement da MESMA modelo no turno anterior da cadeia.
 * Espera um cliente que atravesse o RLS (admin) — o turno anterior pode ser de
 * outro rep, e o que volta são só os valores acumulados do print dele.
 */
export async function buscarAnterior(
  db: SupabaseClient,
  turno: Turno,
  data: string,
  modeloId: string,
): Promise<Anterior> {
  const anterior = turnoAnterior(turno, data);
  if (!anterior) return { tipo: 'primeiro' };

  // Os turnos 'regular' do dia anterior — pode ter mais de um bloco; o que
  // importa é qual shift_log tem statement para ESTA modelo.
  const { data: shiftsAnteriores } = await db
    .from('shifts')
    .select('shift_logs(id)')
    .eq('data', anterior.data)
    .eq('turno', anterior.turno)
    .eq('funcao', 'regular');

  const logIds = (shiftsAnteriores ?? []).flatMap((s) =>
    (s.shift_logs as { id: string }[]).map((l) => l.id),
  );
  if (logIds.length === 0) return { tipo: 'pendente' };

  const { data: st } = await db
    .from('statements')
    .select('net_assinaturas, net_gorjetas, net_publicacoes, net_mensagens, net_indicacoes')
    .in('shift_log_id', logIds)
    .eq('model_id', modeloId)
    .maybeSingle();

  if (!st) return { tipo: 'pendente' };

  return {
    tipo: 'ok',
    linhas: {
      assinaturas: Number(st.net_assinaturas),
      gorjetas: Number(st.net_gorjetas),
      publicacoes: Number(st.net_publicacoes),
      mensagens: Number(st.net_mensagens),
      indicacoes: Number(st.net_indicacoes),
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/statementDb.ts
git commit -m "statementDb: remove o desvio de modelo independente e resolverAnterior()"
```

---

### Task 5: Revert call sites from `resolverAnterior()` back to `buscarAnterior()`, drop `externa`/`anterior_manual` references

**Files:**
- Modify: `lib/metaDb.ts` (whole file — `LinhaShift` type loses `externa`/`anterior_manual`, `vendidoDoTurno` calls `buscarAnterior`, drop the `paginasComMeta`/`externa` filtering)
- Modify: `lib/invoiceDb.ts:9,31,60-94` (`montarModelos` calls `buscarAnterior`, `CAMPOS_STATEMENTS` drops `anterior_manual`)
- Modify: `app/(app)/admin/turnos/page.tsx:4,78` (`buscarAnterior` import already there — just drop `anteriorManual`-related nothing, it's already using `buscarAnterior` directly — confirm no `anterior_manual` in the `statements(...)` select)
- Modify: `app/(app)/turno/actions.ts:6,108-121` (`statementAnterior` calls `buscarAnterior` directly, not `resolverAnterior`)

**Interfaces:**
- Consumes: `buscarAnterior(db, turno, data, modeloId)` from Task 4.

- [ ] **Step 1: `lib/metaDb.ts`** — remove all `externa`/`anterior_manual` handling

In the `LinhaShift` type (line ~25), the `models` sub-select drops `externa`; the `statements` sub-select drops `anterior_manual`:
```ts
type LinhaShift = {
  id: string;
  data: string;
  turno: Turno;
  bloco: Bloco;
  shift_logs: {
    shift_log_models: { model_id: string; models: { nome: string; meta_mensal: number } }[];
    statements: {
      model_id: string;
      net_assinaturas: number;
      net_gorjetas: number;
      net_publicacoes: number;
      net_mensagens: number;
      net_indicacoes: number;
    }[];
  }[];
};
```
`vendidoDoTurno()` (line ~65-97): swap `resolverAnterior(db, turno, data, modeloId, statement?.anterior_manual)` for `buscarAnterior(db, turno, data, modeloId)`. Update the import at the top: `import { buscarAnterior } from './statementDb';`.

`buscarMetasDoRep()` (line ~104-208): the select string drops `externa`/`anterior_manual`:
```ts
'id, data, turno, bloco, shift_logs(shift_log_models(model_id, models(nome, meta_mensal)), statements(model_id, net_assinaturas, net_gorjetas, net_publicacoes, net_mensagens, net_indicacoes))',
```
Remove the `paginasComMeta = paginas.filter((p) => !p.externa)` line — just use `paginas` directly everywhere it was used (there's no more "externa" to exclude; extra models never reach this query at all because they're filtered out of the roster fetch — see Task 12). Same for `porPaginaComMeta`'s `pagina?.externa ? 0 : ...` — drop the ternary, always compute the meta.

`buscarRecordeDoRep()` (line ~219-246): same select-string trim (drop `anterior_manual`).

- [ ] **Step 2: `lib/invoiceDb.ts`**

`CAMPOS_STATEMENTS` (line 60-61) drops `anterior_manual`:
```ts
const CAMPOS_STATEMENTS =
  'statements(model_id, net_assinaturas, net_gorjetas, net_publicacoes, net_mensagens, net_indicacoes)';
```
`LinhaStatement` type (line 24-32) drops the `anterior_manual: LinhasNet | null` field (and the now-unused `LinhasNet` import if nothing else in the file needs it — check).

`montarModelos()` (line 65-94): swap `resolverAnterior(db, turno, data, model_id, statement?.anterior_manual)` for `buscarAnterior(db, turno, data, model_id)`. Update the import: `import { buscarAnterior } from '@/lib/statementDb';`.

- [ ] **Step 3: `app/(app)/admin/turnos/page.tsx`**

Already imports and calls `buscarAnterior` directly (line 4, 78) — no change needed there. Just confirm the `shifts` select string (line 38) doesn't reference `anterior_manual` (it doesn't, per the file read during planning) — no edit needed, this file is already clean.

- [ ] **Step 4: `app/(app)/turno/actions.ts`**

`statementAnterior()` (line 108-121) already calls `buscarAnterior` directly — no change needed (this file never used `resolverAnterior`). Confirm by re-reading after Task 4/8's edits land — no edit expected here beyond what Task 8 adds.

- [ ] **Step 5: `npx tsc --noEmit`**

Expect remaining errors only in files not yet touched (admin/models, turno/report-modelo.tsx, turno/modal-report.tsx, turno/painel.tsx, turno/page.tsx, admin/turnos/linha-turno.tsx) — those are Tasks 10-14.

- [ ] **Step 6: Commit**

```bash
git add lib/metaDb.ts lib/invoiceDb.ts
git commit -m "metaDb/invoiceDb: volta a chamar buscarAnterior() direto, remove externa/anterior_manual"
```

---

### Task 6: `lib/comissao.ts` — add `comissaoTurnoExtra()`

**Files:**
- Modify: `lib/comissao.ts` (append after `pagamentoDoSlot`)
- Test: `lib/comissao.test.ts` (append)

**Interfaces:**
- Produces: `export function comissaoTurnoExtra(base: number, cargo: Cargo, regra: RegraComissao): number`.
- Consumes: `baseComissao()`/`deltaTurno()` from `lib/statement.ts` (caller's responsibility, not this function's — this function just takes the already-computed base).

- [ ] **Step 1: Write the failing test**

```ts
// append to lib/comissao.test.ts, inside a new describe block

describe('comissaoTurnoExtra', () => {
  test('Grand Primaris recebe a taxa de Knight Primaris, não a própria', () => {
    expect(comissaoTurnoExtra(1000, 'grand_primaris', REGRA_PADRAO)).toBe(55);
  });

  test('os outros cargos recebem a taxa deles mesmos', () => {
    expect(comissaoTurnoExtra(1000, 'knight_primaris', REGRA_PADRAO)).toBe(55);
    expect(comissaoTurnoExtra(1000, 'secundus', REGRA_PADRAO)).toBe(40);
    expect(comissaoTurnoExtra(1000, 'tertius', REGRA_PADRAO)).toBe(35);
  });

  test('Admin 5C não recebe nada (cargo de acesso, não trabalha turno)', () => {
    expect(comissaoTurnoExtra(1000, 'admin_5c', REGRA_PADRAO)).toBe(0);
  });

  test('arredonda em centavos', () => {
    expect(comissaoTurnoExtra(1786.77, 'grand_primaris', REGRA_PADRAO)).toBe(98.27);
  });
});
```
And add the import at the top: `import { REGRA_PADRAO, comissaoTurnoExtra, pagamentoDoSlot } from './comissao';`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/comissao.test.ts`
Expected: FAIL with "comissaoTurnoExtra is not defined" (or similar import error).

- [ ] **Step 3: Implement**

Append to `lib/comissao.ts`:
```ts
/**
 * Comissão do Turno Extra (docs/superpowers/specs/2026-08-18-turno-extra-
 * design.md) — sem hora/hora (não tem clock-in) e sem fatia de assistente
 * (é sempre um rep só reportando). Grand Primaris recebe na taxa de Knight
 * Primaris, não na própria — decisão de negócio confirmada pelo usuário.
 */
export function comissaoTurnoExtra(base: number, cargo: Cargo, regra: RegraComissao): number {
  const cargoEfetivo = cargo === 'grand_primaris' ? 'knight_primaris' : cargo;
  return centavos(base * regra.percentual[cargoEfetivo]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/comissao.test.ts`
Expected: PASS, all tests including the pre-existing `pagamentoDoSlot` ones.

- [ ] **Step 5: Commit**

```bash
git add lib/comissao.ts lib/comissao.test.ts
git commit -m "comissao: adiciona comissaoTurnoExtra() — GP recebe taxa de Knight"
```

---

### Task 7: `lib/turnosExtraDb.ts` — new file, core read/write

**Files:**
- Create: `lib/turnosExtraDb.ts`

**Interfaces:**
- Consumes: `deltaTurno`, `baseComissao`, `totalDasLinhas`, `type LinhasNet` from `lib/statement.ts`; `comissaoTurnoExtra` from `lib/comissao.ts`; `buscarRegraVigente` from `lib/comissaoDb.ts`; `type Turno, type Cargo` from `lib/tipos.ts`.
- Produces:
  - `export type LinhaTurnoExtra = { id: string; data: string; turno: Turno; modeloNome: string; vendido: number; comissao: number }`
  - `export async function buscarTurnosExtraDoRep(db, repId, cargo, inicio, fim): Promise<LinhaTurnoExtra[]>`
  - `export async function buscarTurnosExtraAdmin(db, inicio, fim): Promise<(LinhaTurnoExtra & { repNome: string })[]>`
  - `export type DadosTurnoExtra = { id: string; repId: string; data: string; turno: Turno; modeloId: string | null; nomeLivre: string | null; atual: LinhasNet; anterior: LinhasNet | null; imagemAtualPath: string | null; ocrAtualRaw: unknown; imagemAnteriorPath: string | null; ocrAnteriorRaw: unknown }`
  - `export async function lancarTurnoExtra(db, dados: DadosTurnoExtra): Promise<void>`
  - `export async function apagarTurnoExtra(db, id: string): Promise<void>`

- [ ] **Step 1: Write the file**

```ts
// Leitura/escrita da tabela turnos_extra — nunca passa por
// shifts/shift_logs/statements, de propósito (ver docs/superpowers/specs/
// 2026-08-18-turno-extra-design.md). Cada linha já vem com o print de agora
// e, quando o turno não é T6T1, o print anterior digitado/lido na hora — o
// "vendido" é sempre o delta entre os dois (lib/statement.ts:deltaTurno).

import type { SupabaseClient } from '@supabase/supabase-js';
import { buscarRegraVigente } from './comissaoDb';
import { comissaoTurnoExtra } from './comissao';
import { baseComissao, deltaTurno, totalDasLinhas, type LinhasNet } from './statement';
import type { Cargo, Turno } from './tipos';

type LinhaCrua = {
  id: string;
  data: string;
  turno: Turno;
  model_id: string | null;
  nome_livre: string | null;
  models: { nome: string } | null;
  net_assinaturas: number;
  net_gorjetas: number;
  net_publicacoes: number;
  net_mensagens: number;
  net_indicacoes: number;
  anterior: LinhasNet | null;
};

const CAMPOS =
  'id, data, turno, model_id, nome_livre, models(nome), net_assinaturas, net_gorjetas, net_publicacoes, net_mensagens, net_indicacoes, anterior';

function linhasAtuais(l: LinhaCrua): LinhasNet {
  return {
    assinaturas: Number(l.net_assinaturas),
    gorjetas: Number(l.net_gorjetas),
    publicacoes: Number(l.net_publicacoes),
    mensagens: Number(l.net_mensagens),
    indicacoes: Number(l.net_indicacoes),
  };
}

export type LinhaTurnoExtra = {
  id: string;
  data: string;
  turno: Turno;
  modeloNome: string;
  vendido: number;
  comissao: number;
};

async function montarLinha(
  db: SupabaseClient,
  l: LinhaCrua,
  cargo: Cargo,
  data: string,
): Promise<LinhaTurnoExtra> {
  const delta = deltaTurno(linhasAtuais(l), l.anterior);
  const regra = await buscarRegraVigente(db, data);
  return {
    id: l.id,
    data: l.data,
    turno: l.turno,
    modeloNome: l.models?.nome ?? l.nome_livre ?? '',
    vendido: totalDasLinhas(delta),
    comissao: comissaoTurnoExtra(baseComissao(delta), cargo, regra),
  };
}

/** Lançamentos do próprio rep no período — pro histórico em /turno e a linha extra no /invoice. */
export async function buscarTurnosExtraDoRep(
  db: SupabaseClient,
  repId: string,
  cargo: Cargo,
  inicio: string,
  fim: string,
): Promise<LinhaTurnoExtra[]> {
  const { data } = await db
    .from('turnos_extra')
    .select(CAMPOS)
    .eq('rep_id', repId)
    .gte('data', inicio)
    .lte('data', fim)
    .order('data');

  const linhas = (data ?? []) as unknown as LinhaCrua[];
  return Promise.all(linhas.map((l) => montarLinha(db, l, cargo, l.data)));
}

/** Todos os lançamentos do período, com o nome de quem reportou — pra tela de correção em /admin/turnos. */
export async function buscarTurnosExtraAdmin(
  db: SupabaseClient,
  inicio: string,
  fim: string,
): Promise<(LinhaTurnoExtra & { repNome: string })[]> {
  const { data } = await db
    .from('turnos_extra')
    .select(`${CAMPOS}, reps(nome_curto, cargo)`)
    .gte('data', inicio)
    .lte('data', fim)
    .order('data');

  const linhas = (data ?? []) as unknown as (LinhaCrua & { reps: { nome_curto: string; cargo: Cargo } | null })[];
  return Promise.all(
    linhas.map(async (l) => ({
      ...(await montarLinha(db, l, l.reps?.cargo ?? 'tertius', l.data)),
      repNome: l.reps?.nome_curto ?? '—',
    })),
  );
}

export type DadosTurnoExtra = {
  id: string;
  repId: string;
  data: string;
  turno: Turno;
  modeloId: string | null;
  nomeLivre: string | null;
  atual: LinhasNet;
  anterior: LinhasNet | null;
  imagemAtualPath: string | null;
  ocrAtualRaw: unknown;
  imagemAnteriorPath: string | null;
  ocrAnteriorRaw: unknown;
};

export async function lancarTurnoExtra(db: SupabaseClient, dados: DadosTurnoExtra): Promise<void> {
  const { error } = await db.from('turnos_extra').insert({
    id: dados.id,
    rep_id: dados.repId,
    data: dados.data,
    turno: dados.turno,
    model_id: dados.modeloId,
    nome_livre: dados.nomeLivre,
    net_assinaturas: dados.atual.assinaturas,
    net_gorjetas: dados.atual.gorjetas,
    net_publicacoes: dados.atual.publicacoes,
    net_mensagens: dados.atual.mensagens,
    net_indicacoes: dados.atual.indicacoes,
    anterior: dados.anterior,
    imagem_atual_path: dados.imagemAtualPath,
    ocr_atual_raw: dados.ocrAtualRaw,
    imagem_anterior_path: dados.imagemAnteriorPath,
    ocr_anterior_raw: dados.ocrAnteriorRaw,
  });
  if (error) throw new Error(error.message);
}

export async function apagarTurnoExtra(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.from('turnos_extra').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: `npx tsc --noEmit`** on this file in isolation (it has no consumers yet, should compile clean)

- [ ] **Step 3: Commit**

```bash
git add lib/turnosExtraDb.ts
git commit -m "Adiciona lib/turnosExtraDb.ts — leitura/escrita da tabela turnos_extra"
```

---

### Task 8: Merge `turnos_extra` into `lib/primarisDb.ts` (meta da página + bônus de liderança)

**Files:**
- Modify: `lib/primarisDb.ts:1-134` (`buscarVendasDaEmpresa`)
- Modify: `lib/primarisDb.ts:164-181` (`buscarResumoPrimaris`'s models query)
- Test: `lib/primarisDb.test.ts` (new file, if none exists — check first; `lib/escalaDb.test.ts` is the closest existing pattern for a DB-touching test, but `buscarVendasDaEmpresa` needs a live Supabase client, so this is integration-style — skip an automated test here and verify via browser instead, noted in Task 15)

**Interfaces:**
- Consumes: `lib/turnosExtraDb.ts` isn't quite the right shape (`LinhaTurnoExtra` has no `modeloId`/`modeloBloco`/`repCargo`) — this task reads `turnos_extra` directly instead, same pattern as `buscarVendasDaEmpresa`'s existing `shifts` query.
- Produces: `buscarVendasDaEmpresa()` return value (`VendaDeModelo[]`) now includes Turno Extra sales for roster extra models.

- [ ] **Step 1: Drop `externa`/`anterior_manual` from `buscarVendasDaEmpresa()`**

In `lib/primarisDb.ts`, the `LinhaShift` type (line 51-68) drops `externa` from `models` and `anterior_manual` from `statements`:
```ts
type LinhaShift = {
  data: string;
  turno: Turno;
  rep_id: string | null;
  reps: { cargo: Cargo } | null;
  shift_logs: {
    shift_log_models: { model_id: string; models: { nome: string; bloco: Bloco } }[];
    statements: {
      model_id: string;
      net_assinaturas: number;
      net_gorjetas: number;
      net_publicacoes: number;
      net_mensagens: number;
      net_indicacoes: number;
    }[];
  }[];
};
```
The `shifts` select string (line 82-84) drops `externa`/`anterior_manual` to match. Swap `resolverAnterior(...)` for `buscarAnterior(db, shift.turno, shift.data, model_id)` (update the import at top: `import { buscarAnterior } from './statementDb';`). Delete the `if (modelo.externa) continue;` line — extra models never reach this loop in the first place (they're never in `shift_log_models`, see Task 12), so there's nothing to skip here anymore.

- [ ] **Step 2: Add the Turno Extra merge**

Append after the existing `shifts`-based loop, still inside `buscarVendasDaEmpresa()`, before `return vendas;`:

```ts
  // Turno Extra de modelo do roster (ex. Kaylin) conta pra venda da empresa
  // exatamente como um turno normal — mesma meta de página, mesmo bônus de
  // liderança. Modelo de fora (nome_livre) nunca entra aqui — só invoice
  // pessoal de quem reportou (lib/turnosExtraDb.ts, intocado por esta busca).
  const { data: extrasData } = await db
    .from('turnos_extra')
    .select(
      'data, turno, rep_id, reps(cargo), model_id, models(bloco), net_assinaturas, net_gorjetas, net_publicacoes, net_mensagens, net_indicacoes, anterior',
    )
    .not('model_id', 'is', null)
    .gte('data', inicioBusca)
    .lte('data', fim);

  type LinhaExtra = {
    data: string;
    turno: Turno;
    rep_id: string;
    reps: { cargo: Cargo } | null;
    model_id: string;
    models: { bloco: Bloco } | null;
    net_assinaturas: number;
    net_gorjetas: number;
    net_publicacoes: number;
    net_mensagens: number;
    net_indicacoes: number;
    anterior: LinhasNet | null;
  };

  for (const e of ((extrasData ?? []) as unknown as LinhaExtra[]).filter((e) =>
    dentroDoPeriodo(e.turno, e.data, inicio, fim),
  )) {
    if (!e.reps || !e.models) continue;
    const atuais: LinhasNet = {
      assinaturas: Number(e.net_assinaturas),
      gorjetas: Number(e.net_gorjetas),
      publicacoes: Number(e.net_publicacoes),
      mensagens: Number(e.net_mensagens),
      indicacoes: Number(e.net_indicacoes),
    };
    const delta = deltaTurno(atuais, e.anterior);
    vendas.push({
      repId: e.rep_id,
      repCargo: e.reps.cargo,
      modeloId: e.model_id,
      modeloBloco: e.models.bloco,
      turno: e.turno,
      vendidoTotal: totalDasLinhas(delta),
      vendidoComissionavel: baseComissao(delta),
    });
  }
```

- [ ] **Step 3: `buscarResumoPrimaris()`'s models query** (line ~174-180)

Drop the now-nonexistent `externa` filter:
```ts
    db
      .from('models')
      .select('id, nome, bloco, meta_mensal')
      .eq('ativa', true)
      .order('bloco')
      .order('nome'),
```
(No more comment about "externa=false" above it — delete that comment too, it's stale.)

- [ ] **Step 4: `npx tsc --noEmit`**

Expected: clean on this file (double-check `LinhasNet` is imported — it already is, via `./statement`).

- [ ] **Step 5: Commit**

```bash
git add lib/primarisDb.ts
git commit -m "primarisDb: mescla turnos_extra na venda da empresa (meta + bônus de liderança)"
```

---

### Task 9: Server action `lancarTurnoExtra` (rep-facing) + upload helper

**Files:**
- Modify: `app/(app)/turno/actions.ts` (append)

**Interfaces:**
- Consumes: `lancarTurnoExtra` (db fn) from `lib/turnosExtraDb.ts`; `criarClienteServidor` from `@/lib/supabase/server`; `exigirRep` from `@/lib/auth`.
- Produces: `export async function lancarTurnoExtraAction(dados: { id: string; data: string; turno: Turno; modeloId: string | null; nomeLivre: string | null; atual: LinhasNet; anterior: LinhasNet | null; imagemAtualPath: string | null; ocrAtualRaw: unknown; imagemAnteriorPath: string | null; ocrAnteriorRaw: unknown }): Promise<void>` (named `...Action` to avoid clashing with the lib function of the same base name once both are imported in the same client file).

- [ ] **Step 1: Append to `app/(app)/turno/actions.ts`**

```ts
import { lancarTurnoExtra } from '@/lib/turnosExtraDb';
import type { Turno as TurnoTipo } from '@/lib/tipos';

export async function lancarTurnoExtraAction(dados: {
  id: string;
  data: string;
  turno: TurnoTipo;
  modeloId: string | null;
  nomeLivre: string | null;
  atual: LinhasNet;
  anterior: LinhasNet | null;
  imagemAtualPath: string | null;
  ocrAtualRaw: unknown;
  imagemAnteriorPath: string | null;
  ocrAnteriorRaw: unknown;
}) {
  const rep = await exigirRep();
  const supabase = await criarClienteServidor();

  await lancarTurnoExtra(supabase, { ...dados, repId: rep.id });

  revalidatePath('/turno');
  revalidatePath('/invoice');
  revalidatePath('/primaris');
}
```
(`Turno` is already imported as a type in this file per the existing header — check for a naming collision; if the file already has `import type { Turno } from '@/lib/tipos';`, just reuse that import instead of aliasing.)

- [ ] **Step 2: `npx tsc --noEmit`**

Expected clean.

- [ ] **Step 3: Commit**

```bash
git add app/\(app\)/turno/actions.ts
git commit -m "turno/actions: adiciona lancarTurnoExtraAction"
```

---

### Task 10: `app/(app)/turno/turno-extra.tsx` — the form (new component)

**Files:**
- Create: `app/(app)/turno/turno-extra.tsx`

**Interfaces:**
- Consumes: `CapturaPrint`, `type ResultadoPrint` from `./captura-print.tsx`; `lancarTurnoExtraAction` from `./actions.ts`; `criarClienteBrowser` from `@/lib/supabase/client`; `TURNOS`, `rotuloTurno`, `type Model`, `type Turno` from `@/lib/tipos`.
- Produces: `export function TurnoExtra({ repId, modelosExtras }: { repId: string; modelosExtras: Model[] })`.

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { useState, useTransition } from 'react';
import { criarClienteBrowser } from '@/lib/supabase/client';
import { totalDasLinhas } from '@/lib/statement';
import { TURNOS, rotuloTurno, type Model, type Turno } from '@/lib/tipos';
import { lancarTurnoExtraAction } from './actions';
import { CapturaPrint, type ResultadoPrint } from './captura-print';

const dinheiro = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });

const hoje = () => new Date().toISOString().slice(0, 10);

export function TurnoExtra({ repId, modelosExtras }: { repId: string; modelosExtras: Model[] }) {
  const [data, setData] = useState(hoje());
  const [turno, setTurno] = useState<Turno>('T2T3');
  const [modeloId, setModeloId] = useState<string>(modelosExtras[0]?.id ?? '');
  const [nomeLivre, setNomeLivre] = useState('');
  const [usaModeloDeFora, setUsaModeloDeFora] = useState(false);
  const [anterior, setAnterior] = useState<ResultadoPrint | null>(null);
  const [atual, setAtual] = useState<ResultadoPrint | null>(null);

  const [pendente, executar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  const precisaAnterior = turno !== 'T6T1';
  const anteriorPronto = !precisaAnterior || (anterior?.preenchido ?? false);
  const atualPronto = atual?.preenchido ?? false;
  const modeloEscolhida = usaModeloDeFora ? nomeLivre.trim().length > 0 : !!modeloId;
  const podeEnviar = modeloEscolhida && anteriorPronto && atualPronto && !pendente;

  async function enviar() {
    executar(async () => {
      setErro(null);
      try {
        const id = crypto.randomUUID();
        const bucket = criarClienteBrowser().storage.from('statements');

        let imagemAtualPath: string | null = null;
        if (atual?.blob) {
          const caminho = `${repId}/extra-${id}-atual.jpg`;
          const { error } = await bucket.upload(caminho, atual.blob, { contentType: 'image/jpeg', upsert: true });
          if (!error) imagemAtualPath = caminho;
        }

        let imagemAnteriorPath: string | null = null;
        if (precisaAnterior && anterior?.blob) {
          const caminho = `${repId}/extra-${id}-anterior.jpg`;
          const { error } = await bucket.upload(caminho, anterior.blob, { contentType: 'image/jpeg', upsert: true });
          if (!error) imagemAnteriorPath = caminho;
        }

        await lancarTurnoExtraAction({
          id,
          data,
          turno,
          modeloId: usaModeloDeFora ? null : modeloId || null,
          nomeLivre: usaModeloDeFora ? nomeLivre.trim() : null,
          atual: atual!.linhas,
          anterior: precisaAnterior ? anterior!.linhas : null,
          imagemAtualPath,
          ocrAtualRaw: atual?.ocrRaw ?? null,
          imagemAnteriorPath,
          ocrAnteriorRaw: anterior?.ocrRaw ?? null,
        });

        setAnterior(null);
        setAtual(null);
        setNomeLivre('');
        setSucesso(true);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não deu para gravar.');
      }
    });
  }

  return (
    <section className="rounded-2xl border border-borda bg-superficie p-6">
      <h2 className="text-lg font-medium">Turno Extra</h2>
      <p className="mt-1 text-sm text-texto-fraco">
        Pra modelos fora do turno normal — sem clock-in, é só reportar o que foi feito.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-xs text-texto-fraco">
          Dia
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="rounded-lg border border-borda bg-fundo px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-texto-fraco">
          Turno
          <select
            value={turno}
            onChange={(e) => setTurno(e.target.value as Turno)}
            className="rounded-lg border border-borda bg-fundo px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          >
            {TURNOS.map((t) => (
              <option key={t} value={t}>
                {rotuloTurno(t)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4">
        <p className="text-xs text-texto-fraco">Modelo</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          {!usaModeloDeFora ? (
            <select
              value={modeloId}
              onChange={(e) => setModeloId(e.target.value)}
              className="rounded-lg border border-borda bg-fundo px-2.5 py-1.5 text-sm outline-none focus:border-accent"
            >
              {modelosExtras.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={nomeLivre}
              onChange={(e) => setNomeLivre(e.target.value)}
              placeholder="Nome da modelo"
              className="rounded-lg border border-borda bg-fundo px-2.5 py-1.5 text-sm outline-none focus:border-accent"
            />
          )}
          <label className="flex items-center gap-1.5 text-xs text-texto-fraco">
            <input
              type="checkbox"
              checked={usaModeloDeFora}
              onChange={(e) => setUsaModeloDeFora(e.target.checked)}
              className="size-3.5 accent-[var(--color-accent)]"
            />
            é uma modelo de fora (não é do time)
          </label>
        </div>
      </div>

      {precisaAnterior && (
        <div className="mt-4">
          <p className="text-xs font-medium text-texto-fraco">Print de antes deste turno</p>
          <div className="mt-1">
            <CapturaPrint idPrefix="turno-extra-anterior" onChange={setAnterior} />
          </div>
        </div>
      )}

      <div className="mt-4">
        <p className="text-xs font-medium text-texto-fraco">Print de agora</p>
        <div className="mt-1">
          <CapturaPrint idPrefix="turno-extra-atual" onChange={setAtual} />
        </div>
      </div>

      {atualPronto && anteriorPronto && (
        <p className="mt-3 text-sm text-texto-fraco">
          Neste turno:{' '}
          <span className="font-medium text-texto">
            {dinheiro(totalDasLinhas(atual!.linhas) - (precisaAnterior ? totalDasLinhas(anterior!.linhas) : 0))}
          </span>
        </p>
      )}

      {erro && <p className="mt-3 text-sm text-red-400">{erro}</p>}
      {sucesso && <p className="mt-3 text-sm text-accent">Turno extra lançado.</p>}

      <button
        type="button"
        disabled={!podeEnviar}
        onClick={enviar}
        className="mt-4 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-fundo transition hover:bg-accent-forte disabled:opacity-40"
      >
        {pendente ? 'Enviando…' : 'Lançar turno extra'}
      </button>
    </section>
  );
}
```

- [ ] **Step 2: `npx tsc --noEmit`**

Expected clean (this file has no other consumers yet — wired in Task 12).

- [ ] **Step 3: Commit**

```bash
git add app/\(app\)/turno/turno-extra.tsx
git commit -m "Adiciona formulário da aba Turno Extra"
```

---

### Task 11: `app/(app)/admin/models/` — rename `independente`→`extra`, drop `externa`

**Files:**
- Modify: `app/(app)/admin/models/actions.ts` (whole file)
- Modify: `app/(app)/admin/models/linha-modelo.tsx` (whole file)

**Interfaces:**
- Produces: `criarModelo(nome, bloco, extra)`, `definirExtra(id, extra)` (both renamed, `externa` param/action gone).

- [ ] **Step 1: `actions.ts`** — rename `independente`→`extra` throughout, delete `definirExterna`

```ts
export async function criarModelo(nome: string, bloco: Bloco, extra: boolean) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  const { error } = await supabase.from('models').insert({ nome, bloco, extra });
  if (error) throw new Error(error.message);

  revalidar();
}

/** Sem cadeia de desconto confiável (ex.: Kaylin) — nunca aparece no clock-in
 * normal, só é reportada pela aba "Turno Extra" (ver lib/turnosExtraDb.ts). */
export async function definirExtra(id: string, extra: boolean) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  const { error } = await supabase.from('models').update({ extra }).eq('id', id);
  if (error) throw new Error(error.message);

  revalidar();
}
```
Delete `definirExterna` entirely. Keep `renomearModelo`, `definirAtivaModelo`, `definirMetaMensal`, `apagarModelo` unchanged.

- [ ] **Step 2: `linha-modelo.tsx`** — rename badge/button, drop "externa" badge/button/checkbox

Replace the `model.independente`/`model.externa` badges (lines ~50-59) with just:
```tsx
            {model.extra && (
              <span className="ml-2 rounded-md bg-accent-fraco px-1.5 py-0.5 text-xs text-accent">
                extra
              </span>
            )}
```
Replace the two toggle buttons (`definirIndependente`/`definirExterna`, lines ~119-134) with one:
```tsx
              <button
                type="button"
                disabled={pendente}
                onClick={() => rodar(() => definirExtra(model.id, !model.extra))}
                className="text-xs text-texto-fraco hover:text-texto disabled:opacity-50"
              >
                {model.extra ? 'tirar extra' : 'marcar extra'}
              </button>
```
Update the import line: `import { apagarModelo, criarModelo, definirAtivaModelo, definirExtra, definirMetaMensal, renomearModelo } from './actions';`.

In `FormularioModelo`: replace the two `useState`s (`independente`/`externa`) with one `extra`, replace the two checkboxes (lines ~195-213) with one:
```tsx
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={extra}
            onChange={(e) => setExtra(e.target.checked)}
            className="size-3.5 accent-[var(--color-accent)]"
          />
          extra (ex.: Kaylin — sem cadeia de desconto confiável, só via aba "Turno Extra")
        </label>
```
And `criarModelo(nome.trim(), bloco, extra)` in the `criar()` function, resetting `setExtra(false)` after.

- [ ] **Step 3: `npx tsc --noEmit`**

Expected clean on these two files.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/admin/models/actions.ts" "app/(app)/admin/models/linha-modelo.tsx"
git commit -m "admin/models: renomeia toggle independente para extra, remove externa"
```

---

### Task 12: Filter `extra` models out of the normal clock-in/schedule pickers; wire the Turno Extra tab into `/turno`

**Files:**
- Modify: `app/(app)/turno/page.tsx` (whole file — significant edits)
- Modify: `app/(app)/page.tsx:99` (roster query)
- Modify: `app/(app)/schedule/page.tsx:131` (roster query)
- Modify: `app/(app)/admin/turnos/page.tsx:46` (models query)
- Modify: `lib/metaDb.ts` (roster fallback query, inside `buscarMetasDoRep` — already touched in Task 5, revisit)
- Modify: `app/(app)/turno/painel.tsx:14,32,85` (drop `independente` from the `modelos` prop shape — it's dead now that extra models never appear here)
- Modify: `app/(app)/turno/modal-report.tsx:14,116` (same — drop `independente`)
- Modify: `app/(app)/turno/report-modelo.tsx` (whole file — drop the `independente`/`precisaAnteriorManual` dual-print logic entirely, it's replaced by `turno-extra.tsx`)

**Interfaces:**
- Consumes: `TurnoExtra` component from Task 10 (`export function TurnoExtra(...)`).
- Produces: `/turno?aba=extra` renders the new tab; `models.extra = true` never appears as a pickable option anywhere in the normal flow.

- [ ] **Step 1: Filter queries** — add `.eq('extra', false)` (or drop-then-refetch-extras-separately, see below) to the four plain roster queries:

`app/(app)/page.tsx:99`:
```ts
    supabase.from('models').select('nome, bloco').eq('ativa', true).eq('extra', false).order('nome'),
```
`app/(app)/schedule/page.tsx:131`: same pattern, add `.eq('extra', false)`.
`app/(app)/admin/turnos/page.tsx:46`: same pattern, add `.eq('extra', false)`.
`lib/metaDb.ts`'s `buscarMetasDoRep()` roster query (the `db.from('models').select('*').eq('ativa', true)` line, ~126): add `.eq('extra', false)`.

- [ ] **Step 2: `app/(app)/turno/page.tsx`** — split into two tabs, drop `independente` from the query, fetch `modelosExtras` separately

Replace the `CAMPOS_TURNO`/`emAberto` select strings' `models(nome, independente)` with `models(nome)` (both occurrences, lines 46 and 72). Update `TurnoDoDia['shift_logs'][number]['shift_log_models'][number]['models']` type (line 32) to drop `independente`.

Change the `models` query (line 101) to filter `.eq('extra', false)`, and add a second query for the extra roster:
```ts
  const [{ data: models }, { data: modelosExtras }] = await Promise.all([
    supabase.from('models').select('*').eq('ativa', true).eq('extra', false).order('nome'),
    supabase.from('models').select('*').eq('ativa', true).eq('extra', true).order('nome'),
  ]);
```

Add `aba` to the searchParams type and destructure it: `const { turno: turnoEscolhido, mes: mesParam, aba = 'meus' } = await searchParams;` (update the `searchParams` type at the top of the function signature too: `Promise<{ turno?: string; mes?: string; aba?: string }>`).

Add tab links right after the `<h1>` block (same visual pattern as `/schedule`'s tabs), and gate the existing `<Painel>` + `Histórico de turnos` `<section>` behind `aba === 'meus'`, rendering `<TurnoExtra repId={rep.id} modelosExtras={(modelosExtras ?? []) as Model[]} />` plus a "Turnos extra" history section when `aba === 'extra'`:

```tsx
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
```

For the "Turnos extra" history section (rendered when `aba === 'extra'`, below `<TurnoExtra>`), fetch via the new lib function and render a simple table:
```tsx
      {aba === 'extra' && (
        <>
          <TurnoExtra repId={rep.id} modelosExtras={(modelosExtras ?? []) as Model[]} />
          <TurnosExtraHistorico repId={rep.id} cargo={rep.cargo} mes={mes} />
        </>
      )}
```
Add the `TurnosExtraHistorico` async component in the same file:
```tsx
async function TurnosExtraHistorico({ repId, cargo, mes }: { repId: string; cargo: Cargo; mes: string }) {
  const { inicio, fim } = limitesDoMes(mes);
  const linhas = await buscarTurnosExtraDoRep(criarClienteAdmin(), repId, cargo, inicio, fim);

  if (linhas.length === 0) {
    return <p className="text-sm text-texto-fraco">Nenhum turno extra lançado neste mês.</p>;
  }

  return (
    <section className="rounded-2xl border border-borda bg-superficie p-6">
      <h2 className="text-lg font-medium">Turnos extra do mês</h2>
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
    </section>
  );
}
```
Add imports: `import { buscarTurnosExtraDoRep } from '@/lib/turnosExtraDb'; import { TurnoExtra } from './turno-extra'; import type { Cargo } from '@/lib/tipos';` (the `mes`/`limitesDoMes` variables already exist in the outer function scope — reuse, don't refetch).

- [ ] **Step 3: `app/(app)/turno/painel.tsx`, `modal-report.tsx`, `report-modelo.tsx`** — drop `independente`

`painel.tsx`: `Props.log.modelos` loses `independente: boolean` (line 14); the `<ModalReport modelos={log.modelos} .../>` call (line 217) needs no other change since it just forwards the array.

`modal-report.tsx`: `Props.modelos` loses `independente: boolean` (line 14); the `<ReportModelo independente={modelo.independente} .../>` prop (line 116) — delete that prop entirely.

`report-modelo.tsx`: this file's whole "turno independente dual-print" branch is dead now (`independente` prop, `precisaAnteriorManual`, the second `CapturaPrint`, `statementAnterior`/`Anterior` import, `anteriorManual` in `ResultadoModelo`). Rewrite it back to the single-print version:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { baseComissao, deltaTurno, linhasQueCairam, totalDasLinhas, type LinhasNet } from '@/lib/statement';
import type { Anterior } from '@/lib/statementDb';
import { statementAnterior } from './actions';
import { CapturaPrint, type ResultadoPrint } from './captura-print';

const dinheiro = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });

const ROTULO: Record<string, string> = {
  assinaturas: 'Assinaturas',
  gorjetas: 'Gorjetas',
  publicacoes: 'Publicações',
  mensagens: 'Mensagens',
  indicacoes: 'Indicações',
};

export type ResultadoModelo = {
  linhas: LinhasNet;
  netTotal: number;
  blob: Blob | null;
  ocrRaw: unknown;
  corrigidoManualmente: boolean;
  refundConfirmado: boolean;
  lendo: boolean;
  pronto: boolean;
};

export function ReportModelo({
  shiftId,
  modeloId,
  modeloNome,
  onChange,
}: {
  shiftId: string;
  modeloId: string;
  modeloNome: string;
  onChange: (resultado: ResultadoModelo) => void;
}) {
  const [anteriorAuto, setAnteriorAuto] = useState<Anterior | null>(null);
  const [atual, setAtual] = useState<ResultadoPrint | null>(null);
  const [refundConfirmado, setRefundConfirmado] = useState(false);

  useEffect(() => {
    statementAnterior(shiftId, modeloId)
      .then(setAnteriorAuto)
      .catch(() => setAnteriorAuto({ tipo: 'pendente' }));
  }, [shiftId, modeloId]);

  const base: LinhasNet | null = anteriorAuto?.tipo === 'ok' ? anteriorAuto.linhas : null;
  const podeCalcular = anteriorAuto?.tipo === 'ok' || anteriorAuto?.tipo === 'primeiro';

  const linhasAtuais = atual?.linhas ?? { assinaturas: 0, gorjetas: 0, publicacoes: 0, mensagens: 0, indicacoes: 0 };
  const caiu = linhasQueCairam(linhasAtuais, base);
  const doTurno = deltaTurno(linhasAtuais, base);
  const preenchido = atual?.preenchido ?? false;
  const somaBateAtual = atual?.somaBate ?? false;
  const pronto = preenchido && somaBateAtual && (caiu.length === 0 || refundConfirmado);

  useEffect(() => {
    onChange({
      linhas: linhasAtuais,
      netTotal: atual?.totalImpresso || totalDasLinhas(linhasAtuais),
      blob: atual?.blob ?? null,
      ocrRaw: atual?.ocrRaw ?? null,
      corrigidoManualmente: atual?.editou ?? false,
      refundConfirmado,
      lendo: atual?.lendo ?? false,
      pronto,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atual, refundConfirmado, pronto]);

  return (
    <div className="rounded-xl border border-borda p-4">
      <p className="text-sm font-medium text-accent">{modeloNome}</p>

      <div className="mt-3">
        <CapturaPrint idPrefix={`${modeloId}-atual`} onChange={setAtual} />
      </div>

      {caiu.length > 0 && (
        <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-200">
          <p>
            Conferir se houve refund — {caiu.map((l) => ROTULO[l]).join(', ')} veio menor que no turno anterior.
          </p>
          <button
            type="button"
            onClick={() => setRefundConfirmado(true)}
            disabled={refundConfirmado}
            className="mt-1.5 rounded-lg border border-amber-400/50 px-2 py-1 text-xs font-medium text-amber-100 hover:bg-amber-500/20 disabled:opacity-60"
          >
            {refundConfirmado ? 'Refund confirmado ✓' : 'Houve'}
          </button>
        </div>
      )}

      {anteriorAuto?.tipo === 'pendente' && (
        <p className="mt-2 rounded-lg border border-borda bg-fundo px-2 py-1.5 text-xs text-texto-fraco">
          O turno anterior desta modelo ainda não enviou o print. O valor se ajusta sozinho
          quando ele chegar.
        </p>
      )}

      {preenchido && podeCalcular && (
        <div className="mt-2 rounded-lg border border-borda bg-fundo px-2 py-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-texto-fraco">Neste turno</span>
            <span className="font-medium">{dinheiro(totalDasLinhas(doTurno))}</span>
          </div>
          <div className="mt-0.5 flex justify-between">
            <span className="text-texto-fraco">Base de comissão</span>
            <span className="font-medium text-accent">{dinheiro(baseComissao(doTurno))}</span>
          </div>
        </div>
      )}
    </div>
  );
}
```
And in `modal-report.tsx`, drop the `turno={turno}` / `independente={...}` props on `<ReportModelo>` (line 110-120) — keep `shiftId`, `modeloId`, `modeloNome`, `onChange`. The `turno: Turno` prop on `ModalReport`'s own `Props` (line 13) and the `finalizarTurno` call's `anteriorManual: r.anteriorManual` reference: drop `anteriorManual` from the `reports.push()` object (line 76) since `ReportModeloDados`/`ReportModelo` type in `actions.ts` will lose that field too (Task 13).

- [ ] **Step 4: `npx tsc --noEmit`**

Expect remaining errors only in `app/(app)/turno/actions.ts` (Task 13) and `app/(app)/admin/turnos/linha-turno.tsx` (Task 14).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/turno" "app/(app)/page.tsx" "app/(app)/schedule/page.tsx" "app/(app)/admin/turnos/page.tsx" lib/metaDb.ts
git commit -m "turno: aba Turno Extra, remove Kaylin do clock-in normal, volta ReportModelo ao fluxo de 1 print"
```

---

### Task 13: `app/(app)/turno/actions.ts` — drop `anteriorManual` from `ReportModelo`/`finalizarTurno`

**Files:**
- Modify: `app/(app)/turno/actions.ts:123-133,155-172`

**Interfaces:**
- Produces: `ReportModelo` type loses `anteriorManual`; `finalizarTurno`'s statements upsert loses `anterior_manual`.

- [ ] **Step 1: Edit**

`ReportModelo` type (line 123-133): remove the `anteriorManual: LinhasNet | null;` field and its doc comment.

`finalizarTurno()`'s upsert (line 155-172): remove `anterior_manual: r.anteriorManual,` from the mapped object.

- [ ] **Step 2: `npx tsc --noEmit`** — expect clean across the whole `app/(app)/turno/` directory now.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/turno/actions.ts"
git commit -m "turno/actions: remove anteriorManual de ReportModelo/finalizarTurno"
```

---

### Task 14: `app/(app)/admin/turnos/linha-turno.tsx` — drop dual-print, add Turno Extra correction list

**Files:**
- Modify: `app/(app)/admin/turnos/linha-turno.tsx` (whole file — significant edits)
- Modify: `app/(app)/admin/turnos/actions.ts:126-193,223-258` (`simularPonto`'s model picker doesn't need changes — it already just takes `modeloIds`; `simularStatement` drops `anteriorManual`)
- Modify: `app/(app)/admin/turnos/page.tsx` (add the Turno Extra correction section)

**Interfaces:**
- Consumes: `buscarTurnosExtraAdmin`, `apagarTurnoExtra` from `lib/turnosExtraDb.ts`.
- Produces: admin gets a "Turnos extra" list (data, turno, rep, modelo, vendido, comissão, apagar) at the bottom of `/admin/turnos`.

- [ ] **Step 1: `app/(app)/admin/turnos/actions.ts`** — `simularStatement` drops `anteriorManual`

```ts
export async function simularStatement(dados: {
  shiftLogId: string;
  modeloId: string;
  assinaturas: number;
  gorjetas: number;
  publicacoes: number;
  mensagens: number;
  indicacoes: number;
}) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  const total =
    dados.assinaturas + dados.gorjetas + dados.publicacoes + dados.mensagens + dados.indicacoes;

  const { error } = await supabase.from('statements').upsert(
    {
      shift_log_id: dados.shiftLogId,
      model_id: dados.modeloId,
      net_total: total,
      net_assinaturas: dados.assinaturas,
      net_gorjetas: dados.gorjetas,
      net_publicacoes: dados.publicacoes,
      net_mensagens: dados.mensagens,
      net_indicacoes: dados.indicacoes,
      corrigido_manualmente: true,
    },
    { onConflict: 'shift_log_id,model_id' },
  );
  if (error) throw new Error(error.message);

  revalidar();
}
```
Drop the now-unused `import type { LinhasNet } from '@/lib/statement';` at the top if nothing else in the file needs it (check first — `janelaDoTurno` etc. don't need it).

Append the delete action for Turno Extra entries:
```ts
export async function apagarTurnoExtraAdmin(id: string) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  const { apagarTurnoExtra } = await import('@/lib/turnosExtraDb');
  await apagarTurnoExtra(supabase, id);

  revalidar();
}
```
(Using a dynamic import here only if it avoids a circular import concern — check first whether `lib/turnosExtraDb.ts` importing from `lib/comissaoDb.ts` etc. creates any cycle with this actions file; if not, use a normal top-level `import { apagarTurnoExtra } from '@/lib/turnosExtraDb';` instead — simpler, prefer that unless `tsc`/build actually complains.)

- [ ] **Step 2: `linha-turno.tsx`** — remove `precisaAnteriorManual`, `LinhasComOcr`'s two-block usage collapses to one

In `LinhaTurno`, delete the `precisaAnteriorManual` prop computation (line 270-272) and the `anteriorManual` arg passed to `simularStatement` (line 273-276):
```tsx
              onSalvar={(vals) =>
                rodar(() => simularStatement({ shiftLogId: log.id, modeloId: modeloDoForm, ...vals }))
              }
```
And drop the `precisaAnteriorManual` prop entirely from the `<FormStatement>` call.

In `FormStatement` (bottom of file): remove the `precisaAnteriorManual` prop, the anterior-print block (lines 492-500), and simplify `onSalvar`'s signature back to just `vals` (no `anteriorManual` second arg):
```tsx
function FormStatement({
  modeloNome,
  atual,
  pendente,
  onSalvar,
  onCancelar,
}: {
  modeloNome: string;
  atual: LinhaShift['shift_logs'][number]['statements'][number] | null;
  pendente: boolean;
  onSalvar: (vals: {
    assinaturas: number;
    gorjetas: number;
    publicacoes: number;
    mensagens: number;
    indicacoes: number;
  }) => void;
  onCancelar: () => void;
}) {
  const [vals, setVals] = useState<LinhasNet>({
    assinaturas: atual?.net_assinaturas ?? 0,
    gorjetas: atual?.net_gorjetas ?? 0,
    publicacoes: atual?.net_publicacoes ?? 0,
    mensagens: atual?.net_mensagens ?? 0,
    indicacoes: atual?.net_indicacoes ?? 0,
  });

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-accent">{modeloNome}</span>

      <LinhasComOcr vals={vals} onVals={setVals} />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-lg border border-borda px-3 py-1.5 text-xs text-texto-fraco hover:text-texto"
        >
          cancelar
        </button>
        <button
          type="button"
          disabled={pendente}
          onClick={() => onSalvar(vals)}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-fundo hover:bg-accent-forte disabled:opacity-50"
        >
          gravar statement
        </button>
      </div>
    </div>
  );
}
```
The `VAZIO` constant (line 371) and `LinhasComOcr`'s `titulo` prop can stay as-is (still used elsewhere? — `LinhasComOcr` is now only called once, without a `titulo` — the prop stays optional, no functional change needed, just stops being passed). Delete `VAZIO` only if nothing else in the file uses it after this edit — check before removing (it was only used by `FormStatement`'s `anteriorVals` state, which is gone now, so it's safe to delete).

- [ ] **Step 3: `app/(app)/admin/turnos/page.tsx`** — add the Turno Extra section

At the bottom of the returned JSX, after the existing shifts table, add:
```tsx
      <TurnosExtraAdmin inicio={inicio} fim={fim} podeEditar={podeEditar} />
```
And the component (new, same file or a new `turnos-extra-admin.tsx` — given it needs both server data fetch and a client "apagar" button, split it like `LinhaTurno` does: server component fetches, passes to a small client row):
```tsx
async function TurnosExtraAdmin({ inicio, fim, podeEditar }: { inicio: string; fim: string; podeEditar: boolean }) {
  const linhas = await buscarTurnosExtraAdmin(supabaseAdmin, inicio, fim);
  if (linhas.length === 0) return null;

  return (
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
  );
}
```
This needs a `supabaseAdmin` client — use `criarClienteAdmin()` (already imported pattern elsewhere in the codebase) rather than the RLS-scoped one, since the admin needs to see everyone's entries regardless of who's logged in. Add the import: `import { criarClienteAdmin } from '@/lib/supabase/server';` and call `criarClienteAdmin()` inline instead of a `supabaseAdmin` variable, or define it once at the top of the function — match whatever this file's existing convention is (check `page.tsx`'s current imports first, it already uses `criarClienteServidor` — add `criarClienteAdmin` alongside).

Create `app/(app)/admin/turnos/linha-turno-extra.tsx` for the client row (mirrors the "apagar" button pattern already used in `linha-turno.tsx`):
```tsx
'use client';

import { useState, useTransition } from 'react';
import type { LinhaTurnoExtra } from '@/lib/turnosExtraDb';
import { diaLegivel } from '@/lib/tempo';
import { rotuloTurno } from '@/lib/tipos';
import { apagarTurnoExtraAdmin } from './actions';

const dinheiro = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });

export function LinhaTurnoExtraAdmin({
  linha,
  podeEditar,
}: {
  linha: LinhaTurnoExtra & { repNome: string };
  podeEditar: boolean;
}) {
  const [pendente, executar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <tr className="border-b border-borda last:border-0">
      <td className="px-4 py-2.5">{diaLegivel(linha.data)}</td>
      <td className="px-3 py-2.5 text-texto-fraco">{rotuloTurno(linha.turno)}</td>
      <td className="px-3 py-2.5">{linha.repNome}</td>
      <td className="px-3 py-2.5 text-accent">{linha.modeloNome}</td>
      <td className="px-3 py-2.5 text-right">{dinheiro(linha.vendido)}</td>
      <td className="px-3 py-2.5 text-right font-medium">{dinheiro(linha.comissao)}</td>
      <td className="whitespace-nowrap px-4 py-2.5 text-right">
        {podeEditar && (
          <button
            type="button"
            disabled={pendente}
            onClick={() => {
              if (confirm('Apagar este turno extra?')) {
                executar(async () => {
                  setErro(null);
                  try {
                    await apagarTurnoExtraAdmin(linha.id);
                  } catch (e) {
                    setErro(e instanceof Error ? e.message : 'Não deu.');
                  }
                });
              }
            }}
            className="text-xs text-red-400 hover:underline disabled:opacity-50"
          >
            apagar
          </button>
        )}
        {erro && <span className="ml-2 text-xs text-red-400">{erro}</span>}
      </td>
    </tr>
  );
}
```
Import it in `page.tsx`: `import { LinhaTurnoExtraAdmin } from './linha-turno-extra';` and `import { buscarTurnosExtraAdmin } from '@/lib/turnosExtraDb';`.

- [ ] **Step 4: `npx tsc --noEmit`** — expect fully clean now across the whole project.

- [ ] **Step 5: `npx vitest run`** — all existing suites (`comissao`, `escala`, `escalaDb`, `invoice`, `meta`, `statement`, `turno`) plus the new `comissaoTurnoExtra` tests should pass.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/admin/turnos"
git commit -m "admin/turnos: remove fluxo duplo de print, adiciona lista de correção de turnos extra"
```

---

### Task 15: `/admin/turnos` — separate "precisam de atenção" vs "concluídos"

**Files:**
- Create: `lib/turnoAberto.ts`
- Test: `lib/turnoAberto.test.ts`
- Modify: `app/(app)/admin/turnos/page.tsx` (classify shifts, split rendering)
- Create: `app/(app)/admin/turnos/lista-turnos.tsx` (client wrapper with the collapse `useState`)

**Interfaces:**
- Produces: `export function precisaAtencao(shift: { data: string; shift_logs: { clock_out_at: string | null }[] }, hoje: string): boolean`.
- Consumes (in `page.tsx`): `LinhaShift` (already defined in `app/(app)/admin/turnos/tipos.ts`), `dataBRT()` from `lib/tempo.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/turnoAberto.test.ts
import { describe, expect, test } from 'vitest';
import { precisaAtencao } from './turnoAberto';

describe('precisaAtencao', () => {
  test('turno iniciado e não fechado precisa de atenção', () => {
    expect(precisaAtencao({ data: '2026-08-10', shift_logs: [{ clock_out_at: null }] }, '2026-08-18')).toBe(true);
  });

  test('turno fechado normalmente não precisa de atenção', () => {
    expect(
      precisaAtencao(
        { data: '2026-08-10', shift_logs: [{ clock_out_at: '2026-08-10T13:00:00Z' }] },
        '2026-08-18',
      ),
    ).toBe(false);
  });

  test('turno sem log e com data já passada precisa de atenção (nunca foi aberto)', () => {
    expect(precisaAtencao({ data: '2026-08-10', shift_logs: [] }, '2026-08-18')).toBe(true);
  });

  test('turno sem log ainda no futuro/hoje não precisa de atenção (só ainda não chegou a hora)', () => {
    expect(precisaAtencao({ data: '2026-08-18', shift_logs: [] }, '2026-08-18')).toBe(false);
    expect(precisaAtencao({ data: '2026-08-20', shift_logs: [] }, '2026-08-18')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/turnoAberto.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/turnoAberto.ts
//
// Classifica um turno como "precisa de atenção" pra /admin/turnos separar o
// que está quebrado (não fechou, ou nunca abriu) do resto — ver
// docs/superpowers/specs/2026-08-18-turno-extra-design.md, seção 9.

export function precisaAtencao(
  shift: { data: string; shift_logs: { clock_out_at: string | null }[] },
  hoje: string,
): boolean {
  const log = shift.shift_logs[0];
  if (log) return !log.clock_out_at;
  return shift.data < hoje;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/turnoAberto.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into `app/(app)/admin/turnos/page.tsx`**

Import `precisaAtencao` and `dataBRT`. After building `shifts` (the existing `(shiftsData ?? []) as unknown as LinhaShift[]` line), split:
```ts
  const hoje = dataBRT();
  const emAtencao = shifts.filter((s) => precisaAtencao(s, hoje));
  const concluidos = shifts.filter((s) => !precisaAtencao(s, hoje));
```
Replace the existing single `<table>` block (the one rendering `shifts.map(...)`) with the new `<ListaTurnos>` client wrapper, passing both groups plus everything `LinhaTurno` already needs (`linhasPorShift`, `models`, `podeEditar`):
```tsx
      <ListaTurnos
        emAtencao={emAtencao}
        concluidos={concluidos}
        linhasPorShift={linhasPorShift}
        models={models}
        podeEditar={podeEditar}
      />
```
Note `linhasPorShift` is a `Map`, which isn't directly serializable as a prop from a Server to a Client Component the normal way in Next.js — check whether `LinhaTurno` is already a Client Component receiving `linha={linhasPorShift.get(s.id) ?? null}` per-row (it is, per the existing code) — so `ListaTurnos` should do the same per-row lookup itself (accept the `Map` prop only if this project already passes Maps across the boundary elsewhere; if `tsc`/runtime complains, convert to `Object.fromEntries(linhasPorShift)` before passing, and rebuild the per-row lookup inside `ListaTurnos`). Verify by running `npm run build` (Task 16) — Maps generally do NOT serialize through the RSC boundary in this framework version, so default to passing a plain object and confirm during Step 7 below.

- [ ] **Step 6: Write `lista-turnos.tsx`**

```tsx
'use client';

import { useState } from 'react';
import type { LinhaInvoice } from '@/lib/invoice';
import type { Model } from '@/lib/tipos';
import { LinhaTurno } from './linha-turno';
import type { LinhaShift } from './tipos';

export function ListaTurnos({
  emAtencao,
  concluidos,
  linhasPorShift,
  models,
  podeEditar,
}: {
  emAtencao: LinhaShift[];
  concluidos: LinhaShift[];
  linhasPorShift: Record<string, LinhaInvoice>;
  models: Model[];
  podeEditar: boolean;
}) {
  const [mostrarConcluidos, setMostrarConcluidos] = useState(false);

  return (
    <div className="space-y-4">
      {emAtencao.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-amber-300">
            Precisam de atenção ({emAtencao.length})
          </p>
          <Tabela linhas={emAtencao} linhasPorShift={linhasPorShift} models={models} podeEditar={podeEditar} />
        </div>
      )}

      {concluidos.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setMostrarConcluidos((v) => !v)}
            className="mb-2 flex items-center gap-1.5 text-sm text-texto-fraco hover:text-texto"
          >
            <span className={`transition-transform ${mostrarConcluidos ? 'rotate-90' : ''}`}>▸</span>
            Turnos concluídos ({concluidos.length})
          </button>
          {mostrarConcluidos && (
            <Tabela linhas={concluidos} linhasPorShift={linhasPorShift} models={models} podeEditar={podeEditar} />
          )}
        </div>
      )}

      {emAtencao.length === 0 && concluidos.length === 0 && (
        <div className="rounded-2xl border border-borda bg-superficie p-10 text-center">
          <p className="text-texto-fraco">Nenhum turno neste período.</p>
        </div>
      )}
    </div>
  );
}

function Tabela({
  linhas,
  linhasPorShift,
  models,
  podeEditar,
}: {
  linhas: LinhaShift[];
  linhasPorShift: Record<string, LinhaInvoice>;
  models: Model[];
  podeEditar: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-borda bg-superficie">
      <table className="w-full min-w-[72rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-borda text-left text-texto-fraco">
            <th className="px-4 py-3 font-medium">Dia</th>
            <th className="px-3 py-3 font-medium">Turno</th>
            <th className="px-3 py-3 font-medium">Bloco</th>
            <th className="px-3 py-3 font-medium">Função</th>
            <th className="px-3 py-3 font-medium">Rep</th>
            <th className="px-3 py-3 font-medium">Ponto</th>
            <th className="px-3 py-3 font-medium">Statements</th>
            <th className="px-3 py-3 text-right font-medium">Comissão</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {linhas.map((s) => (
            <LinhaTurno key={s.id} shift={s} linha={linhasPorShift[s.id] ?? null} models={models} podeEditar={podeEditar} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
```
Adjust `page.tsx` to build `linhasPorShift` as a plain object instead of a `Map` (or convert right before passing): `const linhasPorShift = Object.fromEntries(linhasPorShiftMap);` — rename the existing `Map`-building variable to `linhasPorShiftMap` and keep its internal `.set(...)` calls unchanged, only converting at the boundary.

- [ ] **Step 7: `npm run build`**

Run: `npm run build`
Expected: succeeds, no RSC serialization errors, no type errors.

- [ ] **Step 8: Commit**

```bash
git add lib/turnoAberto.ts lib/turnoAberto.test.ts "app/(app)/admin/turnos/page.tsx" "app/(app)/admin/turnos/lista-turnos.tsx"
git commit -m "admin/turnos: separa turnos que precisam de atenção dos concluídos (colapsável)"
```

---

### Task 16: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: zero errors (warnings from pre-existing code are fine, don't fix unrelated files).

- [ ] **Step 3: Full test suite**

Run: `npx vitest run`
Expected: all suites pass, including the two new ones (`comissao.test.ts`'s new `describe`, `turnoAberto.test.ts`).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Browser verification**

Use the Browser pane against the Vercel preview (or local `npm run dev` via `preview_start`) to confirm, logged in as admin (Pedro):
- `/turno?aba=extra` renders the form; T6T1 shows only one `CapturaPrint`, T2T3/T4T5 show two; the roster dropdown lists Kaylin; the free-text checkbox reveals a text input.
- `/turno?aba=meus`: Kaylin is NOT in the "modelo trabalhada" checkboxes for a normal clock-in.
- `/admin/models`: Kaylin's badge reads "extra" (not "independente"), and there's no "externa" badge/button anywhere.
- `/admin/turnos`: shifts split into "Precisam de atenção" (always shown) and a collapsed "Turnos concluídos (N)" that expands on click; the new Turno Extra correction table appears at the bottom once at least one entry exists (create one via the `/turno?aba=extra` flow first to confirm end-to-end).
- `/primaris`: Kaylin's page-level numbers reflect a Turno Extra sale after lançando one (Step above).

- [ ] **Step 6: Commit** (only if Step 5 required fixes)

```bash
git add -A
git commit -m "Ajustes pós-verificação visual do Turno Extra"
```

---

### Task 17: Deploy

**Files:** none

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Poll the Vercel deployment**

Use `mcp__2f791c23-2815-41e1-8d6b-3ca5679469ed__list_deployments` (since the last commit's timestamp) then `get_deployment` until `state: "READY"`.

- [ ] **Step 3: Confirm no runtime errors**

Use `mcp__2f791c23-2815-41e1-8d6b-3ca5679469ed__get_runtime_errors` for the fresh deployment — expect none related to this change (pre-existing unrelated errors, if any, aren't this task's concern).

- [ ] **Step 4: Report the live URL to the user**

`https://vortex-seven-neon.vercel.app` — tell the user it's live and where to click (`/turno` → "Turno Extra" tab; `/admin/turnos` for the new attention/collapse split).
