import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Renova a sessão a cada request e redireciona quem não está logado.
 * Roda antes de qualquer página — é aqui que a proteção de rota vive.
 */
export async function atualizarSessao(request: NextRequest) {
  let resposta = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(paraGravar) {
          for (const { name, value } of paraGravar) {
            request.cookies.set(name, value);
          }
          resposta = NextResponse.next({ request });
          for (const { name, value, options } of paraGravar) {
            resposta.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const noLogin = request.nextUrl.pathname.startsWith('/login');

  if (!user && !noLogin) {
    const destino = request.nextUrl.clone();
    destino.pathname = '/login';
    return NextResponse.redirect(destino);
  }

  if (user && noLogin) {
    const destino = request.nextUrl.clone();
    destino.pathname = '/';
    return NextResponse.redirect(destino);
  }

  return resposta;
}
