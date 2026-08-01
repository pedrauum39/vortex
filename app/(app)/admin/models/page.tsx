import { criarClienteServidor } from '@/lib/supabase/server';
import type { Model } from '@/lib/tipos';
import { FormularioModelo, LinhaModelo } from './linha-modelo';

export default async function AdminModels() {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from('models').select('*').order('nome');
  const models = (data ?? []) as Model[];

  return (
    <div className="max-w-lg space-y-4">
      <div className="overflow-hidden rounded-2xl border border-borda bg-superficie">
        <table className="w-full border-collapse text-sm">
          <tbody>
            {models.map((m) => (
              <LinhaModelo key={m.id} model={m} />
            ))}
            {models.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-texto-fraco">Nenhuma modelo cadastrada.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <FormularioModelo />
    </div>
  );
}
