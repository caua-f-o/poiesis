// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
/* Arte dos companheiros, em SVG por partes: as poses trocam partes (olhos, boca) e o CSS
 * (index.css, "companheiros") anima grupos. A arte é decorativa (aria-hidden); o botão
 * em volta é a única área interativa. Para trocar por outra arte, mantenha as classes. */
import { useId } from "react";
import type { CompanionId, CompanionLevel } from "@/lib/types";
import type { Pose } from "@/lib/companion";
import { cn } from "@/lib/utils";

const POSE_LABEL: Record<Pose, string> = {
  idle: "tranquilo",
  watch: "acompanhando",
  observe: "observando",
  sleep: "dormindo",
  curious: "curioso",
  happy: "contente",
  doubt: "intrigado",
  pet: "feliz com o carinho",
};

export const COMPANION_NAME: Record<Exclude<CompanionId, "nenhum">, string> = { polen: "Pólen", lumen: "Lúmen" };

function Polen({ uid, bloom }: { uid: string; bloom: boolean }) {
  const g = (n: string) => `${uid}-${n}`;
  return (
    <>
      <defs>
        <radialGradient id={g("seed")} cx="40%" cy="35%" r="75%">
          <stop offset="0" stopColor="#fbf1d6" />
          <stop offset="0.6" stopColor="#f0d9a1" />
          <stop offset="1" stopColor="#d8b36b" />
        </radialGradient>
        <linearGradient id={g("leafA")} x1="0" y1="1" x2="0.2" y2="0">
          <stop offset="0" stopColor="#6f9466" />
          <stop offset="1" stopColor="#a9c79a" />
        </linearGradient>
        <linearGradient id={g("leafB")} x1="1" y1="1" x2="0.8" y2="0">
          <stop offset="0" stopColor="#c9993f" />
          <stop offset="1" stopColor="#ecc976" />
        </linearGradient>
      </defs>
      <ellipse className="pzc-shadow" cx="32" cy="60.5" rx="13" ry="2.4" fill="#000" opacity="0.2" />
      <g className="pzc-hop">
        <g className="pzc-body">
          {/* raízes-pezinhos */}
          <path d="M27.5 54.5 q-1.5 3.6 -5 4.2" fill="none" stroke="#9a7438" strokeWidth="2" strokeLinecap="round" />
          <path d="M36.5 54.5 q1.5 3.6 5 4.2" fill="none" stroke="#9a7438" strokeWidth="2" strokeLinecap="round" />
          {/* coroa de folhas */}
          <g className="pzc-leaves">
            <path className="pzc-lf1" d="M31 23 C 25 20, 20.5 14, 21.5 8 C 27.5 9.5, 31.5 15, 31 23 Z" fill={`url(#${g("leafA")})`} stroke="#557a50" strokeWidth="0.8" />
            <path className="pzc-lf2" d="M33 23 C 39 20, 43.5 14, 42.5 8 C 36.5 9.5, 32.5 15, 33 23 Z" fill={`url(#${g("leafB")})`} stroke="#a77e2e" strokeWidth="0.8" />
            <path className="pzc-lf3" d="M32 23 C 30 17.5, 30.5 12, 32.6 8.5 C 34.4 12.5, 34.2 18, 32 23 Z" fill="#7fa572" stroke="#557a50" strokeWidth="0.7" />
            {bloom && (
              <g className="pzc-mark" transform="translate(32.6 8.2)">
                {[0, 72, 144, 216, 288].map((a) => (
                  <ellipse key={a} cx="0" cy="-2.2" rx="1.5" ry="2.2" fill="#f7d6c6" stroke="#d99a86" strokeWidth="0.4" transform={`rotate(${a})`} />
                ))}
                <circle r="1.3" fill="#e8b84f" />
              </g>
            )}
          </g>
          {/* mãozinhas */}
          <ellipse className="pzc-hand pzc-hand-l" cx="18.2" cy="44" rx="2.6" ry="1.6" fill="#e2c47e" stroke="#9a7438" strokeWidth="0.8" transform="rotate(-25 18.2 44)" />
          <ellipse className="pzc-hand pzc-hand-r" cx="45.8" cy="44" rx="2.6" ry="1.6" fill="#e2c47e" stroke="#9a7438" strokeWidth="0.8" transform="rotate(25 45.8 44)" />
          {/* corpo-semente */}
          <path d="M32 21.5 C 42 21.5, 46.6 33.5, 46 42 C 45.4 50.8, 39.4 56, 32 56 C 24.6 56, 18.6 50.8, 18 42 C 17.4 33.5, 22 21.5, 32 21.5 Z" fill={`url(#${g("seed")})`} stroke="#8a6a33" strokeWidth="1.3" />
          <path d="M27 26 C 24 28.5, 22.5 32, 22.4 35.5" fill="none" stroke="#fffaf0" strokeWidth="1.6" strokeLinecap="round" opacity="0.75" />
          {/* bochechas */}
          <ellipse className="pzc-blush" cx="23.4" cy="45.2" rx="2.5" ry="1.3" fill="#e8907a" opacity="0.4" />
          <ellipse className="pzc-blush" cx="40.6" cy="45.2" rx="2.5" ry="1.3" fill="#e8907a" opacity="0.4" />
          {/* olhos */}
          <g className="pzc-eyes">
            <g className="pzc-open">
              <ellipse cx="27" cy="40" rx="2.7" ry="3.5" fill="#2b2118" />
              <ellipse cx="37" cy="40" rx="2.7" ry="3.5" fill="#2b2118" />
              <circle cx="27.9" cy="38.6" r="1" fill="#fff" />
              <circle cx="37.9" cy="38.6" r="1" fill="#fff" />
            </g>
            <g className="pzc-closed" fill="none" stroke="#2b2118" strokeWidth="1.3" strokeLinecap="round">
              <path d="M24.4 40.4 q2.6 2.2 5.2 0" />
              <path d="M34.4 40.4 q2.6 2.2 5.2 0" />
            </g>
            <g className="pzc-joy" fill="none" stroke="#2b2118" strokeWidth="1.4" strokeLinecap="round">
              <path d="M24.4 41 q2.6 -3 5.2 0" />
              <path d="M34.4 41 q2.6 -3 5.2 0" />
            </g>
          </g>
          {/* bocas (uma por vez, pela pose) */}
          <g fill="none" stroke="#2b2118" strokeWidth="1.2" strokeLinecap="round">
            <path className="pzc-m pzc-m-smile" d="M30 46.2 q2 1.8 4 0" />
            <path className="pzc-m pzc-m-big" d="M29.2 45.8 q2.8 3.2 5.6 0 z" fill="#b5584a" />
            <ellipse className="pzc-m pzc-m-o" cx="32" cy="47" rx="1.2" ry="1.5" fill="#6b3a2c" stroke="none" />
            <path className="pzc-m pzc-m-flat" d="M30.4 47 h3.2" />
          </g>
        </g>
      </g>
      {/* pólen dourado (comemoração) */}
      <g className="pzc-fx">
        {[
          [24, 26, 0],
          [41, 24, 0.12],
          [30, 18, 0.24],
          [37, 30, 0.3],
        ].map(([x, y, d], i) => (
          <circle key={i} className="pzc-dot" cx={x} cy={y} r="1.3" fill="#ecc976" style={{ animationDelay: `${d}s` }} />
        ))}
      </g>
      <Zz />
    </>
  );
}

function Lumen({ uid, orbit }: { uid: string; orbit: boolean }) {
  const g = (n: string) => `${uid}-${n}`;
  return (
    <>
      <defs>
        <radialGradient id={g("glow")} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ffd98a" stopOpacity="0.85" />
          <stop offset="0.45" stopColor="#f5c46a" stopOpacity="0.35" />
          <stop offset="1" stopColor="#f5c46a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={g("core")} cx="45%" cy="62%" r="70%">
          <stop offset="0" stopColor="#fffdf6" />
          <stop offset="0.55" stopColor="#fbefd2" />
          <stop offset="1" stopColor="#efc77e" />
        </radialGradient>
      </defs>
      <ellipse className="pzc-shadow" cx="32" cy="61" rx="9" ry="1.8" fill="#000" opacity="0.14" />
      <g className="pzc-float">
        <circle className="pzc-glow" cx="32" cy="37" r="25" fill={`url(#${g("glow")})`} />
        <circle className="pzc-ring" cx="32" cy="37" r="16" fill="none" stroke="#f3d38c" strokeWidth="1.2" />
        <g className="pzc-body">
          {/* halo */}
          <ellipse className="pzc-halo" cx="32" cy="12.5" rx="9.5" ry="2.4" fill="none" stroke="#f3cf7f" strokeWidth="1.5" />
          {orbit && (
            <g className="pzc-mark pzc-orbit">
              <path d="M41.5 12.5 l0.7 -1.6 l0.7 1.6 l1.6 0.7 l-1.6 0.7 l-0.7 1.6 l-0.7 -1.6 l-1.6 -0.7 z" fill="#fff4cf" />
            </g>
          )}
          {/* chamas-folhas laterais (braços etéreos) */}
          <path className="pzc-wisp pzc-wisp-l" d="M20.5 40 C 16 38, 14.5 34, 15.5 31 C 18.5 33, 20.5 35.5, 21.5 38.5 Z" fill="#f7dfa6" opacity="0.85" />
          <path className="pzc-wisp pzc-wisp-r" d="M43.5 40 C 48 38, 49.5 34, 48.5 31 C 45.5 33, 43.5 35.5, 42.5 38.5 Z" fill="#f7dfa6" opacity="0.85" />
          {/* corpo de luz: um broto/chama */}
          <path d="M32 16 C 37.5 22.5, 44.5 30.5, 44.5 39.5 C 44.5 48, 38.8 53.5, 32 53.5 C 25.2 53.5, 19.5 48, 19.5 39.5 C 19.5 30.5, 26.5 22.5, 32 16 Z" fill={`url(#${g("core")})`} stroke="#e6b765" strokeWidth="0.9" />
          <path d="M32 53.5 C 30 57, 31.5 59.5, 33.5 60.5 C 32.6 58, 34 56, 33.6 53.3 Z" className="pzc-tail" fill="#f2cf86" opacity="0.8" />
          <path d="M27.5 27 C 25.5 30, 24.4 33, 24.2 36" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
          {/* olhos */}
          <g className="pzc-eyes">
            <g className="pzc-open">
              <ellipse cx="27.6" cy="39.5" rx="2.1" ry="2.8" fill="#3a2f24" />
              <ellipse cx="36.4" cy="39.5" rx="2.1" ry="2.8" fill="#3a2f24" />
              <circle cx="28.3" cy="38.4" r="0.8" fill="#fff" />
              <circle cx="37.1" cy="38.4" r="0.8" fill="#fff" />
            </g>
            <g className="pzc-closed" fill="none" stroke="#3a2f24" strokeWidth="1.2" strokeLinecap="round">
              <path d="M25.5 40 q2.1 1.8 4.2 0" />
              <path d="M34.3 40 q2.1 1.8 4.2 0" />
            </g>
            <g className="pzc-joy" fill="none" stroke="#3a2f24" strokeWidth="1.3" strokeLinecap="round">
              <path d="M25.5 40.6 q2.1 -2.4 4.2 0" />
              <path d="M34.3 40.6 q2.1 -2.4 4.2 0" />
            </g>
          </g>
          <ellipse className="pzc-blush" cx="24.6" cy="44" rx="2" ry="1.1" fill="#f0a98a" opacity="0.35" />
          <ellipse className="pzc-blush" cx="39.4" cy="44" rx="2" ry="1.1" fill="#f0a98a" opacity="0.35" />
          <g fill="none" stroke="#3a2f24" strokeWidth="1.1" strokeLinecap="round">
            <path className="pzc-m pzc-m-smile" d="M30.4 45 q1.6 1.4 3.2 0" />
            <path className="pzc-m pzc-m-big" d="M30 44.8 q2 2.4 4 0" />
            <ellipse className="pzc-m pzc-m-o" cx="32" cy="45.6" rx="1" ry="1.2" fill="#6b4a33" stroke="none" />
            <path className="pzc-m pzc-m-flat" d="M30.8 45.6 h2.4" />
          </g>
        </g>
      </g>
      {/* estrela: uma ideia recém-iluminada */}
      <g className="pzc-fx">
        <path className="pzc-star" d="M48 18 l1.1 -2.6 l1.1 2.6 l2.6 1.1 l-2.6 1.1 l-1.1 2.6 l-1.1 -2.6 l-2.6 -1.1 z" fill="#fff1c4" stroke="#f1c46c" strokeWidth="0.5" />
      </g>
      <Zz />
    </>
  );
}

function Zz() {
  return (
    <g className="pzc-zz" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" opacity="0.7">
      <path className="pzc-z1" d="M45 20 h3.4 l-3.4 3.4 h3.4" />
      <path className="pzc-z2" d="M50 13 h2.6 l-2.6 2.6 h2.6" />
    </g>
  );
}

export function CompanionArt({ id, pose, level, bloom, place, className }: { id: Exclude<CompanionId, "nenhum">; pose: Pose; level: CompanionLevel; bloom?: boolean; place?: "rail" | "top"; className?: string }) {
  const uid = "pzc" + useId().replace(/[^\w-]/g, "");
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" className={cn("pzc", `pzc-${id}`, `pose-${pose}`, `lvl-${level}`, place && `place-${place}`, className)}>
      {id === "polen" ? <Polen uid={uid} bloom={!!bloom} /> : <Lumen uid={uid} orbit={!!bloom} />}
    </svg>
  );
}

/** O companheiro clicável. Só esta área recebe cliques; nada de teclado é capturado. */
export function Companion({
  id,
  pose,
  level,
  bloom,
  reactions,
  size = 56,
  place,
  onClick,
  className,
}: {
  id: Exclude<CompanionId, "nenhum">;
  pose: Pose;
  level: CompanionLevel;
  bloom?: boolean;
  reactions: number;
  size?: number;
  place?: "rail" | "top";
  onClick(): void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cn("pzc-btn", className)}
      style={{ width: size, height: size }}
      onClick={onClick}
      aria-label={`${COMPANION_NAME[id]}, seu companheiro (${POSE_LABEL[pose]})`}
      title={`${COMPANION_NAME[id]} — ${POSE_LABEL[pose]}`}
      data-pz="companion"
      data-id={id}
      data-pose={pose}
      data-level={level}
      data-reactions={reactions}
    >
      <CompanionArt id={id} pose={pose} level={level} bloom={bloom} place={place} />
    </button>
  );
}
