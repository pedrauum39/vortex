// Tipos do domínio, espelhando os enums de supabase/migrations/0001_schema.sql.

export type Turno = 'T2T3' | 'T4T5' | 'T6T1';
export type Papel = 'A' | 'B' | 'C';
export type Role = 'rep' | 'admin';
export type Bloco = 'I' | 'II';
export type Funcao = 'regular' | 'assist';
export type Origem = 'gerado' | 'manual';

export const TURNOS: Turno[] = ['T2T3', 'T4T5', 'T6T1'];

/** Horários de cada turno em BRT, como definidos no template oficial. */
export const HORARIOS: Record<Turno, { inicio: string; fim: string }> = {
  T2T3: { inicio: '05:00', fim: '13:00' },
  T4T5: { inicio: '13:00', fim: '21:00' },
  T6T1: { inicio: '21:00', fim: '05:00' },
};

export type Rep = {
  id: string;
  auth_user_id: string | null;
  nome_curto: string;
  nome_oficial: string;
  turno: Turno;
  papel: Papel;
  role: Role;
  valor_hora: number;
  ativo: boolean;
};

export type Model = { id: string; nome: string };

export type Shift = {
  id: string;
  data: string; // 'YYYY-MM-DD'
  turno: Turno;
  bloco: Bloco;
  rep_id: string | null;
  model_id: string | null;
  funcao: Funcao;
  origem: Origem;
};

export type ShiftLog = {
  id: string;
  shift_id: string;
  rep_id: string;
  clock_in_at: string;
  clock_out_at: string | null;
  model_id_real: string | null;
  teve_assistente: boolean;
  resumo: string | null;
  saiu_antes: boolean;
  motivo_saida: string | null;
};

export type Statement = {
  id: string;
  shift_log_id: string;
  imagem_path: string | null;
  ocr_raw: unknown;
  valor_confirmado: number | null;
  corrigido_manualmente: boolean;
};

export type CommissionRule = {
  id: string;
  vigente_desde: string;
  regra: unknown;
};
