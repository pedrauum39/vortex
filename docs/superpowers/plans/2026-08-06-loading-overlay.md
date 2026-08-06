# Overlay de Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overlay global de loading que aparece no instante do clique em qualquer link interno (dá feedback imediato de que a navegação começou) e some quando a página seguinte termina de carregar — página anterior visível e apagada atrás, logo + "VORTEX" com efeito de "tempestade" azul no centro.

**Architecture:** Um Client Component único montado no layout raiz, sem tocar em nenhuma página existente. Mostra via listener global de `click` (detecta o clique antes do Next processar a navegação); esconde via `usePathname`/`useSearchParams` (detecta quando a URL realmente mudou).

**Tech Stack:** Next.js App Router (`next/navigation`), React Client Component, Tailwind v4 (`@theme`/`@keyframes` em `app/globals.css`), reaproveita `IconeRaio` de `app/(app)/meta-visual.tsx`.

## Global Constraints

- Sem dependência nova (nenhum pacote de progress-bar) — tudo com APIs nativas do Next/React + CSS.
- Não intercepta forms/botões (login, "Sair", ações com `useTransition`) — só cliques em links de navegação.
- Overlay precisa de um timeout de segurança pra nunca travar a tela coberta indefinidamente.

---

## File Structure

- **Create** `app/loading-overlay.tsx` — Client Component com toda a lógica de mostrar/esconder e o JSX do overlay.
- **Modify** `app/layout.tsx` — monta `<LoadingOverlay />` dentro de `<Suspense>`, uma vez, no `<body>`.
- **Modify** `app/globals.css` — duas `@keyframes` novas (`tempestade`, `raio-flash`).

---

### Task 1: Overlay de loading

**Files:**
- Create: `app/loading-overlay.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `IconeRaio` de `./(app)/meta-visual` (já existe, exportado com `className` opcional).
- Produces: `LoadingOverlay` (componente, sem props) — usado só em `app/layout.tsx`.

- [ ] **Step 1: Adicionar as keyframes em `app/globals.css`**

Adicionar ao fim do arquivo:

```css
@keyframes tempestade {
  0%, 8%, 12%, 45%, 100% {
    text-shadow: 0 0 12px rgba(56, 189, 248, 0.6);
  }
  10% {
    text-shadow:
      0 0 24px rgba(125, 211, 252, 1),
      0 0 44px rgba(56, 189, 248, 0.85);
  }
  47% {
    text-shadow:
      0 0 28px rgba(224, 242, 254, 1),
      0 0 48px rgba(56, 189, 248, 0.9);
  }
}

@keyframes raio-flash {
  0%, 85%, 100% {
    opacity: 0;
    transform: scale(0.8);
  }
  90% {
    opacity: 1;
    transform: scale(1.1);
  }
  95% {
    opacity: 0.3;
    transform: scale(1);
  }
}
```

- [ ] **Step 2: Criar `app/loading-overlay.tsx`**

```tsx
'use client';

import Image from 'next/image';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { IconeRaio } from './(app)/meta-visual';

const TIMEOUT_SEGURANCA_MS = 15_000;

function ehCliqueDeNavegacao(evento: MouseEvent): boolean {
  if (evento.defaultPrevented || evento.button !== 0) return false;
  if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return false;

  const alvo = evento.target as HTMLElement | null;
  const link = alvo?.closest('a');
  if (!link || link.target === '_blank' || link.hasAttribute('download')) return false;

  const href = link.getAttribute('href');
  if (!href || href.startsWith('#')) return false;

  try {
    const destino = new URL(href, window.location.href);
    if (destino.origin !== window.location.origin) return false;
    if (destino.pathname === window.location.pathname && destino.search === window.location.search) {
      return false;
    }
  } catch {
    return false;
  }

  return true;
}

export function LoadingOverlay() {
  const [visivel, setVisivel] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    function aoClicar(evento: MouseEvent) {
      if (ehCliqueDeNavegacao(evento)) setVisivel(true);
    }
    document.addEventListener('click', aoClicar);
    return () => document.removeEventListener('click', aoClicar);
  }, []);

  useEffect(() => {
    setVisivel(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!visivel) return;
    const id = setTimeout(() => setVisivel(false), TIMEOUT_SEGURANCA_MS);
    return () => clearTimeout(id);
  }, [visivel]);

  if (!visivel) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-fundo/65 backdrop-blur-sm">
      <div className="relative flex flex-col items-center gap-3">
        <IconeRaio className="absolute -left-6 -top-2 size-6 text-accent opacity-0 [animation:raio-flash_1.6s_ease-in-out_infinite]" />
        <IconeRaio className="absolute -right-4 bottom-1 size-5 text-accent-forte opacity-0 [animation:raio-flash_1.6s_ease-in-out_0.5s_infinite]" />
        <IconeRaio className="absolute -right-8 top-6 size-4 text-accent opacity-0 [animation:raio-flash_1.6s_ease-in-out_1s_infinite]" />
        <Image
          src="/vortex-logo.png"
          alt=""
          width={72}
          height={72}
          className="rounded-full"
          priority
        />
        <span className="text-2xl font-semibold tracking-wide text-accent [animation:tempestade_1.6s_ease-in-out_infinite]">
          VORTEX
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Montar no layout raiz — `app/layout.tsx`**

Trocar:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
```

Por:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { LoadingOverlay } from "./loading-overlay";
```

Trocar:

```tsx
      <body className="min-h-full flex flex-col font-sans">{children}</body>
```

Por:

```tsx
      <body className="min-h-full flex flex-col font-sans">
        <Suspense fallback={null}>
          <LoadingOverlay />
        </Suspense>
        {children}
      </body>
```

- [ ] **Step 4: Verificar tipos, lint e build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: sem erros — em especial, sem o erro "useSearchParams() should be wrapped in a suspense boundary" (é exatamente pra evitar isso que o `<Suspense>` do Step 3 existe).

- [ ] **Step 5: Verificação visual no browser (páginas públicas, sem login)**

Com `npm run dev` rodando, abrir `/login`:
- Clicar no link "Criar uma" (vai pra `/cadastro`) → overlay aparece na hora do clique (página de login visível e apagada atrás, logo + "VORTEX" piscando em azul no centro), some assim que `/cadastro` termina de carregar.
- Em `/cadastro`, clicar no link de volta pro login → mesmo comportamento.
- Clicar num link já ativo (mesma URL) → overlay NÃO aparece.
- Middle-click ou Ctrl+click num link (abrir em nova aba) → overlay NÃO aparece na aba original.

- [ ] **Step 6: Commit**

```bash
git add app/loading-overlay.tsx app/layout.tsx app/globals.css
git commit -m "Adiciona overlay de loading global entre navegacoes"
```

---

### Task 2: Verificação final, push e deploy

- [ ] **Step 1: Suite completa**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: 80 testes verdes, build sem erro (repete a suite completa por segurança, já que a maior parte já rodou na Task 1).

- [ ] **Step 2: Push**

```bash
git push origin main
```

- [ ] **Step 3: Confirmar deploy**

Usar o conector MCP da Vercel (`list_deployments` com `projectId: "prj_LoV2katWTCWSToUsfcJZiRJlsnNp"`, `teamId: "vortex-f5a9"`) pra confirmar que o deploy do commit chegou a `READY`, e `get_runtime_errors` pra checar que não apareceu erro novo depois do deploy.
