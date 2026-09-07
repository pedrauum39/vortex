# Log de alterações da escala Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Em `/admin/turnos`, registrar cada troca de rep feita na grade numa tabela de auditoria e mostrar, abaixo da grade, a lista de mudanças da semana aberta — com um botão "Copiar" que leva o texto todo pro clipboard.

**Architecture:** Nova tabela append-only `escala_alteracoes` (migração + apply via Supabase MCP). A server action `salvarGrade` já sabe o antes/depois de cada slot em `aplicarSlot` — passa a inserir uma linha de log ali. A página carrega as linhas da semana junto com o resto e monta `EntradaLog[]`; um client component renderiza os grupos e o botão de copiar. Toda a formatação/agrupamento vive num módulo puro `lib/logEscala.ts` com testes.

**Tech Stack:** Next.js 16 App Router (server components + server actions), Supabase (`@supabase/supabase-js`, RLS), Vitest, Tailwind v4. Clipboard API nativa — sem libs novas.

## Global Constraints

- **Sem dependência nova.**
- **pt-BR** em todo texto de UI (nunca pt-PT).
- Migração: criar o arquivo em `supabase/migrations/0025_escala_alteracoes.sql` **e** aplicar no projeto Supabase `vbyvpjtmayavtvfhpgax` via `mcp__75bf43be-48a3-4dd8-b1f7-9f53cc565bb8__apply_migration` (name: `escala_alteracoes`). Convenção do projeto: `revoke ... from anon`, policies `to authenticated`, helpers SQL `is_admin()` / `pode_ver()` já existem (ver `supabase/migrations/0023_notificacoes.sql`).
- Auditoria é **imutável**: sem policy de update/delete na tabela.
- Escopo: **só trocas de rep na grade** (`salvarGrade` → `aplicarSlot`). Nada de criar/apagar turno, turno extra, ponto ou statement.
- Rótulo de cargo sempre via `ROTULO_CARGO` de `lib/tipos.ts` (`grand_primaris` → "Gran Primaris", etc).
- Testes rodam com `npm test` (vitest). Typecheck: `npm run typecheck`. Lint: `npm run lint`.

---

## Task 1: Migração — tabela `escala_alteracoes`

**Files:**
- Create: `supabase/migrations/0025_escala_alteracoes.sql`

**Interfaces:**
- Consumes: helpers SQL `is_admin()`, `pode_ver()` (já existem, migrações 0013/0014/0016); tabela `reps(id)`.
- Produces: tabela `escala_alteracoes` com colunas `id, data, turno, bloco, funcao, rep_saiu, rep_entrou, alterado_por, criado_em`.

- [ ] **Step 1: Escrever o arquivo de migração**

Create `supabase/migrations/0025_escala_alteracoes.sql`:

```sql
-- Log de auditoria das trocas de rep na grade da escala (/admin/turnos).
-- salvarGrade() → aplicarSlot() grava uma linha aqui toda vez que muda quem
-- ocupa um slot. Append-only: não tem policy de update nem delete de
-- propósito — histórico não se reescreve. rep_saiu nulo = o slot estava
-- vazio; rep_entrou nulo = o slot foi limpo pra "—".

create table escala_alteracoes (
  id           uuid primary key default gen_random_uuid(),
  data         date not null,
  turno        text not null check (turno in ('T2T3', 'T4T5', 'T6T1')),
  bloco        text not null check (bloco in ('I', 'II')),
  funcao       text not null check (funcao in ('regular', 'assist')),
  rep_saiu     uuid references reps(id) on delete set null,
  rep_entrou   uuid references reps(id) on delete set null,
  alterado_por uuid references reps(id) on delete set null,
  criado_em    timestamptz not null default now(),

  -- toda linha é uma mudança real: os dois lados diferentes e pelo menos um
  -- preenchido (aplicarSlot já só grava quando o rep_id do slot muda).
  constraint escala_alteracoes_mudanca_real check (
    rep_saiu is distinct from rep_entrou
    and (rep_saiu is not null or rep_entrou is not null)
  )
);

create index escala_alteracoes_data_idx on escala_alteracoes (data);

alter table escala_alteracoes enable row level security;

-- Quem já enxerga a aba admin enxerga o log (admin/primaris/observador/admin_5c).
create policy escala_alteracoes_select on escala_alteracoes for select to authenticated
  using (is_admin() or pode_ver());

-- Só admin grava. Sem update/delete — auditoria imutável.
create policy escala_alteracoes_insert on escala_alteracoes for insert to authenticated
  with check (is_admin());

revoke all on escala_alteracoes from anon;
```

- [ ] **Step 2: Aplicar a migração no Supabase**

Chamar `mcp__75bf43be-48a3-4dd8-b1f7-9f53cc565bb8__apply_migration` com:
- `project_id`: `vbyvpjtmayavtvfhpgax`
- `name`: `escala_alteracoes`
- `query`: o conteúdo SQL do Step 1

- [ ] **Step 3: Verificar que a tabela e as policies existem**

Chamar `mcp__75bf43be-48a3-4dd8-b1f7-9f53cc565bb8__execute_sql` com:
- `project_id`: `vbyvpjtmayavtvfhpgax`
- `query`:

```sql
select policyname, cmd from pg_policies where tablename = 'escala_alteracoes' order by policyname;
```

Expected: duas linhas — `escala_alteracoes_insert` (INSERT) e `escala_alteracoes_select` (SELECT).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0025_escala_alteracoes.sql
git commit -m "Migracao: tabela escala_alteracoes (log de trocas da grade)"
```

---

## Task 2: Módulo puro `lib/logEscala.ts` (TDD)

**Files:**
- Create: `lib/logEscala.ts`
- Test: `lib/logEscala.test.ts`

**Interfaces:**
- Consumes: `dataBRT(instante: Date): string` de `lib/tempo.ts` (retorna `'YYYY-MM-DD'` em BRT); `rotuloTurno`, `ROTULO_CARGO`, tipos `Turno`/`Bloco`/`Funcao`/`Cargo` de `lib/tipos.ts`.
- Produces:
  - `type EntradaLog = { id: string; criadoEm: string; data: string; turno: Turno; bloco: Bloco; funcao: Funcao; repSaiu: string | null; cargoSaiu: Cargo | null; repEntrou: string | null; cargoEntrou: Cargo | null; modelosDoBloco: string[] }`
  - `type GrupoLog = { diaMudanca: string; itens: EntradaLog[] }`
  - `agruparPorDiaDaMudanca(entradas: EntradaLog[]): GrupoLog[]`
  - `diaMes(data: string): string` — `'2026-09-10'` → `'10/09'`
  - `textoDoLog(grupos: GrupoLog[]): string`

- [ ] **Step 1: Escrever os testes que falham**

Create `lib/logEscala.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { agruparPorDiaDaMudanca, diaMes, textoDoLog, type EntradaLog } from './logEscala';

const base: EntradaLog = {
  id: '1',
  criadoEm: '2026-09-07T12:00:00.000Z',
  data: '2026-09-10',
  turno: 'T2T3',
  bloco: 'I',
  funcao: 'regular',
  repSaiu: 'Carolinne P.',
  cargoSaiu: 'tertius',
  repEntrou: 'Léo Grimaldi',
  cargoEntrou: 'secundus',
  modelosDoBloco: ['Joyce', 'Riley'],
};

describe('agruparPorDiaDaMudanca', () => {
  test('duas mudanças do mesmo dia BRT caem no mesmo grupo', () => {
    const grupos = agruparPorDiaDaMudanca([
      { ...base, id: 'a', criadoEm: '2026-09-07T12:00:00.000Z' },
      { ...base, id: 'b', criadoEm: '2026-09-07T20:00:00.000Z' },
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].diaMudanca).toBe('2026-09-07');
    expect(grupos[0].itens.map((i) => i.id)).toEqual(['a', 'b']);
  });

  test('grupos vêm do mais recente pro mais antigo', () => {
    const grupos = agruparPorDiaDaMudanca([
      { ...base, id: 'velho', criadoEm: '2026-09-05T12:00:00.000Z' },
      { ...base, id: 'novo', criadoEm: '2026-09-07T12:00:00.000Z' },
    ]);
    expect(grupos.map((g) => g.diaMudanca)).toEqual(['2026-09-07', '2026-09-05']);
  });

  test('vira o dia pelo fuso BRT (UTC-3)', () => {
    // 2026-09-08T02:00Z = 2026-09-07 23:00 em São Paulo
    const grupos = agruparPorDiaDaMudanca([{ ...base, criadoEm: '2026-09-08T02:00:00.000Z' }]);
    expect(grupos[0].diaMudanca).toBe('2026-09-07');
  });

  test('lista vazia → nenhum grupo', () => {
    expect(agruparPorDiaDaMudanca([])).toEqual([]);
  });
});

describe('diaMes', () => {
  test('formata DD/MM', () => {
    expect(diaMes('2026-09-10')).toBe('10/09');
  });
});

describe('textoDoLog', () => {
  test('bloco com Sai e Entra', () => {
    const texto = textoDoLog(agruparPorDiaDaMudanca([base]));
    expect(texto).toBe(
      [
        'Mudanças feitas 07/09',
        '',
        'T2/T3 · 10/09 · Joyce + Riley',
        'Sai: Carolinne P. (Tertius)',
        'Entra: Léo Grimaldi (Secundus)',
      ].join('\n'),
    );
  });

  test('item só com Entra (slot estava vazio) e sem modelo do bloco', () => {
    const texto = textoDoLog(
      agruparPorDiaDaMudanca([
        { ...base, repSaiu: null, cargoSaiu: null, modelosDoBloco: [], funcao: 'assist' },
      ]),
    );
    expect(texto).toBe(
      ['Mudanças feitas 07/09', '', 'T2/T3 (Assistant) · 10/09', 'Entra: Léo Grimaldi (Secundus)'].join(
        '\n',
      ),
    );
  });
});
```

- [ ] **Step 2: Rodar os testes e ver falhar**

Run: `npm test -- logEscala`
Expected: FAIL — `Cannot find module './logEscala'`.

- [ ] **Step 3: Implementar `lib/logEscala.ts`**

Create `lib/logEscala.ts`:

```ts
// Formatação e agrupamento do log de trocas da escala (/admin/turnos).
// Puro — sem I/O. A página resolve rep_id → nome/cargo e os modelos do
// bloco antes de chamar aqui.

import { dataBRT } from './tempo';
import { ROTULO_CARGO, rotuloTurno, type Bloco, type Cargo, type Funcao, type Turno } from './tipos';

export type EntradaLog = {
  id: string;
  criadoEm: string; // ISO — instante em que a troca foi salva
  data: string; // 'YYYY-MM-DD' do turno afetado
  turno: Turno;
  bloco: Bloco;
  funcao: Funcao;
  repSaiu: string | null;
  cargoSaiu: Cargo | null;
  repEntrou: string | null;
  cargoEntrou: Cargo | null;
  modelosDoBloco: string[];
};

export type GrupoLog = { diaMudanca: string; itens: EntradaLog[] };

/**
 * Agrupa pela data (em BRT) em que a mudança foi feita. Grupos do mais
 * recente pro mais antigo; dentro do grupo mantém a ordem recebida (a página
 * entrega já ordenado por criado_em desc).
 */
export function agruparPorDiaDaMudanca(entradas: EntradaLog[]): GrupoLog[] {
  const grupos = new Map<string, EntradaLog[]>();
  for (const entrada of entradas) {
    const dia = dataBRT(new Date(entrada.criadoEm));
    const lista = grupos.get(dia) ?? [];
    lista.push(entrada);
    grupos.set(dia, lista);
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([diaMudanca, itens]) => ({ diaMudanca, itens }));
}

/** 'YYYY-MM-DD' → 'DD/MM'. */
export function diaMes(data: string): string {
  const [, mes, dia] = data.split('-');
  return `${dia}/${mes}`;
}

/** Cabeçalho de um item: 'T2/T3 · 10/09 · Joyce + Riley'. */
function tituloDoItem(item: EntradaLog): string {
  const turno = rotuloTurno(item.turno) + (item.funcao === 'assist' ? ' (Assistant)' : '');
  const partes = [turno, diaMes(item.data)];
  if (item.modelosDoBloco.length > 0) partes.push(item.modelosDoBloco.join(' + '));
  return partes.join(' · ');
}

function linhaLado(rotulo: string, nome: string | null, cargo: Cargo | null): string | null {
  if (!nome) return null;
  return cargo ? `${rotulo}: ${nome} (${ROTULO_CARGO[cargo]})` : `${rotulo}: ${nome}`;
}

/** Versão texto puro do bloco inteiro, pro botão "Copiar". */
export function textoDoLog(grupos: GrupoLog[]): string {
  return grupos
    .map((grupo) => {
      const linhas = [`Mudanças feitas ${diaMes(grupo.diaMudanca)}`, ''];
      for (const item of grupo.itens) {
        linhas.push(tituloDoItem(item));
        const sai = linhaLado('Sai', item.repSaiu, item.cargoSaiu);
        const entra = linhaLado('Entra', item.repEntrou, item.cargoEntrou);
        if (sai) linhas.push(sai);
        if (entra) linhas.push(entra);
      }
      return linhas.join('\n');
    })
    .join('\n\n');
}
```

- [ ] **Step 4: Rodar os testes e ver passar**

Run: `npm test -- logEscala`
Expected: PASS — todos os testes verdes.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add lib/logEscala.ts lib/logEscala.test.ts
git commit -m "Log da escala: modulo puro de agrupamento e texto (lib/logEscala)"
```

---

## Task 3: Gravar o log em `salvarGrade` / `aplicarSlot`

**Files:**
- Modify: `app/(app)/admin/turnos/actions.ts:10-13` (`exigirAdmin`), `:72-112` (`aplicarSlot`, `salvarGrade`)

**Interfaces:**
- Consumes: `exigirRep()` de `@/lib/auth` (já retorna o `Rep` logado); tabela `escala_alteracoes` da Task 1.
- Produces: `salvarGrade` passa a inserir uma linha em `escala_alteracoes` por slot que mudou de dono. `exigirAdmin()` passa a retornar `Promise<Rep>`.

- [ ] **Step 1: `exigirAdmin` retorna o rep**

Em `app/(app)/admin/turnos/actions.ts`, trocar:

```ts
async function exigirAdmin() {
  const rep = await exigirRep();
  if (!ehAdmin(rep)) throw new Error('Só admin.');
}
```

por:

```ts
async function exigirAdmin() {
  const rep = await exigirRep();
  if (!ehAdmin(rep)) throw new Error('Só admin.');
  return rep;
}
```

(Os outros chamadores — `criarTurno`, `apagarTurno`, `simularPonto`, etc — só fazem `await exigirAdmin();` e ignoram o retorno. Nada mais muda neles.)

- [ ] **Step 2: `aplicarSlot` recebe `alteradoPor` e grava o log**

Trocar a função `aplicarSlot` inteira (o bloco que hoje vai de `async function aplicarSlot(` até o `}` antes de `salvarGrade`) por:

```ts
/**
 * Define quem ocupa um slot da grade.
 *
 * Trocar o dono de um slot que já existe apaga a linha antiga em vez de só
 * atualizar o rep_id: um upsert por cima deixaria o ponto/statement do rep
 * anterior pendurado no mesmo shift_id, já que a troca de dono não é o mesmo
 * turno continuando — é outra pessoa nele.
 *
 * Toda troca de dono (inclusive slot que estava vazio, ou slot esvaziado pra
 * "—") grava uma linha em escala_alteracoes — é o log da aba /admin/turnos.
 */
async function aplicarSlot(
  supabase: Awaited<ReturnType<typeof criarClienteServidor>>,
  slot: Slot,
  alteradoPor: string,
) {
  const { data: existente } = await supabase
    .from('shifts')
    .select('id, rep_id')
    .eq('data', slot.data)
    .eq('turno', slot.turno)
    .eq('bloco', slot.bloco)
    .eq('funcao', slot.funcao)
    .maybeSingle();

  const repAntes = existente?.rep_id ?? null;
  if (repAntes === slot.repId) return;

  if (existente) {
    const { error } = await supabase.from('shifts').delete().eq('id', existente.id);
    if (error) throw new Error(error.message);
  }

  if (slot.repId) {
    const { error } = await supabase.from('shifts').insert({
      data: slot.data,
      turno: slot.turno,
      bloco: slot.bloco,
      funcao: slot.funcao,
      rep_id: slot.repId,
      origem: 'manual',
    });
    if (error) throw new Error(error.message);
  }

  const { error: erroLog } = await supabase.from('escala_alteracoes').insert({
    data: slot.data,
    turno: slot.turno,
    bloco: slot.bloco,
    funcao: slot.funcao,
    rep_saiu: repAntes,
    rep_entrou: slot.repId,
    alterado_por: alteradoPor,
  });
  if (erroLog) throw new Error(erroLog.message);
}
```

Nota sobre o que mudou no fluxo do `shifts` (comportamento idêntico ao de antes, só reescrito): antes o delete era `if (existente && existente.rep_id !== slot.repId)` e o insert `if (slot.repId && (!existente || existente.rep_id !== slot.repId))`. Como agora a função já retornou cedo quando `repAntes === slot.repId`, daqui pra baixo `repAntes !== slot.repId` é sempre verdade — então as condições viram só `if (existente)` e `if (slot.repId)`.

- [ ] **Step 3: `salvarGrade` passa o rep**

Trocar:

```ts
export async function salvarGrade(alteracoes: Slot[]) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  for (const slot of alteracoes) await aplicarSlot(supabase, slot);

  revalidar();
}
```

por:

```ts
export async function salvarGrade(alteracoes: Slot[]) {
  const rep = await exigirAdmin();
  const supabase = await criarClienteServidor();

  for (const slot of alteracoes) await aplicarSlot(supabase, slot, rep.id);

  revalidar();
}
```

- [ ] **Step 4: Typecheck e lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erros. (Se o lint reclamar de `Rep` não usado em algum import — não deve, `exigirRep` já era importado.)

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS — nada quebrou (nenhum teste cobre `actions.ts` diretamente).

- [ ] **Step 6: Commit**

```bash
git add app/(app)/admin/turnos/actions.ts
git commit -m "Grade da escala: grava escala_alteracoes a cada troca de rep no slot"
```

---

## Task 4: Componente `LogAlteracoes` + montagem em `page.tsx`

**Files:**
- Create: `app/(app)/admin/turnos/log-alteracoes.tsx`
- Modify: `app/(app)/admin/turnos/page.tsx` (import + query no `Promise.all` + monta `EntradaLog[]` + render)

**Interfaces:**
- Consumes: `EntradaLog`, `GrupoLog`, `agruparPorDiaDaMudanca`, `diaMes`, `textoDoLog` de `@/lib/logEscala` (Task 2); `rotuloTurno`, `ROTULO_CARGO` de `@/lib/tipos`; tabela `escala_alteracoes` (Task 1); arrays `reps` e `models` que `page.tsx` já carrega.
- Produces: bloco visual "Mudanças feitas na semana" abaixo da grade, com botão "Copiar".

- [ ] **Step 1: Escrever o componente**

Create `app/(app)/admin/turnos/log-alteracoes.tsx`:

```tsx
'use client';

import { useState } from 'react';
import {
  agruparPorDiaDaMudanca,
  diaMes,
  textoDoLog,
  type EntradaLog,
} from '@/lib/logEscala';
import { ROTULO_CARGO, rotuloTurno } from '@/lib/tipos';

/**
 * Lista as trocas de rep feitas na semana aberta na grade, agrupadas pelo dia
 * em que foram salvas. O botão "Copiar" joga o texto todo (versão sem
 * marcação, de logEscala.textoDoLog) no clipboard.
 */
export function LogAlteracoes({ entradas }: { entradas: EntradaLog[] }) {
  const [copiado, setCopiado] = useState(false);

  if (entradas.length === 0) return null;
  const grupos = agruparPorDiaDaMudanca(entradas);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(textoDoLog(grupos));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // navegador sem permissão de clipboard — não trava a tela, só não copia.
    }
  }

  return (
    <div className="rounded-2xl border border-borda bg-superficie">
      <div className="flex items-center justify-between gap-3 border-b border-borda px-4 py-3">
        <p className="text-sm font-medium text-texto-fraco">Mudanças feitas na semana</p>
        <button
          type="button"
          onClick={copiar}
          className="rounded-lg border border-borda px-3 py-1.5 text-xs font-medium transition hover:border-accent"
        >
          {copiado ? 'Copiado!' : 'Copiar'}
        </button>
      </div>
      <div className="divide-y divide-borda">
        {grupos.map((grupo) => (
          <div key={grupo.diaMudanca} className="px-4 py-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-accent">
              Mudanças feitas {diaMes(grupo.diaMudanca)}
            </p>
            <ul className="space-y-3">
              {grupo.itens.map((item) => (
                <li key={item.id} className="text-sm">
                  <p className="text-texto-fraco">
                    {rotuloTurno(item.turno)}
                    {item.funcao === 'assist' ? ' (Assistant)' : ''} · {diaMes(item.data)}
                    {item.modelosDoBloco.length > 0 && ` · ${item.modelosDoBloco.join(' + ')}`}
                  </p>
                  {item.repSaiu && (
                    <p>
                      <span className="text-texto-fraco">Sai:</span> {item.repSaiu}
                      {item.cargoSaiu && ` (${ROTULO_CARGO[item.cargoSaiu]})`}
                    </p>
                  )}
                  {item.repEntrou && (
                    <p>
                      <span className="text-texto-fraco">Entra:</span> {item.repEntrou}
                      {item.cargoEntrou && ` (${ROTULO_CARGO[item.cargoEntrou]})`}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Adicionar a query em `page.tsx`**

Em `app/(app)/admin/turnos/page.tsx`, no `Promise.all` que hoje começa em `const [{ data: shiftsData }, { data: repsData }, { data: modelsData }, periodos] = await Promise.all([`, adicionar um item no fim do array e no destructuring.

Destructuring:

```ts
  const [
    { data: shiftsData },
    { data: repsData },
    { data: modelsData },
    periodos,
    { data: alteracoesData },
  ] = await Promise.all([
```

Novo item no fim do array (depois de `buscarPeriodos(supabase),`):

```ts
    supabase
      .from('escala_alteracoes')
      .select('id, data, turno, bloco, funcao, criado_em, rep_saiu, rep_entrou, alterado_por')
      .gte('data', inicio)
      .lte('data', fim)
      .order('criado_em', { ascending: false }),
```

- [ ] **Step 3: Montar `EntradaLog[]` em `page.tsx`**

Logo depois de `const models = (modelsData ?? []) as Model[];`, adicionar:

```ts
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
      modelosDoBloco: models.filter((m) => m.bloco === a.bloco && m.ativa).map((m) => m.nome),
    };
  });
```

- [ ] **Step 4: Imports em `page.tsx`**

Adicionar no topo:

```ts
import { type EntradaLog } from '@/lib/logEscala';
import { LogAlteracoes } from './log-alteracoes';
```

E garantir que `Bloco, Funcao, Turno` estejam no import de `@/lib/tipos` (hoje é `import type { Model, Rep } from '@/lib/tipos';` → passa a `import type { Bloco, Funcao, Model, Rep, Turno } from '@/lib/tipos';`).

- [ ] **Step 5: Renderizar o componente**

No JSX, logo depois do `<GradeEscala key={inicio} ... />` e antes do `{podeEditar && <FormularioTurno ... />}`, inserir:

```tsx
      <LogAlteracoes entradas={entradasLog} />
```

- [ ] **Step 6: Typecheck, lint, testes**

Run: `npm run typecheck && npm run lint && npm test`
Expected: tudo verde.

- [ ] **Step 7: Verificar no navegador**

1. `mcp__Claude_Browser__preview_start` com `{ name: "vortex" }` (config já existe em `.claude/launch.json`).
2. Navegar pra `/admin/turnos` logado como admin.
3. Na grade, trocar o rep de um slot qualquer, clicar "Salvar alterações".
4. Confirmar: aparece o bloco "Mudanças feitas na semana" com o grupo "Mudanças feitas DD/MM" de hoje, o item com `T?/T? · DD/MM · <modelos>` e as linhas `Sai:` / `Entra:` com nome e cargo certos.
5. Clicar "Copiar" → o rótulo vira "Copiado!". Colar em algum lugar e conferir o texto.
6. Trocar de semana no `NavPeriodo` (seta) → o bloco some (ou muda) conforme a semana; voltar → reaparece.
7. `mcp__Claude_Browser__read_console_messages` — sem erros.
8. Screenshot do bloco pro usuário.

Se o login de admin no preview não for viável, fallback: inserir uma linha de teste via `mcp__75bf43be-48a3-4dd8-b1f7-9f53cc565bb8__execute_sql` (INSERT em `escala_alteracoes` com uma `data` da semana corrente e `rep_saiu`/`rep_entrou` de reps reais), recarregar a página e conferir o render; apagar a linha de teste depois.

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/admin/turnos/log-alteracoes.tsx" "app/(app)/admin/turnos/page.tsx"
git commit -m "Aba admin/turnos: bloco 'Mudancas feitas na semana' com botao Copiar"
```

---

## Self-Review

**Spec coverage:**
- Tabela `escala_alteracoes` + RLS imutável → Task 1. ✓
- Gravação em `aplicarSlot` com antes/depois + quem alterou → Task 3. ✓
- `exigirAdmin` retorna o rep → Task 3 Step 1. ✓
- Filtro por `data` na semana aberta, ordem `criado_em desc` → Task 4 Step 2. ✓
- Agrupar por dia da mudança (BRT), grupos recentes primeiro → Task 2 (`agruparPorDiaDaMudanca`). ✓
- Item mostra data do turno + modelos do bloco (`Model.bloco`) → Task 4 Step 3 + componente. ✓
- Omitir "Sai"/"Entra" quando nulo; sufixo "(Assistant)"; some quando vazio → componente + `textoDoLog`. ✓
- Botão "Copiar" com Clipboard API, "Copiado!" por ~2s, sem lib → Task 4 Step 1. ✓
- Posição abaixo da grade, visível a quem vê a página → Task 4 Step 5. ✓
- Testes de `agruparPorDiaDaMudanca` / `diaMes` / `textoDoLog` → Task 2 Step 1. ✓

**Placeholder scan:** nenhum "TBD"/"handle errors"/"similar to". Todo código presente por extenso.

**Type consistency:** `EntradaLog` (com `id`) definido na Task 2, consumido igual nas Tasks 4; `GrupoLog` usado em `agruparPorDiaDaMudanca`/`textoDoLog`; `aplicarSlot(supabase, slot, alteradoPor)` — os 3 args batem entre a definição (Task 3 Step 2) e a chamada (Task 3 Step 3). Colunas do INSERT (`rep_saiu`, `rep_entrou`, `alterado_por`) batem com a migração (Task 1).

## Execução

Plano salvo. Sugestão de execução: subagent-driven (um subagente por task, revisão entre elas).
