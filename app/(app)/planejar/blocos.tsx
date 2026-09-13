'use client';

import { useEffect, useRef, useState, type DragEvent } from 'react';
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
 *  pularia pro início a cada letra digitada. */
function useConteudoEditavel(htmlInicial: string) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = htmlInicial;
    // Só na montagem deste bloco (a troca de aba desmonta/remonta por causa
    // da key={item.id} no chamador) — não a cada valor novo de htmlInicial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}

function BlocoTexto({
  item,
  podeEditar,
  onMudar,
  dragProps,
}: {
  item: ItemTexto;
  podeEditar: boolean;
  onMudar: (html: string) => void;
  dragProps: Record<string, unknown>;
}) {
  const ref = useConteudoEditavel(item.html);

  return (
    <div className="group flex items-start gap-2" {...dragProps}>
      {podeEditar && <Alca />}
      <div
        ref={ref}
        contentEditable={podeEditar}
        suppressContentEditableWarning
        onInput={() => onMudar(ref.current!.innerHTML)}
        className="min-h-[1.5rem] flex-1 text-sm leading-relaxed outline-none"
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
      <div className="flex flex-wrap items-center gap-2">
        {podeEditar && <Alca />}
        <span className="text-sm font-semibold text-cyan-300">{numero}: mass digitada pelo rep</span>
        {podeEditar && (
          <div className="ml-auto flex items-center gap-1.5 opacity-0 transition group-hover:opacity-100">
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
            <button
              type="button"
              onClick={onRemover}
              className="ml-1 text-xs text-red-400 hover:underline"
            >
              remover
            </button>
          </div>
        )}
      </div>
      <div
        ref={refTexto}
        contentEditable={podeEditar}
        suppressContentEditableWarning
        onInput={() => onMudar({ texto: refTexto.current!.innerHTML })}
        className="mt-2 min-h-[2.5rem] text-sm leading-relaxed outline-none"
      />
      <div className="mt-2 border-t border-cyan-500/20 pt-1.5">
        <p className="text-xs text-texto-fraco">…</p>
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

/**
 * A lista inteira de itens de uma aba (data+modelo) — mistura livre de
 * parágrafos e blocos "mass", arrastáveis entre si. A numeração conta só os
 * blocos mass (os parágrafos livres não entram na contagem).
 */
export function ListaItens({
  itens,
  podeEditar,
  onReordenar,
  onAlterarItem,
  onRemoverItem,
}: {
  itens: ItemPlanejamento[];
  podeEditar: boolean;
  onReordenar: (itens: ItemPlanejamento[]) => void;
  onAlterarItem: (id: string, patch: Partial<ItemMass> | Partial<ItemTexto>) => void;
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
        // Numeração conta só os blocos mass até aqui — os parágrafos livres
        // ficam de fora da contagem (calculado sem mutar variável de fora do
        // map, que o eslint do react-compiler não deixa).
        const numeroMass = itens.slice(0, indice + 1).filter((i) => i.tipo === 'mass').length;
        const dragProps = podeEditar
          ? {
              draggable: true,
              onDragStart: () => setArrastando(item.id),
              onDragOver: (e: DragEvent) => e.preventDefault(),
              onDrop: () => aoSoltarEm(item.id),
              className: arrastando === item.id ? 'opacity-40' : '',
            }
          : {};

        return item.tipo === 'mass' ? (
          <BlocoMass
            key={item.id}
            numero={numeroMass}
            item={item}
            podeEditar={podeEditar}
            onMudar={(patch) => onAlterarItem(item.id, patch)}
            onRemover={() => onRemoverItem(item.id)}
            dragProps={dragProps}
          />
        ) : (
          <BlocoTexto
            key={item.id}
            item={item}
            podeEditar={podeEditar}
            onMudar={(html) => onAlterarItem(item.id, { html })}
            dragProps={dragProps}
          />
        );
      })}
    </div>
  );
}
