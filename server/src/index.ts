import fs from "node:fs";
import path from "node:path";
import { createApp } from "./app.js";
import { loadConfig, repoRoot } from "./config.js";

const { port } = loadConfig();
// `--serve-web` (used by the root `npm start`) serves the built web app from web/dist.
let webDir: string | undefined;
if (process.argv.includes("--serve-web")) {
  webDir = path.join(repoRoot, "web", "dist");
  if (!fs.existsSync(path.join(webDir, "index.html"))) {
    console.error(`No web build found at ${webDir}. Run "npm run build" first (or use "npm start", which builds it).`);
    process.exit(1);
  }
}
// Host/Origin guard: only loopback hosts on this port. In dev (no --serve-web) the browser talks to the Vite
// dev server (strictPort 5173, see web/vite.config.ts), whose proxy rewrites Host but forwards its Origin.
const devOrigins = webDir ? [] : ["http://localhost:5173", "http://127.0.0.1:5173"];
createApp({ webDir, hostCheck: { port, extraOrigins: devOrigins } }).listen(port, "127.0.0.1", () => {
  console.log(`LogoBench listening on http://127.0.0.1:${port}`);
});
