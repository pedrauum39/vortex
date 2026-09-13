// Sanitização do HTML rico do "Planejar turno" (lib/planejamentoDb.ts) antes
// de gravar — o conteúdo é editado num contentEditable no navegador (o rep
// pode digitar/colar qualquer coisa) e depois é lido por outras pessoas
// (admin/primaris, via RLS de planejamentos_turno), então nunca confiamos
// no HTML que chega do cliente: só permitimos negrito e cor de texto.

import sanitizeHtml from 'sanitize-html';

const OPCOES: sanitizeHtml.IOptions = {
  allowedTags: ['b', 'strong', 'br', 'span', 'div'],
  allowedAttributes: { span: ['style'] },
  allowedStyles: {
    span: { color: [/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i] },
  },
  // contentEditable no Chrome/Firefox costuma envolver cada linha nova num
  // <div> — sem isto a quebra de linha se perderia na sanitização.
  transformTags: { div: 'div' },
};

/** Só negrito, cor de texto e quebra de linha sobrevivem. Tudo mais é removido. */
export function sanitizarConteudo(html: string): string {
  return sanitizeHtml(html ?? '', OPCOES);
}
