# Overlay de loading entre navegações

Data: 2026-08-06. Aprovado em conversa: o Vercel é lento e um clique em link não dá nenhum feedback visual até a página seguinte terminar de carregar no servidor — o usuário não sabe se o clique "pegou".

## Problema

Todo o app roda em Server Components com `export const dynamic = 'force-dynamic'` (sem cache) — toda navegação depende do servidor responder antes de qualquer pixel novo aparecer. `loading.tsx` nativo do Next.js resolveria o feedback, mas troca o conteúdo da rota (não sobrepõe a página anterior por baixo), e o pedido aprovado é justamente um overlay com a página anterior visível e apagada atrás.

## Design

**Arquivo novo:** `app/loading-overlay.tsx` (Client Component), montado uma única vez em `app/layout.tsx` (raiz — cobre `(app)` e `(auth)` sem duplicar).

**Mostrar (no instante do clique):** listener de `click` no `document` inteiro (capture na fase de bubbling é suficiente, roda antes do Next processar a navegação do `<Link>`). Critérios pra contar como navegação interna real:
- `e.button === 0` (botão esquerdo) e sem `metaKey`/`ctrlKey`/`shiftKey`/`altKey` (não é "abrir em nova aba").
- o alvo do clique tem um `<a>` ancestral (`closest('a')`).
- `<a>` não tem `target="_blank"` nem atributo `download`.
- `href` existe, não começa com `#`.
- `new URL(href, location.href)` tem a mesma `origin` da página atual (exclui link externo, `mailto:`, `tel:`).
- o par pathname+search do destino é diferente do atual (clicar na aba já ativa não aciona o overlay).

Escopo deliberadamente limitado a cliques em links (`<a>`/`<Link>`) — não intercepta submits de formulário nem botões de ação (login, "Sair", "Gravar alterações" etc.), que já têm seus próprios indicadores de pendência locais (`useTransition` + texto tipo "Gravando…").

**Esconder:** `usePathname()` + `useSearchParams()` (`next/navigation`) num `useEffect` — dispara toda vez que a URL muda de verdade, ou seja, a navegação terminou. Um `setTimeout` de segurança (15s) força esconder o overlay mesmo que algo impeça a mudança de URL (evita ficar preso cobrindo a tela pra sempre); é cancelado normalmente quando a navegação termina antes disso.

`useSearchParams()` exige um limite de Suspense — o componente é montado dentro de `<Suspense fallback={null}>` no layout raiz.

**Visual:**
- `fixed inset-0 z-[100]`, fundo `bg-fundo/65 backdrop-blur-sm` (dim + leve desfoque da página anterior, visível por baixo).
- Logo do Vortex (`/vortex-logo.png`, mesmo arquivo do header) + texto "VORTEX" centralizados, cor `text-accent`.
- Efeito de "tempestade": duas `@keyframes` novas em `app/globals.css` —
  - `tempestade`: pisca o `text-shadow` do texto "VORTEX" entre um glow constante e picos tipo relâmpago, em dois momentos por ciclo (não simétrico, pra não parecer metrônomo).
  - `raio-flash`: fade in/out rápido de opacidade+escala, usado em 3 ícones de raio (reaproveita `IconeRaio` de `app/(app)/meta-visual.tsx`) posicionados ao redor do texto, cada um com `animation-delay` diferente.

## Testes e verificação

Sem lógica de negócio — feature 100% de apresentação/interação client-side. Verificação por `npm run build` (garante que o Client Component + Suspense boundary compilam sem o erro de `useSearchParams`) e checagem visual no browser: as páginas `/login` e `/cadastro` são públicas (sem autenticação), então dá pra testar o clique em "Criar uma"/"Voltar pro login" sem precisar de credencial de ninguém.
