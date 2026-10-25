// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
/* O pacote `emmet` traz tipos, mas o campo "exports" dele não os expõe;
 * aqui ficam só as assinaturas que o Poiesis usa. */
declare module "emmet" {
  export interface UserConfig {
    type?: "markup" | "stylesheet";
    syntax?: string;
    text?: string | string[];
    options?: Record<string, unknown>;
  }
  export interface ExtractedAbbreviation {
    abbreviation: string;
    location: number;
    start: number;
    end: number;
  }
  export default function expandAbbreviation(abbr: string, config?: UserConfig): string;
  export function extract(
    line: string,
    pos?: number,
    options?: { lookAhead?: boolean; type?: "markup" | "stylesheet"; prefix?: string }
  ): ExtractedAbbreviation | undefined;
}
