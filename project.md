# Escala de trabalho — time Vortex

Visão geral do processo de montagem e envio da escala semanal do time.

## Objetivo

Manter a escala 3x1 do time (trabalha 3 dias, folga 1) em uma planilha de trabalho interna e, a partir dela, preencher o template oficial da empresa que é enviado a cada duas semanas.

## Arquivos

| Arquivo | Papel |
|---|---|
| `schedule by claude.xlsx` | Planilha de trabalho interna. Uma aba por semana. É aqui que a escala é montada e conferida. |
| `schedule para ser enviado.xlsx` | Template oficial da empresa, com verificação de dados. É o que sai pra fora. Preenchido **a partir** da planilha de trabalho. |
| `CLAUDE.md` | Diretrizes de comportamento pro assistente. |
| `.claude/settings.local.json` | Permissões pré-aprovadas de ferramentas. |

---

## 1. Planilha de trabalho (`schedule by claude.xlsx`)

Uma aba por semana, nomeada `DDMM - DDMM`, sempre de segunda a domingo. Exemplo: a aba `1008 - 1608` é a semana de segunda 10/08 até domingo 16/08.

Cada aba tem dois blocos, um por modelo:

| | Bloco de cima | Bloco de baixo |
|---|---|---|
| Título | `A2` | `A9` |
| Datas | linha 3 | linha 10 (fórmula `=B$3`) |
| Cargos | linha 4 | linha 11 |
| **T2/T3** | linha **5** | linha **12** |
| **T4/T5** | linha **6** | linha **13** |
| **T6/T1** | linha **7** | linha **14** |

Colunas, de segunda a domingo:

- **Promotor:** `B D F H J L N`
- **Assistant:** `C E G I K M O`

A área `Q:U` é a tabela ADMIN TIME, que conta turnos por pessoa via `COUNTIF`.

### Regras de preenchimento

1. Cada pessoa fica **no seu turno**. Quem é T6/T1 só entra em linha de T6/T1.
2. Ninguém trabalha nos **dois blocos no mesmo dia** — são modelos diferentes, simultâneos.
3. **Só tertius pode ocupar o campo Assistant.**

### Observações sobre o arquivo

- As **cores de fonte são posicionais**, não por pessoa. A mesma célula tem sempre a mesma cor, independente de quem está nela. Não vale a pena tentar manter cor coerente com o nome.
- A célula `S8` (turnos do Oliver Melo) está com o valor `5` digitado à mão em vez da fórmula `COUNTIF` que as outras linhas têm, em todas as abas. Fica desatualizada sozinha.

---

## 2. O modelo da escala 3x1

A escala é um **ciclo de 4 dias**. Cada turno tem 3 pessoas, cada uma folgando em uma fase diferente do ciclo. Na quarta fase ninguém folga, e o tertius vai pro campo Assistant.

Isso garante 3x1 exato pra todo mundo, **sem quebra na virada de semana** — que é justamente onde a escala costumava quebrar quando montada na mão.

```
fase = (data − 10/08/2026) em dias, módulo 4
```

Papéis por turno. **A** = titular do bloco de cima, **B** = segundo secundus, **C** = tertius:

| Turno | A | B | C | folga A | folga B | folga C | todos trabalham |
|---|---|---|---|---|---|---|---|
| T2/T3 | Carolinne P. | Léo Grimaldi | Oliver Melo | fase 1 | fase 0 | fase 2 | fase 3 |
| T4/T5 | Gabriela Storini | Ignacio Canelo | Carlos de Lucca | fase 0 | fase 3 | fase 2 | fase 1 |
| T6/T1 | Pedro Ribeiro | Natasha Tem Tem | Diogo Ciesielski | fase 3 | fase 0 | fase 2 | fase 1 |

O tertius folga na fase 2 nos três turnos.

Alocação de cada dia:

| Situação | Bloco de cima | Bloco de baixo |
|---|---|---|
| fase = folga de **A** | B | C |
| fase = folga de **B** | A | C |
| fase = folga de **C** | A | B |
| fase = todos trabalham | A + Assistant **C** | B |

### Como conferir

O teste que pega erro é olhar a sequência contínua de cada pessoa atravessando semanas. O padrão tem que ser `WWW.` repetindo sem interrupção — três dias de trabalho, um de folga. Qualquer sequência de 4 trabalhados ou de 2 folgas seguidas é erro.

> Este modelo foi extraído da semana 10/08–16/08/2026, que estava correta. Regenerando aquela semana pela regra, o resultado sai idêntico célula a célula. As semanas de 17/08 até 13/09/2026 foram refeitas por ele.

---

## 3. Template oficial (`schedule para ser enviado.xlsx`)

Duas abas: `Semana1` e `Semana2`. O preenchimento acontece **só na seção Team Schedule**.

| Nossa planilha | Template oficial | REGULAR | ASSIST |
|---|---|---|---|
| Bloco de cima, T2/T3 (linha 5) | Vortex I | linha 46 | linha 47 |
| Bloco de cima, T4/T5 (linha 6) | Vortex I | linha 48 | linha 49 |
| Bloco de cima, T6/T1 (linha 7) | Vortex I | linha 50 | linha 51 |
| Bloco de baixo, T2/T3 (linha 12) | Vortex II | linha 55 | linha 56 |
| Bloco de baixo, T4/T5 (linha 13) | Vortex II | linha 57 | linha 58 |
| Bloco de baixo, T6/T1 (linha 14) | Vortex II | linha 59 | linha 60 |

- **Colunas dos dias:** `F H J L N P R` (segunda a domingo)
- **Cabeçalhos de data:** linhas `45, 54, 63, 72, 78, 90, 105, 117, 126, 135`
- Nosso **Promotor** = campo **REGULAR**. Nosso **Assistant** = campo **ASSIST**.

Não preencher DayOff, Vortex III, Buffers, Skylar ou ADM sem pedido explícito.

Os rótulos de modelo em `B46` e `B55` **devem ser ignorados** — trocam com frequência e não servem pra guiar o mapeamento.

Os horários `Hour_in` / `Hour_out` já vêm definidos no template (T2-T3 = 05:00–13:00, T4-T5 = 13:00–21:00, T6-T1 = 21:00–05:00) e não são alterados.

### Mapa de nomes

A planilha de trabalho usa nome curto. O template oficial exige o **nome completo exato** da lista de verificação de dados — coluna `AH`, faixa `AH2:AH1473`, cabeçalho "SOCIAL NAME".

| Planilha de trabalho | Nome oficial |
|---|---|
| Carolinne P. | Carolinne Pacheco Campos |
| Léo Grimaldi | Léo Victor Grimaldi de Castro |
| Oliver Melo | Oliver Barroso Melo |
| Gabriela Storini | Gabriela Jacó Storini |
| Ignacio Canelo | Ignacio Canelo |
| Carlos de Lucca | Carlos Antônio de Lucca Vicente |
| Pedro Ribeiro | Pedro Ribeiro da Silva Neto |
| Natasha Tem Tem | Natasha Tem Tem |
| Diogo Ciesielski | Diogo Ciesielski |

**Cuidado com os homônimos da lista.** São pessoas diferentes e fáceis de confundir:

- *Bruno* Grimaldi de Castro
- *Guilherme* de Lucca Vicente
- *José Otávio* de Melo
- *Poliana* Tem Tem Cardozo
- *José Diogo* Moss Domingues Cascon Martins

A lista tem cerca de 294 nomes e pode mudar. **Sempre validar contra o arquivo antes de gravar**, em vez de confiar nesta tabela. Nome que não bate exatamente deixa o campo inválido no template.

---

## 4. Armadilha técnica: não gravar o template oficial com openpyxl

Ler com openpyxl é seguro. **Gravar não.**

O openpyxl não edita o `.xlsx` — ele reescreve o pacote inteiro e descarta o que não sabe representar. Numa gravação, isso apagou `xl/drawings/drawing1.xml`, `xl/drawings/drawing2.xml` e `xl/persons/person.xml`, encolheu o `xl/workbook.xml` de 870 para 385 bytes e removeu os vínculos de desenho das duas abas.

O agravante: uma verificação que compara **valores de células** dá "nenhuma diferença" e não detecta nada disso. O arquivo parece íntegro e não está.

**Como gravar corretamente:** abrir o `.xlsx` como zip, alterar só `xl/worksheets/sheet1.xml` e `sheet2.xml` na célula alvo, e regravar copiando as outras partes byte a byte.

- Célula vazia no XML: `<c r="F46" s="74"/>`
- Com texto: `<c r="F46" s="74" t="s"><v>IDX</v></c>`, onde `IDX` é o índice no `sharedStrings.xml`
- Os nomes dos reps já existem no `sharedStrings` (estão na coluna AH), então esse arquivo não precisa ser alterado
- Datas são serial numérico com época 1899-12-30, no formato `<v>46251.0</v>`

**Verificar sempre comparando as partes do zip**, não só os valores: contar as partes, listar quais mudaram — só as duas abas devem mudar — e confirmar que nenhuma sumiu.

---

## Estado atual

- Escala montada e conferida até **13/09/2026**.
- Template oficial preenchido com **Semana1 = 17/08–23/08** e **Semana2 = 24/08–30/08**.
- A planilha de trabalho está com marcas `*` nas células alteradas na última revisão, para conferência. **Enquanto as marcas existirem, os contadores da tabela ADMIN TIME ficam abaixo do real**, porque o sufixo `*` quebra a correspondência exata do `COUNTIF`. Remover as marcas quando a conferência terminar.
