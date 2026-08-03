import { ehAdmin, exigirRep } from '@/lib/auth';
import { criarClienteServidor } from '@/lib/supabase/server';
import type { Model } from '@/lib/tipos';
import { FormularioModelo, LinhaModelo } from './linha-modelo';

export default async function AdminModels() {
  const rep = await exigirRep();
  const podeEditar = ehAdmin(rep);

  const supabase = await criarClienteServidor();
  const { data } = await supabase.from('models').select('*').order('bloco').order('nome');
  const models = (data ?? []) as Model[];

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {(['I', 'II'] as const).map((bloco) => (
        <div key={bloco} className="space-y-3">
          <p className="text-sm font-medium text-accent">
            {bloco === 'I' ? 'Time 1 · Vortex I' : 'Time 2 · Vortex II'}
          </p>

          <div className="overflow-hidden rounded-2xl border border-borda bg-superficie">
            <table className="w-full border-collapse text-sm">
              <tbody>
                {models
                  .filter((m) => m.bloco === bloco)
                  .map((m) => (
                    <LinhaModelo key={m.id} model={m} podeEditar={podeEditar} />
                  ))}
                {models.filter((m) => m.bloco === bloco).length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-center text-texto-fraco">
                      Nenhuma modelo cadastrada neste time.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {podeEditar && <FormularioModelo bloco={bloco} />}
        </div>
      ))}
    </div>
  );
}
