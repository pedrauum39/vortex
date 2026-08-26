# Spec: Sistema de notificações (admin → reps)

> Escrito para ser lido do zero. Sessão de 26/08/2026, brainstorming conversacional
> (perguntas uma a uma, respondidas pelo usuário) — este documento é o resultado
> já fechado, não um rascunho.

## Motivação

O admin (Pedro) hoje só tem um jeito de "falar" com o time inteiro: um popup de
boas-vindas **hardcoded** (`app/(app)/popup-boas-vindas.tsx`), mensagem fixa
("Oi, o Pedro ama vc tá?"), controlado por uma flag em `localStorage` do
navegador de cada um. Isso tem três problemas: (1) a mensagem é fixa no código,
não dá pra mandar avisos novos sem editar e dar deploy; (2) `localStorage` não
dá visibilidade nenhuma pro admin de quem já viu; (3) não tem como desativar um
popup que já está "solto" — ele já apareceu pra sessão passada e vai continuar
aparecendo pra quem ainda não viu, sem controle.

Pedido: uma aba nova em `/admin` pra criar notificações de verdade — mandadas
pra reps específicos (ou todos de uma vez), aparecendo pro rep de um jeito
parecido com o aviso de "turno vazio" que já existe no dashboard.

## Três tipos de notificação

| Tipo | Onde aparece | Como o rep dispensa | Prazo |
|---|---|---|---|
| `popup` | Modal ao abrir o site (substitui o popup antigo) | Botão "Fechar" | Sem prazo — só some quando a pessoa confirma |
| `aviso` | Card no topo do dashboard (`/`), mesma área do aviso de turno vazio | Botão "Já vi" | Tem início e fim (`data_inicio`/`data_fim`) — só aparece dentro dessa janela |
| `todo` | Card no topo do dashboard (`/`), junto dos avisos | Botão "Já fiz" | Sem prazo — só some quando a pessoa confirma |

Todos os três suportam mandar pra um ou mais reps específicos, com um botão
"marcar todos" no formulário pra marcar todo mundo de uma vez em vez de
clicar rep por rep.

**Fila de popups**: se uma pessoa tem mais de um popup pendente (não
confirmado), eles aparecem um de cada vez, do mais antigo pro mais novo — só
depois de fechar o primeiro que o segundo aparece. Nenhum se perde.

## Modelo de dados

Migração `0023_notificacoes.sql`.

```sql
create table notificacoes (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null check (tipo in ('popup', 'aviso', 'todo')),
  mensagem    text not null,
  data_inicio date,
  data_fim    date,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now(),

  -- data_inicio/data_fim só fazem sentido (e são obrigatórios) pra tipo=aviso.
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
```

Uma linha em `notificacao_destinatarios` é criada por rep alvo no momento em
que a notificação é criada (não é uma flag "para todos" resolvida em tempo de
leitura) — mesmo padrão de `shift_log_models`: uma tabela associativa
materializada, simples de ler e de auditar. "Marcar todos" no formulário só
significa marcar todos os checkboxes antes de enviar; o insert final é o
mesmo, uma linha por rep.

`lida_em` é o único campo de status: nulo = pendente, preenchido = confirmado
("Fechar"/"Já vi"/"Já fiz" gravam a mesma coisa, só o rótulo do botão muda
por tipo). É esse campo que alimenta tanto "o que ainda falta mostrar pro
rep X" quanto "quem já confirmou", no admin.

**Quem pode ser alvo**: reps com `auth_user_id is not null` — ou seja, quem
de fato tem login e abre o site. Os 3 reps sintéticos de cover nunca têm
`auth_user_id` (não logam), então nunca aparecem no seletor. Isso já inclui
o Thomas (observador) se ele tiver vinculado o login dele.

## Regra de "ativa" vs. "encerrada" (as duas abas da lista, no admin)

Uma notificação fica **encerrada** quando:
- o admin desativou manualmente (`ativo = false`), OU
- é `aviso` e `hoje > data_fim`, OU
- todo mundo que foi marcado como alvo já confirmou (`lida_em` preenchido em
  todas as linhas de `notificacao_destinatarios` dela).

Caso contrário, fica em **ativa** — inclusive um aviso agendado pro futuro
(`hoje < data_inicio`), que já existe mas ainda não está sendo mostrado pra
ninguém.

Lógica pura em `lib/notificacoes.ts` (testada), duas funções:
- `estaEncerrada(notificacao, hoje, destinatarios)` — usada pra separar as
  duas abas no admin.
- `estaVisivelHoje(notificacao, hoje)` — `false` de cara se `ativo = false`
  (desativada nunca aparece pra ninguém, de nenhum tipo); pra `aviso`, checa
  também se `hoje` está dentro de `[data_inicio, data_fim]`; `popup`/`todo`
  só dependem do `ativo`.

## Ação "Desativar" (não "Apagar")

A lista de **Ativas**, no admin, tem um botão "Desativar" por notificação —
seta `ativo = false`. Isso tira a notificação da tela de todo mundo na hora
(não aparece mais em nenhum popup/dashboard), mas **não apaga o histórico**:
continua dando pra expandir e ver quem já tinha confirmado antes de você
desligar. Não existe um "apagar" que remova a linha do banco — desativar já
resolve o caso de uso ("solteia um popup errado, quero tirar do ar").

## RLS

Reaproveita `current_rep_id()`, `is_admin()`, `pode_ver()` (já existem).

```sql
alter table notificacoes enable row level security;

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

create policy notificacao_destinatarios_insert on notificacao_destinatarios
  for insert to authenticated with check (is_admin());

create policy notificacao_destinatarios_delete on notificacao_destinatarios
  for delete to authenticated using (is_admin());

-- O próprio rep precisa poder gravar a própria confirmação (lida_em).
create policy notificacao_destinatarios_update on notificacao_destinatarios
  for update to authenticated
  using (is_admin() or rep_id = current_rep_id())
  with check (is_admin() or rep_id = current_rep_id());
```

Observador e Admin 5C enxergam a aba (leitura, via `pode_ver()`) mas não
criam/desativam nada — mesmo padrão de toda outra tela do admin
(`podeEditar = ehAdmin(rep)` no app, `is_admin()` no banco).

## Camada de app

- `lib/notificacoes.ts` — tipos + `estaEncerrada`/`estaVisivelHoje` (puro,
  testado em `lib/notificacoes.test.ts`).
- `lib/notificacoesDb.ts`:
  - `buscarNotificacoesAdmin(db)` — todas, com destinatários + nome do rep,
    pra montar as duas abas e o expand.
  - `buscarNotificacoesPendentesDoRep(db, repId, hoje)` — só as não
    confirmadas E visíveis hoje (filtra `aviso` fora da janela), separadas em
    `popups` / `avisos` / `todos`, ordenadas por `criado_em` asc.
  - `criarNotificacao(db, { tipo, mensagem, dataInicio, dataFim, repIds })` —
    insere a notificação + uma linha em destinatários por rep.
  - `desativarNotificacao(db, id)`.
  - `confirmarNotificacao(db, notificacaoId, repId)` — grava `lida_em = now()`.
- `app/(app)/notificacoes-actions.ts` (`'use server'`) — `confirmarNotificacaoAction`,
  chamada tanto pelo popup (layout raiz) quanto pelos cards do dashboard.
- `app/(app)/admin/notificacoes/`:
  - `page.tsx` — Server Component, busca tudo, monta as duas abas.
  - `form-notificacao.tsx` (client) — tipo, mensagem, período condicional,
    checkboxes de reps + "marcar todos".
  - `lista-notificacoes.tsx` (client) — abas Ativas/Encerradas, linha
    expansível com status por rep, botão Desativar.
  - `actions.ts` (`'use server'`) — `criarNotificacaoAction`,
    `desativarNotificacaoAction`, ambas com `exigirAdmin()`.
- `app/(app)/admin/admin-nav.tsx` — nova aba "Notificações"
  (`/admin/notificacoes`).
- `app/(app)/layout.tsx` — busca os popups pendentes do rep (cliente admin,
  já que a lista de reps observadores é pequena e não tem nada sensível
  cruzando rep) e passa pro componente.
- `app/(app)/popup-boas-vindas.tsx` — reescrito: recebe a fila de popups como
  prop, mostra um de cada vez, "Fechar" chama a action e avança pro próximo
  (client-side, otimista — não espera recarregar a página). **O componente
  antigo (mensagem fixa + localStorage) é substituído inteiro** — quem quiser
  aquela mensagem de volta cria ela pela tela nova.
- `app/(app)/page.tsx` (Dashboard) — busca avisos+todos pendentes do rep,
  mostra como cards no mesmo estilo/lugar do aviso de turno vazio (entre o
  nome e o card de turno/cargo), cada um com o botão de confirmar
  correspondente ao tipo.

## Fora de escopo (YAGNI, por enquanto)

- Editar uma notificação já criada (mensagem/período) — só criar e desativar,
  mesmo padrão de "apagar e relançar" já usado em Turno Extra.
- Anexar imagem/link na notificação — só texto simples.
- Notificação recorrente/agendada pra repetir sozinha.
