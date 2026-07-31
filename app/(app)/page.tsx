import { exigirRep } from '@/lib/auth';
import { gerarEscala } from '@/lib/escala';
import { dataBRT, diaLegivel, somarDias } from '@/lib/tempo';
import { HORARIOS, rotuloTurno } from '@/lib/tipos';

export default async function Dashboard() {
  const rep = await exigirRep();
  const hoje = dataBRT();

  const meuSlot = gerarEscala(hoje, hoje).find(
    (slot) => slot.turno === rep.turno && slot.papel === rep.papel,
  );

  const proximos = gerarEscala(hoje, somarDias(hoje, 14))
    .filter((slot) => slot.turno === rep.turno && slot.papel === rep.papel && slot.data > hoje)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Olá, {rep.nome_curto}</h1>
        <p className="mt-1 text-sm text-texto-fraco">
          {rotuloTurno(rep.turno)} · papel {rep.papel} · {HORARIOS[rep.turno].inicio}–
          {HORARIOS[rep.turno].fim}
        </p>
      </div>

      <section className="rounded-2xl border border-borda bg-superficie p-6">
        <h2 className="text-sm font-medium text-texto-fraco">Hoje</h2>
        {meuSlot ? (
          <>
            <p className="mt-2 text-xl font-medium">
              Bloco {meuSlot.bloco}
              {meuSlot.funcao === 'assist' && (
                <span className="ml-2 rounded-md bg-accent-fraco px-2 py-0.5 text-sm text-accent">
                  Assistant
                </span>
              )}
            </p>
            <p className="mt-1 text-sm text-texto-fraco">
              {HORARIOS[rep.turno].inicio} às {HORARIOS[rep.turno].fim}
            </p>
          </>
        ) : (
          <p className="mt-2 text-xl font-medium text-texto-fraco">Folga</p>
        )}
      </section>

      <section className="rounded-2xl border border-borda bg-superficie p-6">
        <h2 className="text-sm font-medium text-texto-fraco">Próximos turnos</h2>
        <ul className="mt-3 divide-y divide-borda">
          {proximos.map((slot) => (
            <li
              key={`${slot.data}-${slot.bloco}-${slot.funcao}`}
              className="flex items-center justify-between py-2.5 text-sm"
            >
              <span>{diaLegivel(slot.data)}</span>
              <span className="text-texto-fraco">
                Bloco {slot.bloco}
                {slot.funcao === 'assist' && ' · Assistant'}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
