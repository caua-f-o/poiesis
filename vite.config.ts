import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
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
