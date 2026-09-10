'use client';

import { useEffect, useState } from 'react';

/**
 * Foto que abre ampliada (imagem inteira, sem corte) por cima da tela ao
 * clicar. Fecha clicando fora ou no Esc.
 */
export function FotoAmpliavel({
  url,
  className,
  alt = '',
}: {
  url: string;
  /** Classe da miniatura (o clicável) — ex.: "size-full object-cover". */
  className?: string;
  alt?: string;
}) {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    const aoTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false);
    };
    document.addEventListener('keydown', aoTecla);
    return () => document.removeEventListener('keydown', aoTecla);
  }, [aberto]);

  return (
    <>
      <button type="button" onClick={() => setAberto(true)} className="block size-full cursor-zoom-in">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={alt} className={className} />
      </button>
      {aberto && (
        <div
          onClick={() => setAberto(false)}
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/80 p-6"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={alt} className="max-h-full max-w-full rounded-xl object-contain shadow-2xl" />
        </div>
      )}
    </>
  );
}
