# Workspace do time Vortex — estado e handoff

> Documento de continuidade. Escrito para ser lido do zero em outra conversa.
> Última atualização: 01/08/2026, depois da sessão que implementou o núcleo inteiro.

---

## Estado: o núcleo está implementado e verificado contra dados reais

Não é mais plano — é código rodando, testado e commitado. As 8 etapas do plano original foram feitas; falta só uma peça de conforto no admin (etapa 14, ver "Pendências"). Se você está lendo isto numa conversa nova: **leia este arquivo inteiro antes de mexer em qualquer coisa**, principalmente a seção de armadilhas técnicas — são bugs reais que já morderam uma vez.

```bash
npm run dev        # servidor local, localhost:3000
npm test            # 64 testes, todos verdes
npm run typecheck
npm run eval:ocr    # compara modelos de OCR contra prints reais salvos em evals/statements/
```

`git log --oneline` tem o histórico completo, cada commit com uma mensagem longa explicando o quê e o porquê — vale ler antes de perguntar "por que isso foi feito assim".

---

## Verificado contra dados reais (não é achismo)

- **Escala**: `gerarEscala()` bate **315/315 células** contra a planilha oficial no período em que ela foi refeita pela regra (10/08–13/09/2026). Datas antes de 10/08 na planilha **não devem bater** — foram montadas à mão com outro time (tem até um nome, "Joao P. Caetano", que não existe no roster atual). Isso é esperado, não é bug.
- **Comissão**: o exemplo dado pelo usuário (GP com $100 de base e assistente → $5,40 pro GP, $0,60 pro assist) é um teste automatizado que passa. Verificado também com os três statements reais de 30/07 batendo contra conta manual.
- **OCR**: comparei Opus 5 vs Haiku 4.5 contra 7 prints reais (`npm run eval:ocr`) — os dois acertaram 35/35 campos. Haiku é 6x mais barato e 2x mais rápido, então é o modelo em uso (`OCR_MODEL=claude-haiku-4-5` no `.env.local`).
- **RLS**: testado com sessão real (magic link, sem senha) — rep comum vê 1 de 2 shifts e 1 de 9 reps; admin vê tudo.
- **Fuso T6/T1**: turno que atravessa meia-noite testado contra o banco — entrada 21:30 BRT / saída 04:45 BRT grava certo em UTC e volta certo na tela.

---

## Decisões tomadas que NÃO estavam no plano original

O plano em si (seção "Ordem de execução" mais abaixo) ficou obsoleto em alguns pontos. O que mudou de verdade, na ordem em que foi descoberto:

### `papel` (A/B/C) ≠ `cargo` (Grand Primaris etc.)
São dois conceitos independentes. `papel` é a posição no rodízio da escala (decide em qual fase do ciclo de 4 dias a pessoa folga — é o que `gerarEscala()` usa). `cargo` é a patente que decide o percentual de comissão. **Não são deriváveis um do outro**: Carolinne e Gabriela são papel A mas cargo Secundus; Natasha é papel B mas cargo Knight Primaris. Os cargos reais vieram da tabela ADMIN TIME da planilha (coluna R), não de um chute — errei 3 de 9 na primeira tentativa antes de checar a planilha.

`papel` continua no banco (`reps.papel`) e decide o rodízio por baixo dos panos, mas **sumiu da tela de admin/reps** — mostrar "papel: A" não ajudava o admin a decidir nada ali.

### Modelos viram roster por time, não um nome fixo
`models` tinha só 2 linhas, `'Vortex I'` e `'Vortex II'` — mas isso eram nomes de **time** (bloco), não de modelo de conteúdo. Agora `models` tem coluna `bloco` (I/II) e `ativa`, e cada time pode ter várias modelos reais no roster (`/admin/models`, agrupado por time, com botão de adicionar).

**Consequência que quebrou em silêncio**: o gerador de escala (`lib/escalaDb.ts`) mapeava bloco → modelo procurando pelo NOME `'Vortex I'`/`'Vortex II'`. Quando o usuário renomeou essas linhas pra modelos reais, a busca parou de achar e **329 shifts geradas ficaram com modelo planejado nulo**, sem erro nenhum aparecer. Corrigido removendo essa lógica inteira — não tem como o gerador saber sozinho qual modelo do roster é "a" do dia, isso só se sabe no clock-in.

### Double: 1 ou 2 modelos por turno
Pedido do usuário: no clock in o rep escolhe 1 ou 2 modelos (double) do roster do próprio time, e no fechamento aparece uma área de report **por modelo** escolhida, cada uma com seu próprio print/OCR/valores.

Mudança de schema: `shift_logs.model_id_real` (campo único) foi trocado por `shift_log_models` (tabela, shift_log_id + model_id, até 2 linhas). `statements` ganhou `model_id` e o unique passou de `(shift_log_id)` para `(shift_log_id, model_id)` — um report por modelo, não por turno inteiro.

A base de comissão do turno é a **soma dos deltas de cada modelo trabalhada** (`lib/invoice.ts`, `baseDoRegular()`). Uma modelo sem statement ainda não trava a base da outra — só marca a linha inteira como "pendente". `pagamentoDoSlot()` (o cálculo de comissão em si) não mudou nada, só passou a receber um número diferente.

### Admin ignora a janela de 15 minutos
Pedido explícito: como admin, iniciar/finalizar turno a qualquer hora, pra testar OCR e comissão sem esperar o horário certo. `rep.role === 'admin'` pula a checagem de `podeIniciar()`.

### `/schedule` e `/admin/turnos`: uma semana por vez, texto maior
Era duas semanas (14 dias) por tela. Trocado pra 7 dias, navegação de 7 em 7, fonte maior na grade do time.

### `/admin/turnos` ganhou uma grade editável (estilo planilha Excel)
Além da lista antiga (pra testar ponto/statement/comissão turno a turno), agora tem uma tabela no topo: uma linha por turno + Assistant, uma coluna por dia, cada célula é um `<select>` com o time inteiro. Trocar o valor grava na hora (`definirSlot()` em `admin/turnos/actions.ts`). Essa grade dá liberdade total de escalar qualquer rep em qualquer turno/horário, inclusive diferente do turno de "casa" dele — o que revelou o próximo bug.

### `/turno` não pode assumir "meu turno de hoje = meu turno de perfil"
A tela pessoal de clock in/out calculava a data usando `dataDoTurnoAtual(rep.turno)` — ou seja, assumia que o turno de hoje da pessoa é sempre o turno cadastrado no perfil dela. Isso quebra a liberdade de admin escalar alguém (inclusive a si mesmo) num turno diferente do de costume: o shift existia no banco mas nunca aparecia nessa tela. Corrigido pra checar os três turnos possíveis e usar o que realmente tem um shift pra aquele rep hoje.

---

## Armadilhas técnicas descobertas (pra não cair de novo)

1. **Arquivo `'use server'` só pode exportar função async.** `export type { Anterior }` num arquivo de Server Actions quebrou em runtime com `ReferenceError: Anterior is not defined` — só aparecia no cliente, sem erro nenhum no build/typecheck. Tipos usados por Client Components devem vir de um arquivo comum (`lib/`), nunca reexportados de um `actions.ts`.

2. **Relação com `unique` constraint volta como OBJETO, não array, no PostgREST.** `statements` tem `unique(shift_log_id, model_id)` — o Supabase detecta isso e devolve `shift_logs.statements` como objeto único em vez de lista, mesmo a sintaxe de select parecendo pedir uma lista. Tratar como array (`statements[0]`) sempre dá `undefined`. Já mordeu duas vezes nesta sessão.

3. **Trocar o "dono" de um slot via upsert deixa registro órfão.** Se um shift já tem `shift_logs` associados e você faz upsert trocando só o `rep_id`, o `shift_id` continua o mesmo — o log antigo (do rep anterior) fica pendurado ali, associado à pessoa errada. `definirSlot()` resolve isso apagando a linha antiga e recriando, em vez de fazer update por cima.

4. **Claude não consegue rodar DDL no Supabase.** Só a API REST (data plane) é acessível por código — `CREATE TABLE`, `ALTER TABLE`, `CREATE VIEW` etc. só rodam colando no SQL Editor do dashboard, manualmente, pelo usuário. Toda migração desta sessão seguiu esse fluxo. Migrações rodam em transação única — se falhar no meio, tudo volta atrás sozinho, então é seguro tentar de novo depois de corrigir.

5. **Erro de query engolido em silêncio vira "nenhum dado" na tela.** `const { data } = await supabase.from(...)...` sem checar `error` faz uma coluna inexistente (ex.: migração não rodada ainda) parecer "tabela vazia" em vez de mostrar o problema real. Isso já escondeu uma migração pendente uma vez — agora `schedule/page.tsx` loga o erro do `escala_time` no console do servidor.

6. **`horasDoTurno()` está sempre presa à janela oficial do turno**, não ao horário que a pessoa bateu ponto — entrar adiantado ou sair atrasado não muda a hora paga. Isso é intencional (pedido do usuário), não um bug a "corrigir" se parecer estranho.

---

## Modelo de dados atual (depois de 9 migrações)

```
reps            id, auth_user_id, nome_curto, nome_oficial, turno, papel, cargo,
                role, valor_hora, ativo
models          id, nome, bloco (I|II), ativa      -- roster por time
shifts          id, data, turno, bloco, rep_id, funcao (regular|assist), origem
                -- shifts.model_id ainda existe na tabela mas está morto/sem uso;
                -- ignorar, não tentar popular de novo
shift_logs      id, shift_id, rep_id, clock_in_at, clock_out_at,
                teve_assistente, resumo, saiu_antes, motivo_saida
shift_log_models  shift_log_id, model_id            -- 1 ou 2 linhas (double)
statements      id, shift_log_id, model_id, imagem_path, ocr_raw,
                net_total, net_{assinaturas,gorjetas,publicacoes,mensagens,indicacoes},
                corrigido_manualmente, refund_confirmado
                -- unique(shift_log_id, model_id): um report por modelo
commission_rules  id, vigente_desde, regra (jsonb: percentual por cargo + fatia_assistente)
```

`escala_time` (view, security definer) expõe `data, turno, bloco, funcao, origem, rep_nome, modelos_nome` pra qualquer rep autenticado — é o que a aba "Time" do schedule lê. `modelos_nome` vem de `shift_log_models` (modelo REAL trabalhada), não de um planejamento.

Lista das migrações, em ordem — todas já rodadas no Supabase de produção deste projeto:

| # | O que faz |
|---|---|
| 0001 | Schema base: reps, models, shifts, shift_logs, statements, commission_rules |
| 0002 | RLS de tudo + a view `escala_time` |
| 0003 | Bucket de storage `statements` (prints) |
| 0004 | Seed dos 9 reps (turno + papel) |
| 0005 | Statement ganha as 5 linhas separadas (era um valor único) + refund_confirmado |
| 0006 | Coluna `cargo` nos reps (dados reais da planilha) + regra de comissão |
| 0007 | `models` ganha `bloco` + `ativa` (vira roster) |
| 0008 | `shift_log_models` (double) + `statements.model_id` |
| 0009 | `escala_time` passa a expor modelo real trabalhada, não planejada |

---

## Regras de negócio confirmadas pelo usuário

**Comissão** (`lib/comissao.ts`, `REGRA_PADRAO`):

| Cargo | % sobre a base |
|---|---|
| Grand Primaris | 6% |
| Knight Primaris | 5,5% |
| Secundus | 4% |
| Tertius | 3,5% |

- Todo mundo ganha **$2/hora** (`reps.valor_hora`).
- Assistente **não tem comissão própria**: leva 10% da comissão do rep que assistiu, **saindo dela** (90/10). Total pago pelo slot é igual com ou sem assistente — só muda a divisão.
- Base de comissão = net do turno **sem assinaturas nem indicações** (só gorjetas + publicações + mensagens).
- Statement da plataforma é **acumulado no dia**: T6/T1 → T2/T3 → T4/T5. O que cada um ganhou é o delta pro turno anterior da mesma modelo. O dia do statement é **UTC**, então o T6/T1 de um dia aparece no statement do dia seguinte (21h BRT já é 00h UTC do dia posterior).

**Os 9 reps** (turno / papel / cargo — ver `project.md` pra mais contexto):

| Nome | Turno | Papel | Cargo |
|---|---|---|---|
| Pedro Ribeiro (admin) | T6/T1 | A | Grand Primaris |
| Natasha Tem Tem | T6/T1 | B | Knight Primaris |
| Diogo Ciesielski | T6/T1 | C | Tertius |
| Carolinne P. | T2/T3 | A | Secundus |
| Léo Grimaldi | T2/T3 | B | Secundus |
| Oliver Melo | T2/T3 | C | Tertius |
| Gabriela Storini | T4/T5 | A | Secundus |
| Ignacio Canelo | T4/T5 | B | Secundus |
| Carlos de Lucca | T4/T5 | C | Tertius |

**Janela de ponto**: abre 15 min antes do turno, fecha quando o turno oficial termina (rep comum). Admin ignora essa janela. Horas pagas ficam sempre presas ao horário oficial do turno, nunca ao horário real batido.

---

## Arquivos principais

```
lib/
  escala.ts + escala.test.ts     gerarEscala() pura, mesclarOverrides() — 17 testes
  escalaDb.ts + .test.ts         resolve papel->rep_id, materializa no banco
  statement.ts + .test.ts        cadeia de delta do statement, checagens (soma, refund) — 36 testes
  statementDb.ts                 busca o statement anterior na cadeia, contra o banco (por modelo)
  comissao.ts + .test.ts         pagamentoDoSlot() — percentual + fatia do assist
  comissaoDb.ts                  busca a regra vigente
  invoice.ts + .test.ts          soma horas+comissão por slot, soma double por modelo
  turno.ts + .test.ts            janela oficial, horasDoTurno(), podeIniciar()
  tempo.ts                       conversão UTC <-> BRT, uma função por operação
  tipos.ts                       tipos do domínio (espelham os enums do Postgres)
  ocrPrompt.ts                   prompt + schema do OCR, compartilhado por rota e eval

app/api/ocr/route.ts             chama a Anthropic (modelo configurável via OCR_MODEL)
evals/ocr.ts                     compara modelos de OCR contra prints reais (não versionados)

app/(app)/
  page.tsx                       dashboard pessoal
  schedule/page.tsx              "Meus turnos" + "Time" (grade, 1 semana)
  turno/                         clock in/out + report double (page, painel, modal-report,
                                  report-modelo, actions)
  invoice/                       invoice em tempo real (page, dados.ts)
  admin/
    layout.tsx                   guarda de role, nav
    reps/                        editar cargo/turno/valor_hora/nomes (sem papel na tela)
    models/                      roster por time, criar/renomear/desativar/apagar
    turnos/                      grade editável (grade-escala.tsx) + lista de
                                  ponto/statement/comissão pra teste manual (playground)
```

---

## Pendências

- **Etapa 14** (única do núcleo ainda não feita): no `/admin/turnos`, o "simular statement" só aceita digitar valores na mão. Falta a opção de **subir um print de verdade** (reaproveitando `/api/ocr`) pra testar o fluxo completo de OCR sem precisar ser a pessoa do turno.
- **Fora de escopo** (decidido desde o início, ver seção original abaixo): banco de scripts, pedidos de folga/troca, dicas/material de apoio, export pro template `.xlsx` oficial.
- **`shifts.model_id`** ainda existe na tabela mas está morto — considerar dropar numa migração futura se ninguém for usar (baixo risco, é nullable).

---

## Referência: o plano original (pra contexto histórico, já executado)

O texto abaixo é o plano que foi aprovado no início do projeto. As decisões de arquitetura (stack, RLS, fuso horário, edições manuais não propagam) continuam válidas e não mudaram — só a modelagem de `models`/`papel`/`cargo`/double evoluiu, como descrito acima.

### Stack

Next.js (App Router) + TypeScript, Tailwind, Supabase (Postgres + Auth + Storage), Claude API pro OCR (hoje `claude-haiku-4-5`, ver seção de verificação acima), deploy pensado pra Vercel (**ainda não hospedado** — rodando só local por decisão do usuário).

Fuso: tudo gravado em UTC, exibido/calculado em America/Sao_Paulo. `lib/tempo.ts` é o único lugar que faz essa conversão.

### Edições manuais não propagam (garantia central, ainda válida)

A escala gerada é função pura da data (`fase = (data − 2026-08-10) mod 4`), sem estado entre dias. Overrides vivem como linhas `origem = 'manual'` com precedência sobre a linha gerada do mesmo slot (índice único em `shifts(data,turno,bloco,funcao)`, upsert com `ignoreDuplicates`). O gerador nunca sobrescreve manual.

### Fora de escopo desta fase

- Banco de scripts e mass messages
- Pedidos de folga/extra/troca de turno
- Dicas e material de apoio
- Export pro template oficial `.xlsx` (a técnica de edição direta do XML está documentada em `project.md`, seção "Armadilha técnica" — não mudou)
