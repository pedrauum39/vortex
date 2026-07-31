import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/** Cliente com a sessão do usuário logado. Respeita o RLS. */
export async function criarClienteServidor() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(paraGravar) {
          try {
            for (const { name, value, options } of paraGravar) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Component não pode gravar cookie; o middleware renova a sessão.
          }
        },
      },
    },
  );
}

/**
 * Cliente com a service role. Atravessa o RLS — usar só onde o próprio código
 * já verificou que quem chamou é admin. Nunca importar no cliente.
 */
export function criarClienteAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
