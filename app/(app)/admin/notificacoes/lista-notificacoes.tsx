'use client';

import { useState, useTransition } from 'react';
import type { NotificacaoComDestinatarios } from '@/lib/notificacoesDb';
import { ROTULO_TIPO } from '@/lib/notificacoes';
import { dataCurta } from '@/lib/tempo';
import { desativarNotificacaoAction } from './actions';

export function ListaNotificacoes({
  ativas,
  encerradas,
  podeEditar,
}: {
  ativas: NotificacaoComDestinatarios[];
  encerradas: NotificacaoComDestinatarios[];
  podeEditar: boolean;
}) {
  const [aba, setAba] = useState<'ativas' | 'encerradas'>('ativas');
  const linhas = aba === 'ativas' ? ativas : encerradas;

  return (
    <section>
      <div className="flex gap-1 border-b border-borda">
        {(
          [
            { chave: 'ativas' as const, rotulo: `Ativas (${ativas.length})` },
            { chave: 'encerradas' as const, rotulo: `Encerradas (${encerradas.length})` },
          ]
        ).map(({ chave, rotulo }) => (
          <button
            key={chave}
            type="button"
            onClick={() => setAba(chave)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm transition ${
              aba === chave ? 'border-accent text-accent' : 'border-transparent text-texto-fraco hover:text-texto'
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {linhas.length === 0 ? (
        <p className="mt-4 text-sm text-texto-fraco">Nenhuma notificação aqui.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {linhas.map((n) => (
            <LinhaNotificacao key={n.id} notificacao={n} podeEditar={podeEditar && aba === 'ativas'} />
          ))}
        </div>
      )}
    </section>
  );
}

function LinhaNotificacao({
  notificacao,
  podeEditar,
}: {
  notificacao: NotificacaoComDestinatarios;
  podeEditar: boolean;
}) {
  const [aberta, setAberta] = useState(false);
  const [pendente, executar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const confirmados = notificacao.destinatarios.filter((d) => d.lidaEm !== null).length;

  return (
    <div className="rounded-xl border border-borda bg-superficie p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-md bg-accent-fraco px-2 py-0.5 text-xs text-accent">
          {ROTULO_TIPO[notificacao.tipo]}
        </span>
        <p className="flex-1 text-sm">{notificacao.mensagem}</p>
        {notificacao.tipo === 'aviso' && notificacao.dataInicio && notificacao.dataFim && (
          <span className="text-xs text-texto-fraco">
            {dataCurta(notificacao.dataInicio)} até {dataCurta(notificacao.dataFim)}
          </span>
        )}
        <span className="text-xs text-texto-fraco">
          {confirmados}/{notificacao.destinatarios.length} confirmaram
        </span>
        <button type="button" onClick={() => setAberta((v) => !v)} className="text-xs text-accent hover:underline">
          {aberta ? 'esconder' : 'ver quem'}
        </button>
        {podeEditar && (
          <button
            type="button"
            disabled={pendente}
            onClick={() =>
              executar(async () => {
                setErro(null);
                try {
                  await desativarNotificacaoAction(notificacao.id);
                } catch {
                  setErro('Não deu para desativar.');
                }
              })
            }
            className="text-xs text-red-400 hover:underline disabled:opacity-50"
          >
            desativar
          </button>
        )}
      </div>

      {erro && <p className="mt-2 text-xs text-red-400">{erro}</p>}

      {aberta && (
        <ul className="mt-3 grid grid-cols-2 gap-1.5 border-t border-borda pt-3 sm:grid-cols-3">
          {notificacao.destinatarios.map((d) => (
            <li key={d.repId} className="text-xs">
              {d.lidaEm ? '✓' : '—'} {d.nomeCurto}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
