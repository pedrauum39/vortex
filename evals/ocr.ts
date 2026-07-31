// Compara modelos de OCR contra o gabarito de evals/statements/esperado.json.
//
//   npm run eval:ocr                      # opus 5 e haiku 4.5
//   npm run eval:ocr claude-haiku-4-5     # só um modelo
//
// Salve os prints em evals/statements/ com o nome que o gabarito espera.

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { INSTRUCAO, opcoesOcr, type LidoDoPrint } from '../lib/ocrPrompt';
import { LINHAS } from '../lib/statement';

const PASTA = join(process.cwd(), 'evals', 'statements');

// $ por milhão de tokens: [entrada, saída]
const PRECO: Record<string, [number, number]> = {
  'claude-opus-5': [5, 25],
  'claude-haiku-4-5': [1, 5],
};

type Gabarito = { net: Record<string, number> };

for (const [chave, valor] of Object.entries(
  Object.fromEntries(
    readFileSync(join(process.cwd(), '.env.local'), 'utf-8')
      .split('\n')
      .filter((l) => l.includes('=') && !l.startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  ),
)) {
  if (!process.env[chave]) process.env[chave] = valor;
}

const gabarito = JSON.parse(readFileSync(join(PASTA, 'esperado.json'), 'utf-8')) as Record<
  string,
  Gabarito
>;
const casos = Object.entries(gabarito).filter(([nome]) => !nome.startsWith('_'));
const presentes = casos.filter(([nome]) => existsSync(join(PASTA, nome)));

if (presentes.length === 0) {
  console.log(`Nenhum print encontrado em ${PASTA}.`);
  console.log('Salve as imagens com estes nomes:\n');
  for (const [nome] of casos) console.log(`  ${nome}`);
  console.log(`\nEncontrei lá: ${readdirSync(PASTA).join(', ') || '(vazio)'}`);
  process.exit(1);
}

const cliente = new Anthropic();
const modelos = process.argv[2] ? [process.argv[2]] : Object.keys(PRECO);

for (const modelo of modelos) {
  console.log(`\n=== ${modelo} ===`);
  let campos = 0;
  let acertos = 0;
  let custo = 0;
  const falhas: string[] = [];

  for (const [nome, esperado] of presentes) {
    const dados = readFileSync(join(PASTA, nome)).toString('base64');
    const tipo = nome.endsWith('.png') ? 'image/png' : 'image/jpeg';

    const resposta = await cliente.messages.create({
      ...opcoesOcr(modelo),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: tipo, data: dados } },
            { type: 'text', text: INSTRUCAO },
          ],
        },
      ],
    });

    const [entrada, saida] = PRECO[modelo] ?? [0, 0];
    custo +=
      (resposta.usage.input_tokens * entrada) / 1e6 +
      (resposta.usage.output_tokens * saida) / 1e6;

    const bloco = resposta.content.find((b) => b.type === 'text');
    if (!bloco || bloco.type !== 'text') {
      falhas.push(`${nome}: sem resposta`);
      campos += LINHAS.length + 1;
      continue;
    }

    const lido = JSON.parse(bloco.text) as LidoDoPrint;
    for (const campo of [...LINHAS, 'total'] as const) {
      campos++;
      const obtido = lido.net[campo];
      if (Math.abs(obtido - esperado.net[campo]) < 0.005) acertos++;
      else falhas.push(`${nome} · ${campo}: esperado ${esperado.net[campo]}, leu ${obtido}`);
    }
  }

  const pct = ((acertos / campos) * 100).toFixed(1);
  console.log(`campos certos: ${acertos}/${campos} (${pct}%)`);
  console.log(`custo dos ${presentes.length} prints: $${custo.toFixed(4)}`);
  console.log(`projeção 540 prints/mês: $${((custo / presentes.length) * 540).toFixed(2)}`);
  if (falhas.length) console.log('erros:\n  ' + falhas.join('\n  '));
}
