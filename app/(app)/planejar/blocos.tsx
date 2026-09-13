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
    <span className="cursor-grab select-none text-texto-fraco opacity-0 transition group-hover:opacity-100 active:cursor-grabbing">
      ⠿
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
      className="rounded px-1.5 py-0.5 text-xs text-texto-fraco hover:bg-cyan-500/20 hover:text-texto"
      title="Copiar"
    >
      {copiado ? 'copiado!' : 'copiar'}
    </button>
  );
}

function BlocoMass({
  numero,
  item,
  podeEditar,
  onMudar,
  onRemover,
  dragProps,
}: {
  numero: number;
  item: ItemMass;
  podeEditar: boolean;
  onMudar: (patch: Partial<Pick<ItemMass, 'texto' | 'nota'>>) => void;
  onRemover: () => void;
  dragProps: Record<string, unknown>;
}) {
  const refTexto = useConteudoEditavel(item.texto);
  const refNota = useConteudoEditavel(item.nota);

  return (
    <div className="group rounded-xl border-2 border-cyan-500/60 bg-cyan-500/[0.06] p-3" {...dragProps}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {podeEditar && <Alca />}
          <span className="flex size-5 items-center justify-center rounded-full bg-cyan-500/20 text-xs font-semibold text-cyan-300">
            {numero}
          </span>
        </div>
        <div className="flex items-center gap-1.5 opacity-0 transition group-hover:opacity-100">
          {podeEditar && (
            <>
              <button
                type="button"
                onMouseDown={preservarSelecao}
                onClick={() => aplicar('bold')}
                className="rounded px-1.5 py-0.5 text-xs font-bold text-texto-fraco hover:bg-cyan-500/20 hover:text-texto"
                title="Negrito"
              >
                B
              </button>
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
            </>
          )}
          <BotaoCopiar obterTexto={() => refTexto.current?.innerText ?? ''} />
          {podeEditar && (
            <button type="button" onClick={onRemover} className="text-xs text-red-400 hover:underline">
              remover
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

/** A lista dos blocos "mass" de uma aba (data+modelo) — arrastáveis entre si. */
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
      {itens.map((item, indice) => {
        const dragProps = podeEditar
          ? {
              draggable: true,
              onDragStart: () => setArrastando(item.id),
              onDragOver: (e: DragEvent) => e.preventDefault(),
              onDrop: () => aoSoltarEm(item.id),
              className: arrastando === item.id ? 'opacity-40' : '',
            }
          : {};

        return (
          <BlocoMass
            key={item.id}
            numero={indice + 1}
            item={item}
            podeEditar={podeEditar}
            onMudar={(patch) => onAlterarItem(item.id, patch)}
            onRemover={() => onRemoverItem(item.id)}
            dragProps={dragProps}
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
