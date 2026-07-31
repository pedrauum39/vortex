import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { repAtual } from '@/lib/auth';
import { INSTRUCAO, opcoesOcr } from '@/lib/ocrPrompt';

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
      // Trocável sem mexer em código — ver evals/ocr.ts para o comparativo.
      ...opcoesOcr(process.env.OCR_MODEL ?? 'claude-opus-5'),
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
