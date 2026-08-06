'use client';

import Image from 'next/image';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { IconeRaio } from './(app)/meta-visual';

const TIMEOUT_SEGURANCA_MS = 15_000;

function ehCliqueDeNavegacao(evento: MouseEvent): boolean {
  if (evento.defaultPrevented || evento.button !== 0) return false;
  if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return false;

  const alvo = evento.target as HTMLElement | null;
  const link = alvo?.closest('a');
  if (!link || link.target === '_blank' || link.hasAttribute('download')) return false;

  const href = link.getAttribute('href');
  if (!href || href.startsWith('#')) return false;

  try {
    const destino = new URL(href, window.location.href);
    if (destino.origin !== window.location.origin) return false;
    if (destino.pathname === window.location.pathname && destino.search === window.location.search) {
      return false;
    }
  } catch {
    return false;
  }

  return true;
}

export function LoadingOverlay() {
  const [visivel, setVisivel] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Some quando a URL realmente muda — ajuste de estado durante o render
  // (padrão recomendado pelo React pra isto), não dentro de um efeito.
  const chaveRota = `${pathname}?${searchParams.toString()}`;
  const [chaveRotaAnterior, setChaveRotaAnterior] = useState(chaveRota);
  if (chaveRota !== chaveRotaAnterior) {
    setChaveRotaAnterior(chaveRota);
    setVisivel(false);
  }

  useEffect(() => {
    function aoClicar(evento: MouseEvent) {
      if (ehCliqueDeNavegacao(evento)) setVisivel(true);
    }
    document.addEventListener('click', aoClicar);
    return () => document.removeEventListener('click', aoClicar);
  }, []);

  useEffect(() => {
    if (!visivel) return;
    const id = setTimeout(() => setVisivel(false), TIMEOUT_SEGURANCA_MS);
    return () => clearTimeout(id);
  }, [visivel]);

  if (!visivel) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-fundo/65 backdrop-blur-sm">
      <div className="relative flex flex-col items-center gap-3">
        <IconeRaio className="absolute -left-6 -top-2 size-6 text-accent opacity-0 [animation:raio-flash_1.6s_ease-in-out_infinite]" />
        <IconeRaio className="absolute -right-4 bottom-1 size-5 text-accent-forte opacity-0 [animation:raio-flash_1.6s_ease-in-out_0.5s_infinite]" />
        <IconeRaio className="absolute -right-8 top-6 size-4 text-accent opacity-0 [animation:raio-flash_1.6s_ease-in-out_1s_infinite]" />
        <Image
          src="/vortex-logo.png"
          alt=""
          width={72}
          height={72}
          className="rounded-full"
          priority
        />
        <span className="text-2xl font-semibold tracking-wide text-accent [animation:tempestade_1.6s_ease-in-out_infinite]">
          VORTEX
        </span>
      </div>
    </div>
  );
}
