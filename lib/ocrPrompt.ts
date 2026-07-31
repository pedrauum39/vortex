// Prompt e schema da leitura do print. Vive aqui porque a rota (/api/ocr) e o
// comparativo de modelos (evals/ocr.ts) têm que usar exatamente o mesmo — se
// divergirem, a medição deixa de dizer o que vai acontecer em produção.

const CATEGORIAS = {
  type: 'object',
  properties: {
    assinaturas: { type: 'number' },
    gorjetas: { type: 'number' },
    publicacoes: { type: 'number' },
    mensagens: { type: 'number' },
    indicacoes: { type: 'number' },
    total: { type: 'number' },
  },
  required: ['assinaturas', 'gorjetas', 'publicacoes', 'mensagens', 'indicacoes', 'total'],
  additionalProperties: false,
} as const;

export const ESQUEMA = {
  type: 'object',
  properties: {
    periodo_de: { type: 'string', description: 'YYYY-MM-DD' },
    periodo_ate: { type: 'string', description: 'YYYY-MM-DD' },
    bruto: CATEGORIAS,
    net: CATEGORIAS,
  },
  required: ['periodo_de', 'periodo_ate', 'bruto', 'net'],
  additionalProperties: false,
} as const;

/**
 * Parâmetros da chamada por modelo. O Haiku 4.5 não aceita `effort` — mandar
 * dá 400 —, então ele só entra nos modelos que suportam.
 */
export function opcoesOcr(modelo: string) {
  const formato = { type: 'json_schema' as const, schema: ESQUEMA };

  return {
    model: modelo,
    max_tokens: 2000,
    // Extração pura, sem ferramentas: raciocínio aqui só custaria tokens.
    thinking: { type: 'disabled' as const },
    output_config: modelo.includes('haiku') ? { format: formato } : { effort: 'low' as const, format: formato },
  };
}

export type LidoDoPrint = {
  periodo_de: string;
  periodo_ate: string;
  bruto: Record<'assinaturas' | 'gorjetas' | 'publicacoes' | 'mensagens' | 'indicacoes' | 'total', number>;
  net: Record<'assinaturas' | 'gorjetas' | 'publicacoes' | 'mensagens' | 'indicacoes' | 'total', number>;
};

export const INSTRUCAO = `Esta é uma captura de tela de um relatório de ganhos.

A tabela tem cinco categorias e uma linha de TOTAL, com duas colunas de valores:
a primeira é o BRUTO, a segunda é o LÍQUIDO. Extraia as duas colunas.

Os rótulos aparecem em português, espanhol ou inglês. Mapeie assim:
- assinaturas: Assinaturas | Suscripciones | Subscriptions
- gorjetas: Gorjetas | Propinas | Tips
- publicacoes: Publicações | Publicaciones | Posts
- mensagens: Mensagens | Mensajes | Messages
- indicacoes: Indicações | Referencias | Referrals
- total: a linha TOTAL (bruto = BRUTO/GROSS, liquido = LÍQUIDO/NETO/NET)

Extraia também o intervalo de datas do filtro no topo ("De ... Até ...",
"Desde ... Hasta ..."), em formato YYYY-MM-DD.

Regras:
- Devolva números, não texto: 1.602,77 e $1,602.77 viram 1602.77.
- Uma linha zerada é 0, nunca null.
- Transcreva o que está escrito. Não corrija, não arredonde e não calcule
  nenhum valor que não esteja visível na imagem.`;
