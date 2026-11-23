import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// The API server listens on PORT (server/src/config.ts default 3001). Override the proxy target with
// LOGOBENCH_API_URL, or just set PORT to the same value used for the server.
const apiTarget = process.env.LOGOBENCH_API_URL || `http://127.0.0.1:${Number(process.env.PORT) || 3001}`;

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": apiTarget } },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
