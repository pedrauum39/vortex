import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { repAtual } from '@/lib/auth';

// O layout do statement é fixo: cinco categorias e um total, duas colunas
// (bruto à esquerda, líquido à direita). O que varia é o idioma e o tema.
const INSTRUCAO = `Esta é uma captura de tela de um relatório de ganhos.

A tabela tem cinco categorias e uma linha de TOTAL, com duas colunas de valores:
a primeira é o BRUTO, a segunda é o LÍQUIDO. Extraia as duas colunas.

Os rótulos aparecem em português, espanhol ou inglês. Mapeie assim:
- assinaturas: Assinaturas | Suscripciones | Subscriptions
- gorjetas: Gorjetas | Propinas | Tips
- publicacoes: Publicações | Publicaciones | Posts
- mensagens: Mensagens | Mensajes | Messages
- indicacoes: Indicações | Referencias | Referrals
- total: TOTAL (bruto = BRUTO/BRUTO, liquido = LÍQUIDO/NETO/NET)

Extraia também o intervalo de datas do filtro no topo ("De ... Até ...",
"Desde ... Hasta ..."), em formato YYYY-MM-DD.

Regras:
- Devolva números, não texto: 1.602,77 ou $1,602.77 viram 1602.77.
- Uma linha zerada é 0, nunca null.
- Transcreva o que está escrito. Não corrija, não arredonde, não calcule
  nenhum valor que não esteja visível na imagem.`;

const ESQUEMA = {
  type: 'object',
  properties: {
    periodo_de: { type: 'string', description: 'YYYY-MM-DD' },
    periodo_ate: { type: 'string', description: 'YYYY-MM-DD' },
    bruto: {
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
    },
    net: {
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
    },
  },
  required: ['periodo_de', 'periodo_ate', 'bruto', 'net'],
  additionalProperties: false,
} as const;

export async function POST(request: Request) {
  const rep = await repAtual();
  if (!rep) return NextResponse.json({ erro: 'nao autenticado' }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    // O upload nunca bloqueia o fechamento do turno: sem chave, os campos
    // vêm vazios e o rep digita.
    return NextResponse.json({ erro: 'ocr_desligado' }, { status: 503 });
  }

  const { imagem, tipo } = (await request.json()) as { imagem: string; tipo: string };
  if (!imagem) return NextResponse.json({ erro: 'sem imagem' }, { status: 400 });

  try {
    const resposta = await new Anthropic().messages.create({
      model: 'claude-opus-5',
      max_tokens: 2000,
      // Extração pura, sem ferramentas: raciocínio aqui só custaria tokens.
      thinking: { type: 'disabled' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA } },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: tipo as 'image/jpeg' | 'image/png' | 'image/webp',
                data: imagem,
              },
            },
            { type: 'text', text: INSTRUCAO },
          ],
        },
      ],
    });

    const bloco = resposta.content.find((b) => b.type === 'text');
    if (!bloco || bloco.type !== 'text') {
      return NextResponse.json({ erro: 'sem resposta' }, { status: 502 });
    }

    return NextResponse.json(JSON.parse(bloco.text));
  } catch (e) {
    console.error('ocr:', e);
    return NextResponse.json({ erro: 'falha na leitura' }, { status: 502 });
  }
}
