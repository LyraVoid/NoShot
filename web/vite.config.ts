import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// The WebUI runs inside a WebView with no network. Inline the bundle so the
// module ships exactly one index.html alongside the M3E token stylesheet.
export default defineConfig({
  base: "./",
  plugins: [react(), viteSingleFile()],
  build: {
    target: "es2020",
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 4096,
  },
});
