// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
/* Arte dos companheiros, em SVG por partes, a partir dos conceitos em docs/arte/
 * (polen-conceito.png e lumen-conceito.png). As poses trocam partes (olhos, boca, braços,
 * os sinais </>, … e ?) e o CSS (index.css, "companheiros") anima grupos. A arte é
 * decorativa (aria-hidden); o botão em volta é a única área interativa. */
import { useId } from "react";
import type { CompanionId, CompanionLevel } from "@/lib/types";
import type { Pose } from "@/lib/companion";
import { cn } from "@/lib/utils";

const POSE_LABEL: Record<Pose, string> = {
  idle: "tranquilo",
  rest: "em repouso",
  watch: "acompanhando",
  observe: "pensando",
  sleep: "dormindo",
  curious: "curioso",
  happy: "contente",
  doubt: "intrigado",
  pet: "feliz com o carinho",
};

export const COMPANION_NAME: Record<Exclude<CompanionId, "nenhum">, string> = { polen: "Pólen", lumen: "Lúmen" };

/* paletas dos conceitos */
const P = { ouro: "#f6c461", creme: "#fff4d6", folhaClara: "#9ccf7a", folhaOliva: "#6b8f4e", terra: "#2b2314" };
const L = { ambar: "#f6b74d", marfim: "#fff3d7", luz: "#ffe08a", salvia: "#9caf7a", carvao: "#1f1e1a" };

const Sparkle = ({ x, y, s = 1, className, fill = "#ffe7a3" }: { x: number; y: number; s?: number; className?: string; fill?: string }) => (
  <path className={className} d={`M${x} ${y - 3 * s} Q${x + 0.5 * s} ${y - 0.5 * s} ${x + 3 * s} ${y} Q${x + 0.5 * s} ${y + 0.5 * s} ${x} ${y + 3 * s} Q${x - 0.5 * s} ${y + 0.5 * s} ${x - 3 * s} ${y} Q${x - 0.5 * s} ${y - 0.5 * s} ${x} ${y - 3 * s} Z`} fill={fill} />
);

/** Olhos grandes e brilhantes (íris âmbar), fechados (repouso/sono) e felizes (^ ^). */
function Eyes({ uid, cx1, cx2, cy, r, ink }: { uid: string; cx1: number; cx2: number; cy: number; r: number; ink: string }) {
  const iris = `${uid}-iris`;
  const eye = (cx: number) => (
    <g key={cx}>
      <ellipse cx={cx} cy={cy} rx={r} ry={r * 1.12} fill={ink} />
      <ellipse cx={cx} cy={cy + r * 0.18} rx={r * 0.78} ry={r * 0.86} fill={`url(#${iris})`} />
      <ellipse cx={cx} cy={cy + r * 0.25} rx={r * 0.38} ry={r * 0.44} fill={ink} />
      <circle cx={cx + r * 0.36} cy={cy - r * 0.42} r={r * 0.36} fill="#fff" />
      <circle cx={cx - r * 0.34} cy={cy + r * 0.48} r={r * 0.16} fill="#fff" opacity="0.9" />
    </g>
  );
  const arc = (cx: number, up: boolean) => <path key={cx} d={up ? `M${cx - r} ${cy + r * 0.2} q${r} ${-r * 1.3} ${2 * r} 0` : `M${cx - r} ${cy - r * 0.1} q${r} ${r * 1.1} ${2 * r} 0`} />;
  return (
    <g className="pzc-eyes">
      <defs>
        <radialGradient id={iris} cx="50%" cy="70%" r="70%">
          <stop offset="0" stopColor="#f0a24a" />
          <stop offset="0.55" stopColor="#b8651f" />
          <stop offset="1" stopColor="#5a2c0e" />
        </radialGradient>
      </defs>
      <g className="pzc-open">{[eye(cx1), eye(cx2)]}</g>
      <g className="pzc-closed" fill="none" stroke={ink} strokeWidth="1.3" strokeLinecap="round">
        {[arc(cx1, false), arc(cx2, false)]}
      </g>
      <g className="pzc-joy" fill="none" stroke={ink} strokeWidth="1.4" strokeLinecap="round">
        {[arc(cx1, true), arc(cx2, true)]}
      </g>
    </g>
  );
}

/** Bocas: sorriso, sorriso aberto, "o" e reta; uma por vez, pela pose. */
function Mouth({ x, y, ink }: { x: number; y: number; ink: string }) {
  return (
    <g fill="none" stroke={ink} strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round">
      <path className="pzc-m pzc-m-smile" d={`M${x - 2.2} ${y} q2.2 2.2 4.4 0`} />
      <g className="pzc-m pzc-m-big">
        <path d={`M${x - 2.8} ${y - 0.4} q2.8 4 5.6 0 z`} fill="#7c3218" stroke={ink} />
        <path d={`M${x - 1.4} ${y + 1.6} q1.4 -0.9 2.8 0`} stroke="#e97f6a" strokeWidth="1" />
      </g>
      <ellipse className="pzc-m pzc-m-o" cx={x} cy={y + 0.8} rx="1.1" ry="1.4" fill="#6b2e18" stroke="none" />
      <path className="pzc-m pzc-m-flat" d={`M${x - 1.6} ${y + 0.8} q1.6 -0.8 3.2 0.2`} />
    </g>
  );
}

/** Sinais dos conceitos: </> (digitando/foco), … (pensando), ? (erro), z z z (dormindo). */
function Signs({ gold }: { gold: string }) {
  return (
    <>
      <g className="pzc-sign pzc-sign-code" fill="none" stroke={gold} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M49 12 l-3 3 l3 3" />
        <path d="M56 12 l3 3 l-3 3" />
        <path d="M53.6 11 l-1.8 8.2" />
      </g>
      <g className="pzc-sign pzc-sign-dots">
        <path d="M46 4 h13 a4 4 0 0 1 4 4 v3 a4 4 0 0 1 -4 4 h-8 l-3 3 v-3 h-2 a4 4 0 0 1 -4 -4 v-3 a4 4 0 0 1 4 -4 z" fill="#2a2420" stroke="#6b5a40" strokeWidth="0.6" />
        <circle className="pzc-dot1" cx="49.5" cy="9.5" r="1.15" fill="#f3dfb6" />
        <circle className="pzc-dot2" cx="52.5" cy="9.5" r="1.15" fill="#f3dfb6" />
        <circle className="pzc-dot3" cx="55.5" cy="9.5" r="1.15" fill="#f3dfb6" />
      </g>
      <path className="pzc-sign pzc-sign-q" d="M49.5 9 q0 -3.6 3.6 -3.6 q3.6 0 3.6 3.2 q0 2.2 -2.4 3.2 q-1.2 0.6 -1.2 2.2 M53.1 17.6 v0.2" fill="none" stroke={gold} strokeWidth="1.8" strokeLinecap="round" />
      <g className="pzc-zz" fill="none" stroke={gold} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <path className="pzc-z1" d="M46 16 h3.4 l-3.4 3.4 h3.4" />
        <path className="pzc-z2" d="M51 10 h3 l-3 3 h3" />
        <path className="pzc-z3" d="M56 4.5 h2.6 l-2.6 2.6 h2.6" />
      </g>
    </>
  );
}

function Leaf({ d, fill, vein, className, stroke }: { d: string; fill: string; vein?: string; className?: string; stroke: string }) {
  return (
    <g className={className}>
      <path d={d} fill={fill} stroke={stroke} strokeWidth="0.5" />
      {vein && <path d={vein} fill="none" stroke="#fff6d6" strokeWidth="0.55" strokeLinecap="round" opacity="0.7" />}
    </g>
  );
}

/* ================================== Pólen ================================== */
function Polen({ uid, bloom }: { uid: string; bloom: boolean }) {
  const g = (n: string) => `${uid}-${n}`;
  const gold = `url(#${g("gold")})`;
  const green = `url(#${g("green")})`;
  return (
    <>
      <defs>
        <radialGradient id={g("aura")} cx="50%" cy="55%" r="50%">
          <stop offset="0" stopColor={P.ouro} stopOpacity="0.45" />
          <stop offset="1" stopColor={P.ouro} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={g("bulb")} cx="42%" cy="38%" r="70%">
          <stop offset="0" stopColor="#fffbee" />
          <stop offset="0.45" stopColor={P.creme} />
          <stop offset="0.85" stopColor="#f6dc9c" />
          <stop offset="1" stopColor="#e9bd62" />
        </radialGradient>
        <linearGradient id={g("gold")} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#e2a43c" />
          <stop offset="0.6" stopColor={P.ouro} />
          <stop offset="1" stopColor="#ffe6a6" />
        </linearGradient>
        <linearGradient id={g("green")} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor={P.folhaOliva} />
          <stop offset="1" stopColor={P.folhaClara} />
        </linearGradient>
      </defs>
      <circle className="pzc-glow" cx="32" cy="38" r="26" fill={`url(#${g("aura")})`} />
      <ellipse className="pzc-shadow" cx="32" cy="61.2" rx="12" ry="1.8" fill="#000" opacity="0.22" />
      <g className="pzc-hop">
        <g className="pzc-body">
          {/* perninhas de raiz */}
          <g className="pzc-legs" fill="none" stroke="#e7ad4c" strokeWidth="2.4" strokeLinecap="round">
            <path d="M26.5 51.5 q-0.6 4.6 -3.2 7.6" />
            <path d="M37.5 51.5 q0.6 4.6 3.2 7.6" />
          </g>
          <g fill="#e7ad4c">
            <ellipse cx="22.6" cy="59.6" rx="2.4" ry="1.2" />
            <ellipse cx="41.4" cy="59.6" rx="2.4" ry="1.2" />
          </g>
          {/* broto: folhas douradas e verdes saindo da ponta */}
          <g className="pzc-leaves">
            <Leaf className="pzc-lf1" d="M31.5 21.5 C 25 17.5, 17 14, 11.5 5 C 21 4.5, 29 11, 31.5 21.5 Z" fill={gold} stroke="#c88a2c" vein="M30.5 20 C 25 15, 18.5 10.5, 13.5 6.2" />
            <Leaf className="pzc-lf2" d="M32.5 21.5 C 35 12, 41 4, 49.5 1.5 C 48.5 10, 42 17, 32.5 21.5 Z" fill={gold} stroke="#c88a2c" vein="M33.5 19.5 C 37.5 12, 42.5 6, 48.4 2.8" />
            <Leaf className="pzc-lf3" d="M32 21.5 C 27.5 14, 26.5 5, 29.5 -2 C 36 3.5, 36.5 13, 32 21.5 Z" fill={green} stroke="#56773f" vein="M31.8 20 C 30 13, 29.5 6, 29.8 -0.5" />
            <Leaf className="pzc-lf4" d="M32.5 22 C 39 18.5, 47 19, 54.5 23 C 47.5 27, 39 26.5, 32.5 22 Z" fill={green} stroke="#56773f" vein="M34 22 C 40 21, 47 21.3, 52.5 22.9" />
            <Leaf className="pzc-lf5" d="M31.5 22 C 25.5 20.5, 19 22, 14.5 26 C 21 28, 27.5 26.5, 31.5 22 Z" fill={green} stroke="#56773f" />
            <path d="M32 24 C 31.6 22.5, 31.8 21, 32.4 19.8" fill="none" stroke="#c88a2c" strokeWidth="1.3" strokeLinecap="round" />
            {bloom && (
              <g className="pzc-mark" transform="translate(30.2 2.2)">
                {[0, 72, 144, 216, 288].map((a) => (
                  <ellipse key={a} cx="0" cy="-2" rx="1.4" ry="2.1" fill="#fff0e4" stroke="#e7a98f" strokeWidth="0.4" transform={`rotate(${a})`} />
                ))}
                <circle r="1.2" fill={P.ouro} />
              </g>
            )}
          </g>
          {/* corpo: bulbo creme com a pontinha */}
          <path
            d="M32 20.5 C 33.6 23, 35.6 24.4, 38.6 25.4 C 45.8 27.6, 49.4 33.8, 48.9 40.6 C 48.4 48.6, 41.4 53.6, 32 53.6 C 22.6 53.6, 15.6 48.6, 15.1 40.6 C 14.6 33.8, 18.2 27.6, 25.4 25.4 C 28.4 24.4, 30.4 23, 32 20.5 Z"
            fill={`url(#${g("bulb")})`}
            stroke="#e4b25a"
            strokeWidth="0.8"
          />
          <path d="M23.5 29 C 20.5 31.5, 19 35, 18.8 38.5" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
          <path d="M40.5 28.5 C 43 30.5, 44.4 33, 45 35.5" fill="none" stroke="#f0cf8a" strokeWidth="0.7" strokeLinecap="round" opacity="0.6" />
          {/* bochechas, sobrancelhas, olhos, boca */}
          <ellipse className="pzc-blush" cx="20.4" cy="44.6" rx="2.7" ry="1.6" fill="#f4a07c" opacity="0.5" />
          <ellipse className="pzc-blush" cx="43.6" cy="44.6" rx="2.7" ry="1.6" fill="#f4a07c" opacity="0.5" />
          <g className="pzc-brows" fill="none" stroke="#9a6224" strokeWidth="0.9" strokeLinecap="round">
            <path d="M22.6 32.6 q2.2 -1.2 4.4 -0.2" />
            <path d="M37 32.4 q2.2 -1 4.4 0.2" />
          </g>
          <Eyes uid={uid} cx1={25} cx2={39} cy={38.6} r={3.9} ink="#2e1a0c" />
          <Mouth x={32} y={45.4} ink="#3a1d0c" />
          {/* braços-folha */}
          <Leaf className="pzc-hand pzc-hand-l" d="M16.2 41.5 C 12 41, 8.5 43.5, 7 47.5 C 11 48, 14.8 45.8, 16.2 41.5 Z" fill={green} stroke="#56773f" />
          <Leaf className="pzc-hand pzc-hand-r" d="M47.8 41.5 C 52 41, 55.5 43.5, 57 47.5 C 53 48, 49.2 45.8, 47.8 41.5 Z" fill={gold} stroke="#c88a2c" />
          {/* folha-cobertor do sono */}
          <Leaf className="pzc-blanket" d="M14.5 33.5 C 20 22.5, 41 20, 50.5 30.5 C 44 34.5, 26 36.5, 14.5 33.5 Z" fill={green} stroke="#56773f" vein="M17.5 33 C 27 30, 38 29, 48.5 30.6" />
        </g>
      </g>
      <g className="pzc-fx">
        <Sparkle className="pzc-spark pzc-spark1" x={10} y={14} s={1.3} />
        <Sparkle className="pzc-spark pzc-spark2" x={55} y={28} s={1} />
        <Sparkle className="pzc-spark pzc-spark3" x={8} y={33} s={0.8} />
        {[
          [22, 26, 0],
          [43, 24, 0.12],
          [28, 16, 0.24],
          [38, 30, 0.3],
        ].map(([x, y, d], i) => (
          <circle key={i} className="pzc-dot" cx={x} cy={y} r="1.2" fill={P.ouro} style={{ animationDelay: `${d}s` }} />
        ))}
      </g>
      <Signs gold={P.ouro} />
    </>
  );
}

/* ================================== Lúmen ================================== */
function Lumen({ uid, orbit }: { uid: string; orbit: boolean }) {
  const g = (n: string) => `${uid}-${n}`;
  const flame = `url(#${g("flame")})`;
  const sage = `url(#${g("sage")})`;
  return (
    <>
      <defs>
        <radialGradient id={g("aura")} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor={L.luz} stopOpacity="0.75" />
          <stop offset="0.5" stopColor={L.ambar} stopOpacity="0.28" />
          <stop offset="1" stopColor={L.ambar} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={g("orb")} cx="45%" cy="40%" r="65%">
          <stop offset="0" stopColor="#fffdf3" />
          <stop offset="0.5" stopColor={L.marfim} />
          <stop offset="0.85" stopColor={L.luz} />
          <stop offset="1" stopColor={L.ambar} />
        </radialGradient>
        <linearGradient id={g("flame")} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor={L.ambar} />
          <stop offset="0.55" stopColor={L.luz} />
          <stop offset="1" stopColor="#fff8dc" />
        </linearGradient>
        <linearGradient id={g("sage")} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#7d935e" />
          <stop offset="1" stopColor="#c3d3a4" />
        </linearGradient>
      </defs>
      <ellipse className="pzc-shadow" cx="32" cy="62" rx="8" ry="1.4" fill="#000" opacity="0.14" />
      <g className="pzc-float">
        <circle className="pzc-glow" cx="32" cy="35" r="27" fill={`url(#${g("aura")})`} />
        <circle className="pzc-ring" cx="32" cy="36" r="17" fill="none" stroke={L.luz} strokeWidth="1.2" />
        <g className="pzc-body">
          {/* chamas-folhas em redemoinho, atrás do orbe */}
          <g className="pzc-flames">
            <path className="pzc-wisp pzc-crest" d="M26.5 24.5 C 23.5 16, 27.5 6.5, 37 3.5 C 34 9.5, 36 15, 39.5 23 Z" fill={flame} />
            <path className="pzc-wisp pzc-wisp-r" d="M42 27.5 C 50 25.5, 55.5 19.5, 54.5 12 C 51.5 17.5, 47.5 21.5, 40.5 23.5 Z" fill={flame} />
            <path className="pzc-wisp pzc-wisp-l" d="M19.6 33.5 C 12 32.5, 7 37.5, 5.8 44.5 C 11 41, 15.5 39.8, 20.2 39.6 Z" fill={flame} />
            <path className="pzc-wisp pzc-leaf-tl" d="M24.5 25.8 C 19 23.8, 15.5 19, 16 13.5 C 19.5 17.5, 23 20, 27.8 22.6 Z" fill={sage} />
            <path className="pzc-wisp pzc-leaf-r" d="M45 40.5 C 52 41.5, 56.5 46.5, 56.5 53.5 C 52.5 49.5, 48.5 47.5, 43.5 45.5 Z" fill={sage} />
            <path className="pzc-wisp pzc-leaf-l" d="M21.5 45.5 C 15.5 48.5, 12.5 53.5, 13.5 58.5 C 17.5 54.5, 20.5 51.5, 24.5 48.5 Z" fill={flame} />
            <path className="pzc-wisp pzc-tail" d="M28.5 48 C 28 53.5, 31.5 57, 35.5 57.5 C 33 59.5, 28.5 59.5, 26 56.5 C 24 54, 24.8 50.5, 26.5 48.5 Z" fill={flame} />
          </g>
          {/* halo inclinado */}
          <ellipse className="pzc-halo" cx="33" cy="9.5" rx="11" ry="2.8" fill="none" stroke={L.luz} strokeWidth="1.4" transform="rotate(-12 33 9.5)" />
          {orbit && (
            <g className="pzc-mark pzc-orbit">
              <Sparkle x={44.5} y={7} s={0.9} fill="#fff8dc" />
            </g>
          )}
          {/* orbe de luz */}
          <circle cx="32" cy="36" r="14" fill={`url(#${g("orb")})`} />
          <path d="M23 31 C 23.5 27.5, 26 25, 29 24" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" opacity="0.85" />
          <ellipse className="pzc-blush" cx="23.3" cy="41.2" rx="2.3" ry="1.3" fill="#f6a989" opacity="0.45" />
          <ellipse className="pzc-blush" cx="40.7" cy="41.2" rx="2.3" ry="1.3" fill="#f6a989" opacity="0.45" />
          <g className="pzc-brows" fill="none" stroke="#a56b25" strokeWidth="0.8" strokeLinecap="round">
            <path d="M24 30.6 q2 -1 4 -0.1" />
            <path d="M36 30.5 q2 -0.9 4 0.1" />
          </g>
          <Eyes uid={uid} cx1={26.2} cx2={37.8} cy={36.4} r={3.4} ink="#2e1a0c" />
          <Mouth x={32} y={42.2} ink="#3a1d0c" />
        </g>
      </g>
      <g className="pzc-fx">
        <Sparkle className="pzc-spark pzc-star" x={52} y={30} s={1.4} fill="#fff4cc" />
        <Sparkle className="pzc-spark pzc-spark2" x={11} y={36} s={1} fill="#fff4cc" />
      </g>
      <Sparkle className="pzc-twinkle pzc-tw1" x={50} y={44} s={0.7} fill="#ffeeb8" />
      <Sparkle className="pzc-twinkle pzc-tw2" x={14} y={10} s={0.6} fill="#ffeeb8" />
      <Signs gold={L.luz} />
    </>
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
