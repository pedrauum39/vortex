# Turno avulso

Data: 2026-08-08. Aprovado em conversa depois de várias rodadas de perguntas — ver o histórico da sessão pro raciocínio completo. Resumo do problema real por trás do pedido: **Kaylin** é uma modelo do roster (Time 1, `models.bloco = 'I'`, ativa, com meta configurada), mas o time nem sempre trabalha nela — às vezes um "buffer" (alguém de fora do sistema, de outro pool da empresa) cobre a página. Quando isso acontece, ninguém do time bate ponto nela naquele turno, então **nenhum statement é registrado** — e se o admin tentar lançar um depois, a busca automática de "turno anterior" (`buscarAnterior()`) vai achar a última vez que um REP DO TIME trabalhou nela, que pode ser dias atrás, somando o delta de vários turnos do buffer como se fosse um só. Errado.

## O que é "turno avulso"

Não é um tipo de registro novo — é uma **flag por statement** (não por turno inteiro). Marca que, pra esse statement específico, o "turno anterior" não pode vir da busca automática (porque quem trabalhou antes não foi um rep do time), então quem está lançando digita ou sobe o print anterior na mão. Esse valor manual vale **só pra esse statement** — não vira elo permanente da cadeia; o statement de verdade que vier depois continua descontando do jeito automático de sempre.

Junto vem uma segunda flag independente, **"é página do time"**: decide se esse delta específico entra na conta de Party/Team addition dos primaris. Se marcado (padrão), conta pro bônus igual uma venda normal da página. Se desmarcado, só conta pra comissão pessoal de quem lançou — não infla o bônus do Grand/Knight Primaris. Isso vale mesmo pra modelos que já têm bloco definido (como a Kaylin) — a flag do statement manda, não o bloco do roster.

## 1. Banco de dados

Migração nova: `statements` ganha duas colunas nullable —
- `anterior_manual jsonb` — as 5 linhas net (`assinaturas, gorjetas, publicacoes, mensagens, indicacoes`), mesmo formato de `LinhasNet`. `null` = fluxo normal (busca automática).
- `pagina_do_time boolean` — só é lido quando `anterior_manual` não é nulo. `null`/statements normais não usam esse campo.

## 2. Resolução do delta

`lib/statementDb.ts` ganha uma função nova, `resolverAnterior(db, turno, data, modeloId, anteriorManual)`: se `anteriorManual` vier preenchido, devolve `{ tipo: 'ok', linhas: anteriorManual }` direto, sem tocar no banco; senão, delega pro `buscarAnterior()` que já existe (intocado). Os três lugares que hoje chamam `buscarAnterior()` diretamente passam a chamar `resolverAnterior()`, passando o `anterior_manual` do statement em questão (já vem no `select` de cada consulta):
- `app/(app)/turno/actions.ts` (`statementAnterior`, usado pelo preview do `ReportModelo` — aqui o valor vem do estado do formulário no cliente, ainda sem statement salvo)
- `lib/metaDb.ts` (`vendidoDoTurno`)
- `lib/invoiceDb.ts` (`montarModelos`)

## 3. UI — captura de print vira componente compartilhado

Hoje `ReportModelo` (`app/(app)/turno/report-modelo.tsx`) já tem toda a lógica de upload/colar/arrastar + OCR + edição manual das 5 linhas — só que só pro print de AGORA. Extraio essa parte pra um componente `CapturaPrint` reutilizável (upload, preview, OCR, campos editáveis, soma confere), usado duas vezes dentro do `ReportModelo` quando "turno avulso" está marcado: uma pro print de agora (como já é hoje) e outra pro print anterior (novo).

**`/turno` (fechamento do próprio rep, `ReportModelo`):**
- Checkbox "Turno avulso". Marcando, aparece o `CapturaPrint` extra pro anterior, mais o checkbox "É página do time" (vem marcado por padrão).
- Sem marcar nenhum valor no `CapturaPrint` do anterior (nem digitado, nem por OCR), o botão de finalizar turno fica bloqueado pra esse modelo — mensagem clara pedindo pra preencher.
- O preview de "base de comissão" passa a usar o anterior manual em vez do automático assim que ele é preenchido.

**`/admin/turnos` (`FormStatement`, dentro de `linha-turno.tsx`):**
- Mesmos dois campos (checkbox "Turno avulso" abrindo o `CapturaPrint` do anterior + "É página do time"), no formulário que já existe pra "simular statement"/"+ modelo". Mesma trava de não salvar sem preencher o anterior quando avulso está marcado.

## 4. Bônus dos primaris

`lib/primarisDb.ts` (`buscarVendasDaEmpresa` ou onde a soma por bloco acontece hoje): pra cada delta, se o statement tem `anterior_manual` preenchido E `pagina_do_time === false`, esse delta é excluído da soma de Party/Team addition. Em qualquer outro caso (normal, ou avulso com `pagina_do_time === true`), o comportamento não muda — continua pelo `models.bloco`, como hoje.

## Testes

- `resolverAnterior()`: unitário — devolve o manual quando presente, delega pro automático quando não.
- Exclusão do bônus: unitário no cálculo de Party/Team addition — um delta com `pagina_do_time = false` não deve aparecer na soma.
- Sem teste de UI automatizado (não existe no projeto) — verificação visual no browser (mesma ressalva de sempre: não dá pra logar como rep real pra testar de ponta a ponta; confere pelo menos que os campos aparecem/desaparecem certo e que build/typecheck passam).

## Decisões confirmadas

- Anterior manual vale só pro statement em questão, nunca vira elo da cadeia.
- Cobre tanto modelos fora do roster quanto modelos do roster (como a Kaylin) — a flag manda, não o bloco.
- Sem preencher o anterior com "turno avulso" marcado, o salvamento fica bloqueado (não assume zero silenciosamente).
- "É página do time" vem marcado por padrão ao ligar "turno avulso".
