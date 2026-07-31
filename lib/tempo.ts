// Conversão entre UTC (como tudo é gravado) e America/Sao_Paulo (como tudo é
// exibido e calculado). Toda a aplicação passa por aqui — o turno T6/T1 cruza
// a meia-noite e é onde erro de fuso aparece.

export const FUSO = 'America/Sao_Paulo';

const PARTES = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSO,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

type Relogio = {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
};

/** Relógio de parede em BRT para um instante. */
export function relogioBRT(instante: Date = new Date()): Relogio {
  const p = Object.fromEntries(
    PARTES.formatToParts(instante).map((x) => [x.type, x.value]),
  ) as Record<string, string>;

  return {
    ano: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    // 'en-US' com hour12:false devolve 24 para a meia-noite.
    hora: Number(p.hour) % 24,
    minuto: Number(p.minute),
    segundo: Number(p.second),
  };
}

/** Deslocamento do fuso, em minutos, no instante dado. */
function offsetMinutos(instante: Date): number {
  const r = relogioBRT(instante);
  const comoSeFosseUTC = Date.UTC(r.ano, r.mes - 1, r.dia, r.hora, r.minuto, r.segundo);
  const semMilissegundos = instante.getTime() - (instante.getTime() % 1000);
  return (comoSeFosseUTC - semMilissegundos) / 60000;
}

/** Um horário de parede em BRT vira o instante UTC correspondente. */
export function brtParaUtc(
  ano: number,
  mes: number,
  dia: number,
  hora = 0,
  minuto = 0,
  segundo = 0,
): Date {
  const comoSeFosseUTC = Date.UTC(ano, mes - 1, dia, hora, minuto, segundo);
  // Duas passadas: a primeira usa o offset do palpite, a segunda o offset do
  // instante já corrigido. Resolve os casos em cima de uma virada de offset.
  let ts = comoSeFosseUTC - offsetMinutos(new Date(comoSeFosseUTC)) * 60000;
  ts = comoSeFosseUTC - offsetMinutos(new Date(ts)) * 60000;
  return new Date(ts);
}

/** 'YYYY-MM-DD' do dia em BRT — o formato usado na coluna `data` de shifts. */
export function dataBRT(instante: Date = new Date()): string {
  const { ano, mes, dia } = relogioBRT(instante);
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** 'HH:mm' em BRT. */
export function horaBRT(instante: Date): string {
  const { hora, minuto } = relogioBRT(instante);
  return `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
}

/** 'dd/MM HH:mm' em BRT. */
export function formatarBRT(instante: Date): string {
  const { dia, mes } = relogioBRT(instante);
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')} ${horaBRT(instante)}`;
}

/** Meia-noite BRT de uma data 'YYYY-MM-DD', como instante UTC. */
export function inicioDoDiaBRT(data: string): Date {
  const [ano, mes, dia] = data.split('-').map(Number);
  return brtParaUtc(ano, mes, dia);
}
