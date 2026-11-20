import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, /api is proxied to the backend, so no CORS setup is needed.
// For production set VITE_API_URL (e.g. https://api.example.com) at build time.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://localhost:5000" } },
});
