// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
/* Música de foco: uma faixa empacotada na extensão ("Jardim de Luz", composição original,
 * ver design/musica/compor.py), tocada em loop sem emenda pelo Web Audio, com entrada e
 * saída suaves. Só começa num clique, nunca sozinha, e não faz nenhuma conexão externa. */
import { useCallback, useEffect, useRef, useState } from "react";

export const TRACK = { src: "audio/jardim-de-luz.opus", title: "Jardim de Luz", note: "Composição original do Poiesis, gerada por código. Toca em loop." };

export type MusicState = "off" | "loading" | "playing" | "paused" | "error";

const FADE_IN = 2.5;
const FADE_OUT = 1.2;

export function useFocusMusic(volume: number, autoPause: boolean) {
  const [state, setState] = useState<MusicState>("off");
  const [error, setError] = useState<string | null>(null);
  const a = useRef<{ ctx: AudioContext | null; gain: GainNode | null; src: AudioBufferSourceNode | null; buf: AudioBuffer | null; hiddenPause: boolean }>({ ctx: null, gain: null, src: null, buf: null, hiddenPause: false });
  const stateRef = useRef(state);
  stateRef.current = state;
  const volRef = useRef(volume);
  volRef.current = volume;

  const fadeTo = (v: number, secs: number) => {
    const { ctx, gain } = a.current;
    if (!ctx || !gain) return;
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(v, now + secs);
  };

  const play = useCallback(async () => {
    const r = a.current;
    try {
      if (!r.ctx) {
        setState("loading");
        r.ctx = new AudioContext();
        r.gain = r.ctx.createGain();
        r.gain.gain.value = 0;
        r.gain.connect(r.ctx.destination);
        const res = await fetch(TRACK.src);
        if (!res.ok) throw new Error(`arquivo de áudio não encontrado (${res.status})`);
        r.buf = await r.ctx.decodeAudioData(await res.arrayBuffer());
        r.src = r.ctx.createBufferSource();
        r.src.buffer = r.buf;
        r.src.loop = true; // loop sem emenda (a faixa foi feita para isso)
        r.src.connect(r.gain);
        r.src.start();
      } else await r.ctx.resume();
      r.hiddenPause = false;
      fadeTo(volRef.current, FADE_IN);
      setState("playing");
      setError(null);
    } catch (e) {
      setState("error");
      setError((e as Error).message || String(e));
    }
  }, []);

  const pause = useCallback(() => {
    const r = a.current;
    if (!r.ctx || stateRef.current !== "playing") return;
    fadeTo(0, FADE_OUT);
    setState("paused");
    setTimeout(() => {
      if (stateRef.current !== "playing") r.ctx?.suspend();
    }, FADE_OUT * 1000 + 50);
  }, []);

  const toggle = useCallback(() => (stateRef.current === "playing" ? pause() : play()), [play, pause]);

  // volume: acompanha sem pular
  useEffect(() => {
    const { ctx, gain } = a.current;
    if (ctx && gain && stateRef.current === "playing") gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.12);
  }, [volume]);

  // aba escondida: pausa (se a opção estiver ligada) e volta quando a aba reaparece
  useEffect(() => {
    const onVis = () => {
      const r = a.current;
      if (document.hidden && autoPause && stateRef.current === "playing") {
        r.hiddenPause = true;
        pause();
      } else if (!document.hidden && r.hiddenPause) {
        r.hiddenPause = false;
        play();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [autoPause, pause, play]);

  useEffect(
    () => () => {
      a.current.ctx?.close();
    },
    []
  );

  return { state, error, play, pause, toggle };
}
