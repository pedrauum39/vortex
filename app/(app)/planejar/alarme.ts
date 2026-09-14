'use client';

import { useEffect, useRef } from 'react';
import type { AbaPlanejamento } from '@/lib/planejamentoDb';

let audioCtx: AudioContext | null = null;

function obterAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Construtor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Construtor) return null;
  if (!audioCtx) audioCtx = new Construtor();
  return audioCtx;
}

/** Autoplay de áudio só é liberado depois de uma interação real do usuário —
 *  isto destrava o AudioContext no primeiro clique/tecla da página inteira,
 *  pra o ring poder tocar mais tarde mesmo com a aba em segundo plano. */
function destravarAudioNoPrimeiroClique() {
  const destravar = () => {
    obterAudioContext()?.resume();
    document.removeEventListener('pointerdown', destravar);
    document.removeEventListener('keydown', destravar);
  };
  document.addEventListener('pointerdown', destravar);
  document.addEventListener('keydown', destravar);
}

function tocarBeep(ctx: AudioContext, quando: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.0001, quando);
  gain.gain.exponentialRampToValueAtTime(0.9, quando + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, quando + 0.35);
  osc.connect(gain).connect(ctx.destination);
  osc.start(quando);
  osc.stop(quando + 0.36);
}

function tocarRing() {
  const ctx = obterAudioContext();
  if (!ctx) return;
  tocarBeep(ctx, ctx.currentTime);
  tocarBeep(ctx, ctx.currentTime + 0.45);
  tocarBeep(ctx, ctx.currentTime + 0.9);
}

function dataLocalISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function agoraHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Roda em segundo plano: a cada 15s, olha TODOS os blocos mass (de todas as
 *  abas já carregadas, não só a que está aberta na tela) e toca um "ring"
 *  quando o horário marcado bate com o relógio do navegador — na aba do dia
 *  OU do dia anterior (turno T6/T1 atravessa a meia-noite: uma mass marcada
 *  pras 00:15 de um turno que começou ontem à noite ainda precisa tocar
 *  depois que o relógio virar o dia). Guarda o que já tocou (por
 *  id+horário+dia) num Set em ref pra não repetir dentro do mesmo minuto. */
export function useAlarmesDeMass(abas: AbaPlanejamento[]) {
  const jaTocou = useRef(new Set<string>());

  useEffect(() => {
    destravarAudioNoPrimeiroClique();
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const agoraData = new Date();
      const hoje = dataLocalISO(agoraData);
      const ontem = dataLocalISO(new Date(agoraData.getTime() - 24 * 60 * 60 * 1000));
      const agora = agoraHHMM();
      for (const aba of abas) {
        if (aba.data !== hoje && aba.data !== ontem) continue;
        for (const modelo of aba.modelos) {
          for (const item of modelo.itens) {
            if (item.tipo !== 'mass' || !item.alarmeAtivo || !item.horario || item.horario !== agora) continue;
            const chave = `${item.id}:${item.horario}:${hoje}`;
            if (jaTocou.current.has(chave)) continue;
            jaTocou.current.add(chave);
            tocarRing();
          }
        }
      }
    }, 15000);
    return () => clearInterval(id);
  }, [abas]);
}
