// Compara modelos de OCR contra o gabarito de evals/statements/esperado.json.
//
//   npm run eval:ocr                      # opus 5 e haiku 4.5
//   npm run eval:ocr claude-haiku-4-5     # só um modelo
//
// Basta jogar os prints em evals/statements/ com qualquer nome: cada arquivo é
// identificado pelo TOTAL líquido que o próprio modelo leu. Arquivos idênticos
// entram uma vez só.

import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { INSTRUCAO, opcoesOcr, type LidoDoPrint } from '../lib/ocrPrompt';
import { LINHAS } from '../lib/statement';

const PASTA = join(process.cwd(), 'evals', 'statements');

// $ por milhão de tokens: [entrada, saída]
const PRECO: Record<string, [number, number]> = {
  'claude-opus-5': [5, 25],
  'claude-haiku-4-5': [1, 5],
};

for (const [chave, valor] of readFileSync(join(process.cwd(), '.env.local'), 'utf-8')
  .split('\n')
  .filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])) {
  if (!process.env[chave]) process.env[chave] = valor;
}

const gabarito = JSON.parse(readFileSync(join(PASTA, 'esperado.json'), 'utf-8')) as Record<
  string,
  Record<string, number | string>
>;

// Arquivos iguais byte a byte entram uma vez só.
const vistos = new Set<string>();
const prints: string[] = [];
for (const nome of readdirSync(PASTA).filter((n) => /\.(png|jpe?g|webp)$/i.test(n)).sort()) {
  const hash = createHash('sha1').update(readFileSync(join(PASTA, nome))).digest('hex');
  if (vistos.has(hash)) continue;
  vistos.add(hash);
  prints.push(nome);
}

if (prints.length === 0) {
  console.log(`Nenhuma imagem em ${PASTA}.`);
  process.exit(1);
}
console.log(`${prints.length} prints únicos, ${Object.keys(gabarito).length - 1} no gabarito.`);

const cliente = new Anthropic();
const modelos = process.argv[2] ? [process.argv[2]] : Object.keys(PRECO);

for (const modelo of modelos) {
  console.log(`\n=== ${modelo} ===`);
  let campos = 0;
  let acertos = 0;
  let custo = 0;
  let ms = 0;
  const problemas: string[] = [];

  for (const nome of prints) {
    const dados = readFileSync(join(PASTA, nome)).toString('base64');
    const tipo = nome.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

    const t0 = Date.now();
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
    ms += Date.now() - t0;

    const [pEntrada, pSaida] = PRECO[modelo] ?? [0, 0];
    custo +=
      (resposta.usage.input_tokens * pEntrada) / 1e6 +
      (resposta.usage.output_tokens * pSaida) / 1e6;

    const bloco = resposta.content.find((b) => b.type === 'text');
    if (!bloco || bloco.type !== 'text') {
      problemas.push(`${nome}: sem resposta`);
      continue;
    }

    const lido = JSON.parse(bloco.text) as LidoDoPrint;
    const chave = lido.net.total.toFixed(2);
    const esperado = gabarito[chave];

    if (!esperado) {
      problemas.push(`${nome}: leu total ${chave}, que não está no gabarito`);
      continue;
    }

    for (const campo of LINHAS) {
      campos++;
      if (Math.abs(lido.net[campo] - (esperado[campo] as number)) < 0.005) acertos++;
      else problemas.push(`${chave} · ${campo}: certo ${esperado[campo]}, leu ${lido.net[campo]}`);
    }
  }

  const pct = campos ? ((acertos / campos) * 100).toFixed(1) : '0';
  console.log(`campos certos: ${acertos}/${campos} (${pct}%)`);
  console.log(`tempo médio: ${Math.round(ms / prints.length)}ms por print`);
  console.log(`custo dos ${prints.length}: $${custo.toFixed(4)}`);
  console.log(`projeção 540 prints/mês: $${((custo / prints.length) * 540).toFixed(2)}`);
  if (problemas.length) console.log('problemas:\n  ' + problemas.join('\n  '));
}
