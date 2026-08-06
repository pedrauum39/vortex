// Tipos do domínio, espelhando os enums de supabase/migrations/0001_schema.sql.

export type Turno = 'T2T3' | 'T4T5' | 'T6T1';
export type Papel = 'A' | 'B' | 'C';

/**
 * Cargo é o que define o percentual de comissão, e é independente do `papel`:
 * papel é a posição no rodízio da escala, cargo é a patente do rep.
 */
export type Cargo = 'grand_primaris' | 'knight_primaris' | 'secundus' | 'tertius';

export const ROTULO_CARGO: Record<Cargo, string> = {
  grand_primaris: 'Gran Primaris',
  knight_primaris: 'Knight Primaris',
  secundus: 'Secundus',
  tertius: 'Tertius',
};

export type Role = 'rep' | 'admin';
export type Bloco = 'I' | 'II';
export type Funcao = 'regular' | 'assist';
export type Origem = 'gerado' | 'manual';

export const TURNOS: Turno[] = ['T2T3', 'T4T5', 'T6T1'];

/** 'T2T3' → 'T2/T3', como aparece na planilha. */
export const rotuloTurno = (turno: Turno) => `${turno.slice(0, 2)}/${turno.slice(2)}`;

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
  cargo: Cargo;
  role: Role;
  valor_hora: number;
  ativo: boolean;
  /** Acompanha admin/schedule/primaris sem poder editar nada — não é do time (ex.: Thomas, OM). */
  observador: boolean;
};

/** Uma modelo (perfil de conteúdo) do roster de um dos dois times. */
export type Model = { id: string; nome: string; bloco: Bloco; ativa: boolean; meta_mensal: number };

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
  net_total: number;
  net_assinaturas: number;
  net_gorjetas: number;
  net_publicacoes: number;
  net_mensagens: number;
  net_indicacoes: number;
  corrigido_manualmente: boolean;
  refund_confirmado: boolean;
};

export type CommissionRule = {
  id: string;
  vigente_desde: string;
  regra: unknown;
};
