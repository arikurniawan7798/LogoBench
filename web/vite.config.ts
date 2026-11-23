import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// The API server listens on PORT (server/src/config.ts default 3001). Override the proxy target with
// LOGOBENCH_API_URL, or just set PORT to the same value used for the server.
const apiTarget = process.env.LOGOBENCH_API_URL || `http://127.0.0.1:${Number(process.env.PORT) || 3001}`;

export default defineConfig({
  plugins: [react()],
  // changeOrigin: the API server only accepts its own loopback Host (DNS-rebinding guard, server/src/hostcheck.ts).
  // strictPort: the server allows the dev Origin http://localhost:5173 only, so never drift to another port.
  server: { port: 5173, strictPort: true, proxy: { "/api": { target: apiTarget, changeOrigin: true } } },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
