import { redirect } from 'next/navigation';
import { exigirRep } from '@/lib/auth';
import { mesAtual } from '@/lib/tempo';
import { DetalheRep } from '../../detalhe-rep';

type Busca = { mes?: string };

// Sem isto, o Next serve do cache do navegador uma versão antiga da mesma
// URL — um mês que ainda não tinha turno algum continua aparecendo vazio
// depois, até o cache expirar sozinho.
export const dynamic = 'force-dynamic';

// Mesma regra de /primaris/page.tsx — esta rota não passa pelo layout do
// admin (é por isso que ela existe: pra abrir sem o menu do admin), então
// precisa checar acesso por conta própria.
export default async function Pagina({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Busca>;
}) {
  const rep = await exigirRep();
  const ehPrimaris = rep.cargo === 'grand_primaris' || rep.cargo === 'knight_primaris';
  if (!ehPrimaris && !rep.observador && rep.cargo !== 'admin_5c') redirect('/');

  const { id } = await params;
  const { mes: mesParam } = await searchParams;
  const mes = mesParam ?? mesAtual();

  return (
    <DetalheRep id={id} mes={mes} basePath={`/primaris/${id}`} voltarHref="/primaris" voltarRotulo="primaris" />
  );
}
