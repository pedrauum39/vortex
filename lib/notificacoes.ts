// Lógica pura de quando uma notificação aparece e quando ela "encerra" — sem
// tocar em banco, pra dar pra testar isolado. Três tipos:
// - popup: modal ao abrir o site, sem prazo, some quando a pessoa confirma.
// - aviso: banner no dashboard, só dentro de [dataInicio, dataFim].
// - todo: banner no dashboard, sem prazo, some quando a pessoa confirma.

export type TipoNotificacao = 'popup' | 'aviso' | 'todo';

export type Notificacao = {
  id: string;
  tipo: TipoNotificacao;
  mensagem: string;
  dataInicio: string | null;
  dataFim: string | null;
  ativo: boolean;
  criadoEm: string;
};

export type Destinatario = {
  repId: string;
  lidaEm: string | null;
};

export const ROTULO_TIPO: Record<TipoNotificacao, string> = {
  popup: 'Popup',
  aviso: 'Aviso',
  todo: 'To-do',
};

export const ROTULO_CONFIRMAR: Record<TipoNotificacao, string> = {
  popup: 'Fechar',
  aviso: 'Já vi',
  todo: 'Já fiz',
};

/**
 * Se ainda deve aparecer pro rep HOJE. Desativada nunca aparece, de nenhum
 * tipo. Só `aviso` tem janela de data — `popup`/`todo` não têm prazo, só
 * dependem de `ativo` (a checagem de "já confirmou" é feita à parte, olhando
 * `lida_em` do destinatário).
 */
export function estaVisivelHoje(
  n: Pick<Notificacao, 'tipo' | 'dataInicio' | 'dataFim' | 'ativo'>,
  hoje: string,
): boolean {
  if (!n.ativo) return false;
  if (n.tipo === 'aviso') {
    if (n.dataInicio && hoje < n.dataInicio) return false;
    if (n.dataFim && hoje > n.dataFim) return false;
  }
  return true;
}

/**
 * Se não sobra mais nada pra mostrar pra ninguém — usado só pra separar as
 * abas Ativas/Encerradas no admin. Encerra quando: foi desativada à mão, OU
 * é aviso e a data_fim já passou, OU todo mundo que era alvo já confirmou.
 */
export function estaEncerrada(
  n: Pick<Notificacao, 'tipo' | 'dataFim' | 'ativo'>,
  hoje: string,
  destinatarios: Pick<Destinatario, 'lidaEm'>[],
): boolean {
  if (!n.ativo) return true;
  if (n.tipo === 'aviso' && n.dataFim && hoje > n.dataFim) return true;
  return destinatarios.length > 0 && destinatarios.every((d) => d.lidaEm !== null);
}
