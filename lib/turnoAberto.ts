// Classifica um turno como "precisa de atenção" pra /admin/turnos separar o
// que está quebrado (não fechou, ou nunca abriu, ou fechou mas a comissão
// ainda não dá pra calcular por falta de statement) do resto — ver
// docs/superpowers/specs/2026-08-18-turno-extra-design.md, seção 9.

export function precisaAtencao(
  shift: { data: string; shift_logs: { clock_out_at: string | null }[] },
  hoje: string,
  comissaoPendente = false,
): boolean {
  if (comissaoPendente) return true;
  const log = shift.shift_logs[0];
  if (log) return !log.clock_out_at;
  return shift.data < hoje;
}
