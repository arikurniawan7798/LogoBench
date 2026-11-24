# LogoBench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build LogoBench, a local single-user web app that reviews logos with an AI vision model and builds an exportable brand identity (colors, type, mockups, export files).

**Architecture:** npm workspaces monorepo: `server/` (Express + TypeScript, file-based storage, localhost only) and `web/` (Vite + React + TypeScript). AI sits behind a `Provider` interface (Gemini default, Ollama optional). Everything not judgment-based (palette, mockups, export, PDF, zip) is deterministic server code.

**Tech Stack:** Node 20+, TypeScript, Express, Vitest + supertest, zod, sharp, pdfkit, archiver, Vite, React, @google/generative-ai (or plain `fetch` to the Gemini REST API), plain `fetch` to Ollama.

**Spec:** `docs/superpowers/specs/2026-11-23-logo-review-app-design.md`

## Global Constraints
- Project root: the `logobench/` repository folder. Run `git init` there in Task 1.
- Windows 11; avoid dependencies needing hard native builds (`sharp` ships prebuilt binaries, fine).
- Single user, no auth, no accounts/credits/pricing. Backend binds to `127.0.0.1` only.
- Own name, branding, copy: never reuse any existing product's name, wording, stats, testimonials or look.
- Upload accepts SVG, PNG, JPG, WebP only.
- Scores: each dimension 1–10 integer with a one-sentence reason; one scoring model for Review, Advanced Review, Compare, PDF, history.
- Review dimensions: readability, originality, balance, scalability, misinterpretation risk. Personality fields: presence, attitude, formality, style, tone, positioning.
- Cache key for AI results: `sha256(imageBytes) + promptVersion + modelName`; "re-run" bypasses cache.
- CMYK always labelled "approximate, not print-accurate".
- Final/recolored logo files need SVG input; raster input disables them with a stated reason. Recolor rewrites simple solid fills/strokes only; gradients/embedded images produce a warning and stay unchanged.
- Gemini API key read from `logobench/.env` (`GEMINI_API_KEY`) or settings file; never returned to the browser, never committed (`.gitignore`).
- AI calls in "Create identity" run sequentially with backoff; a failed step is reported and the rest still run.
- Identity zip: fonts bundled (downloaded at export), mockups pre-rendered PNG, opens offline. PDF report multi-page with logo embedded.
- Data on disk under `logobench/data/` (gitignored): `projects/<id>/…`, `forms/`, `compares/`, `settings.json`.

## Review Focus
1. **Hostile/odd filenames and ids** (`..\..\x.png`, unicode, very long): stored under generated ids; the original name is only metadata; no path traversal. Test in Task 2.
2. **SVG containing `<script>`, event handlers or external refs**: sanitized on upload, never served as executable content. Test in Task 2.
3. **AI returns malformed output** (markdown-fenced JSON, missing field, score 11, extra prose): strip fences, validate with zod, retry once, then a clear error, never a crash or a partial save. Test in Task 3.
4. **Monochrome, transparent or near-white logos**: palette extraction ignores transparency, returns ≥1 color, still assigns roles (neutrals derived if needed). Test in Task 8.
5. **Missing/invalid Gemini key and 429 rate limit**: user-facing message naming the cause and a retry hint; the app keeps running; "Create identity" reports the failed step. Test in Task 3 and Task 13.

---

### Task 1: Scaffold, config and storage layer

**Files:**
- Create: `package.json` (workspaces), `.gitignore`, `.env.example`, `server/package.json`, `server/tsconfig.json`, `server/src/index.ts`, `server/src/app.ts`, `server/src/storage.ts`, `server/src/config.ts`, `server/tests/storage.test.ts`, `web/` (Vite React-TS template, minimal)

**Interfaces:**
- Produces: `createApp(deps?: { dataDir?: string; provider?: Provider }): Express` in `app.ts` (tests pass a temp dir and fake provider); `class Store { constructor(dataDir: string); readJson<T>(rel: string): Promise<T|null>; writeJson(rel: string, data: unknown): Promise<void>; writeFile(rel: string, data: Buffer): Promise<void>; readFile(rel: string): Promise<Buffer>; list(relDir: string): Promise<string[]>; newId(): string }` in `storage.ts`; `loadConfig(): { port: number; dataDir: string; geminiKey?: string }`.

- [ ] **Step 1:** `git init`; create workspace files, `.gitignore` (`node_modules`, `data`, `.env`, `dist`).
- [ ] **Step 2: Write failing test** `storage.test.ts`: `writeJson then readJson returns equal object`; `readJson of missing path returns null`; `any rel path resolving outside dataDir throws` (e.g. `../x`).
- [ ] **Step 3:** Run `npm test -w server` → FAIL.
- [ ] **Step 4:** Implement `Store` (all paths resolved and checked to stay inside `dataDir`; `newId` = `crypto.randomUUID()`), `createApp` with `GET /api/health` → `{ok:true}`, `index.ts` listening on `127.0.0.1`.
- [ ] **Step 5:** Run tests → PASS; `npm run dev` serves `/api/health`.
- [ ] **Step 6:** Commit `chore: scaffold logobench and storage layer`.

### Task 2: Projects and upload

**Files:** Create `server/src/projects.ts`, `server/src/svg.ts` (sanitizer), `server/src/routes/projects.ts`; Test `server/tests/projects.test.ts`, `server/tests/svg.test.ts`.

**Interfaces:**
- Consumes: `Store`, `createApp`.
- Produces: `type Project = { id: string; name: string; createdAt: string; versions: { id: string; file: string; mime: string; sha256: string; originalName: string; uploadedAt: string }[] }`; `sanitizeSvg(svg: string): string`; `ProjectService { create(name, file: {buffer, originalName}): Promise<Project>; get(id); list(); addVersion(id, file); latestVersion(id): {meta, bytes: Buffer} }`. Routes: `POST /api/projects` (multipart field `logo`, optional `name`), `GET /api/projects`, `GET /api/projects/:id`, `POST /api/projects/:id/versions`, `GET /api/projects/:id/logo` (latest bytes; SVG served as `image/svg+xml` with `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'`).

- [ ] **Step 1: Write failing tests:** `rejects .gif/.pdf with 415`; `rejects file with png extension but non-image bytes (sniff magic bytes) with 415`; `rejects >10MB with 413`; `hostile original name '..\\..\\evil.png' is stored under generated id and listing shows it only as originalName`; `sanitizeSvg removes <script>, on* attributes, javascript: hrefs and external href/xlink:href`; `sanitizeSvg keeps fills, paths, viewBox`; `GET /api/projects empty returns []`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement with `multer` memory storage, magic-byte sniffing, size cap 10MB, svg sanitize on SVG uploads (regex/DOM-free approach via `fast-xml-parser` or `sanitize` of tag/attr allow-list).
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit `feat: projects and safe upload`.

### Task 3: AI provider layer

**Files:** Create `server/src/ai/provider.ts`, `server/src/ai/gemini.ts`, `server/src/ai/ollama.ts`, `server/src/ai/structured.ts`, `server/src/ai/fake.ts`; Test `server/tests/structured.test.ts`, `server/tests/gemini.test.ts`.

**Interfaces:**
- Produces: `interface Provider { readonly name: string; readonly model: string; generateJson<T>(req: { system: string; prompt: string; images: { mime: string; bytes: Buffer }[]; schema: z.ZodType<T> }): Promise<T> }`; `class AiError extends Error { code: 'NO_KEY'|'BAD_KEY'|'RATE_LIMIT'|'BAD_OUTPUT'|'NETWORK'; retryAfterSec?: number }`; `parseModelJson<T>(raw: string, schema: z.ZodType<T>): T` (strips ``` fences and prose around the first JSON object); `withBackoff<T>(fn, opts: {retries: number; baseMs: number}): Promise<T>` (retries RATE_LIMIT/NETWORK only); `createProvider(settings): Provider` choosing gemini/ollama; `FakeProvider(responses)` for tests.

- [ ] **Step 1: Write failing tests:** `parseModelJson accepts fenced json`; `parseModelJson accepts leading prose`; `rejects score 11 with BAD_OUTPUT`; `rejects missing field`; `generateJson retries once on BAD_OUTPUT then throws AiError BAD_OUTPUT`; Gemini adapter with mocked `fetch`: `429 → AiError RATE_LIMIT with retryAfterSec`, `400/403 API key invalid → BAD_KEY`, `no key configured → NO_KEY before any network call`; `withBackoff retries 429 twice then succeeds`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Gemini: REST `generateContent` with inline image parts and JSON response mime type; default model is a current free-tier Gemini vision "flash" model read from settings (builder picks the current name and records it in `config.ts`). Ollama: `/api/chat` with `images` base64 and `format: 'json'`.
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit `feat: AI provider layer with validation and backoff`.

### Task 4: Settings API and AI error surface

**Files:** Create `server/src/settings.ts`, `server/src/routes/settings.ts`, `server/src/errors.ts`; Test `server/tests/settings.test.ts`.

**Interfaces:**
- Produces: `Settings = { provider: 'gemini'|'ollama'; geminiModel: string; ollamaModel: string; ollamaUrl: string; geminiKey?: string }`; `GET /api/settings` returns settings with `geminiKey` replaced by `hasGeminiKey: boolean`; `PUT /api/settings`; Express error middleware mapping `AiError` → `{error:{code,message,retryAfterSec?}}` with status 429/401/502/422.

- [ ] **Step 1: Write failing tests:** `GET never contains the key string`; `PUT persists and survives new app instance`; `AiError RATE_LIMIT maps to 429 with retry hint message`; `NO_KEY maps to 401 with message telling where to set the key`.
- [ ] **Step 2–4:** fail, implement, pass. **Step 5:** Commit `feat: settings and error mapping`.

### Task 5: Logo Review (scores, personality, cache)

**Files:** Create `server/src/review/schema.ts`, `server/src/review/prompts.ts`, `server/src/review/review.ts`, `server/src/review/cache.ts`, `server/src/routes/review.ts`; Test `server/tests/review.test.ts`.

**Interfaces:**
- Consumes: `Provider`, `ProjectService.latestVersion`, `Store`.
- Produces: `ReviewResult = { scores: Record<'readability'|'originality'|'balance'|'scalability'|'misinterpretation', {score: number; reason: string}>; personality: {presence, attitude, formality, style, tone, positioning: string}; summary: string }`; `reviewLogo(projectId, opts: {brief?: string; force?: boolean}): Promise<{result: ReviewResult; cached: boolean}>`; `PROMPT_VERSION = 'review-v1'`; route `POST /api/projects/:id/review` body `{brief?, force?}`; `GET /api/projects/:id/review` (latest stored).

- [ ] **Step 1: Write failing tests (FakeProvider):** `first call invokes provider once and stores result`; `second call with same image/prompt/model returns cached:true and provider call count stays 1`; `force:true calls provider again`; `different image bytes miss the cache`; `provider BAD_OUTPUT leaves nothing stored`; `prompt instructs not to invent text/elements not visible` (assert on the prompt string).
- [ ] **Step 2–4:** fail, implement, pass. **Step 5:** Commit `feat: logo review with caching`.

### Task 6: Advanced Review and PDF report

**Files:** Create `server/src/review/advanced.ts`, `server/src/report/pdf.ts`, `server/src/routes/advanced.ts`; Test `server/tests/advanced.test.ts`.

**Interfaces:**
- Produces: `AdvancedReview = ReviewResult & { fixes: {issue: string; fix: string; priority: 'high'|'medium'|'low'}[]; checklist: {item: string; done: boolean}[]; presentationIdeas: string[] }`; `advancedReview(projectId, opts): Promise<{result: AdvancedReview; cached: boolean}>`; `buildReportPdf(project: Project, review: AdvancedReview, logo: {mime: string; bytes: Buffer}): Promise<Buffer>`; routes `POST /api/projects/:id/advanced-review`, `GET /api/projects/:id/report.pdf`.

- [ ] **Step 1: Write failing tests:** `report.pdf starts with %PDF and has ≥2 pages for a result with 8 fixes` (count `/Type /Page`); `PDF builds for SVG, PNG and WebP logos` (SVG/WebP rasterized to PNG via sharp before embedding); `report.pdf 404 when no advanced review exists`.
- [ ] **Step 2–4:** fail, implement (pdfkit), pass. **Step 5:** Commit `feat: advanced review and PDF report`.

### Task 7: Client forms and briefs

**Files:** Create `server/src/forms.ts`, `server/src/routes/forms.ts`; Test `server/tests/forms.test.ts`.

**Interfaces:**
- Produces: `FormTemplate = { id; title; questions: {id; text; type: 'text'|'longtext'|'choice'; options?: string[]}[] }`; `FilledForm = { id; templateId; projectId; answers: Record<string,string> }`; `briefFromForm(t: FormTemplate, f: FilledForm): string` (plain-text brief for prompts); routes CRUD `/api/forms`, `POST /api/projects/:id/forms` (fill/attach), `GET /api/projects/:id/brief` returning `{text: string}` combining free-text brief + filled forms.

- [ ] **Step 1: Write failing tests:** `template create/list/update/delete`; `fill rejects answers to unknown question ids (422)`; `briefFromForm lists each question with its answer, skipping blanks`; `brief combines free text and form`.
- [ ] **Step 2–4:** fail, implement, pass; make Task 5 `reviewLogo` default `brief` to the project's brief when not passed. **Step 5:** Commit `feat: client forms and briefs`.

### Task 8: Colors

**Files:** Create `server/src/colors/extract.ts`, `server/src/colors/roles.ts`, `server/src/colors/convert.ts`, `server/src/routes/colors.ts`; Test `server/tests/colors.test.ts`.

**Interfaces:**
- Produces: `extractPalette(bytes: Buffer, mime: string, n?: number): Promise<{hex: string; share: number}[]>`; `assignRoles(colors): BrandPalette` where `BrandPalette = { main: Swatch; support: Swatch[]; neutral: Swatch[] }`, `Swatch = { hex; rgb: [number,number,number]; cmyk: [number,number,number,number]; cmykApproximate: true }`; `suggestPalette(projectId): Promise<BrandPalette>` (AI refines names/rationale, deterministic result is the fallback); routes `GET /api/projects/:id/colors`, `PUT /api/projects/:id/colors` (user edits), `POST /api/projects/:id/colors/suggest`.

- [ ] **Step 1: Write failing tests:** `hexToRgb/rgbToCmyk known values (#FF0000 → 0,100,100,0 approx)`; `all-black PNG returns ≥1 color and roles assigned`; `fully transparent PNG returns error 422 'no visible pixels'`; `transparent background pixels are ignored (red circle on transparent → main is red)`; `near-white logo still returns main + generated neutral`; `SVG input is rasterized before extraction`.
- [ ] **Step 2–4:** fail, implement (`sharp` resize to 128px, quantize, drop alpha<16), pass. **Step 5:** Commit `feat: palette extraction and roles`.

### Task 9: Typography

**Files:** Create `server/src/type/pairings.ts`, `server/src/routes/type.ts`, `server/data-static/fonts.json` (curated Google Fonts list with category/mood); Test `server/tests/type.test.ts`.

**Interfaces:**
- Produces: `TypeSystem = { heading: string; body: string; accent?: string; scale: { web: Record<'h1'|'h2'|'h3'|'body'|'small', string>; social: Record<'postTitle'|'postBody'|'caption', string> } }`; `suggestTypography(projectId): Promise<TypeSystem>` (AI picks only fonts present in `fonts.json`; unknown names are replaced by deterministic fallback by mood); routes `GET/PUT /api/projects/:id/type`, `POST /api/projects/:id/type/suggest`.

- [ ] **Step 1: Write failing tests:** `AI-suggested font not in curated list falls back`; `scale values are valid CSS sizes`; `PUT rejects fonts not in list`.
- [ ] **Step 2–4:** fail, implement, pass. **Step 5:** Commit `feat: typography suggestions`.

### Task 10: Export, favicon and background generators

**Files:** Create `server/src/export/recolor.ts`, `server/src/export/package.ts`, `server/src/export/favicon.ts`, `server/src/export/background.ts`, `server/src/routes/export.ts`; Test `server/tests/export.test.ts`.

**Interfaces:**
- Produces: `recolorSvg(svg: string, map: Record<string,string>): { svg: string; warnings: string[] }` (only solid `fill`/`stroke`; warns on gradients/`<image>`); `buildExportZip(projectId, opts: {palette: BrandPalette}): Promise<{zip: Buffer; skipped: string[]}>` (SVG variants only when source is SVG, else `skipped` lists them with reason); `makeFavicons(bytes, mime): Promise<{name: string; bytes: Buffer}[]>` (16, 32, 48, 180, 192, 512 PNG + `.ico`); `makeBackground(opts: {width; height; color; logo?}): Promise<Buffer>`; routes `GET /api/projects/:id/export.zip`, `POST /api/tools/favicons`, `POST /api/tools/background`.

- [ ] **Step 1: Write failing tests:** `recolorSvg swaps simple fills and keeps others`; `gradient SVG yields warning and unchanged gradient`; `PNG project export has no SVG files and skipped explains need for SVG`; `favicons include all six sizes plus ico`; `background output has requested dimensions`.
- [ ] **Step 2–4:** fail, implement, pass. **Step 5:** Commit `feat: export, favicons, backgrounds`.

### Task 11: Mockups

**Files:** Create `server/src/mockups/render.ts`, `server/src/mockups/templates/*.svg.ts` (website header, mobile screen, app icon, favicon preview, business card), `server/src/routes/mockups.ts`; Test `server/tests/mockups.test.ts`.

**Interfaces:**
- Produces: `type MockupKind = 'website'|'mobile'|'appicon'|'favicon'|'businesscard'`; `renderMockup(kind, input: {logo: {mime; bytes}; palette: BrandPalette; type: TypeSystem; brandName: string}): Promise<Buffer>` (PNG via SVG template + sharp); `GET /api/projects/:id/mockups/:kind.png`.

- [ ] **Step 1: Write failing tests:** `each kind renders a PNG with expected dimensions`; `brand name with <&"> characters is escaped (no broken output)`; `works with default palette/type when none saved`.
- [ ] **Step 2–4:** fail, implement, pass. **Step 5:** Commit `feat: mockups`.

### Task 12: Compare

**Files:** Create `server/src/compare/compare.ts`, `server/src/routes/compare.ts`; Test `server/tests/compare.test.ts`.

**Interfaces:**
- Produces: `Compare = { id; createdAt; brief: string; items: {projectId: string; versionId: string}[]; result: { scores: Record<string, ReviewResult['scores']>; recommendation: { winnerProjectId: string; reason: string }; notes: string[] } }`; `POST /api/compares` body `{items: [{projectId}], brief?}` (2–3 items else 422); `GET /api/compares`, `GET /api/compares/:id`.

- [ ] **Step 1: Write failing tests:** `1 or 4 items rejected`; `winnerProjectId must be one of the items or BAD_OUTPUT`; `result persisted and listed`; `images from all items sent to provider in one call`.
- [ ] **Step 2–4:** fail, implement, pass. **Step 5:** Commit `feat: compare concepts`.

### Task 13: Brand identity bundle and "Create identity" workflow

**Files:** Create `server/src/identity/page.ts`, `server/src/identity/bundle.ts`, `server/src/identity/fonts.ts`, `server/src/identity/workflow.ts`, `server/src/routes/identity.ts`; Test `server/tests/identity.test.ts`, `server/tests/workflow.test.ts`.

**Interfaces:**
- Consumes: reviewLogo, suggestPalette, suggestTypography, renderMockup, buildExportZip.
- Produces: `buildIdentityZip(projectId): Promise<Buffer>` (contains `index.html`, `assets/logo.*`, `assets/mockups/*.png`, `assets/fonts/*.woff2`, `@font-face` pointing to local files; no `http(s)://` references); `downloadFont(family: string): Promise<{file: string; bytes: Buffer}[]>` (injectable fetcher for tests); `runCreateIdentity(projectId, emit: (e: StepEvent) => void): Promise<StepResult[]>` where steps are `review, colors, type, mockups, identity` run sequentially, `StepResult = {step: string; status: 'ok'|'failed'|'skipped'; error?: {code: string; message: string}}`; routes `POST /api/projects/:id/create-identity` (streams step events via SSE), `GET /api/projects/:id/identity.zip`.

- [ ] **Step 1: Write failing tests:** `identity.html contains no remote URLs`; `fonts bundled when fetcher returns files; font download failure falls back to system stack with warning, zip still built`; `workflow with provider RATE_LIMIT on review marks review failed, still runs colors (deterministic fallback), type fallback, mockups, identity`; `steps run in order, never concurrently`; `NO_KEY marks AI steps failed with message pointing to settings`.
- [ ] **Step 2–4:** fail, implement, pass. **Step 5:** Commit `feat: identity bundle and create-identity workflow`.

### Task 14: Web app shell, Review and history

**Files:** Create `web/src/main.tsx`, `web/src/App.tsx`, `web/src/api.ts`, `web/src/pages/Home.tsx` (upload + history list), `web/src/pages/Project.tsx` (tabs shell), `web/src/pages/ReviewTab.tsx`, `web/src/pages/Settings.tsx`, `web/src/styles.css`; Test `web/src/__tests__/review.test.tsx` (Vitest + Testing Library); configure Vite proxy `/api` → `http://127.0.0.1:<port>`.

**Interfaces:**
- Consumes: routes from Tasks 2–6.
- Produces: `api.ts` typed client (`listProjects`, `createProject(file, name?)`, `getReview`, `runReview(id, {force})`, `getSettings`, `saveSettings`) and an error shape `{code, message, retryAfterSec?}` shown as a banner. Original visual design (own palette, type, copy); layout: Home (drop zone + history), Project with tabs Review / Advanced / Colors / Type / Mockups / Export / Identity, Compare and Forms and Tools in top nav.

- [ ] **Step 1: Write failing tests:** `ReviewTab renders five scores with reasons and personality`; `shows "Re-run" and cached badge`; `RATE_LIMIT error shows message with retry seconds`; `Home shows empty state when no projects`.
- [ ] **Step 2–4:** fail, implement, pass. **Step 5:** Commit `feat: web shell, review UI, history`.

### Task 15: Web: remaining tools UI

**Files:** Create `web/src/pages/AdvancedTab.tsx`, `ColorsTab.tsx`, `TypeTab.tsx`, `MockupsTab.tsx`, `ExportTab.tsx`, `IdentityTab.tsx`, `ComparePage.tsx`, `FormsPage.tsx`, `ToolsPage.tsx` (favicon + background); Test `web/src/__tests__/tabs.test.tsx`.

**Interfaces:** Consumes routes from Tasks 6–13; extends `api.ts` with matching typed functions.

- [ ] **Step 1: Write failing tests:** `ColorsTab shows HEX/RGB/CMYK with "approximate" label and lets user edit a role`; `ExportTab disables SVG options with reason for PNG projects`; `IdentityTab shows per-step status from SSE events including a failed step`; `ComparePage blocks submit with <2 or >3 images`; `FormsPage can add a question and save a template`.
- [ ] **Step 2–4:** fail, implement, pass. **Step 5:** Commit `feat: remaining tools UI`.

### Task 16: Run script, README and end-to-end check

**Files:** Create `README.md`, `package.json` scripts (`dev` runs server+web; `start` builds web and serves it from Express), `e2e/smoke.test.ts` (server-level, FakeProvider).

- [ ] **Step 1: Write failing test:** `smoke: upload SVG → review → colors → type → mockups → export.zip → identity.zip all return 200 with a FakeProvider`.
- [ ] **Step 2–4:** fail, implement `start` script, pass; README covers where to put `GEMINI_API_KEY`, how to run, and switching to Ollama.
- [ ] **Step 5: Manual verification with Ari's real key:** upload a real logo, run Review, Create identity, open the identity zip offline; list anything that fails.
- [ ] **Step 6:** Commit `docs: readme and smoke test`.

---

## Self-Review Notes
- Spec coverage: Review, Advanced+PDF, Compare, Colors, Typography, Mockups, Export, favicon/background tools, Client form, Brand identity zip, Create identity, History, settings/provider swap, cache, CMYK label, SVG-only final files, localhost, no key exposure — each has a task above. Explicit non-goals (accounts, credits, pricing, awards) have none.
- Names checked across tasks: `Provider`, `AiError`, `BrandPalette`, `TypeSystem`, `ReviewResult`, `ProjectService`, `Store`.
