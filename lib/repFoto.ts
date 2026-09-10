// URL pública da foto de perfil do rep. Bucket 'rep-fotos' é público, então
// dá pra montar a URL sem cliente do Supabase — serve tanto no servidor
// quanto no browser.

/** URL da foto do rep, ou null se não tem foto. */
export function fotoDoRep(fotoPath: string | null): string | null {
  if (!fotoPath) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/rep-fotos/${fotoPath}`;
}
