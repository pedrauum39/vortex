import { criarClienteAdmin } from '@/lib/supabase/server';
import { FormularioCadastro } from './formulario-cadastro';

// Sem cookies/headers, o Next static-otimiza esta página por padrão — a lista
// de reps ficaria congelada no build. Força buscar de novo a cada acesso.
export const dynamic = 'force-dynamic';

export default async function Cadastro() {
  const admin = criarClienteAdmin();
  const { data } = await admin.from('reps').select('id, nome_curto').order('nome_curto');
  const reps = (data ?? []) as { id: string; nome_curto: string }[];

  return <FormularioCadastro reps={reps} />;
}
