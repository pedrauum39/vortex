# Workspace do time Vortex — estado e handoff

> Documento de continuidade. Escrito para ser lido do zero em outra conversa.
> Última atualização: 05/08/2026, depois de mais uma sessão longa em cima do site já no ar: cover como reps sintéticos, acesso de "observador" (Thomas, OM), metas visíveis no clock-in e no /primaris, fluxo de fechamento do assistente simplificado, e três bugs reais de produção achados e corrigidos (métricas pessoais zeradas por causa de RLS, turno T6T1 preso sem como fechar, gerador de escala podendo escalar um cover sozinho).

---

## Estado: hosteado e em uso real, com o time testando

Não é mais só local. O site está no ar, os reps já estão se cadastrando e batendo ponto de verdade — inclusive gente de fora do time (observador) já foi adicionada. Se você está lendo isto numa conversa nova: **leia este arquivo inteiro antes de mexer em qualquer coisa**, principalmente "Armadilhas técnicas" — tem bug de produção real ali, já mordeu mais de uma vez.

```bash
npm run dev        # servidor local, localhost:3000
npm test            # 80 testes, todos verdes
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

- **Escala**: `gerarEscala()` bate **315/315 células** contra a planilha oficial no período em que ela foi refeita pela regra (10/08–13/09/2026). Datas antes de 10/08 na planilha não devem bater (montadas à mão com outro time antes da regra existir) — esperado, não é bug. Desde a sessão de 05/08, a escala já está materializada até **30/09/2026** (435 turnos no total no banco).
- **Comissão**: exemplo do Pedro (GP, $100 base, com assistente → $5,40/$0,60) é teste automatizado. Também batido contra os três statements reais de 30/07.
- **OCR**: Haiku 4.5 empata com Opus 5 em 35/35 campos, 6x mais barato — é o modelo em uso (`OCR_MODEL=claude-haiku-4-5`).
- **RLS**: testado com sessão real de admin simulada via SQL direto (`set local request.jwt.claims`) em duas sessões diferentes — uma pra investigar o bug #11 (client-side puro, RLS estava certo) e outra pra CONFIRMAR um bug real de RLS (armadilha #15, sessão da Carolinne via `set local request.jwt.claims` provando que ela não enxergava o statement de outro rep).
- **Fuso T6/T1**: turno que atravessa meia-noite testado contra o banco, e o bug do turno preso (armadilha #16) foi confirmado contra dados reais — o T6T1 de 04/08 do Pedro e do Diogo, ambos com `clock_out_at` nulo.

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

## Decisões e features da SESSÃO DE 05/08 (cover, observador, bugs de produção)

Sessão em cima do site já no ar, com o time realmente usando. Boa parte foi corrigir coisa que só aparece com uso real (turno duplicado no mesmo dia, T6T1 preso, métricas zeradas). Na ordem:

### 11. Turno duplicado no mesmo dia (mesmo rep, dois turnos)
Passou a acontecer de verdade: admin escala alguém num turno EXTRA além do de costume no mesmo dia (ex.: T6T1 além do T2T3 de sempre). Isso quebrou dois lugares que assumiam "no máximo um turno por dia por rep": o card "Hoje" da dashboard (`turnos.find()` só achava o primeiro, escondia o resto — virou `.filter()`) e o `/turno` (mesmo problema, mais grave: como os 3 turnos oficiais cobrem o dia inteiro sem sobrepor horário, `dataDoTurnoAtual()` considera quase todos os turnos do dia como "atuais" o dia inteiro, então o rep podia nem conseguir alcançar o turno extra pra bater ponto — agora mostra um seletor quando há mais de um candidato).

### 12. Clock-in permite modelo de outro time
O rep só via o roster do PRÓPRIO time no checkbox de "modelo trabalhada" — sem como marcar se cobriu uma modelo de outro time. Corrigido em dois lugares: `/turno` (clock-in real) e "simular ponto" no admin — os dois agora mostram o roster do time (pré-marcado, igual antes) mais uma seção "outro time" (desmarcada, pra adicionar). A comissão/bônus já tratava isso certo por baixo dos panos (quem decide o time é o `bloco` da MODELO, não do rep nem do turno agendado) — só faltava a UI deixar escolher.

Junto: "+ modelo" na coluna de statements do admin/turnos, pra adicionar uma modelo que faltou ao ponto sem precisar reabrir "editar ponto" e mexer nos horários de novo.

### 13. Cover — refeito do zero no meio da sessão
**Primeira tentativa** (abandonada): coluna `shifts.cover_cargo`, o admin escolhia "Cover Tertius/Secundus/Primaris" pra um rep JÁ escalado, e a comissão usava esse cargo em vez do real. Errado: cover é usado quando **ninguém do time pode fazer o turno**, então não tem rep pra escolher, e o próprio usuário confirmou que não precisa nem calcular o pagamento do cover — só a parte que vai pro bônus dos primaris.

**Segunda tentativa** (a que ficou): **3 reps sintéticos** — "Cover Tertius", "Cover Secundus", "Cover Primaris" (`ativo=false`, `valor_hora=0`, cargo correspondente à taxa: tertius 3,5%, secundus 4%, o "Primaris" usa a taxa do Knight Primaris 5,5%). Aparecem no MESMO seletor de reps de sempre (a query de reps nunca filtrou por `ativo`), então o admin só escolhe "Cover X" como se fosse um rep normal, na grade ou no formulário. Zero coluna nova, zero lógica extra em invoiceDb/primarisDb — `reps.cargo` já é suficiente, e o bônus de Party/Team addition já soma a venda deles automaticamente pela taxa certa. Ficam de fora do "porRep" de `/primaris` (que filtra `ativo=true`), então não poluem o ranking de gente de verdade — mas a VENDA deles ainda conta pro total do time/página normalmente.

**Armadilha própria disso** — ver #17 abaixo: os 3 covers têm `turno`/`papel` só de enfeite (pra satisfazer a constraint NOT NULL da tabela), e isso quase corrompeu o gerador de escala.

### 14. Observador (Thomas, OM) — acesso de acompanhamento sem editar nada
Pedido: alguém de fora do time (Thomas, "OM") precisa ver `/admin`, `/schedule` e `/primaris` pra acompanhar o time, mas **sem poder editar nada**. Não existia esse meio-termo — só tinha "admin" (edita tudo) ou "rep comum" (só o próprio).

Solução, nova coluna `reps.observador boolean` (migração 0014):
- **Banco**: `pode_ver()` é o irmão só-leitura de `is_admin()` (`role='admin' OR cargo primaris OR observador`), usado só nas políticas de **SELECT** de `reps`/`shifts`/`shift_logs`/`statements`. As políticas de INSERT/UPDATE/DELETE continuam presas só a `is_admin()` — observador nunca ganha bypass de escrita no RLS.
- **App**: `lib/auth.ts:podeVerAdmin()` = `ehAdmin() OU observador`, usado só nos gates de VISUALIZAÇÃO (`admin/layout.tsx`, a nav, o gate de `/primaris`). `ehAdmin()` sozinho continua travando toda ação de escrita (os 3 `exigirAdmin()` de admin/turnos, admin/models, admin/reps) — observador nunca passa nele.
- Cada tela do admin ganhou um `podeEditar` (= `ehAdmin(rep)`) calculado no Server Component e passado pros client components: a grade da escala vira texto simples por célula sem `podeEditar` (sem select, sem "Salvar alterações"), os formulários de criar turno/modelo somem, e os botões de editar/apagar/simular em turnos/reps/models somem.
- `/primaris` já era 100% leitura (só tabelas e barras de progresso) — só precisou abrir o gate de acesso pra observador também.

Thomas foi criado como uma linha em `reps` (`ativo=false`, `observador=true`) — o app **não cria contas nem mexe em senha** (política de sempre), então falta o usuário vincular o login dele (self-signup em `/cadastro`, que já lista "Thomas" já que a query nunca filtrou `ativo`, ou vínculo manual em `/admin/reps`).

### 15. Metas ficaram visíveis no clock-in e no /primaris
- `/turno`: cada checkbox de modelo mostra "· meta $X" (a meta diária daquela página NESSE turno — `metaDiariaDaPagina()`, já existia em `lib/meta.ts`). Tem também uma linha fixa "Meta do turno" logo no topo do painel, **sempre visível** (antes só aparecia dentro da lista de checkbox, que sumia assim que o rep batia ponto) — antes de bater ponto reflete quem tá marcado, depois reflete quem foi de fato trabalhado, e continua ali até depois do turno fechado.
- `/primaris` → tabela "Por rep": ganhou colunas "Meta" e "% atingida", usando **meta parcial** (só os turnos já trabalhados no mês — mesma conta do card pessoal do dashboard, pra dar uma ideia de ritmo mesmo com o mês não fechado). Reaproveita o mesmo array de vendas que já era buscado pra "vendido no mês", sem refazer a busca de turnos/statements pra cada rep — só precisou o `VendaDeModelo` ganhar o campo `turno` (faltava pra calcular a meta diária de cada venda).

### 16. Assistente: fechamento simplificado + "teve assistente" pré-marcado
Assistente não reporta modelo própria — a comissão dele é sempre uma fatia (10%) da comissão do REGULAR, nunca depende de um statement próprio. Mas o modal de fechar turno pedia print/statement dele igual a qualquer regular, o que nunca fez sentido. Agora `ModalReport` tem um modo `assist`: esconde a grade de report por modelo (só um aviso explicando o motivo) e o checkbox "teve assistente" (que só faz sentido pro REGULAR, nunca pro próprio assistente sobre o próprio turno) — só sobra resumo + saiu antes + confirmar.

Separadamente: quando o REGULAR fecha o próprio turno, se já existe alguém escalado E de fato trabalhando (com log aberto) no papel de assistente daquele mesmo slot, a caixinha "teve assistente" já vem PRÉ-marcada. **Detalhe**: esse campo (`shift_logs.teve_assistente`) é só informativo — a comissão/bônus nunca leu esse campo em lugar nenhum, ela sempre deriva "teve assistente" olhando se existe de fato um `shift_log` no papel assist pro mesmo slot (ver `invoiceDb.ts`/`admin/turnos/page.tsx`/`primarisDb.ts`). Não mude essa premissa sem checar os três lugares.

### 17. Admin liberado pros primaris também
Grand/Knight Primaris passaram a administrar o time igual a `role='admin'` — mesma mecânica de duas camadas da decisão #14 (`ehAdmin()` no app + `is_admin()` no banco, migração 0013), sem reps sintéticos envolvidos aqui.

### 18. Aviso de turno vazio pros primaris
Dashboard, entre o nome e o bloco de turno/cargo, só pros primaris: lista turnos REGULARES sem ninguém escalado, de hoje em diante — "Turno do dia X, turno X (Time N) está vazio, procure cover". Só considera datas que JÁ têm algum turno materializado (não confunde "vazio porque foi limpo" com "vazio porque a escala ainda nem chegou lá").

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

### Da sessão de 05/08 (bugs de produção com uso real)

14. **RLS: a mesma função que decide "quem vê tudo" também decide "quem edita tudo" — se for adicionar um nível de acesso só-leitura, não reuse `is_admin()` direto.** Ao criar o observador (decisão #14 acima), a primeira armadilha em potencial era só adicionar `observador` dentro de `is_admin()` — isso resolveria a visibilidade, mas também destravaria TODAS as políticas de INSERT/UPDATE/DELETE que checam `is_admin()`, dando ao observador escrita de verdade no banco (mesmo que a UI escondesse os botões). Resolvido criando uma função irmã (`pode_ver()`) usada só nas políticas de SELECT, mantendo `is_admin()` intocado nas de escrita — as duas camadas (RLS e app) continuam concordando sobre quem edita.

15. **Bug de produção real: métricas pessoais (% meta, total vendido, turno recorde) zeradas pra praticamente todo mundo.** `buscarMetasDoRep()`/`buscarRecordeDoRep()` usam `buscarAnterior()` por baixo dos panos pra pegar o statement do TURNO ANTERIOR na cadeia de desconto — que quase sempre pertence a OUTRO rep, já que a escala roda entre pessoas diferentes. `lib/statementDb.ts` já documentava que `buscarAnterior()` espera um cliente ADMIN por causa disso ("o turno anterior pode ser de outro rep"), e `invoiceDb.ts`/`primarisDb.ts`/`admin/turnos/page.tsx` já seguiam essa regra — só a dashboard pessoal (`app/(app)/page.tsx`) passava a sessão comum do próprio rep. A RLS bloqueava a leitura do statement alheio (corretamente!), o delta sempre caía como "pendente" e contava zero, **mesmo com o print do próprio rep certinho**. Confirmado simulando a sessão real da Carolinne via SQL (`set local request.jwt.claims`): a linha existia no banco, a sessão dela via zero linhas. Fix: trocar pro cliente admin nessas duas chamadas específicas — o filtro por `rep_id` já vem explícito no argumento da função, então cada um só vê o próprio resultado final, só a cadeia de desconto por baixo enxerga certo. **Lição geral: sempre que uma função precisar ler dado de OUTRA entidade pra calcular o resultado de UMA entidade, ela precisa do cliente admin — não existe RLS que dê pra isso sem abrir mão da própria garantia de "cada um só vê o seu".**

16. **Turno que atravessa meia-noite (T6T1) podia ficar preso, sem como fechar, depois que a janela oficial passava.** `dataDoTurnoAtual('T6T1')` vira "hoje" (a data do T6T1 que começa HOJE à noite) assim que o relógio passa das 5h da manhã (fim da janela oficial) — isso é intencional, é o que abre o PRÓXIMO T6T1 pra iniciar. O bug: a tela de `/turno` usava essa MESMA data pra filtrar TODOS os candidatos, inclusive um turno de ONTEM ainda aberto (rep esqueceu de bater saída, ou só não fechou ainda) — que sumia da lista assim que passava das 5h, sobrando só o turno de hoje à noite (ainda nem começado) pra "iniciar turno". Sem como alcançar o turno de verdade que precisava ser fechado. Confirmado no banco: exatamente esse caso, o T6T1 de 04/08 do Pedro e do Diogo, os dois com `clock_out_at` nulo. Fix: busca em paralelo os turnos "pra iniciar" (filtro de data de sempre) E qualquer turno com ponto aberto, **sem filtro de data nenhum** (`shift_logs!inner(...)` + `.is('shift_logs.clock_out_at', null)`) — um turno só pode ficar aberto por engano, não importa há quanto tempo. Sem escolha explícita na URL, prioriza o que está em andamento sobre o próximo ainda não começado. **Lição geral: "qual data representa 'agora' pra esse turno" e "quais turnos esse rep ainda precisa fechar" são duas perguntas DIFERENTES — não dá pra responder as duas com o mesmo filtro de data.**

17. **Rep sintético (`ativo=false`) pode corromper o gerador de escala se o `(turno, papel)` dele colidir com o de um rep de verdade.** `slotsParaLinhas()` (o gerador) resolve rep por `turno+papel` sem checar `ativo`. Os 3 reps sintéticos de cover (decisão #13) precisam de ALGUM `turno`/`papel` pra satisfazer a constraint NOT NULL da tabela — e um deles (`T2T3`/`C`) coincidia exatamente com o do Oliver. Sem filtro, dependendo da ordem que o banco devolvesse as linhas do `select * from reps`, o Map de resolução podia sobrescrever o Oliver pelo "Cover Tertius", e o gerador passaria a escalar o cover SOZINHO — o que nunca pode acontecer (cover só entra se o admin escolher manualmente). Fix: `slotsParaLinhas()` só considera reps `ativo=true` na resolução. **Sempre que criar um rep/entidade placeholder pra satisfazer uma constraint, cheque se algum código resolve por uma combinação de campos que o placeholder também preenche "só de enfeite" — ele pode ganhar de um registro de verdade sem ninguém perceber.**

18. **Filtrar por uma coluna de relação aninhada no PostgREST/Supabase precisa de `!inner` explícito.** `.select('shift_logs(clock_out_at, ...)').is('shift_logs.clock_out_at', null)` sem `!inner` no embed não restringe de forma confiável a quem TEM um `shift_log` — o embed por padrão é um left join, e o filtro na coluna aninhada fica ambíguo. Com `shift_logs!inner(...)` no select, vira inner join de verdade e o `.is(...)` filtra certo. Usado na armadilha #16 pra achar "qualquer turno com ponto aberto, de qualquer data".

19. **Erro de banco propagado por `throw new Error(error.message)` numa Server Action pode virar só um "digest" sem explicação nenhuma pro usuário, em produção.** Bateu a constraint `shift_logs_saida_ordenada` (saída antes da entrada, ao simular ponto num T6T1 com os campos de data em branco) e o cliente só recebeu "An error occurred... digest: ...", sem a mensagem real. A mensagem verdadeira só apareceu nos **runtime logs do Vercel** (`get_runtime_errors`/`get_runtime_logs`), nunca no browser. **Sempre que um erro chegar redigido/genérico assim, puxe os logs do Vercel antes de adivinhar — não dá pra debugar só pelo que o usuário vê na tela.** Depois de achado, o fix ficou em duas camadas: pré-preencher os campos com a janela oficial do turno (evita o erro na maioria dos casos) e validar `saída >= entrada` no servidor ANTES de tentar gravar, com mensagem clara.

---

## Modelo de dados atual (depois de 14 migrações)

```
reps            id, auth_user_id, nome_curto, nome_oficial, turno, papel, cargo,
                role, valor_hora, ativo, observador
                -- observador: acompanha admin/schedule/primaris sem editar
                -- nada (migração 0014) — ver decisão #14 e armadilha #14.
                -- Além dos 9 reps de verdade, a tabela também tem 3 reps
                -- sintéticos de cover ("Cover Tertius/Secundus/Primaris",
                -- ativo=false) e o Thomas (observador=true, ativo=false) —
                -- ver "Reps que NÃO são os 9 do time" abaixo.
models          id, nome, bloco (I|II), ativa, meta_mensal   -- roster por time + meta (migração 0010)
shifts          id, data, turno, bloco, rep_id, funcao (regular|assist), origem
                -- shifts.model_id ainda existe na tabela mas está morto/sem uso;
                -- ignorar, não tentar popular de novo
                -- shifts.cover_cargo EXISTIU (migração 0011) e foi REVERTIDO
                -- na 0012 — não recriar, cover agora é um rep sintético.
shift_logs      id, shift_id, rep_id, clock_in_at, clock_out_at,
                teve_assistente, resumo, saiu_antes, motivo_saida
                -- teve_assistente é só informativo — a comissão nunca lê essa
                -- coluna, sempre deriva olhando se existe de fato um
                -- shift_log no papel assist do mesmo slot (ver decisão #16).
shift_log_models  shift_log_id, model_id            -- 1+ linhas (double, sem teto desde esta sessão)
statements      id, shift_log_id, model_id, imagem_path, ocr_raw,
                net_total, net_{assinaturas,gorjetas,publicacoes,mensagens,indicacoes},
                corrigido_manualmente, refund_confirmado
                -- unique(shift_log_id, model_id): um report por modelo
commission_rules  id, vigente_desde, regra (jsonb: percentual por cargo + fatia_assistente)
```

`escala_time` (view, security definer) expõe `data, turno, bloco, funcao, origem, rep_nome, modelos_nome` pra qualquer rep autenticado — é o que a aba "Time" do schedule lê. `modelos_nome` vem de `shift_log_models` (modelo REAL trabalhada), não de um planejamento.

`is_admin()` (SQL, security definer) = `role='admin' OR cargo in (grand_primaris, knight_primaris)` — usada em TODA política de RLS, tanto SELECT quanto INSERT/UPDATE/DELETE. `pode_ver()` (desde a migração 0014) = `is_admin() OR observador` — usada só nas políticas de SELECT de reps/shifts/shift_logs/statements, nunca nas de escrita (ver armadilha #14).

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
| 0011 | `shifts.cover_cargo` — **revertida na 0012**, não existe mais |
| 0012 | Reverte a 0011; cria os 3 reps sintéticos de cover (ativo=false) |
| 0013 | `is_admin()` passa a incluir cargo primaris (GP/KP administram igual admin) |
| 0014 | `reps.observador` + `pode_ver()` (RLS só-leitura) + insere o Thomas |

### Reps que NÃO são os 9 do time

Além da tabela "Os 9 reps" mais abaixo, a tabela `reps` tem hoje mais 4 linhas que **não são gente da escala normal** — todas `ativo=false`, então ficam fora do gerador de escala e do ranking "porRep" de `/primaris`, mas aparecem normalmente no seletor de reps do admin (essa query nunca filtrou por `ativo`):

| Nome | cargo | observador | Pra que serve |
|---|---|---|---|
| Cover Tertius | tertius | não | Cobrir turno quando ninguém do time pode, pagando taxa de tertius (3,5%) |
| Cover Secundus | secundus | não | Idem, taxa de secundus (4%) |
| Cover Primaris | knight_primaris | não | Idem, taxa de Knight Primaris (5,5%) — não existe "cover grand_primaris" |
| Thomas (OM) | tertius (irrelevante) | **sim** | Acompanha admin/schedule/primaris sem editar nada — não faz parte do time |

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
- Assistente **não tem comissão própria**: leva 10% da comissão do rep que assistiu, **saindo dela** (90/10). Total pago pelo slot é igual com ou sem assistente — só muda a divisão. Por isso o assistente **não reporta modelo/statement próprio** ao fechar o turno — só confirma o fechamento (ver decisão #16).
- Base de comissão = net do turno **sem assinaturas nem indicações** (só gorjetas + publicações + mensagens).
- Statement da plataforma é **acumulado no dia**: T6/T1 → T2/T3 → T4/T5. O que cada um ganhou é o delta pro turno anterior da mesma modelo. O dia do statement é **UTC**, então o T6/T1 de um dia aparece no statement do dia seguinte (21h BRT já é 00h UTC do dia posterior) — **e isso vale pra agrupamento por MÊS também** (ver armadilha #9).

**Hora paga** (desde esta sessão): sempre a janela oficial do turno (8h) — só reduz se o rep marcar "saí mais cedo" ao finalizar. Ponto abre 15 min antes, nunca mais fecha sozinho.

**Meta** (`lib/meta.ts`, desde esta sessão): 42% T6T1 / 28% T2T3 / 30% T4T5 da meta mensal de cada página, dividido pelos dias do mês pra achar a meta diária.

**Bônus de Primaris** (`lib/primarisDb.ts`, desde esta sessão) — dinheiro NOVO, não descontado de ninguém:

| Quem | Ganha |
|---|---|
| Grand Primaris | comissão normal + 0,5% de TODO o comissionável da empresa (Team addition) + 1,5% do que secundus vendeu no Time 1 + 2% do que tertius vendeu no Time 1 (Party addition) |
| Knight Primaris | comissão normal + 1,5% do que secundus vendeu no Time 2 + 2% do que tertius vendeu no Time 2 (Party addition, sem Team addition) |

O que decide de qual time é uma venda é o bloco da PÁGINA (`models.bloco`), não do rep. GP é sempre dono do Time 1, KP do Time 2 — fixo. Isso vale IGUAL pra venda feita por um dos 3 reps sintéticos de "Cover" (decisão #13) — o `repCargo` deles (tertius/secundus/knight_primaris) já entra certinho nessa conta sem nenhum código extra.

**Cover** (desde a sessão de 05/08): quando ninguém do time pode fazer o turno, o admin escala um dos 3 reps sintéticos ("Cover Tertius", "Cover Secundus", "Cover Primaris") no lugar de uma pessoa de verdade — aparecem no mesmo seletor de reps de sempre. Pagam comissão pela taxa do cargo escolhido, mas ninguém realmente recebe esse dinheiro (são `ativo=false`, sem login, sem dono) — o que importa de verdade é a venda contar certo pro bônus de Party/Team addition dos primaris. Ver decisão #13 e armadilha #17 (não deixe o `turno`/`papel` deles colidir com o de um rep real).

**Observador** (desde a sessão de 05/08): acesso de acompanhamento (vê admin/schedule/primaris) sem poder editar nada — pra gente de fora do time, tipo o Thomas (OM). `reps.observador = true`. Ver decisão #14 e armadilha #14.

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
  auth.ts                        exigirRep(), ehAdmin() (admin/primaris), podeVerAdmin()
                                  (+ observador — só gates de visualização, nunca de escrita)
  escala.ts + .test.ts           gerarEscala() pura, mesclarOverrides()
  escalaDb.ts + .test.ts         resolve papel->rep_id (só ativo=true — armadilha #17),
                                  materializa no banco
  statement.ts + .test.ts        cadeia de delta do statement, diaDoStatement(), checagens
  statementDb.ts                 busca o statement anterior na cadeia, contra o banco (por modelo)
  comissao.ts + .test.ts         pagamentoDoSlot() — percentual + fatia do assist
  comissaoDb.ts                  busca a regra vigente
  invoice.ts + .test.ts          soma horas+comissão por slot, soma double por modelo, saiuAntes
  invoiceDb.ts                   buscarSlotsDoRep() — usado por /invoice e pelo dashboard
  turno.ts + .test.ts            janela oficial, horasDoTurno() (regra saiuAntes), podeIniciar() (sem fim)
  meta.ts + .test.ts             metaDiariaDaPagina(), calcularMetas(), corDaMeta(), temRaio()
  metaDb.ts                      buscarMetasDoRep(), buscarRecordeDoRep() — sempre com cliente
                                  admin, nunca com a sessão do próprio rep (armadilha #15)
  primarisDb.ts                  buscarVendasDaEmpresa() (com turno, pra meta por venda),
                                  buscarResumoPrimaris() (porRep já com meta/%), buscarBonusPrimaris()
  imagem.ts                      reduzirImagem() — resize+base64, compartilhado turno/admin
  tempo.ts                       conversão UTC <-> BRT + helpers de mês (mesAtual, limitesDoMes, etc.)
  tipos.ts                       tipos do domínio (espelham os enums do Postgres)
  ocrPrompt.ts                   prompt + schema do OCR, compartilhado por rota e eval

app/api/ocr/route.ts             chama a Anthropic (modelo configurável via OCR_MODEL)
app/icon.png                     favicon — NÃO recriar app/favicon.ico junto
evals/ocr.ts                     compara modelos de OCR contra prints reais (não versionados)

app/(auth)/
  login/page.tsx                 e-mail/senha + CampoSenha (olho) + link pra /cadastro
  cadastro/                      page.tsx (server, busca TODOS os reps, sem filtro de ativo —
                                  por isso o Thomas já aparece pra se auto-cadastrar) +
                                  formulario-cadastro.tsx (client) + actions.ts (reivindicarNome)
  aguardando/page.tsx             sessão sem rep vinculado cai aqui, não em /login (evita loop)
  campo-senha.tsx                 input de senha com botão mostrar/esconder, compartilhado

app/(app)/
  layout.tsx                     header com logo+nome linkando pra "/", nav (admin= podeVerAdmin())
  page.tsx                       dashboard: cartão nome+turno+cargo, aviso de turno vazio pros
                                  primaris (buscarTurnosVazios), cards de meta/invoice/recorde
                                  (com cliente admin — armadilha #15)
  cartao-invoice.tsx              client — invoice mascarado, botão de olho
  schedule/page.tsx              "Meus turnos" + "Time" (destaque do rep logado na grade)
  turno/                         clock in/out + report double
    page.tsx                     resolve o turno atual — busca em paralelo "pra iniciar" (data
                                  bate com hoje) E "em aberto" (log sem clock_out_at, sem filtro
                                  de data — armadilha #16); calcula meta diária por modelo e se
                                  o slot tem assistente de verdade trabalhando (temAssistente)
    painel.tsx                   linha fixa de "Meta do turno" sempre visível; passa
                                  assist/temAssistente pro ModalReport
    modal-report.tsx             modo assist: sem grade de report, sem checkbox "teve
                                  assistente" — só resumo + saiu antes + confirmar
    report-modelo.tsx, actions.ts
  invoice/page.tsx                invoice mensal, seção de bônus pros primaris
  primaris/page.tsx               aba Primaris (gate: cargo primaris OU observador); tabela
                                  "Por rep" com Meta e % atingida
  admin/
    layout.tsx                   guarda: podeVerAdmin() (admin/primaris/observador VEEM;
                                  ehAdmin() sozinho continua travando toda escrita)
    admin-nav.tsx                sub-nav Turnos/Reps/Modelos
    reps/                        editar cargo/turno/valor_hora/nomes + coluna "Login" (vincular)
                                  — podeEditar (=ehAdmin()) esconde o botão "editar" e os
                                  controles de vincular/desvincular login pro observador
    reps/[id]/page.tsx            tela de meta por rep (mês, nav ←/→) — só leitura, sem gate extra
    models/                      roster por time, meta_mensal editável — podeEditar esconde
                                  renomear/desativar/apagar e o formulário de criar
    turnos/                      grade editável (grade-escala.tsx, key={inicio}, podeEditar
                                  vira texto simples sem select nem "Salvar alterações") +
                                  lista de ponto/statement/comissão pra teste manual
                                  (linha-turno.tsx, podeEditar esconde editar/apagar/simular)
```

---

## Pendências

- **`shifts.model_id`** ainda existe na tabela mas está morto — considerar dropar numa migração futura se ninguém for usar (baixo risco, é nullable).
- **Verificação de identidade no cadastro**: decisão consciente do usuário de não ter (ver decisão #6 da sessão inicial) — não é bug, mas fica registrado caso o time cresça e vire um risco de verdade.
- **Login do Thomas (observador)**: a linha em `reps` já existe (`observador=true`), mas ninguém vinculou o login ainda — falta o Thomas se auto-cadastrar em `/cadastro` (já aparece na lista) ou o admin vincular manualmente em `/admin/reps`. Não faço isso por conta própria — política de sempre, não criar conta nem mexer em senha.
- **`shift_logs.teve_assistente`** é só informativo (ver decisão #16 / armadilha na coluna) — nunca é lido pra calcular comissão ou bônus. Se um dia precisar que ele influencie algum cálculo, os 3 lugares que hoje derivam "teve assistente" olhando o shift_log de verdade (`invoiceDb.ts`, `admin/turnos/page.tsx`, `primarisDb.ts`) precisam ser revistos juntos, não só um.
- **`/admin/reps`** ainda lista os 3 reps sintéticos de cover + o Thomas junto com os 9 de verdade (a query nunca filtrou `ativo`) — cosmético, sem função ali, mas se algum dia incomodar dá pra filtrar `ativo=true` nessa tela específica sem afetar nada mais (ela é só visual, não trava lógica).
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
