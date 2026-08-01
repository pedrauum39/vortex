import { criarClienteServidor } from '@/lib/supabase/server';
import type { Rep } from '@/lib/tipos';
import { LinhaRep } from './linha-rep';

export default async function AdminReps() {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from('reps').select('*').order('turno').order('papel');
  const reps = (data ?? []) as Rep[];

  return (
    <div className="overflow-x-auto rounded-2xl border border-borda bg-superficie">
      <table className="w-full min-w-[62rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-borda text-left text-texto-fraco">
            <th className="px-4 py-3 font-medium">Nome curto</th>
            <th className="px-3 py-3 font-medium">Nome oficial</th>
            <th className="px-3 py-3 font-medium">Turno</th>
            <th className="px-3 py-3 font-medium">Cargo</th>
            <th className="px-3 py-3 font-medium">$/h</th>
            <th className="px-3 py-3 font-medium">Ativo</th>
            <th className="px-3 py-3 font-medium">Login</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {reps.map((rep) => (
            <LinhaRep key={rep.id} rep={rep} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
