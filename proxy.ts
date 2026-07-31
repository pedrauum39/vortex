import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { atualizarSessao } from '@/lib/supabase/middleware';

export default async function proxy(request: NextRequest) {
  // Sem Supabase configurado ainda: manda para a tela de login, que mostra o
  // aviso de configuração em vez de estourar dentro de cada página.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    if (request.nextUrl.pathname.startsWith('/login')) return NextResponse.next();
    const destino = request.nextUrl.clone();
    destino.pathname = '/login';
    return NextResponse.redirect(destino);
  }

  return atualizarSessao(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
