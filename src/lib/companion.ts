// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
/* Companheiros (Pólen e Lúmen): máquina de estados compartilhada.
 * A lógica de eventos fica aqui; a arte e as animações ficam em components/Companion.tsx.
 * Regras do documento de personalidade: nada interrompe a digitação, reações curtas
 * (0,4–1,5 s) com intervalo mínimo, erro reage uma vez por ocorrência, digitação agrupada,
 * e o nível "foco" tem prioridade sobre qualquer animação. Tudo local, nada sai daqui. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { CompanionLevel } from "./types";

export type CompanionEvent =
  | "editor:typing"
  | "file:created"
  | "file:opened"
  | "preview:success"
  | "preview:error"
  | "debug:start"
  | "debug:stop"
  | "project:exported"
  | "project:imported"
  | "mascot:clicked"
  | "focus:on"
  | "focus:off";

/** idle, rest (repouso: nível foco ou música tocando), watch, observe e sleep são estados de base; os outros são reações curtas */
export type Pose = "idle" | "rest" | "watch" | "observe" | "sleep" | "curious" | "happy" | "doubt" | "pet";

export const SLEEP_AFTER = 5 * 60_000;
const TYPING_WINDOW = 3500;
const MIN_GAP = 2500;

const REACTION: Partial<Record<CompanionEvent, { pose: Pose; ms: number; priority: number; levels: CompanionLevel[] }>> = {
  "preview:error": { pose: "doubt", ms: 1400, priority: 2, levels: ["discreto", "vivo"] },
  "project:exported": { pose: "happy", ms: 1500, priority: 3, levels: ["discreto", "vivo"] },
  "preview:success": { pose: "happy", ms: 1300, priority: 3, levels: ["discreto", "vivo"] },
  "file:created": { pose: "curious", ms: 1200, priority: 3, levels: ["discreto", "vivo"] },
  "project:imported": { pose: "curious", ms: 1200, priority: 3, levels: ["discreto", "vivo"] },
  "file:opened": { pose: "curious", ms: 800, priority: 4, levels: ["vivo"] },
  "mascot:clicked": { pose: "pet", ms: 1000, priority: 1, levels: ["foco", "discreto", "vivo"] },
};

export interface CompanionState {
  pose: Pose;
  /** quantas reações já aconteceram (útil para testes e para não repetir) */
  reactions: number;
}

export function useCompanion(level: CompanionLevel, enabled: boolean) {
  const [st, setSt] = useState<CompanionState>({ pose: "idle", reactions: 0 });
  const r = useRef({
    lastAct: Date.now(),
    typingUntil: 0,
    debugging: false,
    focus: false,
    reaction: null as Pose | null,
    reactUntil: 0,
    lastReact: 0,
    seenErrors: new Set<string>(),
    timer: null as ReturnType<typeof setTimeout> | null,
  });
  const levelRef = useRef(level);
  levelRef.current = level;
  const poseRef = useRef(st.pose);
  poseRef.current = st.pose;

  const base = useCallback((): Pose => {
    const s = r.current;
    const now = Date.now();
    if (now - s.lastAct > SLEEP_AFTER) return "sleep";
    if (levelRef.current === "foco") return "rest";
    if (s.debugging) return "observe";
    if (levelRef.current === "vivo" && now < s.typingUntil && !s.focus) return "watch";
    // com a música de foco tocando, repousa de olhos fechados, curtindo
    return s.focus ? "rest" : "idle";
  }, []);

  const refresh = useCallback(() => {
    const s = r.current;
    const pose = s.reaction && Date.now() < s.reactUntil ? s.reaction : base();
    if (!(s.reaction && Date.now() < s.reactUntil)) s.reaction = null;
    setSt((cur) => (cur.pose === pose ? cur : { ...cur, pose }));
  }, [base]);

  // relógio barato: só muda o estado quando a pose muda (dormir, parar de "olhar" a digitação)
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, [enabled, refresh]);

  const emit = useCallback(
    (ev: CompanionEvent, key?: string) => {
      if (!enabled) return;
      const s = r.current;
      const now = Date.now();
      const wasAsleep = now - s.lastAct > SLEEP_AFTER;
      switch (ev) {
        case "editor:typing":
          s.lastAct = now;
          if (levelRef.current === "vivo") s.typingUntil = now + TYPING_WINDOW;
          // digitação agrupada: só re-renderiza se a pose de base mudar
          if (wasAsleep || (levelRef.current === "vivo" && (poseRef.current === "idle" || poseRef.current === "rest"))) refresh();
          return;
        case "debug:start":
        case "debug:stop":
          s.debugging = ev === "debug:start";
          refresh();
          return;
        case "focus:on":
        case "focus:off":
          s.focus = ev === "focus:on";
          refresh();
          return;
        case "preview:success":
          s.seenErrors.clear();
          break;
        case "preview:error": {
          const k = (key ?? "").slice(0, 200);
          if (s.seenErrors.has(k)) return; // a mesma ocorrência não reage de novo
          s.seenErrors.add(k);
          break;
        }
      }
      if (ev !== "preview:error" && ev !== "preview:success") s.lastAct = now;
      const rule = REACTION[ev];
      if (!rule || !rule.levels.includes(levelRef.current)) return void refresh();
      // prioridade: uma reação mais importante pode cortar outra; a mesma ou menor espera o intervalo
      const busy = s.reaction && now < s.reactUntil;
      const curPriority = busy ? (Object.values(REACTION).find((x) => x?.pose === s.reaction)?.priority ?? 9) : 9;
      if (busy && rule.priority >= curPriority && ev !== "mascot:clicked") return;
      if (!busy && now - s.lastReact < MIN_GAP && rule.priority > 2) return;
      s.reaction = rule.pose;
      s.reactUntil = now + rule.ms;
      s.lastReact = now;
      if (s.timer) clearTimeout(s.timer);
      s.timer = setTimeout(refresh, rule.ms + 30);
      setSt((cur) => ({ pose: rule.pose, reactions: cur.reactions + 1 }));
    },
    [enabled, refresh]
  );

  return { pose: st.pose, reactions: st.reactions, emit };
}
