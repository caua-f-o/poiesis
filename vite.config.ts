// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { thirdPartyLicenses } from "./scripts/third-party-licenses.ts";

export default defineConfig({
  base: "./",
  plugins: [react(), thirdPartyLicenses()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "chrome116",
    modulePreload: { polyfill: false },
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: 0,
  },
});
