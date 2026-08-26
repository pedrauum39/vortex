# Sistema de Notificações — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao admin uma aba `/admin/notificacoes` pra criar três tipos de aviso (popup, aviso com período, to-do) mandados pra reps específicos ou todos, aparecendo no dashboard/popup do rep com botão de confirmação — substituindo o popup de boas-vindas hardcoded atual.

**Architecture:** Duas tabelas novas (`notificacoes` + `notificacao_destinatarios`, esta última materializada por rep alvo e servindo tanto de "quem é alvo" quanto de "quem já confirmou" via `lida_em`). Lógica pura de "ativa/encerrada/visível hoje" em `lib/notificacoes.ts` (testada). Camada de acesso a dados em `lib/notificacoesDb.ts`. RLS deixa cada rep ler só as próprias notificações-alvo, e o admin ler/escrever tudo — reaproveitando `current_rep_id()`/`is_admin()`/`pode_ver()` já existentes.

**Tech Stack:** Next.js 16 (App Router, Server Components + Server Actions), Supabase (Postgres + RLS), TypeScript, Vitest, Tailwind.

## Global Constraints

- Sempre pt-BR nos textos visíveis e nos comentários do código (convenção do projeto).
- Nenhum tipo gerado do Supabase é usado neste projeto — toda leitura do banco é `as unknown as TipoLocal` manual. Siga esse padrão, não introduza `Database` types.
- Rodar `npm run typecheck && npm run lint && npm test && npm run build` antes de qualquer commit (fluxo documentado em `workspace-vortex.md`).
- **Aplicar a migração no Supabase de produção exige confirmação explícita do usuário antes de rodar** — é uma alteração de schema num banco compartilhado e em uso real; não rode `apply_migration`/DDL sem perguntar primeiro, mesmo que o arquivo da migração já esteja escrito e commitado.
- Não commitar/dar push sem o usuário pedir (regra já em vigor nesta sessão) — cada task termina com `git add` + `git commit`, mas o `git push` só acontece quando o usuário mandar "deploy".
- RLS: `notificacao_destinatarios` é o único lugar onde o próprio rep grava algo (`lida_em`) — toda escrita de `notificacoes` (criar/desativar) é só admin.

---

### Task 1: Migração do banco — tabelas + RLS

**Files:**
- Create: `supabase/migrations/0023_notificacoes.sql`

**Interfaces:**
- Produces: tabelas `notificacoes(id, tipo, mensagem, data_inicio, data_fim, ativo, criado_em)` e `notificacao_destinatarios(notificacao_id, rep_id, lida_em)`, usadas por todas as tasks seguintes.

- [ ] **Step 1: Escrever a migração**

```sql
-- Sistema de notificações do admin pros reps
-- (docs/superpowers/specs/2026-08-26-notificacoes-design.md). Três tipos:
-- popup (modal, uma vez, sem prazo), aviso (banner com data_inicio/data_fim),
-- todo (banner sem prazo, "já fiz"). notificacao_destinatarios é
-- materializada por rep alvo no momento da criação — lida_em nula é
-- pendente, preenchida é confirmado. É o mesmo campo que alimenta tanto "o
-- que falta mostrar pro rep X" quanto "quem já confirmou" no admin.

create table notificacoes (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null check (tipo in ('popup', 'aviso', 'todo')),
  mensagem    text not null,
  data_inicio date,
  data_fim    date,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now(),

  -- data_inicio/data_fim só existem (e são obrigatórios) pra tipo=aviso.
  constraint notificacoes_periodo_so_aviso check (
    (tipo = 'aviso') = (data_inicio is not null and data_fim is not null)
  )
);

create table notificacao_destinatarios (
  notificacao_id uuid not null references notificacoes(id) on delete cascade,
  rep_id         uuid not null references reps(id) on delete cascade,
  lida_em        timestamptz,

  primary key (notificacao_id, rep_id)
);

alter table notificacoes enable row level security;

-- O rep precisa ler a PRÓPRIA notificação-alvo pra saber o texto e o tipo,
-- sem enxergar as dos outros. Admin/observador/admin_5c enxergam tudo
-- (pode_ver() já cobre os três, ver migrações 0014/0016).
create policy notificacoes_select on notificacoes for select to authenticated
  using (
    is_admin() or pode_ver() or exists (
      select 1 from notificacao_destinatarios d
      where d.notificacao_id = notificacoes.id and d.rep_id = current_rep_id()
    )
  );

create policy notificacoes_admin_write on notificacoes for all to authenticated
  using (is_admin()) with check (is_admin());

alter table notificacao_destinatarios enable row level security;

create policy notificacao_destinatarios_select on notificacao_destinatarios
  for select to authenticated
  using (is_admin() or pode_ver() or rep_id = current_rep_id());

-- Só admin cria/apaga destinatário (a lista de quem é alvo é decidida no
-- formulário do admin, nunca pelo próprio rep).
create policy notificacao_destinatarios_insert on notificacao_destinatarios
  for insert to authenticated with check (is_admin());

create policy notificacao_destinatarios_delete on notificacao_destinatarios
  for delete to authenticated using (is_admin());

-- O próprio rep precisa poder gravar a confirmação (lida_em) na própria
-- linha — "Fechar"/"Já vi"/"Já fiz" chamam essa mesma coluna.
create policy notificacao_destinatarios_update on notificacao_destinatarios
  for update to authenticated
  using (is_admin() or rep_id = current_rep_id())
  with check (is_admin() or rep_id = current_rep_id());
```

- [ ] **Step 2: Commitar o arquivo da migração**

```bash
git add supabase/migrations/0023_notificacoes.sql
git commit -m "Adiciona migração: tabelas de notificações (notificacoes, notificacao_destinatarios)"
```

- [ ] **Step 3: Aplicar no Supabase — PARE E PERGUNTE AO USUÁRIO PRIMEIRO**

Isto é uma alteração de schema num banco de produção em uso real. Antes de
rodar, pergunte ao usuário se pode aplicar agora. Só depois do "sim",
aplique com o conector MCP do Supabase (`apply_migration`, projeto `Vortex`
id `vbyvpjtmayavtvfhpgax`) ou peça pro usuário colar no SQL Editor.

Depois de aplicada, confirme com uma leitura direta (`execute_sql` ou
equivalente):

```sql
select table_name from information_schema.tables
where table_name in ('notificacoes', 'notificacao_destinatarios');
```

Espera-se as duas linhas de volta.

---

### Task 2: `lib/notificacoes.ts` — tipos e lógica pura (TDD)

**Files:**
- Create: `lib/notificacoes.ts`
- Test: `lib/notificacoes.test.ts`

**Interfaces:**
- Consumes: nada (arquivo puro, sem dependência de banco).
- Produces: `TipoNotificacao`, `Notificacao`, `Destinatario`, `estaVisivelHoje(n, hoje)`, `estaEncerrada(n, hoje, destinatarios)`, `ROTULO_TIPO`, `ROTULO_CONFIRMAR` — usados por `lib/notificacoesDb.ts` e por todos os componentes de UI das tasks seguintes.

- [ ] **Step 1: Escrever o teste que falha**

```typescript
// lib/notificacoes.test.ts
import { describe, expect, test } from 'vitest';
import { estaEncerrada, estaVisivelHoje } from './notificacoes';

describe('estaVisivelHoje', () => {
  test('desativada nunca é visível, de nenhum tipo', () => {
    expect(estaVisivelHoje({ tipo: 'popup', dataInicio: null, dataFim: null, ativo: false }, '2026-08-26')).toBe(
      false,
    );
    expect(
      estaVisivelHoje(
        { tipo: 'aviso', dataInicio: '2026-08-01', dataFim: '2026-08-31', ativo: false },
        '2026-08-26',
      ),
    ).toBe(false);
  });

  test('popup e todo ativos são sempre visíveis, sem checagem de data', () => {
    expect(estaVisivelHoje({ tipo: 'popup', dataInicio: null, dataFim: null, ativo: true }, '2026-08-26')).toBe(
      true,
    );
    expect(estaVisivelHoje({ tipo: 'todo', dataInicio: null, dataFim: null, ativo: true }, '2026-08-26')).toBe(
      true,
    );
  });

  test('aviso só é visível dentro de [data_inicio, data_fim]', () => {
    const n = { tipo: 'aviso' as const, dataInicio: '2026-08-20', dataFim: '2026-08-25', ativo: true };
    expect(estaVisivelHoje(n, '2026-08-19')).toBe(false); // antes de começar
    expect(estaVisivelHoje(n, '2026-08-20')).toBe(true); // primeiro dia
    expect(estaVisivelHoje(n, '2026-08-25')).toBe(true); // último dia
    expect(estaVisivelHoje(n, '2026-08-26')).toBe(false); // já passou
  });
});

describe('estaEncerrada', () => {
  test('desativada manualmente está sempre encerrada', () => {
    expect(estaEncerrada({ tipo: 'todo', dataFim: null, ativo: false }, '2026-08-26', [{ lidaEm: null }])).toBe(
      true,
    );
  });

  test('aviso com data_fim já passada está encerrado mesmo com gente pendente', () => {
    expect(
      estaEncerrada({ tipo: 'aviso', dataFim: '2026-08-20', ativo: true }, '2026-08-26', [{ lidaEm: null }]),
    ).toBe(true);
  });

  test('aviso ainda dentro do prazo, com alguém pendente, não está encerrado', () => {
    expect(
      estaEncerrada({ tipo: 'aviso', dataFim: '2026-08-30', ativo: true }, '2026-08-26', [{ lidaEm: null }]),
    ).toBe(false);
  });

  test('todo/popup encerram quando todo mundo confirmou', () => {
    expect(
      estaEncerrada({ tipo: 'todo', dataFim: null, ativo: true }, '2026-08-26', [
        { lidaEm: '2026-08-20T10:00:00Z' },
        { lidaEm: '2026-08-21T10:00:00Z' },
      ]),
    ).toBe(true);
  });

  test('todo/popup continuam ativos enquanto falta alguém confirmar', () => {
    expect(
      estaEncerrada({ tipo: 'popup', dataFim: null, ativo: true }, '2026-08-26', [
        { lidaEm: '2026-08-20T10:00:00Z' },
        { lidaEm: null },
      ]),
    ).toBe(false);
  });

  test('sem destinatário nenhum (lista vazia) nunca encerra sozinho por confirmação', () => {
    expect(estaEncerrada({ tipo: 'todo', dataFim: null, ativo: true }, '2026-08-26', [])).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run lib/notificacoes.test.ts`
Expected: FAIL — `Cannot find module './notificacoes'` (o arquivo ainda não existe).

- [ ] **Step 3: Implementar `lib/notificacoes.ts`**

```typescript
// Lógica pura de quando uma notificação aparece e quando ela "encerra" — sem
// tocar em banco, pra dar pra testar isolado. Três tipos:
// - popup: modal ao abrir o site, sem prazo, some quando a pessoa confirma.
// - aviso: banner no dashboard, só dentro de [dataInicio, dataFim].
// - todo: banner no dashboard, sem prazo, some quando a pessoa confirma.

export type TipoNotificacao = 'popup' | 'aviso' | 'todo';

export type Notificacao = {
  id: string;
  tipo: TipoNotificacao;
  mensagem: string;
  dataInicio: string | null;
  dataFim: string | null;
  ativo: boolean;
  criadoEm: string;
};

export type Destinatario = {
  repId: string;
  lidaEm: string | null;
};

export const ROTULO_TIPO: Record<TipoNotificacao, string> = {
  popup: 'Popup',
  aviso: 'Aviso',
  todo: 'To-do',
};

export const ROTULO_CONFIRMAR: Record<TipoNotificacao, string> = {
  popup: 'Fechar',
  aviso: 'Já vi',
  todo: 'Já fiz',
};

/**
 * Se ainda deve aparecer pro rep HOJE. Desativada nunca aparece, de nenhum
 * tipo. Só `aviso` tem janela de data — `popup`/`todo` não têm prazo, só
 * dependem de `ativo` (a checagem de "já confirmou" é feita à parte, olhando
 * `lida_em` do destinatário).
 */
export function estaVisivelHoje(
  n: Pick<Notificacao, 'tipo' | 'dataInicio' | 'dataFim' | 'ativo'>,
  hoje: string,
): boolean {
  if (!n.ativo) return false;
  if (n.tipo === 'aviso') {
    if (n.dataInicio && hoje < n.dataInicio) return false;
    if (n.dataFim && hoje > n.dataFim) return false;
  }
  return true;
}

/**
 * Se não sobra mais nada pra mostrar pra ninguém — usado só pra separar as
 * abas Ativas/Encerradas no admin. Encerra quando: foi desativada à mão, OU
 * é aviso e a data_fim já passou, OU todo mundo que era alvo já confirmou.
 */
export function estaEncerrada(
  n: Pick<Notificacao, 'tipo' | 'dataFim' | 'ativo'>,
  hoje: string,
  destinatarios: Pick<Destinatario, 'lidaEm'>[],
): boolean {
  if (!n.ativo) return true;
  if (n.tipo === 'aviso' && n.dataFim && hoje > n.dataFim) return true;
  return destinatarios.length > 0 && destinatarios.every((d) => d.lidaEm !== null);
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run lib/notificacoes.test.ts`
Expected: PASS (todos os `test(...)` verdes)

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add lib/notificacoes.ts lib/notificacoes.test.ts
git commit -m "Adiciona lib/notificacoes.ts: tipos e regra pura de visível/encerrada (testado)"
```

---

### Task 3: `lib/notificacoesDb.ts` — acesso a dados

**Files:**
- Create: `lib/notificacoesDb.ts`

**Interfaces:**
- Consumes: `TipoNotificacao`, `estaVisivelHoje` de `lib/notificacoes.ts` (Task 2); tabelas `notificacoes`/`notificacao_destinatarios` (Task 1).
- Produces: `NotificacaoComDestinatarios`, `NotificacoesPendentes`, `buscarNotificacoesAdmin(db)`, `buscarNotificacoesPendentesDoRep(db, repId, hoje)`, `criarNotificacao(db, dados)`, `desativarNotificacao(db, id)`, `confirmarNotificacao(db, notificacaoId, repId)` — usados pelas actions das Tasks 4/5 e pela página admin da Task 8.

- [ ] **Step 1: Implementar o arquivo**

```typescript
// Acesso a dados de notificacoes/notificacao_destinatarios. Sem tipos
// gerados do Supabase (este projeto não usa) — cast manual como em todo
// outro *Db.ts (ver lib/statementDb.ts, lib/periodosDb.ts).

import type { SupabaseClient } from '@supabase/supabase-js';
import { estaVisivelHoje, type Notificacao, type TipoNotificacao } from './notificacoes';

export type NotificacaoComDestinatarios = Notificacao & {
  destinatarios: { repId: string; nomeCurto: string; lidaEm: string | null }[];
};

type LinhaNotificacaoAdmin = {
  id: string;
  tipo: TipoNotificacao;
  mensagem: string;
  data_inicio: string | null;
  data_fim: string | null;
  ativo: boolean;
  criado_em: string;
  notificacao_destinatarios: { rep_id: string; lida_em: string | null; reps: { nome_curto: string } | null }[];
};

const CAMPOS_ADMIN =
  'id, tipo, mensagem, data_inicio, data_fim, ativo, criado_em, notificacao_destinatarios(rep_id, lida_em, reps(nome_curto))';

/** Todas as notificações, com quem é alvo e quem já confirmou — pra montar
 * as abas Ativas/Encerradas e o "ver quem" no admin. */
export async function buscarNotificacoesAdmin(db: SupabaseClient): Promise<NotificacaoComDestinatarios[]> {
  const { data, error } = await db
    .from('notificacoes')
    .select(CAMPOS_ADMIN)
    .order('criado_em', { ascending: false });
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as LinhaNotificacaoAdmin[]).map((n) => ({
    id: n.id,
    tipo: n.tipo,
    mensagem: n.mensagem,
    dataInicio: n.data_inicio,
    dataFim: n.data_fim,
    ativo: n.ativo,
    criadoEm: n.criado_em,
    destinatarios: n.notificacao_destinatarios.map((d) => ({
      repId: d.rep_id,
      nomeCurto: d.reps?.nome_curto ?? '—',
      lidaEm: d.lida_em,
    })),
  }));
}

export type NotificacoesPendentes = {
  popups: { id: string; mensagem: string }[];
  avisos: { id: string; mensagem: string }[];
  todos: { id: string; mensagem: string }[];
};

type LinhaPendente = {
  notificacoes: {
    id: string;
    tipo: TipoNotificacao;
    mensagem: string;
    data_inicio: string | null;
    data_fim: string | null;
    ativo: boolean;
    criado_em: string;
  } | null;
};

/** Notificações que o rep ainda não confirmou E que já são visíveis hoje
 * (filtra aviso fora do período; desativada nunca entra aqui — ver
 * estaVisivelHoje). Ordenado do mais antigo pro mais novo, separado por
 * tipo — quem chama decide como renderizar cada um. */
export async function buscarNotificacoesPendentesDoRep(
  db: SupabaseClient,
  repId: string,
  hoje: string,
): Promise<NotificacoesPendentes> {
  const { data, error } = await db
    .from('notificacao_destinatarios')
    .select('notificacoes(id, tipo, mensagem, data_inicio, data_fim, ativo, criado_em)')
    .eq('rep_id', repId)
    .is('lida_em', null);
  if (error) throw new Error(error.message);

  const pendentes = ((data ?? []) as unknown as LinhaPendente[])
    .map((l) => l.notificacoes)
    .filter((n): n is NonNullable<typeof n> => n !== null)
    .filter((n) =>
      estaVisivelHoje({ tipo: n.tipo, dataInicio: n.data_inicio, dataFim: n.data_fim, ativo: n.ativo }, hoje),
    )
    .sort((a, b) => (a.criado_em < b.criado_em ? -1 : a.criado_em > b.criado_em ? 1 : 0));

  return {
    popups: pendentes.filter((n) => n.tipo === 'popup').map((n) => ({ id: n.id, mensagem: n.mensagem })),
    avisos: pendentes.filter((n) => n.tipo === 'aviso').map((n) => ({ id: n.id, mensagem: n.mensagem })),
    todos: pendentes.filter((n) => n.tipo === 'todo').map((n) => ({ id: n.id, mensagem: n.mensagem })),
  };
}

/** Cria a notificação e materializa uma linha de destinatário por rep alvo —
 * "marcar todos" no formulário só significa marcar todos os checkboxes
 * antes de chamar isto aqui, o insert é o mesmo. */
export async function criarNotificacao(
  db: SupabaseClient,
  dados: {
    tipo: TipoNotificacao;
    mensagem: string;
    dataInicio: string | null;
    dataFim: string | null;
    repIds: string[];
  },
): Promise<void> {
  if (dados.repIds.length === 0) throw new Error('Escolha ao menos um destinatário.');
  if (!dados.mensagem.trim()) throw new Error('A mensagem não pode ficar vazia.');

  const { data: notificacao, error } = await db
    .from('notificacoes')
    .insert({
      tipo: dados.tipo,
      mensagem: dados.mensagem,
      data_inicio: dados.dataInicio,
      data_fim: dados.dataFim,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  const { error: erroDestinatarios } = await db
    .from('notificacao_destinatarios')
    .insert(dados.repIds.map((repId) => ({ notificacao_id: notificacao.id, rep_id: repId })));
  if (erroDestinatarios) throw new Error(erroDestinatarios.message);
}

/** Tira do ar pra todo mundo na hora — não apaga a linha, só marca ativo=false,
 * então o histórico de quem já tinha confirmado antes continua no "ver quem". */
export async function desativarNotificacao(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.from('notificacoes').update({ ativo: false }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Grava a confirmação do rep — "Fechar"/"Já vi"/"Já fiz" chamam esta mesma
 * função, só o rótulo do botão muda por tipo (ver ROTULO_CONFIRMAR). */
export async function confirmarNotificacao(
  db: SupabaseClient,
  notificacaoId: string,
  repId: string,
): Promise<void> {
  const { error } = await db
    .from('notificacao_destinatarios')
    .update({ lida_em: new Date().toISOString() })
    .eq('notificacao_id', notificacaoId)
    .eq('rep_id', repId);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npm run typecheck
git add lib/notificacoesDb.ts
git commit -m "Adiciona lib/notificacoesDb.ts: acesso a dados das notificações"
```

---

### Task 4: Action compartilhada de confirmação

**Files:**
- Create: `app/(app)/notificacoes-actions.ts`

**Interfaces:**
- Consumes: `confirmarNotificacao` de `lib/notificacoesDb.ts` (Task 3); `exigirRep` de `lib/auth.ts`; `criarClienteServidor` de `lib/supabase/server.ts`.
- Produces: `confirmarNotificacaoAction(notificacaoId: string): Promise<void>` — usada pelo popup (Task 9) e pelos cards do dashboard (Task 10).

- [ ] **Step 1: Implementar**

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { exigirRep } from '@/lib/auth';
import { confirmarNotificacao } from '@/lib/notificacoesDb';
import { criarClienteServidor } from '@/lib/supabase/server';

/** Chamada tanto pelo popup (fila no layout raiz) quanto pelos cards de
 * aviso/todo no dashboard — o único campo gravado é lida_em, o rótulo do
 * botão que muda por tipo é decisão só de UI (ROTULO_CONFIRMAR). */
export async function confirmarNotificacaoAction(notificacaoId: string) {
  const rep = await exigirRep();
  const supabase = await criarClienteServidor();

  await confirmarNotificacao(supabase, notificacaoId, rep.id);

  revalidatePath('/');
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npm run typecheck
git add "app/(app)/notificacoes-actions.ts"
git commit -m "Adiciona confirmarNotificacaoAction — usada pelo popup e pelos cards do dashboard"
```

---

### Task 5: Actions do admin (criar / desativar)

**Files:**
- Create: `app/(app)/admin/notificacoes/actions.ts`

**Interfaces:**
- Consumes: `criarNotificacao`, `desativarNotificacao` de `lib/notificacoesDb.ts` (Task 3); `TipoNotificacao` de `lib/notificacoes.ts` (Task 2).
- Produces: `criarNotificacaoAction(dados)`, `desativarNotificacaoAction(id: string)` — usadas pelo formulário (Task 6) e pela lista (Task 7).

- [ ] **Step 1: Implementar**

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { ehAdmin, exigirRep } from '@/lib/auth';
import type { TipoNotificacao } from '@/lib/notificacoes';
import { criarNotificacao, desativarNotificacao } from '@/lib/notificacoesDb';
import { criarClienteServidor } from '@/lib/supabase/server';

async function exigirAdmin() {
  const rep = await exigirRep();
  if (!ehAdmin(rep)) throw new Error('Só admin.');
}

function revalidar() {
  revalidatePath('/admin/notificacoes');
  revalidatePath('/');
}

export async function criarNotificacaoAction(dados: {
  tipo: TipoNotificacao;
  mensagem: string;
  dataInicio: string | null;
  dataFim: string | null;
  repIds: string[];
}) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  await criarNotificacao(supabase, dados);

  revalidar();
}

export async function desativarNotificacaoAction(id: string) {
  await exigirAdmin();
  const supabase = await criarClienteServidor();

  await desativarNotificacao(supabase, id);

  revalidar();
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npm run typecheck
git add "app/(app)/admin/notificacoes/actions.ts"
git commit -m "Adiciona actions do admin de notificações: criar e desativar"
```

---

### Task 6: Formulário de criação (client component)

**Files:**
- Create: `app/(app)/admin/notificacoes/form-notificacao.tsx`

**Interfaces:**
- Consumes: `criarNotificacaoAction` da Task 5; `TipoNotificacao`, `ROTULO_TIPO` de `lib/notificacoes.ts` (Task 2).
- Produces: componente `FormNotificacao({ reps: { id: string; nome_curto: string }[] })`, usado pela página da Task 8.

- [ ] **Step 1: Implementar**

```tsx
'use client';

import { useState, useTransition } from 'react';
import { ROTULO_TIPO, type TipoNotificacao } from '@/lib/notificacoes';
import { criarNotificacaoAction } from './actions';

const TIPOS: TipoNotificacao[] = ['popup', 'aviso', 'todo'];

export function FormNotificacao({ reps }: { reps: { id: string; nome_curto: string }[] }) {
  const [tipo, setTipo] = useState<TipoNotificacao>('aviso');
  const [mensagem, setMensagem] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [pendente, executar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function alternar(id: string) {
    setSelecionados((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));
  }

  function enviar() {
    executar(async () => {
      setErro(null);
      try {
        await criarNotificacaoAction({
          tipo,
          mensagem,
          dataInicio: tipo === 'aviso' ? dataInicio : null,
          dataFim: tipo === 'aviso' ? dataFim : null,
          repIds: selecionados,
        });
        setMensagem('');
        setDataInicio('');
        setDataFim('');
        setSelecionados([]);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não deu para gravar.');
      }
    });
  }

  const podeEnviar =
    !pendente && mensagem.trim().length > 0 && selecionados.length > 0 && (tipo !== 'aviso' || (dataInicio && dataFim));

  return (
    <section className="rounded-2xl border border-borda bg-superficie p-6">
      <h2 className="text-lg font-medium">Nova notificação</h2>

      <div className="mt-4 flex gap-2">
        {TIPOS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTipo(t)}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              tipo === t ? 'border-accent bg-accent-fraco text-accent' : 'border-borda text-texto-fraco'
            }`}
          >
            {ROTULO_TIPO[t]}
          </button>
        ))}
      </div>

      <textarea
        value={mensagem}
        onChange={(e) => setMensagem(e.target.value)}
        placeholder="Mensagem"
        rows={3}
        className="mt-4 w-full rounded-lg border border-borda bg-fundo px-3 py-2.5 text-sm outline-none focus:border-accent"
      />

      {tipo === 'aviso' && (
        <div className="mt-3 flex gap-3">
          <label className="text-sm text-texto-fraco">
            De{' '}
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="ml-1 rounded-lg border border-borda bg-fundo px-2 py-1.5 text-sm outline-none focus:border-accent"
            />
          </label>
          <label className="text-sm text-texto-fraco">
            Até{' '}
            <input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="ml-1 rounded-lg border border-borda bg-fundo px-2 py-1.5 text-sm outline-none focus:border-accent"
            />
          </label>
        </div>
      )}

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-texto-fraco">Destinatários</p>
          <button
            type="button"
            onClick={() => setSelecionados(reps.map((r) => r.id))}
            className="text-xs text-accent hover:underline"
          >
            marcar todos
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {reps.map((r) => (
            <label
              key={r.id}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                selecionados.includes(r.id)
                  ? 'border-accent bg-accent-fraco text-accent'
                  : 'border-borda text-texto-fraco'
              }`}
            >
              <input
                type="checkbox"
                checked={selecionados.includes(r.id)}
                onChange={() => alternar(r.id)}
                className="size-4 accent-[var(--color-accent)]"
              />
              {r.nome_curto}
            </label>
          ))}
        </div>
      </div>

      {erro && <p className="mt-3 text-sm text-red-400">{erro}</p>}

      <button
        type="button"
        disabled={!podeEnviar}
        onClick={enviar}
        className="mt-4 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-fundo transition hover:bg-accent-forte disabled:opacity-50"
      >
        {pendente ? 'Enviando…' : 'Criar notificação'}
      </button>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npm run typecheck
git add "app/(app)/admin/notificacoes/form-notificacao.tsx"
git commit -m "Adiciona formulário de criação de notificação"
```

---

### Task 7: Lista com abas Ativas/Encerradas (client component)

**Files:**
- Create: `app/(app)/admin/notificacoes/lista-notificacoes.tsx`

**Interfaces:**
- Consumes: `desativarNotificacaoAction` da Task 5; `ROTULO_TIPO`, `TipoNotificacao` de `lib/notificacoes.ts` (Task 2); `dataCurta` de `lib/tempo.ts` (já existe, ver `app/(app)/admin/turnos/linha-turno.tsx:71`); tipo `NotificacaoComDestinatarios` de `lib/notificacoesDb.ts` (Task 3).
- Produces: componente `ListaNotificacoes({ ativas, encerradas, podeEditar })`, usado pela página da Task 8.

- [ ] **Step 1: Implementar**

```tsx
'use client';

import { useState, useTransition } from 'react';
import type { NotificacaoComDestinatarios } from '@/lib/notificacoesDb';
import { ROTULO_TIPO } from '@/lib/notificacoes';
import { dataCurta } from '@/lib/tempo';
import { desativarNotificacaoAction } from './actions';

export function ListaNotificacoes({
  ativas,
  encerradas,
  podeEditar,
}: {
  ativas: NotificacaoComDestinatarios[];
  encerradas: NotificacaoComDestinatarios[];
  podeEditar: boolean;
}) {
  const [aba, setAba] = useState<'ativas' | 'encerradas'>('ativas');
  const linhas = aba === 'ativas' ? ativas : encerradas;

  return (
    <section>
      <div className="flex gap-1 border-b border-borda">
        {(
          [
            { chave: 'ativas' as const, rotulo: `Ativas (${ativas.length})` },
            { chave: 'encerradas' as const, rotulo: `Encerradas (${encerradas.length})` },
          ]
        ).map(({ chave, rotulo }) => (
          <button
            key={chave}
            type="button"
            onClick={() => setAba(chave)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm transition ${
              aba === chave ? 'border-accent text-accent' : 'border-transparent text-texto-fraco hover:text-texto'
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {linhas.length === 0 ? (
        <p className="mt-4 text-sm text-texto-fraco">Nenhuma notificação aqui.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {linhas.map((n) => (
            <LinhaNotificacao key={n.id} notificacao={n} podeEditar={podeEditar && aba === 'ativas'} />
          ))}
        </div>
      )}
    </section>
  );
}

function LinhaNotificacao({
  notificacao,
  podeEditar,
}: {
  notificacao: NotificacaoComDestinatarios;
  podeEditar: boolean;
}) {
  const [aberta, setAberta] = useState(false);
  const [pendente, executar] = useTransition();

  const confirmados = notificacao.destinatarios.filter((d) => d.lidaEm !== null).length;

  return (
    <div className="rounded-xl border border-borda bg-superficie p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-md bg-accent-fraco px-2 py-0.5 text-xs text-accent">
          {ROTULO_TIPO[notificacao.tipo]}
        </span>
        <p className="flex-1 text-sm">{notificacao.mensagem}</p>
        {notificacao.tipo === 'aviso' && notificacao.dataInicio && notificacao.dataFim && (
          <span className="text-xs text-texto-fraco">
            {dataCurta(notificacao.dataInicio)} até {dataCurta(notificacao.dataFim)}
          </span>
        )}
        <span className="text-xs text-texto-fraco">
          {confirmados}/{notificacao.destinatarios.length} confirmaram
        </span>
        <button type="button" onClick={() => setAberta((v) => !v)} className="text-xs text-accent hover:underline">
          {aberta ? 'esconder' : 'ver quem'}
        </button>
        {podeEditar && (
          <button
            type="button"
            disabled={pendente}
            onClick={() => executar(() => desativarNotificacaoAction(notificacao.id))}
            className="text-xs text-red-400 hover:underline disabled:opacity-50"
          >
            desativar
          </button>
        )}
      </div>

      {aberta && (
        <ul className="mt-3 grid grid-cols-2 gap-1.5 border-t border-borda pt-3 sm:grid-cols-3">
          {notificacao.destinatarios.map((d) => (
            <li key={d.repId} className="text-xs">
              {d.lidaEm ? '✓' : '—'} {d.nomeCurto}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npm run typecheck
git add "app/(app)/admin/notificacoes/lista-notificacoes.tsx"
git commit -m "Adiciona lista de notificações com abas Ativas/Encerradas e expand"
```

---

### Task 8: Página do admin + nav

**Files:**
- Create: `app/(app)/admin/notificacoes/page.tsx`
- Modify: `app/(app)/admin/admin-nav.tsx`

**Interfaces:**
- Consumes: `FormNotificacao` (Task 6), `ListaNotificacoes` (Task 7), `buscarNotificacoesAdmin` (Task 3), `estaEncerrada` (Task 2).
- Produces: rota `/admin/notificacoes` navegável a partir do menu admin.

- [ ] **Step 1: Criar a página**

```tsx
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
```

- [ ] **Step 2: Adicionar a aba no menu do admin**

Em `app/(app)/admin/admin-nav.tsx`, o array `ABAS` vira:

```typescript
const ABAS = [
  { href: '/admin/turnos', rotulo: 'Turnos' },
  { href: '/admin/reps', rotulo: 'Reps' },
  { href: '/admin/models', rotulo: 'Modelos' },
  { href: '/admin/notificacoes', rotulo: 'Notificações' },
];
```

- [ ] **Step 3: Typecheck + lint + build**

```bash
npm run typecheck
npm run lint
npm run build
```

Expected: os três sem erro (build confirma que a rota `/admin/notificacoes`
compila).

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/admin/notificacoes/page.tsx" "app/(app)/admin/admin-nav.tsx"
git commit -m "Adiciona página /admin/notificacoes e a aba no menu do admin"
```

---

### Task 9: Fila de popups (substitui o popup hardcoded)

**Files:**
- Modify: `app/(app)/popup-boas-vindas.tsx` (reescrita completa)
- Modify: `app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `confirmarNotificacaoAction` (Task 4); `buscarNotificacoesPendentesDoRep` (Task 3).
- Produces: popup em fila, um de cada vez, do mais antigo pro mais novo.

- [ ] **Step 1: Reescrever `popup-boas-vindas.tsx`**

O componente antigo usava `useSyncExternalStore` + `localStorage` (mensagem
fixa, sem visibilidade pro admin de quem já viu). Agora recebe a fila via
prop (dados já vêm do servidor) e a confirmação vai pro banco, não mais pro
`localStorage`.

```tsx
'use client';

import { useState, useTransition } from 'react';
import { confirmarNotificacaoAction } from './notificacoes-actions';

type Popup = { id: string; mensagem: string };

/** Mostra um popup de cada vez, do mais antigo pro mais novo (a fila já vem
 * ordenada do servidor) — "Fechar" confirma no banco e avança pro próximo,
 * sem esperar recarregar a página. */
export function PopupBoasVindas({ popups }: { popups: Popup[] }) {
  const [indice, setIndice] = useState(0);
  const [pendente, executar] = useTransition();

  if (indice >= popups.length) return null;
  const popup = popups[indice];

  function fechar() {
    executar(async () => {
      await confirmarNotificacaoAction(popup.id);
      setIndice((i) => i + 1);
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-borda bg-superficie p-6 text-center shadow-2xl">
        <p className="whitespace-pre-wrap text-sm">{popup.mensagem}</p>
        <button
          type="button"
          disabled={pendente}
          onClick={fechar}
          className="mt-5 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-fundo transition hover:bg-accent-forte disabled:opacity-50"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Buscar a fila no layout raiz e passar pro componente**

`app/(app)/layout.tsx` hoje começa assim (import e função):

```typescript
import Image from 'next/image';
import Link from 'next/link';
import { exigirRep, podeVerAdmin } from '@/lib/auth';
import { rotuloTurno } from '@/lib/tipos';
import { Nav } from './nav';
import { PopupBoasVindas } from './popup-boas-vindas';

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const rep = await exigirRep();

  return (
    <div className="relative flex min-h-dvh flex-col">
      <PopupBoasVindas />
```

Troque pelos imports adicionados e a busca da fila:

```typescript
import Image from 'next/image';
import Link from 'next/link';
import { exigirRep, podeVerAdmin } from '@/lib/auth';
import { buscarNotificacoesPendentesDoRep } from '@/lib/notificacoesDb';
import { criarClienteServidor } from '@/lib/supabase/server';
import { dataBRT } from '@/lib/tempo';
import { rotuloTurno } from '@/lib/tipos';
import { Nav } from './nav';
import { PopupBoasVindas } from './popup-boas-vindas';

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const rep = await exigirRep();
  const supabase = await criarClienteServidor();
  const { popups } = await buscarNotificacoesPendentesDoRep(supabase, rep.id, dataBRT());

  return (
    <div className="relative flex min-h-dvh flex-col">
      <PopupBoasVindas popups={popups} />
```

O resto do arquivo (header, nav, etc.) fica exatamente como está.

- [ ] **Step 3: Typecheck + build**

```bash
npm run typecheck
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/popup-boas-vindas.tsx" "app/(app)/layout.tsx"
git commit -m "Popup de boas-vindas vira fila de notificações reais (substitui a mensagem fixa em localStorage)"
```

---

### Task 10: Cards de aviso/todo no dashboard

**Files:**
- Create: `app/(app)/notificacao-card.tsx`
- Modify: `app/(app)/page.tsx`

**Interfaces:**
- Consumes: `confirmarNotificacaoAction` (Task 4); `buscarNotificacoesPendentesDoRep` (Task 3); `ROTULO_CONFIRMAR` (Task 2).
- Produces: cards de aviso/todo pendentes no topo do dashboard, mesmo estilo visual do aviso de "turno vazio" já existente.

- [ ] **Step 1: Criar o componente do card**

```tsx
'use client';

import { useState, useTransition } from 'react';
import { confirmarNotificacaoAction } from './notificacoes-actions';

/** Mesmo estilo visual do aviso de "turno vazio" já existente na Home —
 * confirma no banco e some só pra este cartão (otimista, sem esperar um
 * novo carregamento da página). */
export function NotificacaoCard({
  id,
  mensagem,
  rotuloBotao,
}: {
  id: string;
  mensagem: string;
  rotuloBotao: string;
}) {
  const [sumiu, setSumiu] = useState(false);
  const [pendente, executar] = useTransition();

  if (sumiu) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
      <span>{mensagem}</span>
      <button
        type="button"
        disabled={pendente}
        onClick={() =>
          executar(async () => {
            await confirmarNotificacaoAction(id);
            setSumiu(true);
          })
        }
        className="shrink-0 rounded-md border border-amber-400/50 px-2 py-1 text-xs font-medium hover:bg-amber-400/20 disabled:opacity-50"
      >
        {rotuloBotao}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Buscar e renderizar no dashboard**

Em `app/(app)/page.tsx`, adicionar aos imports já existentes:

```typescript
import { ROTULO_CONFIRMAR } from '@/lib/notificacoes';
import { buscarNotificacoesPendentesDoRep } from '@/lib/notificacoesDb';
import { NotificacaoCard } from './notificacao-card';
```

O `Promise.all` hoje é exatamente este (dentro de `Dashboard()`, logo depois
de `cargoPrimaris` ser calculado):

```typescript
  const [{ data }, { data: modelsData }, metas, recorde, slots, regra, bonus, turnosVazios] = await Promise.all([
    supabase
      .from('shifts')
      .select('id, data, turno, bloco, funcao, shift_logs(shift_log_models(models(nome)))')
      .eq('rep_id', rep.id)
      .gte('data', hoje)
      .order('data')
      .limit(10),
    supabase.from('models').select('nome, bloco').eq('ativa', true).eq('extra', false).order('nome'),
    buscarMetasDoRep(criarClienteAdmin(), rep.id, inicioMes, fimMes, diasDoMes),
    buscarRecordeDoRep(criarClienteAdmin(), rep.id),
    buscarSlotsDoRep(rep.id, rep.cargo, rep.valor_hora, inicioMes, fimMes),
    buscarRegraVigente(criarClienteAdmin(), fimMes),
    cargoPrimaris ? buscarBonusPrimaris(criarClienteAdmin(), cargoPrimaris, inicioMes, fimMes) : null,
    cargoPrimaris ? buscarTurnosVazios(hoje) : Promise.resolve([]),
  ]);
```

Troque pelo mesmo array com uma chamada a mais no fim (usa o `supabase`
comum, não o admin — a RLS já deixa o próprio rep ler as próprias
notificações-alvo):

```typescript
  const [{ data }, { data: modelsData }, metas, recorde, slots, regra, bonus, turnosVazios, notificacoes] =
    await Promise.all([
      supabase
        .from('shifts')
        .select('id, data, turno, bloco, funcao, shift_logs(shift_log_models(models(nome)))')
        .eq('rep_id', rep.id)
        .gte('data', hoje)
        .order('data')
        .limit(10),
      supabase.from('models').select('nome, bloco').eq('ativa', true).eq('extra', false).order('nome'),
      buscarMetasDoRep(criarClienteAdmin(), rep.id, inicioMes, fimMes, diasDoMes),
      buscarRecordeDoRep(criarClienteAdmin(), rep.id),
      buscarSlotsDoRep(rep.id, rep.cargo, rep.valor_hora, inicioMes, fimMes),
      buscarRegraVigente(criarClienteAdmin(), fimMes),
      cargoPrimaris ? buscarBonusPrimaris(criarClienteAdmin(), cargoPrimaris, inicioMes, fimMes) : null,
      cargoPrimaris ? buscarTurnosVazios(hoje) : Promise.resolve([]),
      buscarNotificacoesPendentesDoRep(supabase, rep.id, hoje),
    ]);
```

O bloco JSX que já renderiza `turnosVazios` hoje é este:

```tsx
        {turnosVazios.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {turnosVazios.map((v) => (
              <p
                key={`${v.data}|${v.turno}|${v.bloco}`}
                className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-200"
              >
                Turno do dia {diaLegivel(v.data)}, {rotuloTurno(v.turno)} (Time {v.bloco === 'I' ? '1' : '2'}) está
                vazio, procure cover.
              </p>
            ))}
          </div>
        )}
```

Adicione logo depois desse bloco (mesma indentação, ainda dentro da `div`
do card de nome/turno/cargo):

```tsx
        {(notificacoes.avisos.length > 0 || notificacoes.todos.length > 0) && (
          <div className="mt-3 space-y-1.5">
            {notificacoes.avisos.map((n) => (
              <NotificacaoCard key={n.id} id={n.id} mensagem={n.mensagem} rotuloBotao={ROTULO_CONFIRMAR.aviso} />
            ))}
            {notificacoes.todos.map((n) => (
              <NotificacaoCard key={n.id} id={n.id} mensagem={n.mensagem} rotuloBotao={ROTULO_CONFIRMAR.todo} />
            ))}
          </div>
        )}
```

- [ ] **Step 3: Typecheck + lint + test + build**

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Expected: os quatro sem erro (as 111 unit tests continuam passando — nada
neste projeto testa `page.tsx` diretamente, só a lógica pura).

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/notificacao-card.tsx" "app/(app)/page.tsx"
git commit -m "Dashboard mostra avisos/todos pendentes, mesmo estilo do aviso de turno vazio"
```

---

### Task 11: Verificação de RLS contra o banco real + checklist final

Notificações são a primeira feature deste projeto em que o PRÓPRIO rep
grava numa tabela que o admin também escreve (`notificacao_destinatarios`,
coluna `lida_em`) — vale confirmar a RLS com uma sessão real simulada antes
de dar por certo, mesmo o SQL parecendo óbvio (ver armadilha #14/#15 do
`workspace-vortex.md`: bug de RLS real já aconteceu duas vezes neste
projeto por confiar só na leitura do SQL).

- [ ] **Step 1: Confirmar que a migração já foi aplicada** (Task 1, Step 3)

- [ ] **Step 2: Criar uma notificação de teste via SQL, com um rep real como alvo**

Via `execute_sql` (Supabase MCP) ou SQL Editor:

```sql
insert into notificacoes (tipo, mensagem, ativo)
values ('todo', 'TESTE — pode apagar', true)
returning id;
-- guarda o id retornado, ex. '11111111-...'

insert into notificacao_destinatarios (notificacao_id, rep_id)
select '11111111-...', id from reps where nome_curto = 'Pedro'; -- ajuste o nome
```

- [ ] **Step 3: Simular a sessão do rep alvo e confirmar que ele VÊ a notificação**

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub": "<auth_user_id do rep>"}';

select * from notificacoes; -- deve trazer a notificação de teste
select * from notificacao_destinatarios where rep_id = '<id do rep>'; -- deve trazer a linha, lida_em null
```

- [ ] **Step 4: Simular a sessão de OUTRO rep (não-admin, não-alvo) e confirmar que ele NÃO vê**

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub": "<auth_user_id de outro rep qualquer>"}';

select * from notificacoes where mensagem like 'TESTE%'; -- deve vir vazio
```

- [ ] **Step 5: Simular o rep alvo confirmando (UPDATE de `lida_em`)**

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub": "<auth_user_id do rep>"}';

update notificacao_destinatarios
set lida_em = now()
where notificacao_id = '11111111-...' and rep_id = '<id do rep>';
-- deve afetar 1 linha, sem erro de RLS
```

- [ ] **Step 6: Apagar os dados de teste**

```sql
delete from notificacoes where mensagem = 'TESTE — pode apagar';
-- o cascade em notificacao_destinatarios apaga a linha junto
```

- [ ] **Step 7: Checklist final de verificação manual (via browser)**

1. Logar como admin, ir em `/admin/notificacoes`, criar um `aviso` de teste
   pra si mesmo com período de hoje até amanhã.
2. Ir na Home (`/`) — o card do aviso deve aparecer, com botão "Já vi".
3. Clicar "Já vi" — o card some sem recarregar a página.
4. Voltar em `/admin/notificacoes`, aba Ativas → deve ter ido pra
   Encerradas (todo mundo confirmou), e "ver quem" mostra ✓ no seu nome.
5. Criar um `popup` de teste pra si mesmo, recarregar qualquer página do
   site → o popup aparece; "Fechar" o esconde e não volta ao navegar de
   novo.
6. Criar um `todo` de teste, confirmar que aparece com botão "Já fiz" e
   soma igual ao aviso.
7. Criar uma notificação (qualquer tipo) e clicar "Desativar" nela ainda
   com gente pendente — confirmar que ela some da Home na hora (recarregar
   a página do rep alvo) e vai pra aba Encerradas no admin.

- [ ] **Step 8: Rodar a suíte inteira uma última vez**

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Expected: os quatro passam. Não commitar/dar push desta task (é só
verificação) — se algo precisar de correção, vira um commit novo na task
correspondente.
