# Spec: Log de alterações da escala (admin/turnos)

> Escrito para ser lido do zero. Sessão de 07/09/2026, brainstorming
> conversacional — este documento é o resultado já fechado, não um rascunho.

## Motivação

Na aba `/admin/turnos` o admin monta a escala numa grade (`GradeEscala`). Trocar
quem ocupa um slot e clicar "Salvar alterações" **já persiste** na tabela
`shifts` (via `salvarGrade` → `aplicarSlot` em
`app/(app)/admin/turnos/actions.ts`).

O que falta: não há registro nenhum do que mudou. `shifts` só sabe *quem está*
no slot agora — não guarda quem estava antes, nem quem fez a troca, nem quando.
Se alguém pergunta "por que o Léo entrou no lugar da Carol quarta?", não tem
como responder.

Pedido: mostrar, abaixo da grade, uma lista das trocas feitas na semana aberta,
**agrupada pela data em que a mudança foi feita** (`criado_em`); cada item mostra
a data do turno afetado.

```
Mudanças feitas 07/09

  T2/T3 · 10/09 · Joyce + Riley
    Sai:   Carolinne P. (Tertius)
    Entra: Léo Grimaldi (Secundus)

  T6/T1 · 11/09 · Bella + Nih
    Entra: Pedro Ribeiro (Grand Primaris)

Mudanças feitas 05/09

  T4/T5 · 09/09 · Joyce + Riley
    Sai:   Gabriela Storini (Secundus)
    Entra: Carlos de Lucca (Tertius)
```

## Escopo

- **Só trocas de rep na grade** (`salvarGrade`). Criar/apagar turno pelo
  formulário, turnos extra, simular ponto/statement — **fora**.
- Sem botão de desfazer, sem editar/apagar o log, sem paginação.

## Modelo de dados

Migração `0025_escala_alteracoes.sql`. Tabela append-only.

```sql
create table escala_alteracoes (
  id           uuid primary key default gen_random_uuid(),
  data         date not null,          -- dia do turno afetado
  turno        text not null check (turno in ('T2T3', 'T4T5', 'T6T1')),
  bloco        text not null check (bloco in ('I', 'II')),
  funcao       text not null check (funcao in ('regular', 'assist')),
  rep_saiu     uuid references reps(id) on delete set null,
  rep_entrou   uuid references reps(id) on delete set null,
  alterado_por uuid references reps(id) on delete set null,
  criado_em    timestamptz not null default now(),

  -- toda linha é uma mudança real: pelo menos um lado preenchido, e os dois
  -- lados diferentes (aplicarSlot já só age quando rep_id muda).
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

-- Só admin grava. Sem policy de update/delete — auditoria é imutável.
create policy escala_alteracoes_insert on escala_alteracoes for insert to authenticated
  with check (is_admin());

revoke all on escala_alteracoes from anon;
```

`rep_saiu` nulo = slot estava vazio e alguém entrou. `rep_entrou` nulo = slot foi
limpo pra "—". FKs `on delete set null` pra o log sobreviver a um rep apagado
(a linha "Sai"/"Entra" correspondente some quando o rep não existe mais).

## Gravação

Em `app/(app)/admin/turnos/actions.ts`:

1. `exigirAdmin()` passa a **retornar o rep** (hoje retorna `void`). Os outros
   chamadores (`criarTurno`, `apagarTurno`, etc.) ignoram o retorno — mudança
   compatível.
2. `salvarGrade` guarda o rep de `exigirAdmin()` e repassa `rep.id` para
   `aplicarSlot`.
3. `aplicarSlot` ganha o parâmetro `alteradoPor: string`. Condição única:
   quando `(existente?.rep_id ?? null) !== slot.repId` (cobre troca de dono,
   slot novo e slot limpo — é a mesma condição que já dispara o
   delete/insert em `shifts`), depois de mexer no `shifts`, insere uma linha
   em `escala_alteracoes`:
   - `data/turno/bloco/funcao` = do slot
   - `rep_saiu` = `existente?.rep_id ?? null`
   - `rep_entrou` = `slot.repId`
   - `alterado_por` = `alteradoPor`

O insert do log usa o mesmo cliente com RLS (`criarClienteServidor`); o admin
passa na policy. Se o insert do log falhar, propaga o erro como os outros
`throw new Error(error.message)` da função — a troca do `shifts` já gravada
fica, mas o admin vê o erro e sabe. (É o mesmo padrão de resiliência frouxa do
resto de `salvarGrade`, que não é transacional.)

## Exibição

Novo componente `app/(app)/admin/turnos/log-alteracoes.tsx` (client component —
precisa de estado só pro botão "Copiar"). Recebe `entradas: EntradaLog[]` já
montadas pela página; toda a lógica de agrupamento/formatação fica em
`lib/logEscala.ts` (puro, testável).

Em `page.tsx`, dentro do `Promise.all` que já existe, buscar:

```
supabase
  .from('escala_alteracoes')
  .select('id, data, turno, bloco, funcao, criado_em, rep_saiu, rep_entrou, alterado_por')
  .gte('data', inicio).lte('data', fim)
  .order('criado_em', { ascending: false })
```

Filtro por `data` (dia do turno) dentro da semana aberta na grade — o log
acompanha a semana que está na tela. Ordenação/agrupamento por `criado_em`.

Os nomes/cargos dos reps vêm do array `reps` que a página já carrega (lookup por
id em memória — evita joins aninhados). "Joyce + Riley" = modelos ativas do
bloco: `modelsData.filter(m => m.bloco === bloco && m.ativa).map(m => m.nome)`
(`modelsData` já carregado pela página; `Model` tem o campo `bloco`).

Helper puro em `lib/logEscala.ts` + teste (`lib/logEscala.test.ts`):

```ts
type EntradaLog = {
  id: string;
  criadoEm: string;          // ISO — quando a mudança foi feita
  data: string;              // dia do turno afetado
  turno: Turno; bloco: Bloco; funcao: Funcao;
  repSaiu: string | null;    // já resolvido pra nome
  cargoSaiu: Cargo | null;
  repEntrou: string | null;
  cargoEntrou: Cargo | null;
  modelosDoBloco: string[];  // ['Joyce', 'Riley']
};

// agrupa pela DATA de criadoEm (dia BRT em que a mudança foi feita), grupos
// mais recentes primeiro; dentro do grupo mantém a ordem recebida
// (criado_em desc). Chave do grupo: dataBRT(new Date(criadoEm)) de lib/tempo.
export function agruparPorDiaDaMudanca(entradas: EntradaLog[]): GrupoLog[]

// 'YYYY-MM-DD' → 'DD/MM'.
export function diaMes(data: string): string

// versão texto puro do bloco inteiro, pro botão "Copiar". Mesmo conteúdo do
// render, sem marcação:
//
//   Mudanças feitas 07/09
//
//   T2/T3 · 10/09 · Joyce + Riley
//   Sai: Carolinne P. (Tertius)
//   Entra: Léo Grimaldi (Secundus)
//
export function textoDoLog(grupos: GrupoLog[]): string
```

O componente renderiza:
- Cabeçalho com o título "Mudanças feitas na semana" à esquerda e um botão
  **"Copiar"** à direita (mesmo lugar/estilo do botão "Salvar alterações" da
  grade). Clicar chama `navigator.clipboard.writeText(textoDoLog(grupos))` e o
  rótulo vira "Copiado!" por ~2s. Sem libs — Clipboard API nativa.
- Por grupo: cabeçalho `Mudanças feitas ${diaMes(diaMudanca)}` (ex.
  "Mudanças feitas 07/09").
- Por item: linha `${rotuloTurno(turno)} · ${diaMes(data)} · ${modelos.join(' + ')}`
  e abaixo `Sai: <nome> (<ROTULO_CARGO[cargo]>)` / `Entra: <nome> (<cargo>)`.
  Omite a linha "Sai" quando `repSaiu` é nulo, e "Entra" quando `repEntrou` é
  nulo. Omite ` · ${modelos...}` quando o bloco não tem modelo ativa.
- `funcao === 'assist'` → sufixo "(Assistant)" no rótulo do turno.
- **Some inteiro quando não há nenhuma alteração** (retorna `null`, igual ao
  bloco "Turnos extra").

Posição: logo abaixo do card da `GradeEscala`, antes de `FormularioTurno`.
Visível pra todo mundo que chega na página (a RLS já restringe a leitura).

## Testes

- `lib/logEscala.test.ts`:
  - `agruparPorDiaDaMudanca` — ordem dos grupos (mais recente primeiro), duas
    mudanças no mesmo dia caem no mesmo grupo, fuso BRT na virada de dia, lista
    vazia.
  - `diaMes` — formata `'2026-09-10'` → `'10/09'`.
  - `textoDoLog` — bloco com "Sai" e "Entra", item só com "Entra" (slot estava
    vazio), item sem modelo do bloco.
- Migration + wiring da action: verificação manual no preview do navegador
  (trocar um rep, salvar, conferir a linha no log; trocar de semana e conferir
  que o log acompanha).

## Fora de escopo (YAGNI)

Desfazer troca, log de criar/apagar turno e turno extra, log de ponto/statement,
paginação, edição do log, filtro por rep, exportar arquivo (o botão "Copiar" já
cobre "levar o texto pra fora").
