'use client';

import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import type { ItemMass, ItemPlanejamento, ItemTexto } from '@/lib/planejamentoDb';

// Paleta fixa pro texto rico (negrito + cor) — Notion-like. O primeiro
// item volta pra cor padrão do tema (remove destaque).
const CORES: { nome: string; valor: string }[] = [
  { nome: 'padrão', valor: '#e7e9ea' },
  { nome: 'vermelho', valor: '#f87171' },
  { nome: 'âmbar', valor: '#fbbf24' },
  { nome: 'verde', valor: '#4ade80' },
  { nome: 'azul', valor: '#38bdf8' },
];

/** Clicar no botão da toolbar não pode tirar o foco/seleção do texto — sem
 *  isto, o execCommand aplicaria no lugar errado (ou em nada). */
const preservarSelecao = (e: React.MouseEvent) => e.preventDefault();

function aplicar(comando: string, valor?: string) {
  document.execCommand(comando, false, valor);
}

/** div contentEditable "não-controlado": o HTML inicial é escrito uma vez no
 *  mount (via ref), e dali pra frente o DOM é a fonte da verdade — se a gente
 *  reescrevesse innerHTML a cada tecla (componente controlado), o cursor
 *  pularia pro início a cada letra digitada. Trocar de aba desmonta/remonta
 *  (key diferente no chamador), então o mount novo pega o conteúdo certo. */
function useConteudoEditavel(htmlInicial: string) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = htmlInicial;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}

function focarNoFim(el: HTMLElement) {
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const selecao = window.getSelection();
  selecao?.removeAllRanges();
  selecao?.addRange(range);
}

/** O bloco só pode ser arrastado a partir da alcinha (⠿⠿) — sem isto,
 *  arrastar de qualquer ponto do bloco brigava com selecionar/editar o
 *  texto dentro dele. `draggable` fica ligado só entre o mousedown na alça
 *  e o fim do drag (ou um mouseup sem chegar a arrastar). */
function useArrastavelPorAlca() {
  const [podeArrastar, setPodeArrastar] = useState(false);
  return {
    podeArrastar,
    alcaProps: {
      onMouseDown: () => setPodeArrastar(true),
      onMouseUp: () => setPodeArrastar(false),
    },
    resetar: () => setPodeArrastar(false),
  };
}

function Alca({ alcaProps }: { alcaProps: { onMouseDown: () => void; onMouseUp: () => void } }) {
  return (
    <span
      {...alcaProps}
      className="cursor-grab select-none text-texto-fraco opacity-30 transition group-hover:opacity-100 active:cursor-grabbing"
      title="Arrastar pra reordenar"
    >
      ⠿⠿
    </span>
  );
}

function BotaoCopiar({ obterTexto }: { obterTexto: () => string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(obterTexto());
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // navegador sem permissão de clipboard — não trava a tela, só não copia.
    }
  }

  return (
    <button
      type="button"
      onClick={copiar}
      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
        copiado
          ? 'border-green-500/50 bg-green-500/10 text-green-300'
          : 'border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/20'
      }`}
      title="Copiar"
    >
      {copiado ? 'copiado!' : 'copiar'}
    </button>
  );
}

type DragProps = {
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
};

function BlocoTexto({
  item,
  podeEditar,
  onMudar,
  onQuebrar,
  onApagarSeVazio,
  deveFocar,
  aoFocar,
  dragProps,
  arrastando,
}: {
  item: ItemTexto;
  podeEditar: boolean;
  onMudar: (html: string) => void;
  onQuebrar: () => void;
  onApagarSeVazio: () => void;
  deveFocar: boolean;
  aoFocar: () => void;
  dragProps: DragProps;
  arrastando: boolean;
}) {
  const ref = useConteudoEditavel(item.html);
  const { podeArrastar, alcaProps, resetar } = useArrastavelPorAlca();

  useEffect(() => {
    if (deveFocar && ref.current) {
      focarNoFim(ref.current);
      aoFocar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deveFocar]);

  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      // Enter cria o próximo parágrafo (como um caderno) — Shift+Enter quebra
      // linha dentro do mesmo bloco.
      e.preventDefault();
      onQuebrar();
    } else if (e.key === 'Backspace' && ref.current?.innerText.trim() === '') {
      e.preventDefault();
      onApagarSeVazio();
    }
  }

  return (
    <div
      draggable={podeArrastar}
      onDragEnd={resetar}
      {...dragProps}
      className={`group flex items-start gap-2 rounded-lg px-1 py-0.5 transition ${arrastando ? 'opacity-40' : ''}`}
    >
      {podeEditar && (
        <span className="mt-0.5">
          <Alca alcaProps={alcaProps} />
        </span>
      )}
      <div
        ref={ref}
        contentEditable={podeEditar}
        suppressContentEditableWarning
        onInput={() => onMudar(ref.current!.innerHTML)}
        onKeyDown={podeEditar ? aoTeclar : undefined}
        className="min-h-[1.5rem] flex-1 text-sm leading-relaxed outline-none empty:before:text-texto-fraco empty:before:content-['Escreva_livremente…']"
      />
    </div>
  );
}

function BlocoMass({
  numero,
  item,
  podeEditar,
  onMudar,
  onRemover,
  dragProps,
  arrastando,
}: {
  numero: number;
  item: ItemMass;
  podeEditar: boolean;
  onMudar: (patch: Partial<Pick<ItemMass, 'texto' | 'nota'>>) => void;
  onRemover: () => void;
  dragProps: DragProps;
  arrastando: boolean;
}) {
  const refTexto = useConteudoEditavel(item.texto);
  const refNota = useConteudoEditavel(item.nota);
  const { podeArrastar, alcaProps, resetar } = useArrastavelPorAlca();

  return (
    <div
      draggable={podeArrastar}
      onDragEnd={resetar}
      {...dragProps}
      className={`group rounded-xl border-2 border-cyan-500/60 bg-cyan-500/[0.06] p-3 transition ${arrastando ? 'opacity-40' : ''}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {podeEditar && <Alca alcaProps={alcaProps} />}
          <span className="flex size-5 items-center justify-center rounded-full bg-cyan-500/20 text-xs font-semibold text-cyan-300">
            {numero}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {podeEditar && (
            <>
              <button
                type="button"
                onMouseDown={preservarSelecao}
                onClick={() => aplicar('bold')}
                className="rounded-md border border-borda px-2 py-1 text-xs font-bold hover:border-cyan-500/50 hover:bg-cyan-500/20"
                title="Negrito"
              >
                B
              </button>
              <div className="flex items-center gap-1 rounded-md border border-borda px-1.5 py-1">
                {CORES.map((c) => (
                  <button
                    key={c.valor}
                    type="button"
                    onMouseDown={preservarSelecao}
                    onClick={() => aplicar('foreColor', c.valor)}
                    className="size-4 rounded-full border border-borda"
                    style={{ backgroundColor: c.valor }}
                    title={c.nome}
                  />
                ))}
              </div>
            </>
          )}
          <BotaoCopiar obterTexto={() => refTexto.current?.innerText ?? ''} />
          {podeEditar && (
            <button
              type="button"
              onClick={onRemover}
              className="rounded-md border border-red-500/40 px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-500/10"
              title="Apagar este bloco"
            >
              apagar
            </button>
          )}
        </div>
      </div>
      <div
        ref={refTexto}
        contentEditable={podeEditar}
        suppressContentEditableWarning
        onInput={() => onMudar({ texto: refTexto.current!.innerHTML })}
        className="mt-2 min-h-[2.5rem] text-sm leading-relaxed outline-none"
      />
      <div className="mt-2 border-t border-cyan-500/20 pt-1.5">
        <div className="flex items-center justify-between">
          <p className="text-xs text-texto-fraco">…</p>
          <BotaoCopiar obterTexto={() => refNota.current?.innerText ?? ''} />
        </div>
        <div
          ref={refNota}
          contentEditable={podeEditar}
          suppressContentEditableWarning
          onInput={() => onMudar({ nota: refNota.current!.innerHTML })}
          className="mt-0.5 min-h-[1.25rem] text-xs leading-relaxed text-texto-fraco outline-none"
        />
      </div>
    </div>
  );
}

function numerarBlocosMass(itens: ItemPlanejamento[]): Map<string, number> {
  const numeros = new Map<string, number>();
  let n = 0;
  for (const item of itens) {
    if (item.tipo === 'mass') {
      n += 1;
      numeros.set(item.id, n);
    }
  }
  return numeros;
}

/**
 * A lista MISTA de uma aba (data+modelo) — parágrafos livres e blocos
 * "mass" intercalados como o rep quiser, todos arrastáveis entre si (pela
 * alça). Enter no fim de um parágrafo cria o próximo; Backspace num
 * parágrafo vazio apaga ele e volta o foco pro anterior.
 */
export function ListaBlocosPlanejamento({
  itens,
  podeEditar,
  onMudarItens,
  onAlterarMass,
  onRemoverMass,
}: {
  itens: ItemPlanejamento[];
  podeEditar: boolean;
  onMudarItens: (itens: ItemPlanejamento[]) => void;
  onAlterarMass: (id: string, patch: Partial<Pick<ItemMass, 'texto' | 'nota'>>) => void;
  onRemoverMass: (id: string) => void;
}) {
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [focoPendente, setFocoPendente] = useState<string | null>(null);
  const numeros = numerarBlocosMass(itens);

  function aoSoltarEm(alvoId: string) {
    if (!arrastando || arrastando === alvoId) return setArrastando(null);
    const de = itens.findIndex((i) => i.id === arrastando);
    const para = itens.findIndex((i) => i.id === alvoId);
    setArrastando(null);
    if (de === -1 || para === -1) return;
    const novos = [...itens];
    const [movido] = novos.splice(de, 1);
    novos.splice(para, 0, movido);
    onMudarItens(novos);
  }

  function quebrarApos(id: string) {
    const idx = itens.findIndex((i) => i.id === id);
    if (idx === -1) return;
    const novoId = crypto.randomUUID();
    const novos = [...itens];
    novos.splice(idx + 1, 0, { id: novoId, tipo: 'texto', html: '' });
    onMudarItens(novos);
    setFocoPendente(novoId);
  }

  function apagarTextoSeVazio(id: string) {
    const idx = itens.findIndex((i) => i.id === id);
    if (idx <= 0) return; // mantém sempre pelo menos o primeiro bloco
    const anterior = itens[idx - 1];
    onMudarItens(itens.filter((i) => i.id !== id));
    setFocoPendente(anterior.id);
  }

  return (
    <div className="space-y-1">
      {itens.map((item) => {
        const dragProps: DragProps = {
          onDragStart: (e) => {
            // Firefox só completa o drag se algo for gravado em
            // dataTransfer — sem isto, o drag nem começa em alguns navegadores.
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', item.id);
            setArrastando(item.id);
          },
          onDragOver: (e) => e.preventDefault(),
          onDrop: (e) => {
            e.preventDefault();
            aoSoltarEm(item.id);
          },
        };

        if (item.tipo === 'mass') {
          return (
            <div key={item.id} className="py-2">
              <BlocoMass
                numero={numeros.get(item.id) ?? 0}
                item={item}
                podeEditar={podeEditar}
                onMudar={(patch) => onAlterarMass(item.id, patch)}
                onRemover={() => onRemoverMass(item.id)}
                dragProps={dragProps}
                arrastando={arrastando === item.id}
              />
            </div>
          );
        }

        return (
          <BlocoTexto
            key={item.id}
            item={item}
            podeEditar={podeEditar}
            onMudar={(html) => onMudarItens(itens.map((i) => (i.id === item.id ? { ...i, html } : i)))}
            onQuebrar={() => quebrarApos(item.id)}
            onApagarSeVazio={() => apagarTextoSeVazio(item.id)}
            deveFocar={focoPendente === item.id}
            aoFocar={() => setFocoPendente(null)}
            dragProps={dragProps}
            arrastando={arrastando === item.id}
          />
        );
      })}
    </div>
  );
}
