# Ajustes de UI (Schedule, Home, Turnos, Invoice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seis ajustes de UI aprovados: calendário mensal com hover em Schedule, nome da modelo em azul (Schedule + Home), rename "Turno"→"Turnos", histórico mensal de metas em `/turno` com destaque de recorde, ajustes visuais no painel do turno, e % de comissão na linha de cabeçalho do Invoice.

**Architecture:** Nenhuma lógica de negócio nova — tudo reaproveita funções puras/queries já testadas (`buscarMetasDoRep`, `buscarRecordeDoRep`, `corDaMeta`, `temRaio`, `percentualAtingido`). O único componente novo com estado é o calendário do Schedule (precisa de hover), então essa parte migra pra um Client Component; o resto é JSX/texto em Server Components existentes.

**Tech Stack:** Next.js App Router (Server + Client Components), TypeScript, Tailwind (tokens de tema em `app/globals.css`: `--color-accent #38bdf8`, `--color-accent-fraco #0b2b3d`, `--color-superficie #0e1520`, `--color-borda #1e2a3a`, `--color-texto-fraco #8496ad`), Supabase.

## Global Constraints

- Sem alteração de lógica de negócio/cálculo — só leitura de dados já existentes e apresentação.
- Props de Server Component para Client Component precisam ser serializáveis: nunca passar `Map`/`Set` direto — converter para array/objeto plano antes.
- Cores/ícones seguem os tokens do tema já definidos (`accent`, `accent-fraco`, `superficie`, `borda`, `texto-fraco`) — não introduzir cor nova.
- Fluxo de deploy do projeto (`workspace-vortex.md`): `npm run typecheck && npm run lint && npm test && npm run build` antes de cada commit que vai pro push final; confirmar deploy `READY` no Vercel antes de reportar como concluído.

---

## File Structure

- **Create** `app/(app)/meta-visual.tsx` — `CORES` (mapa cor por faixa de meta) e `IconeRaio` (ícone de raio), extraídos de `app/(app)/page.tsx` pra serem compartilhados com o histórico de `/turno`.
- **Create** `app/(app)/schedule/meus-turnos.tsx` — Client Component: lista de turnos da semana (com destaque de hover) + calendário do mês (com hover), substitui o `<ul>` que hoje vive dentro de `AbaMeus` em `page.tsx`.
- **Modify** `app/(app)/page.tsx` — usa `meta-visual.tsx` em vez de definição local; separa nome da modelo em span próprio (azul) em "Hoje" e "Próximos turnos".
- **Modify** `app/(app)/schedule/page.tsx` — `AbaMeus` ganha busca do mês (pro calendário) e delega a renderização pro novo `MeusTurnos`.
- **Modify** `app/(app)/nav.tsx` — rótulo "Turno" → "Turnos".
- **Modify** `app/(app)/turno/page.tsx` — `<h1>` "Turno" → "Turnos"; nova seção de histórico mensal (usa `meta-visual.tsx`).
- **Modify** `app/(app)/turno/painel.tsx` — "Bloco X" → "Vortex X"; bloco de meta em duas linhas (total + detalhamento).
- **Modify** `app/(app)/invoice/page.tsx` — adiciona % de comissão na linha de cabeçalho.

---

### Task 1: Extrair cores/ícone de meta compartilhados + nome da modelo em azul na Home

**Files:**
- Create: `app/(app)/meta-visual.tsx`
- Modify: `app/(app)/page.tsx:1-10` (imports), `app/(app)/page.tsx:184-198` (seção "Hoje"), `app/(app)/page.tsx:222-239` (seção "Próximos turnos"), `app/(app)/page.tsx:244-249` (remove `CORES` local), `app/(app)/page.tsx:301-307` (remove `IconeRaio` local)

**Interfaces:**
- Produces: `CORES: Record<CorMeta, string>`, `IconeRaio({ className }: { className?: string }): JSX.Element` (default `className = 'size-5'`) — usados por Task 5.

- [ ] **Step 1: Criar `app/(app)/meta-visual.tsx`**

```tsx
import type { CorMeta } from '@/lib/meta';

export const CORES: Record<CorMeta, string> = {
  vermelho: 'text-red-400',
  amarelo: 'text-amber-300',
  verde: 'text-green-400',
  'azul-neon': 'text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.75)]',
};

export function IconeRaio({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M13 2 3 14h7l-1 8 11-14h-7l0-6Z" />
    </svg>
  );
}
```

- [ ] **Step 2: Em `app/(app)/page.tsx`, importar do novo arquivo e remover as definições locais**

No topo do arquivo, junto dos outros imports locais:

```tsx
import { CORES, IconeRaio } from './meta-visual';
```

Remover o bloco `const CORES: Record<CorMeta, string> = { ... };` (linhas 244-249) e a função `function IconeRaio() { ... }` (linhas 301-307) — o `CorMeta` deixa de precisar ser importado em `page.tsx` se não for mais usado em outro lugar do arquivo (checar; `corDaMeta` continua sendo usado em `CartaoMeta`, então o import de `lib/meta` continua, só `CorMeta` como tipo pode sumir se não usado em mais nenhuma anotação local — manter se `CartaoMeta`/outros ainda referenciarem o tipo).

- [ ] **Step 3: Separar o nome da modelo em span azul — seção "Hoje" (`app/(app)/page.tsx`, dentro do `.map(hojeSlots)`)**

Trocar:

```tsx
<p className="text-xl font-medium">
  {rotuloTurno(t.turno)} · {nomeDoTurno(t, rosterPorBloco)}
  {t.funcao === 'assist' && (
```

Por:

```tsx
<p className="text-xl font-medium">
  {rotuloTurno(t.turno)} · <span className="text-accent">{nomeDoTurno(t, rosterPorBloco)}</span>
  {t.funcao === 'assist' && (
```

- [ ] **Step 4: Separar o nome da modelo em span azul — seção "Próximos turnos"**

Trocar:

```tsx
<li key={t.id} className="flex items-center justify-between py-2.5 text-sm">
  <span>{diaLegivel(t.data)}</span>
  <span className="text-texto-fraco">
    {rotuloTurno(t.turno)} · {nomeDoTurno(t, rosterPorBloco)}
    {t.funcao === 'assist' && ' · Assistant'}
  </span>
</li>
```

Por:

```tsx
<li key={t.id} className="flex items-center justify-between py-2.5 text-sm">
  <span>{diaLegivel(t.data)}</span>
  <span className="text-texto-fraco">
    {rotuloTurno(t.turno)} · <span className="text-accent">{nomeDoTurno(t, rosterPorBloco)}</span>
    {t.funcao === 'assist' && ' · Assistant'}
  </span>
</li>
```

- [ ] **Step 5: Verificar tipos e lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erros. Se `CorMeta` ficar sem uso em `page.tsx`, o lint acusa import não usado — remover do import de `@/lib/meta` nesse caso (mantendo `corDaMeta`, `temRaio`).

- [ ] **Step 6: Commit**

```bash
git add app/\(app\)/meta-visual.tsx app/\(app\)/page.tsx
git commit -m "Extrai cores/icone de meta compartilhados e destaca nome da modelo em azul na Home"
```

---

### Task 2: Schedule — calendário mensal com hover + nome da modelo em azul

**Files:**
- Create: `app/(app)/schedule/meus-turnos.tsx`
- Modify: `app/(app)/schedule/page.tsx` (imports, `type Busca`, `Schedule()`, `AbaMeus`)

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `MeuTurno` (tipo, movido de `page.tsx` pra `meus-turnos.tsx`), `MeusTurnos` (Client Component) — usados só dentro de `app/(app)/schedule/`.

- [ ] **Step 1: Criar `app/(app)/schedule/meus-turnos.tsx`**

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { diaLegivel, diasNoMes, mesLegivel } from '@/lib/tempo';
import { rotuloTurno, type Bloco, type Turno } from '@/lib/tipos';
import { BotaoGerar } from './botao-gerar';

export type MeuTurno = {
  id: string;
  data: string;
  turno: Turno;
  bloco: Bloco;
  funcao: 'regular' | 'assist';
  origem: 'gerado' | 'manual';
  shift_logs: {
    clock_in_at: string;
    clock_out_at: string | null;
    shift_log_models: { models: { nome: string } }[];
  }[];
};

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** Grade do mês, uma célula por dia (null nas células de padding antes do dia 1). */
function gradeDoMes(mes: string): (string | null)[] {
  const [ano, m] = mes.split('-').map(Number);
  const offset = new Date(Date.UTC(ano, m - 1, 1)).getUTCDay();
  const total = diasNoMes(mes);
  const celulas: (string | null)[] = Array(offset).fill(null);
  for (let dia = 1; dia <= total; dia++) {
    celulas.push(`${mes}-${String(dia).padStart(2, '0')}`);
  }
  return celulas;
}

export function MeusTurnos({
  turnos,
  rosterPorBloco,
  hoje,
  admin,
  inicio,
  fim,
  mesCal,
  diasComTurno,
  mesAnteriorHref,
  mesSeguinteHref,
}: {
  turnos: MeuTurno[];
  rosterPorBloco: Record<string, string>;
  hoje: string;
  admin: boolean;
  inicio: string;
  fim: string;
  mesCal: string;
  diasComTurno: string[];
  mesAnteriorHref: string;
  mesSeguinteHref: string;
}) {
  const [diaHover, setDiaHover] = useState<string | null>(null);
  const diasComTurnoSet = new Set(diasComTurno);
  const grade = gradeDoMes(mesCal);

  return (
    <div className="space-y-6">
      {turnos.length === 0 ? (
        <Vazia admin={admin} inicio={inicio} fim={fim} />
      ) : (
        <ul className="divide-y divide-borda rounded-2xl border border-borda bg-superficie">
          {turnos.map((t) => {
            const log = t.shift_logs[0];
            const modelos = log?.shift_log_models.map((m) => m.models.nome).join(' + ');
            const destacado = diaHover !== null && t.data === diaHover;
            return (
              <li
                key={t.id}
                className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-4 text-base transition ${
                  destacado ? 'ring-2 ring-inset ring-accent shadow-[0_0_16px_rgba(56,189,248,0.45)]' : ''
                }`}
              >
                <span className={t.data === hoje ? 'font-medium text-accent' : ''}>
                  {diaLegivel(t.data)}
                </span>
                <span className="text-texto-fraco">{rotuloTurno(t.turno)}</span>
                <span className="text-accent">
                  {modelos || rosterPorBloco[t.bloco] || `Bloco ${t.bloco}`}
                </span>
                {t.funcao === 'assist' && (
                  <span className="rounded-md bg-accent-fraco px-2 py-0.5 text-sm text-accent">
                    Assistant
                  </span>
                )}
                {t.origem === 'manual' && (
                  <span className="rounded-md border border-borda px-2 py-0.5 text-sm text-texto-fraco">
                    alterado
                  </span>
                )}
                <span className="ml-auto text-sm text-texto-fraco">
                  {log?.clock_out_at
                    ? 'concluído'
                    : log
                      ? 'em andamento'
                      : t.data < hoje
                        ? 'sem registro'
                        : ''}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="rounded-2xl border border-borda bg-superficie p-5">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium capitalize text-texto-fraco">{mesLegivel(mesCal)}</h3>
          <div className="ml-auto flex items-center gap-1 text-sm">
            <Link
              href={mesAnteriorHref}
              className="rounded-lg border border-borda px-2.5 py-1.5 text-texto-fraco hover:text-texto"
            >
              ←
            </Link>
            <Link
              href={mesSeguinteHref}
              className="rounded-lg border border-borda px-2.5 py-1.5 text-texto-fraco hover:text-texto"
            >
              →
            </Link>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-xs text-texto-fraco">
          {DIAS_SEMANA.map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1.5">
          {grade.map((data, i) => {
            if (!data) return <div key={`vazio-${i}`} />;
            const temTurno = diasComTurnoSet.has(data);
            const ehHoje = data === hoje;
            const dia = Number(data.slice(-2));
            return (
              <div
                key={data}
                onMouseEnter={() => temTurno && setDiaHover(data)}
                onMouseLeave={() => setDiaHover(null)}
                className={`flex aspect-square items-center justify-center rounded-lg text-sm transition ${
                  temTurno ? 'cursor-default bg-accent-fraco text-accent' : 'text-texto-fraco'
                } ${ehHoje ? 'ring-2 ring-accent' : ''}`}
              >
                {dia}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Vazia({ admin, inicio, fim }: { admin: boolean; inicio: string; fim: string }) {
  return (
    <div className="rounded-2xl border border-borda bg-superficie p-10 text-center">
      <p className="text-texto-fraco">Nenhum turno gravado neste período.</p>
      {admin ? (
        <div className="mt-4">
          <BotaoGerar inicio={inicio} fim={fim} />
        </div>
      ) : (
        <p className="mt-2 text-sm text-texto-fraco">Peça ao admin para gerar a escala.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Atualizar `app/(app)/schedule/page.tsx` — imports e `type Busca`**

Trocar a linha de import de `lib/tempo` (linha 4) e adicionar o import do novo componente:

```tsx
import Link from 'next/link';
import { ehAdmin, exigirRep } from '@/lib/auth';
import { criarClienteServidor } from '@/lib/supabase/server';
import { dataBRT, diaLegivel, limitesDoMes, segundaDaSemana, somarDias, somarMeses } from '@/lib/tempo';
import { TURNOS, rotuloTurno, type Bloco, type Turno } from '@/lib/tipos';
import { BotaoGerar } from './botao-gerar';
import { MeusTurnos, type MeuTurno } from './meus-turnos';
```

Trocar `type Busca = { aba?: string; de?: string };` por:

```tsx
type Busca = { aba?: string; de?: string; mesCal?: string };
```

- [ ] **Step 3: Atualizar `Schedule()` — calcular o mês do calendário e passar pro `AbaMeus`**

Trocar:

```tsx
  const rep = await exigirRep();
  const { aba = 'meus', de } = await searchParams;

  const inicio = de ?? segundaDaSemana(dataBRT());
  const fim = somarDias(inicio, 6);
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(inicio, i));
```

Por:

```tsx
  const rep = await exigirRep();
  const { aba = 'meus', de, mesCal } = await searchParams;

  const inicio = de ?? segundaDaSemana(dataBRT());
  const fim = somarDias(inicio, 6);
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(inicio, i));
  const mesCalendario = mesCal ?? inicio.slice(0, 7);
```

E trocar a chamada:

```tsx
        <AbaMeus repId={rep.id} inicio={inicio} fim={fim} admin={ehAdmin(rep)} />
```

Por:

```tsx
        <AbaMeus
          repId={rep.id}
          inicio={inicio}
          fim={fim}
          admin={ehAdmin(rep)}
          aba={aba}
          mesCal={mesCalendario}
        />
```

- [ ] **Step 4: Remover o `type MeuTurno` local e reescrever `AbaMeus`**

Remover o bloco `type MeuTurno = { ... };` (linhas 82-94, agora vem de `./meus-turnos`).

Trocar a função `AbaMeus` inteira (linhas 96-176) por:

```tsx
async function AbaMeus({
  repId,
  inicio,
  fim,
  admin,
  aba,
  mesCal,
}: {
  repId: string;
  inicio: string;
  fim: string;
  admin: boolean;
  aba: string;
  mesCal: string;
}) {
  const supabase = await criarClienteServidor();
  const { inicio: inicioMes, fim: fimMes } = limitesDoMes(mesCal);

  // rep_id explícito: o RLS filtra o rep comum, mas o admin enxerga tudo — sem
  // isto "Meus turnos" mostraria o time inteiro para o admin.
  const [{ data }, { data: modelsData }, { data: mesData }] = await Promise.all([
    supabase
      .from('shifts')
      .select(
        'id, data, turno, bloco, funcao, origem, shift_logs(clock_in_at, clock_out_at, shift_log_models(models(nome)))',
      )
      .eq('rep_id', repId)
      .gte('data', inicio)
      .lte('data', fim)
      .order('data'),
    supabase.from('models').select('nome, bloco').eq('ativa', true).order('nome'),
    supabase.from('shifts').select('data').eq('rep_id', repId).gte('data', inicioMes).lte('data', fimMes),
  ]);

  const rosterPorBloco: Record<string, string> = {};
  for (const m of modelsData ?? []) {
    const bloco = m.bloco as Bloco;
    rosterPorBloco[bloco] = [rosterPorBloco[bloco], m.nome].filter(Boolean).join(', ');
  }

  const turnos = (data ?? []) as unknown as MeuTurno[];
  const diasComTurno = [...new Set((mesData ?? []).map((s) => s.data as string))];
  const hoje = dataBRT();

  return (
    <MeusTurnos
      turnos={turnos}
      rosterPorBloco={rosterPorBloco}
      hoje={hoje}
      admin={admin}
      inicio={inicio}
      fim={fim}
      mesCal={mesCal}
      diasComTurno={diasComTurno}
      mesAnteriorHref={`/schedule?aba=${aba}&de=${inicio}&mesCal=${somarMeses(mesCal, -1)}`}
      mesSeguinteHref={`/schedule?aba=${aba}&de=${inicio}&mesCal=${somarMeses(mesCal, 1)}`}
    />
  );
}
```

Nota: `Vazia` continua definida no fim de `page.tsx` (linhas 293-308) — ainda usada por `AbaTime`. Não remover.

- [ ] **Step 5: Verificar tipos e lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erros. `Bloco`/`Turno` continuam usados em `page.tsx` (em `AbaTime`), então os imports de `lib/tipos` não mudam.

- [ ] **Step 6: Verificação visual no browser**

Rodar `npm run dev`, abrir `/schedule`, aba "Meus turnos":
- Confirmar que o calendário aparece embaixo da lista, mês atual, dias com turno em azul.
- Passar o mouse num dia do calendário que está dentro da semana mostrada → a(s) linha(s) daquele dia na lista acima devem ganhar o anel/glow azul.
- Passar o mouse num dia com turno fora da semana mostrada → nada na lista reage (comportamento esperado, confirmado com o usuário).
- Clicar ← / → do calendário → mês muda, semana da lista continua a mesma.
- Nome da modelo na lista aparece em azul.

- [ ] **Step 7: Commit**

```bash
git add app/\(app\)/schedule/meus-turnos.tsx app/\(app\)/schedule/page.tsx
git commit -m "Adiciona calendario mensal com hover em Schedule e destaca nome da modelo"
```

---

### Task 3: Rename "Turno" → "Turnos"

**Files:**
- Modify: `app/(app)/nav.tsx:9`
- Modify: `app/(app)/turno/page.tsx:129`

- [ ] **Step 1: `app/(app)/nav.tsx`**

Trocar:

```tsx
  { href: '/turno', rotulo: 'Turno' },
```

Por:

```tsx
  { href: '/turno', rotulo: 'Turnos' },
```

- [ ] **Step 2: `app/(app)/turno/page.tsx`**

Trocar:

```tsx
        <h1 className="text-2xl font-semibold tracking-tight">Turno</h1>
```

Por:

```tsx
        <h1 className="text-2xl font-semibold tracking-tight">Turnos</h1>
```

- [ ] **Step 3: Verificar e commitar**

Run: `npm run typecheck`
Expected: sem erros (mudança de texto só).

```bash
git add app/\(app\)/nav.tsx app/\(app\)/turno/page.tsx
git commit -m "Renomeia aba Turno para Turnos"
```

---

### Task 4: Painel do turno — "Vortex X" + meta detalhada

**Files:**
- Modify: `app/(app)/turno/painel.tsx:85`, `app/(app)/turno/painel.tsx:105-113`

- [ ] **Step 1: Trocar o fallback "Bloco X" por "Vortex X"**

Trocar:

```tsx
          {log ? log.modelos.map((m) => m.nome).join(' + ') : `Bloco ${turno.bloco}`}
```

Por:

```tsx
          {log ? log.modelos.map((m) => m.nome).join(' + ') : `Vortex ${turno.bloco}`}
```

- [ ] **Step 2: Reescrever o bloco "Meta do turno" com total + detalhamento**

Trocar:

```tsx
      {metaTemValor && (
        <p className="mt-2 text-sm text-texto-fraco">
          Meta do turno:{' '}
          {modelosDaMeta
            .filter((m) => (metasDiarias[m.id] ?? 0) > 0)
            .map((m) => `${m.nome} ${dinheiro(metasDiarias[m.id])}`)
            .join(' · ')}
        </p>
      )}
```

Por:

```tsx
      {metaTemValor && (
        <div className="mt-2 text-sm text-texto-fraco">
          <p>
            Meta do turno:{' '}
            <span className="font-medium text-texto">
              {dinheiro(modelosDaMeta.reduce((soma, m) => soma + (metasDiarias[m.id] ?? 0), 0))}
            </span>
          </p>
          <p className="mt-0.5">
            {modelosDaMeta
              .filter((m) => (metasDiarias[m.id] ?? 0) > 0)
              .map((m) => `${m.nome}: ${dinheiro(metasDiarias[m.id])}`)
              .join(' · ')}
          </p>
        </div>
      )}
```

- [ ] **Step 3: Verificar tipos**

Run: `npm run typecheck && npm run lint`
Expected: sem erros.

- [ ] **Step 4: Verificação visual no browser**

Abrir `/turno` (com um turno que tenha modelo(s) selecionada(s)):
- Cabeçalho do painel mostra "Vortex I" (ou "Vortex II") antes de bater ponto.
- "Meta do turno" mostra a soma total na primeira linha, e o detalhamento por modelo na linha de baixo.

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/turno/painel.tsx
git commit -m "Painel do turno: Vortex I/II e meta total + detalhamento por modelo"
```

---

### Task 5: Histórico mensal de turnos em `/turno`

**Files:**
- Modify: `app/(app)/turno/page.tsx` (imports, searchParams, novo bloco de dados, nova seção JSX)

**Interfaces:**
- Consumes: `CORES`, `IconeRaio` de `../meta-visual` (Task 1); `buscarMetasDoRep`, `buscarRecordeDoRep` de `@/lib/metaDb` (já existem); `percentualAtingido`, `corDaMeta`, `temRaio` de `@/lib/meta` (já existem).

- [ ] **Step 1: Atualizar imports e assinatura de `searchParams`**

Trocar:

```tsx
import Link from 'next/link';
import { ehAdmin, exigirRep } from '@/lib/auth';
import { metaDiariaDaPagina } from '@/lib/meta';
import { criarClienteAdmin, criarClienteServidor } from '@/lib/supabase/server';
import { diaLegivel, diasNoMes, horaBRT } from '@/lib/tempo';
import { HORARIOS, TURNOS, rotuloTurno, type Bloco, type Funcao, type Model, type Turno } from '@/lib/tipos';
import {
  MINUTOS_DE_ANTECEDENCIA,
  dataDoTurnoAtual,
  horasDoTurno,
  janelaDoTurno,
  podeIniciar,
} from '@/lib/turno';
import { Painel } from './painel';
```

Por:

```tsx
import Link from 'next/link';
import { ehAdmin, exigirRep } from '@/lib/auth';
import { corDaMeta, metaDiariaDaPagina, percentualAtingido, temRaio } from '@/lib/meta';
import { buscarMetasDoRep, buscarRecordeDoRep } from '@/lib/metaDb';
import { criarClienteAdmin, criarClienteServidor } from '@/lib/supabase/server';
import { diaLegivel, diasNoMes, horaBRT, limitesDoMes, mesAtual, mesLegivel, somarMeses } from '@/lib/tempo';
import { HORARIOS, TURNOS, rotuloTurno, type Bloco, type Funcao, type Model, type Turno } from '@/lib/tipos';
import {
  MINUTOS_DE_ANTECEDENCIA,
  dataDoTurnoAtual,
  horasDoTurno,
  janelaDoTurno,
  podeIniciar,
} from '@/lib/turno';
import { CORES, IconeRaio } from '../meta-visual';
import { Painel } from './painel';

const dinheiro = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });
```

Trocar a assinatura:

```tsx
export default async function TurnoPage({
  searchParams,
}: {
  searchParams: Promise<{ turno?: string }>;
}) {
  const rep = await exigirRep();
  const { turno: turnoEscolhido } = await searchParams;
```

Por:

```tsx
export default async function TurnoPage({
  searchParams,
}: {
  searchParams: Promise<{ turno?: string; mes?: string }>;
}) {
  const rep = await exigirRep();
  const { turno: turnoEscolhido, mes: mesParam } = await searchParams;
```

- [ ] **Step 2: Buscar o histórico do mês — adicionar logo antes do `return (`**

Adicionar, imediatamente antes de `return (` no fim da função:

```tsx
  const mes = mesParam ?? mesAtual();
  const { inicio: inicioMes, fim: fimMes } = limitesDoMes(mes);
  const diasDoMesHistorico = diasNoMes(mes);

  const [metas, recorde] = await Promise.all([
    buscarMetasDoRep(criarClienteAdmin(), rep.id, inicioMes, fimMes, diasDoMesHistorico),
    buscarRecordeDoRep(criarClienteAdmin(), rep.id),
  ]);

  const historico = metas.linhas.filter((l) => l.trabalhado);
```

(Nota: `diasDoMes`, já existente na função pra `metasDiarias` do turno atual, é sobre outro mês — o do turno em exibição, não o do histórico. Não reaproveitar o mesmo nome de variável.)

- [ ] **Step 3: Adicionar a seção de histórico no JSX, depois do bloco `{!turno ? (...) : (<Painel .../>)}`**

Trocar o fim do `return`:

```tsx
      {!turno ? (
        <div className="rounded-2xl border border-borda bg-superficie p-10 text-center">
          <p className="text-texto-fraco">Você não tem turno agora.</p>
        </div>
      ) : (
        <Painel
          ...
        />
      )}
    </div>
  );
}
```

Por (adicionando a seção de histórico logo antes do `</div>` final):

```tsx
      {!turno ? (
        <div className="rounded-2xl border border-borda bg-superficie p-10 text-center">
          <p className="text-texto-fraco">Você não tem turno agora.</p>
        </div>
      ) : (
        <Painel
          ...
        />
      )}

      <section className="rounded-2xl border border-borda bg-superficie p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-medium">Histórico de turnos</h2>
          <div className="ml-auto flex items-center gap-1 text-sm">
            <Link
              href={`/turno?mes=${somarMeses(mes, -1)}`}
              className="rounded-lg border border-borda px-2.5 py-1.5 text-texto-fraco hover:text-texto"
            >
              ←
            </Link>
            <span className="px-2 capitalize text-texto-fraco">{mesLegivel(mes)}</span>
            <Link
              href={`/turno?mes=${somarMeses(mes, 1)}`}
              className="rounded-lg border border-borda px-2.5 py-1.5 text-texto-fraco hover:text-texto"
            >
              →
            </Link>
          </div>
        </div>

        {historico.length === 0 ? (
          <p className="mt-4 text-sm text-texto-fraco">Nenhum turno trabalhado neste mês.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-borda text-left text-texto-fraco">
                  <th className="px-3 py-2.5 font-medium">Data</th>
                  <th className="px-3 py-2.5 font-medium">Turno</th>
                  <th className="px-3 py-2.5 font-medium">Modelo(s)</th>
                  <th className="px-3 py-2.5 text-right font-medium">Meta do turno</th>
                  <th className="px-3 py-2.5 text-right font-medium">Total feito</th>
                  <th className="px-3 py-2.5 text-right font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((l) => {
                  const percentual = percentualAtingido(l.vendido, l.metaDoTurno);
                  const ehRecorde = recorde?.data === l.data && recorde?.turno === l.turno;
                  return (
                    <tr
                      key={`${l.data}-${l.turno}`}
                      className={`border-b border-borda last:border-0 ${
                        ehRecorde ? 'ring-2 ring-inset ring-accent' : ''
                      }`}
                    >
                      <td className="px-3 py-3">{diaLegivel(l.data)}</td>
                      <td className="px-3 py-3 text-texto-fraco">{rotuloTurno(l.turno)}</td>
                      <td className="px-3 py-3 text-accent">{l.paginas.join(' + ')}</td>
                      <td className="px-3 py-3 text-right text-texto-fraco">{dinheiro(l.metaDoTurno)}</td>
                      <td className="px-3 py-3 text-right">
                        {dinheiro(l.vendido)}
                        {l.pendente && (
                          <span className="ml-2 rounded-md border border-amber-500/40 px-2 py-0.5 text-xs text-amber-300">
                            em aberto
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {percentual === null ? (
                          <span className="text-texto-fraco">—</span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 ${CORES[corDaMeta(percentual)]}`}>
                            {percentual.toFixed(1)}%
                            {temRaio(percentual) && <IconeRaio className="size-4" />}
                          </span>
                        )}
                        {ehRecorde && (
                          <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-accent">
                            Recorde
                            {percentual !== null && temRaio(percentual) && <IconeRaio className="size-4" />}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Verificar tipos e lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erros.

- [ ] **Step 5: Verificação visual no browser**

Abrir `/turno`:
- Nova seção "Histórico de turnos" aparece abaixo do painel, com o mês atual.
- Colunas Data/Turno/Modelo(s)/Meta do turno/Total feito/% preenchidas pros turnos já trabalhados no mês.
- Cor do % segue a mesma paleta da Home (vermelho/amarelo/verde/azul-neon), com raio quando >110%.
- Navegar ← / → troca o mês.
- Se algum turno do mês exibido for o recorde histórico do rep, a linha tem contorno azul e o selo "Recorde" (com raio extra se >110%).

- [ ] **Step 6: Commit**

```bash
git add app/\(app\)/turno/page.tsx
git commit -m "Adiciona historico mensal de turnos em /turno, com destaque de recorde"
```

---

### Task 6: Invoice — % de comissão na linha de cabeçalho

**Files:**
- Modify: `app/(app)/invoice/page.tsx:13-16` (helpers), `app/(app)/invoice/page.tsx:71-73` (linha do cabeçalho)

- [ ] **Step 1: Adicionar o helper de formatação de percentual**

Trocar:

```tsx
const dinheiro = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });

const centavos = (valor: number) => Math.round(valor * 100) / 100;
```

Por:

```tsx
const dinheiro = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });

const centavos = (valor: number) => Math.round(valor * 100) / 100;

const percentualComissao = (fracao: number) =>
  `${(fracao * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
```

- [ ] **Step 2: Inserir o percentual na linha do cabeçalho**

Trocar:

```tsx
      <p className="text-sm text-texto-fraco">
        {rep.nome_curto} · {ROTULO_CARGO[rep.cargo]} · {dinheiro(rep.valor_hora)}/h
      </p>
```

Por:

```tsx
      <p className="text-sm text-texto-fraco">
        {rep.nome_curto} · {ROTULO_CARGO[rep.cargo]} · {percentualComissao(regra.percentual[rep.cargo])} ·{' '}
        {dinheiro(rep.valor_hora)}/h
      </p>
```

(`regra` já é buscada mais acima na função via `buscarRegraVigente` — não precisa de fetch novo.)

- [ ] **Step 3: Verificar tipos e lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erros.

- [ ] **Step 4: Verificação visual no browser**

Abrir `/invoice`: a linha de cabeçalho mostra `Nome · Cargo · X% · US$ Y,00/h` (ex.: `Pedro Ribeiro · Grand Primaris · 6% · US$ 2,00/h`).

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/invoice/page.tsx
git commit -m "Mostra percentual de comissao na linha de cabecalho do Invoice"
```

---

### Task 7: Verificação final, push e deploy

**Files:** nenhum (só comandos).

- [ ] **Step 1: Suite completa**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: os quatro passam sem erro (80 testes verdes, build sem falha).

- [ ] **Step 2: Smoke test visual final no browser (dev server)**

Com `npm run dev` rodando, percorrer rapidamente: `/schedule` (aba Meus turnos: calendário + hover + nome azul), `/` (Home: nome da modelo azul em Hoje/Próximos turnos), `/turno` (rótulo "Turnos" no nav, "Vortex I/II", meta em duas linhas, histórico mensal), `/invoice` (percentual na linha de cabeçalho). Checar `read_console_messages`/`preview_logs` por erro.

- [ ] **Step 3: Push**

```bash
git push origin main
```

- [ ] **Step 4: Confirmar deploy**

Se o conector MCP da Vercel estiver disponível na sessão, usar `list_deployments`/`get_deployment_build_logs` pra confirmar que o deploy do commit chegou a `READY` antes de reportar como concluído. Se não estiver disponível, avisar o usuário que o push foi feito e que o deploy automático da Vercel deve estar rodando, sem confirmar o status.
