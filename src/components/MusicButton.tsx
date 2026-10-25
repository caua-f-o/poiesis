// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
/* Botão da música de foco (barra superior), com tocar/pausar, volume e pausa automática. */
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TRACK, type MusicState } from "@/lib/useFocusMusic";
import { Icon } from "./Icon";
import { Tip } from "./md";
import { cn } from "@/lib/utils";

export function MusicButton({
  state,
  error,
  volume,
  autoPause,
  onToggle,
  onVolume,
  onAutoPause,
}: {
  state: MusicState;
  error: string | null;
  volume: number;
  autoPause: boolean;
  onToggle(): void;
  onVolume(v: number): void;
  onAutoPause(v: boolean): void;
}) {
  const playing = state === "playing";
  return (
    <Popover>
      <Tip label={playing ? "Música de foco tocando" : "Música de foco"}>
        <PopoverTrigger asChild>
          <button className="md-icon-btn relative" aria-label="Música de foco" data-on={playing} data-pz="music" data-state={state}>
            <Icon name={playing ? "headphones" : "music_note"} size={21} fill={playing} />
            {playing && <span className="pz-eq" aria-hidden="true"><i /><i /><i /></span>}
          </button>
        </PopoverTrigger>
      </Tip>
      <PopoverContent align="end" className="w-[300px] p-4" data-pz="music-panel">
        <div className="flex items-center gap-3">
          <button
            className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full", playing ? "bg-md-primary text-md-on-primary" : "bg-md-primary-c text-md-on-primary-c")}
            onClick={onToggle}
            aria-label={playing ? "Pausar a música" : "Tocar a música"}
            disabled={state === "loading"}
          >
            <Icon name={state === "loading" ? "progress_activity" : playing ? "pause" : "play_arrow"} size={24} fill className={state === "loading" ? "animate-spin" : ""} />
          </button>
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-semibold text-md-on-surface">{TRACK.title}</div>
            <div className="text-[11.5px] leading-snug text-md-on-variant">{TRACK.note}</div>
          </div>
        </div>
        <label className="mt-4 flex items-center gap-2 text-[12px] text-md-on-variant">
          <Icon name={volume === 0 ? "volume_off" : volume < 0.5 ? "volume_down" : "volume_up"} size={18} />
          <input type="range" min={0} max={100} value={Math.round(volume * 100)} onChange={(e) => onVolume(+e.target.value / 100)} className="flex-1" aria-label="Volume da música" />
          <span className="w-8 text-right tabular-nums">{Math.round(volume * 100)}</span>
        </label>
        <label className="mt-3 flex items-center gap-2 text-[12.5px] text-md-on-surface">
          <input type="checkbox" checked={autoPause} onChange={(e) => onAutoPause(e.target.checked)} /> Pausar quando a aba ficar escondida
        </label>
        {error && <div className="mt-2 text-[12px] text-[var(--syn-invalid)]">Não foi possível tocar: {error}</div>}
        <p className="mt-3 text-[11px] leading-snug text-md-outline">A faixa vem dentro da extensão: nada é baixado nem transmitido.</p>
      </PopoverContent>
    </Popover>
  );
}
