import type { Bloco, Cargo, Funcao, Turno } from '@/lib/tipos';

export type LinhaShift = {
  id: string;
  data: string;
  turno: Turno;
  bloco: Bloco;
  funcao: Funcao;
  rep_id: string | null;
  model_id: string | null;
  origem: string;
  reps: { nome_curto: string; cargo: Cargo; valor_hora: number } | null;
  models: { nome: string } | null;
  shift_logs: {
    id: string;
    rep_id: string;
    clock_in_at: string;
    clock_out_at: string | null;
    model_id_real: string | null;
    statements: {
      id: string;
      net_total: number;
      net_assinaturas: number;
      net_gorjetas: number;
      net_publicacoes: number;
      net_mensagens: number;
      net_indicacoes: number;
    } | null;
  }[];
};
