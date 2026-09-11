import { mesAtual } from '@/lib/tempo';
import { DetalheRep } from '../../../detalhe-rep';

type Busca = { mes?: string };

// Sem isto, o Next serve do cache do navegador uma versão antiga da mesma
// URL — um mês que ainda não tinha turno algum continua aparecendo vazio
// depois, até o cache expirar sozinho.
export const dynamic = 'force-dynamic';

export default async function Pagina({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Busca>;
}) {
  const { id } = await params;
  const { mes: mesParam } = await searchParams;
  const mes = mesParam ?? mesAtual();

  return (
    <DetalheRep id={id} mes={mes} basePath={`/admin/reps/${id}`} voltarHref="/admin/reps" voltarRotulo="reps" />
  );
}
