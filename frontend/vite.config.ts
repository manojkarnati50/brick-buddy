import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const api = process.env.VITE_API_TARGET ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: {
    rollupOptions: {
      output: { manualChunks: { three: ["three"], charts: ["recharts"], react: ["react", "react-dom", "react-router-dom", "motion"] } },
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: { "/api": api, "/files": api, "/ldraw": api },
  },
});
