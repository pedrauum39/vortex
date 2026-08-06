# Ajustes de UI: Schedule, Home, Turnos, Invoice

Data: 2026-08-06. Seis mudanças pequenas/médias, todas de UI, aprovadas em conversa antes de escrever este documento.

## 1. Calendário mensal em Schedule → "Meus turnos"

**Onde:** `app/(app)/schedule/page.tsx` (função `AbaMeus`), novo arquivo `app/(app)/schedule/meus-turnos.tsx`.

- Novo search param `mesCal` (formato `YYYY-MM`), independente do `de` (semana) já existente. Default: mês de `inicio` (a semana mostrada), se ausente.
- `AbaMeus` passa a buscar, além dos turnos da semana (já existe), as datas do mês `mesCal` em que o rep tem algum turno: `select data from shifts where rep_id=... and data between limitesDoMes(mesCal)`, virando `Set<string>`.
- Lista (existente) + calendário (novo) migram para um Client Component (`meus-turnos.tsx`, `'use client'`), porque o hover precisa de estado React. Recebe como props: turnos da semana, o `Set` de dias-com-turno do mês, o mês exibido, hrefs de navegação do mês (construídos no server, mesmo padrão do `de` da semana), `hoje`.
- Calendário: grade padrão de mês (dom→sáb, células vazias de padding no início/fim), cabeçalho com `mesLegivel(mes)` + ← → próprios (via `<Link>`, recarrega a página com `mesCal` novo — mesmo padrão de `/invoice`). Cores do tema: `bg-superficie`/`border-borda` de fundo, `text-texto-fraco` texto padrão.
- Dia com turno meu (está no `Set`): fundo `bg-accent-fraco`, texto `text-accent`.
- Dia de hoje: `ring-2 ring-accent` por cima (independente de ter turno ou não), pra não se confundir com o preenchimento de "tem turno".
- Hover num dia com turno: se a data cai dentro da semana mostrada na lista acima, todas as linhas daquele dia na lista ganham destaque (`ring-2 ring-accent` + glow, `drop-shadow` azul igual ao já usado no nome da Home). Estado local (`useState<string|null>`) guarda a data em hover; comparação simples `t.data === diaHover`.
- Dia com turno fora da semana mostrada: hover não aciona nada além do cursor — o dia já está visualmente marcado (confirmado com o usuário).
- Dia sem turno: sem interação nenhuma.

## 2. Nome da modelo em azul (Schedule + Home)

**Onde:** `app/(app)/schedule/meus-turnos.tsx` (lista, movida do antigo `AbaMeus`), `app/(app)/page.tsx`.

- Schedule: o `<span>` do nome da modelo já é isolado — troca `text-texto-fraco` → `text-accent`.
- Home, seção "Hoje" (linha ~187) e "Próximos turnos" (linha ~232): hoje o nome vem grudado no texto do turno num span só (`{turno} · {modelo}`). Separa em dois elementos: um pro turno (cor atual, `text-texto-fraco`/normal) e um só pro nome da modelo (`text-accent`), mantendo o "·" como separador visual entre eles.

## 3. Rename "Turno" → "Turnos"

**Onde:** `app/(app)/nav.tsx` (rótulo do link, rota continua `/turno`), `app/(app)/turno/page.tsx` (`<h1>`).

Troca de texto só — sem mudança de rota/URL.

## 4. Histórico mensal em `/turno`

**Onde:** `app/(app)/turno/page.tsx`, novo arquivo compartilhado `app/(app)/meta-visual.tsx`.

- Página ganha `?mes=` (formato `YYYY-MM`, default `mesAtual()`) com ← → própria (`<Link>`, mesmo padrão do `/invoice`), independente de qual turno "atual" está sendo mostrado no painel de cima.
- Busca `buscarMetasDoRep(criarClienteAdmin(), rep.id, inicioMes, fimMes, diasDoMes)` (já existe, mesma função usada na Home) e `buscarRecordeDoRep(criarClienteAdmin(), rep.id)` (recorde histórico geral, não do mês — mesma regra da Home).
- Filtra as `linhas` retornadas para `trabalhado === true` (turnos futuros sem ponto batido não aparecem na lista, confirmado com o usuário).
- Tabela abaixo do painel: colunas **Data · Turno · Modelo(s) · Meta do turno · Total feito · %**.
  - Modelo(s): `linha.paginas.join(' + ')`.
  - %: `percentualAtingido(linha.vendido, linha.metaDoTurno)` (`lib/meta.ts`, já existe). Cor por `corDaMeta()`, ícone de raio quando `temRaio()` — mesma paleta e regra da Home.
  - `linha.pendente === true`: badge "em aberto" (mesmo estilo do `/invoice`).
- Linha cujo `(data, turno)` bate com o recorde: `ring-2 ring-accent` na `<tr>` inteira + selo "Recorde"; se o `%` dessa linha também for `> 110`, um raio extra colado no selo "Recorde" (além do raio que já aparece na célula de %, que segue a regra geral de todas as linhas).
- **Refatoração de apoio:** o mapa de cor por faixa (`CORES`, hoje `const` local em `app/(app)/page.tsx`) e o `IconeRaio` (idem) saem para `app/(app)/meta-visual.tsx`, exportados. A Home passa a importar de lá em vez de manter cópia própria — evita duplicar a mesma paleta/ícone numa segunda tela.

## 5. Painel do turno (`app/(app)/turno/painel.tsx`)

- Linha 85 (`` `Bloco ${turno.bloco}` ``) → `` `Vortex ${turno.bloco}` `` (já é `'I'`/`'II'` — vira "Vortex I"/"Vortex II", mesmo formato usado em `/schedule`). **Escopo apenas deste arquivo** — os outros dois usos do mesmo texto-fallback (`app/(app)/page.tsx:36`, `app/(app)/schedule/page.tsx:150`) ficam como estão; não foram pedidos.
- Bloco "Meta do turno" (linhas 105–113) muda de uma linha única para duas:
  - `Meta do turno: {dinheiro(somaDeTodasAsMetas)}` — soma de `metasDiarias[m.id]` de todas as `modelosDaMeta` com meta > 0.
  - Linha seguinte: detalhamento por modelo, `"{nome}: {dinheiro(meta)}"` juntos com `" · "` (mesmo separador já usado em outros lugares do arquivo, ex. linha 100).

## 6. Invoice — linha do cabeçalho

**Onde:** `app/(app)/invoice/page.tsx` (linha ~71–73).

- `regra` já é buscada na página (`buscarRegraVigente`). Formata `regra.percentual[rep.cargo] * 100` como percentual em pt-BR (vírgula decimal, sem zero à direita: `6%`, `5,5%`, `4%`, `3,5%`) e insere entre cargo e valor/hora:
  `{rep.nome_curto} · {ROTULO_CARGO[rep.cargo]} · {percentual} · {dinheiro(rep.valor_hora)}/h`

## Testes e verificação

- `lib/meta.ts` já tem testes (`corDaMeta`, `temRaio`, `percentualAtingido`) — sem mudança de lógica ali, não precisa de teste novo.
- Sem lógica de negócio nova nos itens 2, 3, 5, 6 (só JSX/texto) — sem teste unitário dedicado; verificação por `npm run build` + checagem visual no browser.
- Item 1 (calendário) e item 4 (histórico) reorganizam dados já testados (`buscarMetasDoRep`, `buscarRecordeDoRep`, `AbaMeus`) sem alterar a lógica pura por trás — sem novo teste unitário; verificação visual no browser (hover, navegação de mês, linha de recorde) é o que garante o comportamento.
- Fluxo de deploy padrão do projeto (ver `workspace-vortex.md`): `npm run typecheck && npm run lint && npm test && npm run build`, depois commit + `git push origin main`, confirmar deploy `READY` no Vercel antes de reportar como pronto.
