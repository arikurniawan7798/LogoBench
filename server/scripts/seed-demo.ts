/**
 * npm run seed:demo [-- --force] [-- --dir <path>]
 *
 * Fills a separate data directory (default: data-demo/ in the repository root) with invented demo brands, reviews,
 * palettes, type systems, a client form and a compare, so the app can be explored without an API key:
 *   npm run seed:demo
 *   npm run start:demo        (same as DATA_DIR=data-demo npm start)
 * Your real data/ directory is never touched.
 */
import path from "node:path";
import { repoRoot } from "../src/config.js";
import { seedDemo, SeedRefusedError } from "./demo/seed.js";

const args = process.argv.slice(2);
// `npm run seed:demo --force` (without the `--` separator, which Windows PowerShell 5.1 swallows) reaches us as npm config.
const force = args.includes("--force") || process.env.npm_config_force === "true";
const dirIdx = args.indexOf("--dir");
const unknown = args.filter((a, i) => a !== "--force" && a !== "--dir" && !(dirIdx >= 0 && i === dirIdx + 1));
if (unknown.length || (dirIdx >= 0 && !args[dirIdx + 1])) {
  console.error("Usage: npm run seed:demo [-- --force] [-- --dir <path>]");
  process.exit(2);
}
// --dir is relative to where npm was run (INIT_CWD), not to the server workspace.
const dataDir = dirIdx >= 0 ? path.resolve(process.env.INIT_CWD ?? process.cwd(), args[dirIdx + 1]!) : path.join(repoRoot, "data-demo");

try {
  console.log(`Seeding demo data into ${dataDir}`);
  const r = await seedDemo({ dataDir, force, protectedDirs: [path.join(repoRoot, "data")], log: (l) => console.log(l) });
  console.log(`Done: ${r.projects.length} projects, ${r.forms} form template, ${r.compares} compare.`);
  console.log(
    dirIdx >= 0
      ? `Start the app on it by setting DATA_DIR=${dataDir} and running npm start.`
      : "Start the app on it with:  npm run start:demo   (review/AI buttons still need an API key; seeded results are viewable)",
  );
} catch (e) {
  if (e instanceof SeedRefusedError) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}
