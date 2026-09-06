import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  envDir: "../..",
  plugins: [react()],
  publicDir: "../../public",
  server: { port: 5173, proxy: { "/api": "http://localhost:8081" } },
  build: { outDir: "dist" },
});
