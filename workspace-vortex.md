# Workspace do time Vortex — estado e handoff

> Documento de continuidade. Escrito para ser lido do zero em outra conversa.
> Última atualização: 02/08/2026, depois de uma sessão longa que hosteou o site (Vercel + GitHub) e adicionou metas, o sistema de Primaris, e corrigiu vários bugs achados já em produção com gente de verdade usando.

---

## Estado: hosteado e em uso real, com o time testando

Não é mais só local. O site está no ar, os reps já estão se cadastrando e batendo ponto de verdade. Se você está lendo isto numa conversa nova: **leia este arquivo inteiro antes de mexer em qualquer coisa**, principalmente "Armadilhas técnicas" — tem bug de produção real ali, já mordeu mais de uma vez.

```bash
npm run dev        # servidor local, localhost:3000
npm test            # 79 testes, todos verdes
npm run typecheck
npm run build       # roda antes de qualquer commit — pega erro que o dev não pega
npm run eval:ocr    # compara modelos de OCR contra prints reais salvos em evals/statements/
```

**Site no ar:** `https://vortex-seven-neon.vercel.app`
**Repo:** `https://github.com/pedrauum39/vortex` (branch `main` — todo push nela dispara deploy automático na Vercel)
**Projeto Vercel:** team `vortex-f5a9`, projeto `vortex` (id `prj_LoV2katWTCWSToUsfcJZiRJlsnNp`)
**Projeto Supabase:** `Vortex` (id `vbyvpjtmayavtvfhpgax`), região `sa-east-1`

`git log --oneline` tem o histórico completo, cada commit com uma mensagem longa explicando o quê e o porquê — vale ler antes de perguntar "por que isso foi feito assim".

### Conectores MCP (se disponíveis na sua sessão)

- **Supabase MCP**: `execute_sql`, `apply_migration`, `list_tables`, `get_advisors`, etc. Dá pra rodar SQL direto em produção, **inclusive DDL/migração** — diferente da sessão anterior, agora não precisa mais pedir pro usuário colar no SQL Editor manualmente (ver armadilha #4 antiga, que ficou parcialmente obsoleta por causa disso).
- **Vercel MCP**: `list_deployments`, `get_deployment_build_logs`, `get_runtime_errors`, `get_runtime_logs`. Confirma deploy e debuga produção sem precisar que o usuário abra o dashboard. **Desconecta sozinho com frequência** — erro "connection invalidated" quer dizer que o usuário precisa reconectar (às vezes precisa desconectar e reconectar de novo, um simples "reconectar" nem sempre resolve de primeira).
- **Git**: `git push origin main` funciona direto — as credenciais ficaram salvas no Windows depois que o usuário autenticou uma vez via popup do Git Credential Manager. Numa sessão nova, a primeira tentativa de push pode ficar pendurada esperando esse popup (que você não vê); se acontecer, peça pro usuário rodar o push manualmente uma vez pra reautenticar.

### Fluxo de deploy usado nesta sessão (repita esse padrão)

1. Editar código.
2. Sempre os 4, sempre antes de commitar: `npm run typecheck && npm run lint && npm test && npm run build`.
3. `git add -A && git commit -m "..." && git push origin main`.
4. Confirmar pelo Vercel MCP (`list_deployments`) que o deploy chegou a `READY` antes de dizer "pronto" pro usuário — nunca afirmar que algo está no ar sem checar.

---

## Verificado contra dados reais (não é achismo)

- **Escala**: `gerarEscala()` bate **315/315 células** contra a planilha oficial no período em que ela foi refeita pela regra (10/08–13/09/2026). Datas antes de 10/08 na planilha não devem bater (montadas à mão com outro time antes da regra existir) — esperado, não é bug.
- **Comissão**: exemplo do Pedro (GP, $100 base, com assistente → $5,40/$0,60) é teste automatizado. Também batido contra os três statements reais de 30/07.
- **OCR**: Haiku 4.5 empata com Opus 5 em 35/35 campos, 6x mais barato — é o modelo em uso (`OCR_MODEL=claude-haiku-4-5`).
- **RLS**: testado com sessão real de admin simulada via SQL direto (`set local request.jwt.claims`) nesta sessão, pra investigar o bug #11 abaixo — RLS estava (e está) correto; o bug era outro, puramente client-side.
- **Fuso T6/T1**: turno que atravessa meia-noite testado contra o banco.

---

## Decisões e features da SESSÃO DE IMPLEMENTAÇÃO INICIAL (não estavam no plano original)

O plano em si (seção "Referência: o plano original", bem no fim deste arquivo) ficou obsoleto em alguns pontos. O que mudou de verdade, na ordem em que foi descoberto:

### `papel` (A/B/C) ≠ `cargo` (Grand Primaris etc.)
São dois conceitos independentes. `papel` é a posição no rodízio da escala (decide em qual fase do ciclo de 4 dias a pessoa folga — é o que `gerarEscala()` usa). `cargo` é a patente que decide o percentual de comissão. **Não são deriváveis um do outro**: Carolinne e Gabriela são papel A mas cargo Secundus; Natasha é papel B mas cargo Knight Primaris.

`papel` continua no banco (`reps.papel`) e decide o rodízio por baixo dos panos, mas sumiu da tela de admin/reps — mostrar "papel: A" não ajudava o admin a decidir nada ali.

### Modelos viram roster por time, não um nome fixo
`models` tinha só 2 linhas, `'Vortex I'` e `'Vortex II'` — nomes de **time** (bloco), não de modelo de conteúdo. Agora `models` tem coluna `bloco` (I/II) e `ativa`, e cada time pode ter várias modelos reais no roster (`/admin/models`).

**Consequência que quebrou em silêncio na época**: o gerador de escala mapeava bloco → modelo procurando pelo NOME `'Vortex I'`/`'Vortex II'`. Quando o usuário renomeou essas linhas pra modelos reais, a busca parou de achar e 329 shifts geradas ficaram com modelo planejado nulo, sem erro nenhum aparecer. Corrigido removendo essa lógica inteira — não tem como o gerador saber sozinho qual modelo do roster é "a" do dia, isso só se sabe no clock-in (ou, desde esta sessão, no padrão do roster — ver "Sistema de METAS" abaixo).

### Double: 1 ou 2 (ou mais, desde esta sessão) modelos por turno
No clock-in o rep escolhe modelo(s) do roster do próprio time, e no fechamento aparece uma área de report **por modelo** escolhida, cada uma com seu próprio print/OCR/valores.

Schema: `shift_log_models` (shift_log_id + model_id, uma linha por modelo). `statements` tem `model_id`, unique em `(shift_log_id, model_id)` — um report por modelo, não por turno inteiro.

A base de comissão do turno é a soma dos deltas de cada modelo trabalhada (`lib/invoice.ts`, `baseDoRegular()`). Uma modelo sem statement não trava a base da outra — só marca a linha inteira como "pendente".

### Admin ignora a janela dos 15 minutos (pra iniciar)
Como admin, iniciar turno a qualquer hora, pra testar OCR e comissão sem esperar o horário certo. Desde esta sessão isso ficou menos relevante pro rep comum também — ver "Ponto nunca mais fecha sozinho" abaixo.

### `/turno` não pode assumir "meu turno de hoje = meu turno de perfil"
A tela pessoal de clock in/out calculava a data assumindo que o turno de hoje da pessoa é sempre o cadastrado no perfil dela. Isso quebra a liberdade de admin escalar alguém num turno diferente do de costume. Corrigido pra checar os três turnos possíveis e usar o que realmente tem um shift pra aquele rep hoje.

---

## Decisões e features DESTA SESSÃO (hospedagem + metas + Primaris)

### 1. Schedule/dashboard mostram o roster do time antes do clock-in
Antes do rep bater ponto, `/schedule` e a tela inicial mostram os nomes das modelos ativas do time daquele bloco (roster de `/admin/models`), em vez de "Bloco I/II". Depois do clock-in, mostra a modelo REAL trabalhada. Clock-in (real e o simulador do admin) vem com o roster inteiro pré-marcado, **sem limite de modelos** (o antigo teto de 2 pro "double" foi removido — o rep desmarca quem não fez, marca quem fez fora do padrão).

### 2. Bug do Ctrl+V no double, corrigido
O paste de print era escutado no `window` inteiro. Com duas modelos abertas, colar jogava o mesmo print nas duas. Agora cada área de print é focável (`tabIndex`) e escuta `onPaste` só nela mesma — clique na área antes de colar. Também tem um Xzinho vermelho pra apagar um print colado errado.

### 3. Admin ganhou upload de print de verdade no "simular statement"
Reaproveita `/api/ocr`. Fica em `/admin/turnos`, na linha de cada turno. (Isso fechou a "Etapa 14" que ficou pendente da sessão anterior.)

### 4. Sistema de METAS (`lib/meta.ts` + `lib/metaDb.ts`)
- `models` ganhou coluna `meta_mensal` (editável em `/admin/models`) — migração 0010.
- A meta mensal de uma página se reparte entre os 3 turnos por percentual fixo — **42% T6T1, 28% T2T3, 30% T4T5** — e depois pelos dias do mês (`metaDiariaDaPagina`).
- **Meta total** do rep = soma da meta diária de TODOS os turnos já agendados no mês (mesmo os futuros ainda não trabalhados) — é o alvo fixo do mês, não muda com quantos turnos ele já fez.
- **Meta parcial** = só os turnos já trabalhados.
- Turno futuro (sem clock-in) usa o roster do time como estimativa; turno já trabalhado usa a modelo real (`shift_log_models`).
- `/admin/reps/[id]`: tela por rep com meta total/parcial/% atingida, navegação por mês.
- Dashboard pessoal ganhou cards: % da meta (cor por faixa — abaixo de 85% vermelho, 85–99% amarelo, 100–120% verde, acima de 120% azul neon com glow; raio ⚡ acima de 110%), total vendido, turnos feitos, invoice do mês (mascarado, botão de olho pra revelar), turno recorde (maior turno de todos os tempos, sempre delta descontado do turno anterior da cadeia — nunca o acumulado bruto do print).

### 5. TODOS os invoices viraram mensais (mês calendário)
Antes era uma janela de 14 dias rolante. Agora `/invoice`, o card do dashboard e o cálculo de bônus dos primaris usam sempre o mês calendário corrente, com navegação `?mes=YYYY-MM` (mesmo padrão de `/admin/reps/[id]`).

### 6. Cadastro self-service (`/cadastro`)
Rep cria a própria conta (e-mail — pode ser fake, tipo `nome@vortex.local` — + senha) e escolhe o próprio nome numa lista dos 9 reps (+ opção "Outro"). Se o nome bate e ainda não foi reivindicado, a conta já sai vinculada sozinha (`reps.auth_user_id`), sem o admin precisar fazer nada. Campo de senha com botão de mostrar/esconder em login e cadastro.

`/admin/reps` ganhou coluna "Login" pra vincular manualmente por e-mail (com sugestão automática de e-mail sintético baseado no nome), pro caso de "Outro" ou nome já tomado.

**Ponto de atenção, decisão consciente do usuário**: não tem verificação de identidade — qualquer um que souber os nomes do time pode reivindicar o nome de outra pessoa primeiro. Usuário topou o risco pra um grupo fechado de 9 pessoas combinadas ("ta de boa, ngm vai errar o nome").

**Supabase → Authentication → "Confirm email" precisa estar DESLIGADO** pra contas com e-mail fake funcionarem (ninguém vai clicar num link de confirmação que nunca chega num inbox fake). Se um dia voltar a pedir confirmação, é essa configuração que mudou.

### 7. Sistema de PRIMARIS (`lib/primarisDb.ts`)
Aba nova `/primaris`, só acessível por `cargo IN ('grand_primaris', 'knight_primaris')` (redirect pra `/` pra quem não é). Mostra:
- Resumo de vendas por rep, por página (com % da meta), por time (Vortex I / Vortex II, somando as páginas de cada), e o total do Vortex inteiro — cada um com barra "atingido/meta X%".

O invoice dos primaris (`/invoice` e o card do dashboard, os dois) ganha uma seção extra "Bônus de liderança" ANTES da tabela de turnos, com:
- **Total sales commission**: a comissão pessoal normal (igual todo mundo).
- **Party addition**: 1,5% do que cada SECUNDUS vendeu + 2% do que cada TERTIUS vendeu, só nas páginas do time do primaris.
- **Team addition** (só Grand Primaris): 0,5% do comissionável de TODAS as páginas, os dois times.

Regras de negócio confirmadas com o usuário:
- **Grand Primaris é sempre dono do Time 1 (Vortex I), Knight Primaris do Time 2 (Vortex II)** — fixo, não depende de em qual turno o próprio GP/KP trabalha naquele dia.
- O que decide de qual time é uma venda é o **bloco da PÁGINA/MODELO trabalhada** (`models.bloco`), não do rep que trabalhou nela.
- É **dinheiro novo** — não desconta a comissão de ninguém, soma em cima e entra no "Total" do invoice (tanto na tela `/invoice` quanto no card do dashboard — os dois foram corrigidos pra somar igual).
- Party/Team addition aparecem mesmo se o PRÓPRIO primaris não bateu ponto nenhuma vez no mês — vêm do que OUTRAS pessoas venderam, não do trabalho pessoal dele. Confirmado com o usuário que isso é esperado, não é bug (aconteceu na prática: Pedro tinha $0 de comissão pessoal em agosto por não ter batido ponto, mas Party/Team addition apareciam normalmente).

### 8. Hora paga: regra nova do "saiu antes"
`horasDoTurno()` agora só reduz a hora paga da janela oficial (8h) quando o rep MARCA a caixa "saí mais cedo" ao finalizar o turno. Se ele fechar o turno sem marcar essa caixa, recebe as 8h inteiras — não importa a que horas realmente bateu saída. Turno ainda em andamento (sem clock-out) continua contando ao vivo normalmente, sem essa regra.

### 9. Ponto nunca mais fecha sozinho
`podeIniciar()` antes travava em "agora <= fim do turno". Agora só checa os 15 minutos de antecedência pra abrir — sem limite de fechamento. Um rep que esquece de bater ponto durante o turno ainda consegue registrar depois, mesmo já tendo passado da hora. Combinado com a regra #8, ele recebe certo mesmo batendo ponto tarde (desde que não marque "saí mais cedo").

### 10. Visual: logo, favicon, badge de cargo, destaque no schedule
- Logo do Vortex no header/login/cadastro e como favicon da aba (`app/icon.png`, convenção do Next). **Não recrie `app/favicon.ico`** — ele compete com o `icon.png` e o navegador tende a preferir o `.ico`.
- Tela inicial: nome do rep em azul neon (accent do site, com glow) + um cartão único com turno e cargo lado a lado — cargo com fundo metálico (dourado pros dois Primaris, prata Secundus, bronze Tertius).
- `/schedule` → Time: a célula do dia/turno em que o próprio rep logado aparece (regular ou assistant) ganha um contorno (`ring-2 ring-accent`) pra ele se achar mais fácil na grade do time inteiro.

---

## Armadilhas técnicas descobertas (pra não cair de novo)

### Da sessão de implementação inicial

1. **Arquivo `'use server'` só pode exportar função async.** `export type { Anterior }` num arquivo de Server Actions quebrou em runtime com `ReferenceError: Anterior is not defined` — só aparecia no cliente, sem erro nenhum no build/typecheck. Tipos usados por Client Components devem vir de um arquivo comum (`lib/`), nunca reexportados de um `actions.ts`.

2. **Relação com `unique` constraint volta como OBJETO, não array, no PostgREST**, quando a constraint casa exatamente com a coluna da FK. `statements` tinha `unique(shift_log_id)` (coluna única = a FK inteira) e voltava como objeto — corrigido trocando pra `unique(shift_log_id, model_id)` na migração do double, que aí sim volta como array (constraint composta, não bate exatamente com a FK). Isso já mordeu antes de virar `(shift_log_id, model_id)`; depois disso, o padrão de constraint composta com a FK como primeira coluna (`shift_log_models`, por exemplo) continuou voltando como array normalmente nos testes desta sessão — mas ao debugar algo parecido, sempre desconfie e confirme com uma query direta antes de assumir a forma do dado.

3. **Trocar o "dono" de um slot via upsert deixa registro órfão.** Se um shift já tem `shift_logs` associados e você faz upsert trocando só o `rep_id`, o `shift_id` continua o mesmo — o log antigo (do rep anterior) fica pendurado ali, associado à pessoa errada. `definirSlot()` resolve isso apagando a linha antiga e recriando, em vez de fazer update por cima.

4. **Rodar DDL no Supabase**: antigamente só dava pra colar no SQL Editor manualmente. **Isso mudou nesta sessão** — com o conector MCP do Supabase (`apply_migration`, `execute_sql`), dá pra rodar DDL direto. Se não tiver o conector disponível, ainda vale o fluxo antigo (colar manual, migração roda em transação única, seguro tentar de novo se falhar no meio).

5. **Erro de query engolido em silêncio vira "nenhum dado" na tela.** `const { data } = await supabase.from(...)...` sem checar `error` faz uma coluna inexistente (ex.: migração não rodada ainda) parecer "tabela vazia" em vez de mostrar o problema real. Já escondeu uma migração pendente uma vez.

6. **`horasDoTurno()` fica presa à janela oficial do turno por padrão** — isso é intencional, mas desde a sessão atual tem uma exceção: ver decisão #8 acima ("saiu antes").

### Desta sessão (hospedagem, produção)

7. **`useState` inicializado por prop fica PRESO ao primeiro valor se o componente não trocar de `key` entre navegações client-side.** `GradeEscala` (grid editável do admin/turnos) guardava os valores em `useState(valoresIniciais)`. Ao navegar entre semanas via `<Link>` (soft navigation do Next), o Server Component pai reexecuta e manda props novas — mas como `<GradeEscala>` fica na MESMA posição da árvore, o React reaproveita a instância e NUNCA reroda o inicializador do `useState`. Resultado: a grade ficava travada pra sempre nos valores da primeira semana que carregou naquela aba (nesse caso, antes da escala existir = tudo vazio), não importa pra onde navegasse depois — só um remount completo resolvia. Fix: `<GradeEscala key={inicio} .../>` — força remount a cada troca de período. **Qualquer componente client-side com `useState(algumaPropQueDependeDaURL)` tem esse risco.**

8. **Páginas com navegação por período (`?de=`/`?mes=`) precisam de `export const dynamic = 'force-dynamic'`.** Sem isso, o Next pode servir do cache uma versão antiga da mesma URL — uma semana/mês que estava vazio antes de gerar a escala continua parecendo vazio depois, mesmo com dado real no banco. Já está em `/cadastro`, `/schedule`, `/invoice`, `/admin/turnos`, `/admin/reps/[id]`, `/primaris`. **Qualquer página nova com navegação por período precisa do mesmo.**

9. **T6T1 no limite do MÊS contava pro mês errado.** `diaDoStatement()` (T6T1 conta pro dia seguinte) já existia pra cadeia de desconto, mas os agrupamentos POR MÊS (`invoiceDb.ts`, `metaDb.ts`, `primarisDb.ts`) filtravam pela `data` crua do turno, não pelo dia real do statement. Um T6T1 de 31/07 contava pra julho, deveria contar pra agosto. Fix: busca desde 1 dia antes do início do período, depois filtra com `diaDoStatement()` em JS, não no SQL.

10. **Loop de redirect pra quem tem sessão mas não tem rep vinculado.** Quem se cadastra em `/cadastro` (nome "Outro" ou já tomado) fica com sessão válida no Supabase mas sem `reps.auth_user_id`. O middleware manda esse usuário embora de `/login` (porque ele TEM sessão) — mas a página protegida não acha o rep e mandava de volta pro `/login` — loop infinito, `ERR_TOO_MANY_REDIRECTS`. Fix: `exigirRep()` distingue "sem sessão nenhuma" (vai pro `/login`) de "sessão sem rep vinculado" (vai pra `/aguardando`, página nova que não é redirecionada por nenhuma regra do middleware).

11. **Antes de suspeitar de RLS/banco quando uma tela mostra "vazio" com dado real existindo, teste primeiro se não é um bug de React puro no client.** Passamos um tempo bom investigando RLS pro bug #7 acima — simulei a sessão exata do admin via SQL (`set local request.jwt.claims`) e a query sempre devolveu os dados certos. RLS estava certo o tempo todo. Sinal de alerta: se a query com service role E a query simulando a sessão do usuário AMBAS devolvem dado certo, o bug não está no banco — é client-side.

12. **Next injeta `favicon.ico` E `icon.png` ao mesmo tempo se os dois arquivos existirem**, e navegadores tendem a preferir o `.ico`. Pra trocar o favicon de verdade, apague `app/favicon.ico` — não basta adicionar `app/icon.png`.

13. **PNG gerado por IA às vezes tem moldura transparente enorme em volta do conteúdo real.** A logo original era 1920×1080 com o emblema ocupando só uns 808×802 centralizados — o resto transparente (confirmado lendo o canal alfa com `sharp`: cantos com alpha 0, centro com alpha 255). Antes de usar uma logo assim, cheque o bounding box real do conteúdo e corte (`sharp().extract(...)`) antes de definir o tamanho de exibição — só aumentar `width`/`height` no `<Image>` amplia a moldura vazia junto.

---

## Modelo de dados atual (depois de 10 migrações)

```
reps            id, auth_user_id, nome_curto, nome_oficial, turno, papel, cargo,
                role, valor_hora, ativo
models          id, nome, bloco (I|II), ativa, meta_mensal   -- roster por time + meta (migração 0010)
shifts          id, data, turno, bloco, rep_id, funcao (regular|assist), origem
                -- shifts.model_id ainda existe na tabela mas está morto/sem uso;
                -- ignorar, não tentar popular de novo
shift_logs      id, shift_id, rep_id, clock_in_at, clock_out_at,
                teve_assistente, resumo, saiu_antes, motivo_saida
shift_log_models  shift_log_id, model_id            -- 1+ linhas (double, sem teto desde esta sessão)
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
| 0010 | `models` ganha `meta_mensal` |

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
- Statement da plataforma é **acumulado no dia**: T6/T1 → T2/T3 → T4/T5. O que cada um ganhou é o delta pro turno anterior da mesma modelo. O dia do statement é **UTC**, então o T6/T1 de um dia aparece no statement do dia seguinte (21h BRT já é 00h UTC do dia posterior) — **e isso vale pra agrupamento por MÊS também** (ver armadilha #9).

**Hora paga** (desde esta sessão): sempre a janela oficial do turno (8h) — só reduz se o rep marcar "saí mais cedo" ao finalizar. Ponto abre 15 min antes, nunca mais fecha sozinho.

**Meta** (`lib/meta.ts`, desde esta sessão): 42% T6T1 / 28% T2T3 / 30% T4T5 da meta mensal de cada página, dividido pelos dias do mês pra achar a meta diária.

**Bônus de Primaris** (`lib/primarisDb.ts`, desde esta sessão) — dinheiro NOVO, não descontado de ninguém:

| Quem | Ganha |
|---|---|
| Grand Primaris | comissão normal + 0,5% de TODO o comissionável da empresa (Team addition) + 1,5% do que secundus vendeu no Time 1 + 2% do que tertius vendeu no Time 1 (Party addition) |
| Knight Primaris | comissão normal + 1,5% do que secundus vendeu no Time 2 + 2% do que tertius vendeu no Time 2 (Party addition, sem Team addition) |

O que decide de qual time é uma venda é o bloco da PÁGINA (`models.bloco`), não do rep. GP é sempre dono do Time 1, KP do Time 2 — fixo.

**Os 9 reps** (turno / papel / cargo — `/admin/reps` é a fonte da verdade agora, inclusive se tem login vinculado):

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

**Janela de ponto**: abre 15 min antes do turno, **nunca mais fecha sozinho** (mudou nesta sessão — antes fechava no fim do turno oficial). Admin também ignora a janela dos 15 min pra abrir. Horas pagas ficam sempre presas ao horário oficial do turno (8h), a não ser que o rep marque "saí mais cedo".

---

## Arquivos principais

```
lib/
  escala.ts + .test.ts           gerarEscala() pura, mesclarOverrides()
  escalaDb.ts + .test.ts         resolve papel->rep_id, materializa no banco
  statement.ts + .test.ts        cadeia de delta do statement, diaDoStatement(), checagens
  statementDb.ts                 busca o statement anterior na cadeia, contra o banco (por modelo)
  comissao.ts + .test.ts         pagamentoDoSlot() — percentual + fatia do assist
  comissaoDb.ts                  busca a regra vigente
  invoice.ts + .test.ts          soma horas+comissão por slot, soma double por modelo, saiuAntes
  invoiceDb.ts                   buscarSlotsDoRep() — usado por /invoice e pelo dashboard
  turno.ts + .test.ts            janela oficial, horasDoTurno() (regra saiuAntes), podeIniciar() (sem fim)
  meta.ts + .test.ts             metaDiariaDaPagina(), calcularMetas(), corDaMeta(), temRaio()
  metaDb.ts                      buscarMetasDoRep(), buscarRecordeDoRep()
  primarisDb.ts                  buscarVendasDaEmpresa(), buscarResumoPrimaris(), buscarBonusPrimaris()
  imagem.ts                      reduzirImagem() — resize+base64, compartilhado turno/admin
  tempo.ts                       conversão UTC <-> BRT + helpers de mês (mesAtual, limitesDoMes, etc.)
  tipos.ts                       tipos do domínio (espelham os enums do Postgres)
  ocrPrompt.ts                   prompt + schema do OCR, compartilhado por rota e eval

app/api/ocr/route.ts             chama a Anthropic (modelo configurável via OCR_MODEL)
app/icon.png                     favicon — NÃO recriar app/favicon.ico junto
evals/ocr.ts                     compara modelos de OCR contra prints reais (não versionados)

app/(auth)/
  login/page.tsx                 e-mail/senha + CampoSenha (olho) + link pra /cadastro
  cadastro/                      page.tsx (server, busca os 9 reps) + formulario-cadastro.tsx
                                  (client) + actions.ts (reivindicarNome)
  aguardando/page.tsx             sessão sem rep vinculado cai aqui, não em /login (evita loop)
  campo-senha.tsx                 input de senha com botão mostrar/esconder, compartilhado

app/(app)/
  page.tsx                       dashboard: cartão nome+turno+cargo, cards de meta/invoice/recorde
  cartao-invoice.tsx              client — invoice mascarado, botão de olho
  schedule/page.tsx              "Meus turnos" + "Time" (destaque do rep logado na grade)
  turno/                         clock in/out + report double (page, painel, modal-report,
                                  report-modelo, actions)
  invoice/page.tsx                invoice mensal, seção de bônus pros primaris
  primaris/page.tsx               aba Primaris (server, gate de cargo)
  admin/
    layout.tsx                   guarda de role, nav
    reps/                        editar cargo/turno/valor_hora/nomes + coluna "Login" (vincular)
    reps/[id]/page.tsx            tela de meta por rep (mês, nav ←/→)
    models/                      roster por time, meta_mensal editável
    turnos/                      grade editável (grade-escala.tsx, key={inicio}) + lista de
                                  ponto/statement/comissão pra teste manual (playground, com
                                  upload de print de verdade)
```

---

## Pendências

- **`shifts.model_id`** ainda existe na tabela mas está morto — considerar dropar numa migração futura se ninguém for usar (baixo risco, é nullable).
- **Verificação de identidade no cadastro**: decisão consciente do usuário de não ter (ver decisão #6 desta sessão) — não é bug, mas fica registrado caso o time cresça e vire um risco de verdade.
- **Fora de escopo** (decidido desde o início): banco de scripts, pedidos de folga/troca, dicas/material de apoio, export pro template `.xlsx` oficial.

---

## Referência: o plano original (pra contexto histórico, já executado)

O texto abaixo é o plano que foi aprovado no início do projeto. As decisões de arquitetura (stack, RLS, fuso horário, edições manuais não propagam) continuam válidas e não mudaram — só a modelagem de `models`/`papel`/`cargo`/double/metas/Primaris evoluiu, como descrito acima. O deploy, que o plano original listava como "ainda não hospedado", aconteceu nesta sessão (ver topo do arquivo).

### Stack

Next.js (App Router) + TypeScript, Tailwind, Supabase (Postgres + Auth + Storage), Claude API pro OCR (`claude-haiku-4-5`), hospedado na Vercel (deploy automático a partir do GitHub).

Fuso: tudo gravado em UTC, exibido/calculado em America/Sao_Paulo. `lib/tempo.ts` é o único lugar que faz essa conversão.

### Edições manuais não propagam (garantia central, ainda válida)

A escala gerada é função pura da data (`fase = (data − 2026-08-10) mod 4`), sem estado entre dias. Overrides vivem como linhas `origem = 'manual'` com precedência sobre a linha gerada do mesmo slot (índice único em `shifts(data,turno,bloco,funcao)`, upsert com `ignoreDuplicates`). O gerador nunca sobrescreve manual.

### Fora de escopo desta fase

- Banco de scripts e mass messages
- Pedidos de folga/extra/troca de turno
- Dicas e material de apoio
- Export pro template oficial `.xlsx` (a técnica de edição direta do XML está documentada em `project.md`, seção "Armadilha técnica" — não mudou)
