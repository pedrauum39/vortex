'use client';

import { useEffect, useRef, useState, type DragEvent } from 'react';
import type { ItemMass } from '@/lib/planejamentoDb';

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

function Alca() {
  return (
    <span
      className="cursor-grab select-none rounded px-1 text-texto-fraco hover:bg-cyan-500/20 hover:text-texto active:cursor-grabbing"
      title="Arrastar pra reordenar"
    >
      ⠿⠿
    </span>
  );
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
  draggable?: boolean;
  onDragStart?: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver?: (e: DragEvent<HTMLDivElement>) => void;
  onDrop?: (e: DragEvent<HTMLDivElement>) => void;
};

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

  return (
    <div
      className={`rounded-xl border-2 border-cyan-500/60 bg-cyan-500/[0.06] p-3 transition ${arrastando ? 'opacity-40' : ''}`}
      {...dragProps}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {podeEditar && <Alca />}
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

/** A lista dos blocos "mass" de uma aba (data+modelo) — arrastáveis entre si
 *  pela alça (⠿⠿) no canto. */
export function ListaBlocosMass({
  itens,
  podeEditar,
  onReordenar,
  onAlterarItem,
  onRemoverItem,
}: {
  itens: ItemMass[];
  podeEditar: boolean;
  onReordenar: (itens: ItemMass[]) => void;
  onAlterarItem: (id: string, patch: Partial<ItemMass>) => void;
  onRemoverItem: (id: string) => void;
}) {
  const [arrastando, setArrastando] = useState<string | null>(null);

  function aoSoltarEm(alvoId: string) {
    if (!arrastando || arrastando === alvoId) return setArrastando(null);
    const de = itens.findIndex((i) => i.id === arrastando);
    const para = itens.findIndex((i) => i.id === alvoId);
    setArrastando(null);
    if (de === -1 || para === -1) return;
    const novos = [...itens];
    const [movido] = novos.splice(de, 1);
    novos.splice(para, 0, movido);
    onReordenar(novos);
  }

  return (
    <div className="space-y-3">
      {itens.map((item) => {
        // Índice recalculado a cada render (não guardado no item) — a
        // numeração é sempre a posição atual no array, mesmo depois de
        // arrastar pra outro lugar.
        const numero = itens.findIndex((i) => i.id === item.id) + 1;
        const dragProps: DragProps = podeEditar
          ? {
              draggable: true,
              onDragStart: (e) => {
                // Firefox só completa o drag se algo for gravado em
                // dataTransfer — sem isto, o drag nem começa em alguns
                // navegadores.
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', item.id);
                setArrastando(item.id);
              },
              onDragOver: (e) => e.preventDefault(),
              onDrop: (e) => {
                e.preventDefault();
                aoSoltarEm(item.id);
              },
            }
          : {};

        return (
          <BlocoMass
            key={item.id}
            numero={numero}
            item={item}
            podeEditar={podeEditar}
            onMudar={(patch) => onAlterarItem(item.id, patch)}
            onRemover={() => onRemoverItem(item.id)}
            dragProps={dragProps}
            arrastando={arrastando === item.id}
          />
        );
      })}
    </div>
  );
}

/** O "resto da folha" — bloco de notas livre, sempre presente, sem botão
 *  pra criar: clica e escreve, como um caderno de verdade. */
export function NotebookLivre({
  html,
  podeEditar,
  onMudar,
}: {
  html: string;
  podeEditar: boolean;
  onMudar: (html: string) => void;
}) {
  const ref = useConteudoEditavel(html);

  return (
    <div
      ref={ref}
      contentEditable={podeEditar}
      suppressContentEditableWarning
      onInput={() => onMudar(ref.current!.innerHTML)}
      className="min-h-[10rem] text-sm leading-relaxed outline-none empty:before:text-texto-fraco empty:before:content-['Escreva_livremente_aqui…']"
    />
  );
}
