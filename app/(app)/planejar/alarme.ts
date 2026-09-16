'use client';

import { useEffect, useRef } from 'react';
import type { AbaPlanejamento } from '@/lib/planejamentoDb';
import { HORARIOS, type Turno } from '@/lib/tipos';
import { janelaDoTurno } from '@/lib/turno';

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

function paraMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Em qual dos 3 turnos oficiais um horário cai — T6/T1 cruza meia-noite
 *  (21:00–05:00), então tanto "22:00" quanto "02:00" pertencem a ele. */
function turnoDoHorario(horario: string): Turno {
  const minutos = paraMinutos(horario);
  for (const turno of Object.keys(HORARIOS) as Turno[]) {
    const inicio = paraMinutos(HORARIOS[turno].inicio);
    const fim = paraMinutos(HORARIOS[turno].fim);
    const cruzaMeiaNoite = fim <= inicio;
    if (cruzaMeiaNoite ? minutos >= inicio || minutos < fim : minutos >= inicio && minutos < fim) return turno;
  }
  return 'T6T1';
}

function agoraHHMM(agora: Date) {
  return `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
}

/** Roda em segundo plano: a cada 15s, olha TODOS os blocos mass (de todas as
 *  abas já carregadas, não só a que está aberta na tela) e toca um "ring"
 *  só durante a janela oficial do turno a que aquele horário pertence — o
 *  T6/T1 do dia 16 tem que tocar das 21h do dia 16 às 5h do dia 17, nunca
 *  fora disso (antes disso, qualquer horário que batesse com o relógio em
 *  QUALQUER dia tocava, inclusive dias já passados, até alguém desligar o
 *  alarme manualmente). Guarda o que já tocou (por id+horário+dia da aba)
 *  num Set em ref pra não repetir dentro do mesmo minuto. */
export function useAlarmesDeMass(abas: AbaPlanejamento[]) {
  const jaTocou = useRef(new Set<string>());

  useEffect(() => {
    destravarAudioNoPrimeiroClique();
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const agora = new Date();
      const horaAtual = agoraHHMM(agora);
      for (const aba of abas) {
        for (const modelo of aba.modelos) {
          for (const item of modelo.itens) {
            if (item.tipo !== 'mass' || !item.alarmeAtivo || !item.horario || item.horario !== horaAtual) continue;
            const { inicio, fim } = janelaDoTurno(turnoDoHorario(item.horario), aba.data);
            if (agora < inicio || agora >= fim) continue;
            const chave = `${item.id}:${item.horario}:${aba.data}`;
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
