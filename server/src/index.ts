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
createApp({ webDir }).listen(port, "127.0.0.1", () => {
  console.log(`LogoBench listening on http://127.0.0.1:${port}`);
});
