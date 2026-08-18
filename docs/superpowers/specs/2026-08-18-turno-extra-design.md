# Turno Extra (redesenho do turno independente / página externa)

Data: 2026-08-18. Substitui por completo o sistema "turno independente" + "página externa" implementado na sessão de 06–12/08 (ver `docs/superpowers/specs/2026-08-08-turno-avulso-design.md`, que também fica superada). Motivo da troca: o desenho anterior enfiava a lógica de "modelo sem cadeia confiável" *dentro* do fluxo normal de clock-in/out (`report-modelo.tsx`, `linha-turno.tsx`) — uma condicional escondida que decidia, com base em `models.independente` + o turno, se pedia 1 ou 2 prints. Isso ficou confuso de usar e frágil de manter. O novo desenho isola tudo numa aba própria, com formulário fixo (sempre a mesma pergunta, nunca condicional escondida), sem tocar mais no fluxo normal de turno.

## O problema real

**Kaylin** é uma modelo do roster (Time 1, `models.bloco = 'I'`, ativa, com meta configurada), mas a cadeia automática de desconto (`buscarAnterior()`, que acha o statement do turno anterior pra subtrair) não é confiável pra ela — o motivo original que gerou o incidente de produção em 06/08. Além dela, o time às vezes reporta uma venda avulsa de uma modelo que não é de nenhum dos dois times (nunca cadastrada, nome digitado na hora).

## Visão geral do novo desenho

Uma aba nova, **"Turno Extra"**, dentro de `/turno`. Formulário único e sempre igual, fora do fluxo normal de clock-in/out (sem clock-in — é uma tela de report direto, parecida com o fechamento de turno). O rep escolhe:

1. **Dia** e **turno** (T2/T3, T4/T5 ou T6/T1) — digitados, não vêm de nenhum turno escalado.
2. **A modelo**: um dropdown com as "modelos extras" cadastradas em admin (hoje só a Kaylin) **ou** um campo de texto livre pra uma modelo que não é de nenhum time.
3. **O(s) print(s)**:
   - T6/T1: só o print de agora — é sempre o primeiro turno do dia, não tem "anterior".
   - T2/T3 e T4/T5: print (ou valor digitado) do turno anterior **+** print de agora — sempre os dois, pra qualquer uma das duas modelos (roster ou livre).

## 1. Banco de dados

**Migração 1** — `models`:
```sql
alter table models rename column independente to extra;
alter table models drop column externa;
```
`extra` continua com bloco e meta_mensal — Kaylin continua contando meta da própria página e bônus de liderança dos primaris, igual qualquer venda normal do time. `externa` some: a ideia de "página fora dos times cadastrada em admin" não existe mais — vira texto livre no formulário, sem cadastro nenhum.

**Migração 2** — `statements`:
```sql
alter table statements drop column anterior_manual;
```
Modelo `extra` nunca mais passa pelo `shift_log_models`/`statements` normal (ver seção 5) — essa coluna fica morta.

**Migração 3** — tabela nova `turnos_extra`:
```sql
create table turnos_extra (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references reps(id),
  data date not null,
  turno turno_t not null,
  model_id uuid references models(id),        -- preenchido quando é modelo do roster (ex. Kaylin)
  nome_livre text,                             -- preenchido quando é modelo de fora, sem cadastro
  net_assinaturas numeric not null default 0,
  net_gorjetas numeric not null default 0,
  net_publicacoes numeric not null default 0,
  net_mensagens numeric not null default 0,
  net_indicacoes numeric not null default 0,
  anterior jsonb,                              -- 5 linhas (LinhasNet) do turno anterior; null só quando turno = T6T1
  imagem_atual_path text,
  ocr_atual_raw jsonb,
  imagem_anterior_path text,
  ocr_anterior_raw jsonb,
  criado_em timestamptz not null default now(),
  constraint turnos_extra_modelo_check check (
    (model_id is not null and nome_livre is null) or (model_id is null and nome_livre is not null)
  )
);
```
RLS: mesmo padrão de `shifts`/`statements` — o rep só grava/lê as próprias linhas (`rep_id = auth.uid()` via join com `reps`), `pode_ver()` enxerga tudo pra admin/observador/admin_5c, `is_admin()` escreve tudo.

Sem coluna de comissão gravada: a comissão do Turno Extra é sempre calculada na leitura (invoice, primaris), com a regra vigente na data — mesmo padrão do resto do sistema (nunca fica "congelada" no momento do report).

## 2. `lib/statementDb.ts` volta a ser simples

`buscarAnterior()` perde o desvio de `models.independente` (não existe mais nenhum lugar que precise pular a cadeia dentro do fluxo normal — modelo extra nunca entra nele). `resolverAnterior()` some inteiro; os quatro lugares que hoje chamam ela (`app/(app)/turno/actions.ts`, `lib/metaDb.ts`, `lib/invoiceDb.ts`, `app/(app)/admin/turnos/page.tsx`) voltam a chamar `buscarAnterior()` direto, como era antes de 06/08.

## 3. Fluxo do rep — aba "Turno Extra"

Nova rota/aba em `/turno` (mesmo padrão de `?aba=` que `/schedule` já usa). Componente novo `app/(app)/turno/turno-extra.tsx` (form) + `app/(app)/turno/actions.ts` ganha `lancarTurnoExtra(dados)`.

Reaproveita o `CapturaPrint` (`app/(app)/turno/captura-print.tsx`, já extraído) duas vezes quando o turno não é T6T1 — "print de antes" e "print de agora" — e uma vez só quando é T6T1. Mesma trava de hoje: sem preencher o(s) print(s) obrigatório(s), o botão de enviar fica bloqueado.

Ao enviar: grava uma linha em `turnos_extra` com as 5 linhas do print atual, as 5 do anterior (ou `null` se T6T1), `model_id` OU `nome_livre` conforme o que foi escolhido, e sobe as imagens (quando vieram de upload/OCR) pro mesmo bucket `statements` já usado.

## 4. Admin

`app/(app)/admin/models/`: o toggle que hoje chama `definirIndependente` vira `definirExtra` (mesmo botão, mesmo lugar, rótulo "extra" em vez de "independente"). O toggle "externa" some inteiro — não tem mais cadastro pra modelo de fora.

`app/(app)/admin/turnos/`: ganha uma seção nova listando os lançamentos de `turnos_extra` do período (mesmo padrão de linha com "apagar" que já existe pra statement/ponto/turno) — cobre o caso de o rep errar dia, turno ou valor e precisar de correção. Sem edição de campo a campo por enquanto (YAGNI): apaga e o rep relança.

## 5. Modelo extra some do fluxo normal

Kaylin (e qualquer futura modelo `extra = true`) deixa de aparecer:
- No seletor de modelo do clock-in normal em `/turno` (`app/(app)/turno/page.tsx`, query de `models`) — filtro `.eq('extra', false)`.
- No painel de admin `/admin/turnos` (`FormPonto`, `simularPonto`) — mesmo filtro.
- No roster "planejado" do `/schedule`, no roster do dashboard (`app/(app)/page.tsx`, cards de "Hoje"/"Próximos turnos") e no fallback de `metaDb.ts` (roster do bloco antes de o turno ser trabalhado) — mesmo filtro, já que ela nunca vai ser trabalhada por ali.

Isso mata o bug original de vez: ninguém consegue mais travar um turno normal tentando bater ponto na Kaylin, porque ela simplesmente não é uma opção ali.

## 6. Comissão do Turno Extra

Função nova em `lib/comissao.ts`, `comissaoTurnoExtra(base, cargo, regra)`:
```ts
function cargoEfetivo(cargo: Cargo): Cargo {
  return cargo === 'grand_primaris' ? 'knight_primaris' : cargo;
}
```
`comissao = base * regra.percentual[cargoEfetivo(cargo)]`, onde `base = baseComissao(deltaTurno(atual, anterior))` (mesmas `lib/statement.ts` de sempre — gorjetas+publicações+mensagens, sem assinaturas/indicações). Sem hora/hora (não tem clock-in) e sem fatia de assistente (é sempre um rep só reportando).

## 7. Meta e bônus de liderança

- **Modelo extra do roster** (Kaylin): a venda conta pra meta da própria página e pro bônus de Party/Team addition dos primaris **exatamente como uma venda normal do time** — `lib/primarisDb.ts` (`buscarVendasDaEmpresa`) e `lib/metaDb.ts` (`buscarMetasDoRep`) passam a buscar também em `turnos_extra where model_id is not null`, juntando com as vendas normais antes de somar. Usa o `repCargo` de verdade do rep que reportou (não o "como Knight" — essa troca é só pra calcular a comissão *dele*, não pra decidir quem é secundus/tertius no Party addition).
- **Modelo de fora** (`nome_livre`): não entra em nenhuma dessas contas — só na comissão pessoal de quem reportou, que aparece no invoice dele.

## 8. Onde aparece

- **`/turno`**: histórico mensal ganha uma seção separada "Turnos extra" (linhas de `turnos_extra` do rep no mês, com nome da modelo — cadastrada ou livre — e o valor vendido).
- **`/invoice`**: nova linha "Turno extra" por lançamento, soma no total do mês igual comissão normal.
- **`/primaris`**: a venda da Kaylin entra nas contas de "Por página"/"Por time"/projeção normalmente, porque `buscarVendasDaEmpresa` já inclui ela.

## 9. Admin/turnos — turnos em aberto sempre visíveis (feature separada, mesma leva)

Hoje `/admin/turnos` lista todos os turnos da semana de uma vez (até ~84 linhas), sem filtro — difícil achar os quebrados. Passa a separar em dois grupos:

- **"Precisam de atenção"** (sempre visível): turno com `shift_logs` existente mas `clock_out_at` nulo (iniciado e não fechado), OU sem `shift_logs` nenhum e `data` já passou (nunca foi aberto).
- **"Turnos concluídos"**: o resto — atrás de uma seta, começa fechado, expande ao clicar.

Implementação: `app/(app)/admin/turnos/page.tsx` classifica cada `LinhaShift` em `aberta: boolean` (função pura, testável: `precisaAtencao(shift, hoje)`); componente cliente novo (`lista-turnos.tsx`) recebe as duas listas já separadas e controla o `useState` de expandir/recolher a segunda. Zero mudança na lógica de comissão/ponto/statement já existente — é só reorganização visual da mesma tabela.

## Testes

- `comissaoTurnoExtra()` / `cargoEfetivo()`: unitário — Grand Primaris recebe a taxa de Knight, os outros cargos recebem a própria.
- `buscarVendasDaEmpresa()`/`buscarMetasDoRep()`: unitário ou de integração leve — uma linha de `turnos_extra` com `model_id` preenchido soma junto das vendas normais; uma com `nome_livre` não entra em nenhuma meta/bônus.
- `precisaAtencao()`: unitário — as três combinações (sem log + data passada, log sem clock_out, log fechado) retornam o booleano certo.
- Sem teste de UI automatizado (não existe no projeto) — verificação visual no browser: aba Turno Extra aparece/funciona, Kaylin some do clock-in normal, admin/turnos separa os dois grupos.

## Decisões confirmadas

- Turno Extra é sempre ad-hoc — nunca precisa de um `shifts` escalado; o rep digita dia e turno na hora.
- T6/T1 nunca pede o print anterior (é sempre o primeiro turno do dia); T2/T3 e T4/T5 sempre pedem os dois, pra roster e pra texto livre igual.
- Modelo extra do roster conta meta + bônus de liderança normalmente; modelo de fora só conta comissão pessoal.
- Grand Primaris que reportar um Turno Extra recebe na taxa de Knight Primaris, não na própria.
- Nenhuma comissão fica congelada na gravação — sempre recalculada com a regra vigente na data, como o resto do sistema.
- `models.independente`/`externa` e `statements.anterior_manual` somem; `resolverAnterior()` some; `buscarAnterior()` volta a ser chamado direto em todo lugar.
- Sem trava de duplicata em `turnos_extra` (nenhum `unique` de rep+data+turno+modelo) — se o rep lançar duas vezes por engano, o admin apaga a errada na tela nova de correção (seção 4). Mantém o formulário simples, sem mensagem de erro alarmante pra um caso raro.
