# Workspace do time Vortex — planejamento e handoff

> Documento de continuidade. Plano aprovado, implementação ainda não iniciada.
> Última atualização: 31/07/2026.

---

## Estado atual

**Nada foi implementado ainda.** O plano abaixo está aprovado e é para ser executado como está.

**Bloqueio único:** o **Node.js não está instalado** nesta máquina. Sem ele não é possível criar o projeto Next.js, rodar os testes nem subir o servidor local. `winget` está disponível — a instalação é `winget install OpenJS.NodeJS.LTS`. Foi perguntado ao usuário se podia instalar e ele **não autorizou ainda**; pergunte de novo antes de instalar qualquer coisa.

O que dá para adiantar sem Node: as migrações SQL do Supabase (schema + políticas RLS) são arquivos de texto puro.

---

## Contexto

Hoje o time Vortex é administrado por planilhas Excel (`schedule by claude.xlsx` e o template oficial `schedule para ser enviado.xlsx`). A escala é montada por uma regra determinística de ciclo 4 dias documentada em [project.md](project.md), mas tudo que acontece **depois** da escala — presença nos turnos, vendas do turno, comissão, horas, invoice — não existe em lugar nenhum. É trabalho manual, disperso, e o rep não tem visibilidade do próprio desempenho.

O objetivo é um site multiusuário onde cada rep entra com login próprio, vê só os dados dele, dá clock in/out no turno que o schedule diz que é dele, envia o print do statement no fim do turno, e acompanha o salário sendo formado em tempo real. O admin enxerga o time inteiro.

### Decisões já tomadas

Estas foram respondidas pelo usuário e **não devem ser reabertas**:

| Pergunta | Decisão |
|---|---|
| Onde roda? | **Online, todos os reps acessam** (não é local, não é só admin) |
| Fonte da verdade do schedule? | **O site gera pela regra 3x1**; a planilha vira só export |
| Como o valor de vendas entra? | **OCR lê o print automaticamente** — pré-preenche os campos, **o rep confirma ou corrige antes de enviar** |
| Existe admin? | **Sim, admin com visão total** |

Sobre o OCR: foi registrada a ressalva de que print cortado/borrado/layout novo vai errar. O usuário optou por OCR mesmo assim, e concordou com o desenho de pré-preencher + confirmar. Não relitigar.

### Escopo desta fase

O núcleo é `login → schedule → clock in/report → invoice`. É um fluxo contínuo e é onde está o valor. O banco de scripts é uma ilha independente e entra depois. Pedidos (folga/extra/troca) e material de apoio ficam para depois, conforme o usuário já sinalizou.

### Premissa pendente

As **regras de comissão e o valor/hora** vão ser informados pelo usuário quando o site estiver funcional. O sistema deve ser construído com essas regras **configuráveis pelo admin**, com valores placeholder até lá. Nada do resto depende disso.

### Referência visual

O usuário mandou um print de um dashboard existente como base de layout (cards de missões ativas, métricas de performance, streak, schedule, radar de stats). Quer o **mesmo espírito**, com duas diferenças: **cor azul claro no lugar do rosa**, e abas/informações diferentes na tela inicial.

---

## Stack

| Peça | Escolha | Por quê |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | SSR, rotas de API no mesmo projeto, deploy direto na Vercel |
| Estilo | Tailwind CSS | Tema escuro com accent **azul claro** (`sky`/`cyan`) |
| Banco + Auth + Storage | Supabase (Postgres) | Auth pronta, Row Level Security no banco, bucket para os prints — tudo num serviço só |
| OCR | Claude API — `claude-opus-5` (vision + structured outputs) | Lê screenshot de layout arbitrário; suporte a alta resolução (2576px) importa em print de celular |
| Deploy | Vercel | Plano gratuito para começar |

**Fuso:** tudo gravado em **UTC** no banco, exibido e calculado em **America/Sao_Paulo (BRT)**. Uma única função utilitária de conversão, usada em todo lugar — o turno noturno T6/T1 cruza a meia-noite e é onde erro de fuso aparece.

---

## Modelo de dados (Postgres/Supabase)

```
reps            id, auth_user_id, nome_curto, nome_oficial, turno (T2T3|T4T5|T6T1),
                papel (A|B|C), role (rep|admin), valor_hora, ativo
models          id, nome                      -- Vortex I, Vortex II, etc.
shifts          id, data, turno, bloco (I|II), rep_id, model_id,
                funcao (regular|assist), origem (gerado|manual)
shift_logs      id, shift_id, rep_id, clock_in_at, clock_out_at,
                model_id_real, teve_assistente, resumo,
                saiu_antes, motivo_saida
statements      id, shift_log_id, imagem_path, ocr_raw (jsonb),
                valor_confirmado, corrigido_manualmente (bool)
commission_rules id, vigente_desde, regra (jsonb)   -- versionada, editável pelo admin
```

Índice único em `shifts(data, turno, bloco, funcao)` — impede duas pessoas no mesmo slot.

**Row Level Security é o que garante "o rep só vê o dele".** Política no Postgres: rep lê apenas linhas onde `rep_id` = o próprio; admin lê tudo. Isso vive no banco, não na UI — se alguém chamar a API direto, continua bloqueado.

---

## Componentes

### 1. Gerador de escala — o núcleo testável

Função pura, sem I/O:

```ts
gerarEscala(dataInicio: Date, dataFim: Date): Shift[]
```

Implementa exatamente o modelo de [project.md](project.md) (seção "O modelo da escala 3x1"): `fase = (data − 2026-08-10) mod 4`, com a tabela de papéis A/B/C por turno e a alocação por fase (incluindo o tertius no campo Assistant na fase em que todos trabalham).

**Verificação:** teste que regenera a semana 10/08–16/08/2026 e compara célula a célula com a escala conhecida-correta; e o teste do padrão `WWW.` contínuo atravessando semanas — qualquer sequência de 4 trabalhados ou 2 folgas seguidas falha.

#### Edições manuais não propagam — requisito explícito do usuário

Essa é a garantia central do desenho. A escala gerada é uma função pura da **data** (`fase = (data − âncora) mod 4`), não do dia anterior. Não existe estado acumulado entre dias — então uma alteração em 12/08 é matematicamente incapaz de deslocar 13/08 ou qualquer dia seguinte.

As edições vivem numa **camada de override por dia**, gravadas como linhas com `origem = 'manual'` que têm precedência sobre a linha gerada daquele slot. O gerador nunca sobrescreve manual, e o manual nunca toca no cálculo do gerador.

O efeito prático é a liberdade pedida: o admin pode montar um **4x1**, um **2x2**, cobrir uma falta, ou qualquer arranjo pontual — o ciclo 3x1 segue intacto a partir do dia seguinte, sozinho.

**Duas exceções, ambas explícitas.** Na tela de edição, ao salvar uma alteração o admin escolhe o alcance:

| Opção | Efeito |
|---|---|
| **Só este dia** (padrão) | Grava um override apenas nessa data |
| **Deste dia em diante** | Grava overrides em cada dia do intervalo que o admin definir |

Nunca há propagação implícita. O padrão é sempre o mais contido, e alterar o futuro exige escolher isso na tela.

**Verificação:** editar um dia no meio de uma quinzena, regenerar, e conferir que todos os dias posteriores continuam idênticos ao que eram antes da edição.

### 2. Auth e workspace

Supabase Auth (e-mail + senha). Cada `auth_user` mapeia para um `rep`. Middleware do Next protege todas as rotas exceto login. O `role` do rep decide se as telas de admin aparecem.

Cadastro de reps é feito **pelo admin** — não há auto-registro.

### 3. Telas

| Rota | Conteúdo |
|---|---|
| `/` | Dashboard pessoal: métricas (total vendido, % da meta, turnos feitos, ticket médio), turno de hoje com botão de clock in/out, próximos turnos |
| `/schedule` | Aba "Meus turnos" (feitos + futuros) e aba "Time" (grade por dia, separada em Time 1 / Time 2) |
| `/turno` | Clock in/out e report — detalhado abaixo |
| `/invoice` | Invoice em tempo real do período corrente |
| `/admin/*` | Cadastro de reps, edição da escala, visão de todos os turnos e invoices, regras de comissão |

### 4. Fluxo de clock in / report — o coração

**Iniciar turno.** O dashboard mostra o turno de hoje lido do schedule (dia, turno, modelo). Botão "Iniciar turno" grava `clock_in_at` no horário atual BRT e marca presença. Um dropdown **"Trocar modelo"** permite registrar que ele trabalhou uma modelo diferente da estipulada — grava em `model_id_real`, sem alterar o schedule.

**Finalizar turno.** Botão abre modal com:

1. Upload do print do statement → sobe para o Storage do Supabase
2. Rota de API chama Claude (`claude-opus-5`) com a imagem e um schema JSON estrito (`output_config.format`) → extrai os valores
3. Campos aparecem **pré-preenchidos** com o resultado do OCR; o rep revisa. Se editar qualquer campo, grava `corrigido_manualmente = true` (assim dá para enxergar onde o OCR erra e ajustar o prompt)
4. Campo de texto: resumo do turno
5. Checkbox: teve assistente
6. Checkbox "finalizei antes da hora" → revela campo de motivo (obrigatório) e grava a hora atual BRT em `clock_out_at`
7. Confirmar → grava `shift_log` + `statement`, comissão calculada na hora

Se o OCR falhar (imagem ilegível, erro de API), os campos vêm vazios e editáveis — o rep digita e o turno é registrado normalmente. **O upload nunca bloqueia o fechamento do turno.**

### 5. Invoice em tempo real

Query que soma, para o período corrente:

- **Horas:** `Σ(clock_out_at − clock_in_at)` dos `shift_logs` × `valor_hora` do rep
- **Comissão:** aplicada sobre `valor_confirmado` dos `statements`, pela `commission_rule` vigente

"Tempo real" = recalculado a cada leitura da página, não um valor materializado. Quebra o total em linhas (horas / comissão / bônus) para o rep ver a composição.

Turno em andamento (com `clock_in_at` mas sem `clock_out_at`) conta as horas até agora, marcado como parcial.

---

## Arquivos principais

```
app/
  (auth)/login/page.tsx
  (app)/page.tsx                    # dashboard
  (app)/schedule/page.tsx
  (app)/turno/page.tsx
  (app)/invoice/page.tsx
  (app)/admin/...
  api/ocr/route.ts                  # chama Claude com a imagem
lib/
  escala.ts                         # gerarEscala() — função pura
  escala.test.ts
  comissao.ts                       # cálculo, lê commission_rules
  tempo.ts                          # conversão BRT ↔ UTC
  supabase/{client,server}.ts
supabase/migrations/                # schema + policies RLS
```

---

## Ordem de execução

0. **Instalar Node.js** — bloqueio atual, pedir autorização antes
1. **Projeto + Supabase + schema + RLS** → verificar: rep logado consulta `shifts` de outro rep e recebe vazio
2. **`gerarEscala()` + camada de override + testes** → verificar: (a) semana 10/08 regenerada bate célula a célula; (b) padrão `WWW.` sem quebra em 8 semanas seguidas **na escala gerada pura**; (c) override num dia não altera nenhum dia posterior
3. **Auth + layout + tema azul** → verificar: login funciona, rota protegida redireciona
4. **Telas de schedule** (pessoal + time) → verificar: escala gerada aparece correta, separada por Time 1/2
5. **Clock in/out + trocar modelo** → verificar: iniciar e finalizar turno grava horários BRT corretos, inclusive no turno T6/T1 que vira o dia
6. **OCR + modal de report** → verificar: print real de statement sobe, valores extraídos aparecem pré-preenchidos, edição marca a flag
7. **Invoice** → verificar: turno com horas e venda conhecidas produz total conferido na mão
8. **Admin** (cadastro, edição de escala com alcance, regras de comissão) → verificar: admin vê todos os reps; rep comum recebe 403 nas rotas admin; editar um dia com alcance "só este dia" deixa os seguintes intactos

Cada etapa é entregável e verificável sozinha. Nada depende das regras de comissão reais até a etapa 7, e mesmo lá o sistema roda com placeholder configurável.

---

## Verificação end-to-end

Com o site rodando local (`npm run dev`):

1. Admin cadastra os 9 reps com turno e papel (tabela em [project.md](project.md))
2. Admin gera a escala de uma quinzena → conferir contra `schedule by claude.xlsx` na mesma semana
3. Admin edita um dia no meio (ex.: monta um 2x2 pontual) com alcance "só este dia" → conferir que os dias seguintes continuam no 3x1 original
4. Login como rep → vê só os próprios turnos; tentar acessar `/admin` dá 403
5. Iniciar turno → conferir `clock_in_at` no banco em BRT
6. Finalizar com print real → conferir valores extraídos vs. o que está na imagem
7. Abrir invoice → conferir total contra cálculo manual (horas × valor + comissão)
8. Repetir os passos 5–7 num turno T6/T1 (21:00–05:00) para validar a virada de dia

---

## Fora de escopo desta fase

- **Banco de scripts e mass messages** com categorias → fase seguinte, independente do núcleo
- **Pedidos** de folga / extra / troca de turno → registrado, fica para depois
- **Dicas e material de apoio** → registrado, fica para depois
- **Export para o template oficial `.xlsx`** → o gerador de escala já produz os dados; o export reaproveita a técnica de edição direta de XML documentada em [project.md](project.md) (seção "Armadilha técnica"). Não entra agora.

---

## Armadilhas herdadas do projeto atual

Estão detalhadas em [project.md](project.md) e continuam valendo quando o export for implementado:

- **Não gravar o template oficial com openpyxl** — ele reescreve o pacote inteiro e destrói partes que não sabe representar. Editar o XML do zip diretamente.
- **Nomes precisam bater exatos** com a lista de verificação de dados do template (coluna `AH`), e há homônimos perigosos na lista.
- Ao migrar a escala existente para o banco, atenção às marcas `*` deixadas em células na última revisão da planilha de trabalho.
