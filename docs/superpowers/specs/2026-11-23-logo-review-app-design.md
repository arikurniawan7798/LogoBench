# Personal Logo Review & Brand Identity App — Design

Date: 2026-11-23

## Intent and why
Ari wants a personal, single-user web app modelled on the general feature set of AI logo-review and brand-identity tools for logo designers. It is for Ari's own use only: Ari uploads a logo, gets AI feedback, and builds a deliverable brand identity (colors, type, mockups, export files) to hand to clients. Ari asked for "all of the features", with an AI model connected, free is fine.

## Goals
- Run locally on Ari's Windows PC (localhost), no account, no login.
- Cover every tool in the Features list below.
- AI features use a vision-capable model; default is Gemini's free API tier, swappable to a local Ollama vision model in settings.
- Keep all projects and history on disk, locally.

## Non-goals
- Accounts, credits, pricing, billing, testimonials, community awards/palettes, marketing pages, multi-user, hosting/deployment.
- Real-time sharing links (replaced by exportable folder/zip).

## Anti-goals (failure even if it "works")
- Reproducing any existing product's name, branding, logo, exact copy, stats, testimonials or visual identity. The app uses its own original name, look and wording. Same *feature structure* only.
- Presenting AI scores as authoritative: output is framed as feedback, and the reviewer prompt must not invent facts about the logo.
- Sending logos anywhere other than the configured AI provider.

## Constraints
- Windows 11, Node-based tooling. Avoid dependencies needing hard native builds where a pure-JS option exists.
- Free Gemini tier has rate limits and needs internet; the app must handle 429/errors gracefully (clear message, retry hint, no crash).
- AI is used only for judgment tasks; everything deterministic is plain code.
- Gemini API key supplied by Ari via a local settings/env file; never committed or sent to the browser unnecessarily.

## Approaches considered
1. **Local web app with swappable AI layer (CHOSEN).** Frontend + small local backend; Gemini free tier default, Ollama optional. Best review quality for free; can go fully local later with no rewrite. Cost: rate limits, logos go to Google unless Ollama selected.
2. Fully offline Ollama only. Free/private but needs strong hardware and gives weaker design feedback; hardware unknown.
3. Single static HTML calling Gemini from the browser. Fastest, but key exposed in browser, weak storage, awkward PDF/export. Poor fit for "all features".

Ari picked approach 1.

## Features
AI-backed (via provider layer, vision input):
- **Logo Review:** scores readability, originality, balance, scalability, possible misinterpretations; brand-personality read (presence, attitude, formality, style, tone, positioning). Structured JSON output validated against a schema.
- **Advanced Review:** detailed fixes, delivery checklist, presentation ideas, downloadable PDF report.
- **Compare:** 2–3 concepts against one brief, with a recommendation.
- **Color suggestions / Typography suggestions:** AI proposes palette roles and font pairings; user can edit.

Deterministic:
- **Colors:** extract palette from the logo; assign main/support/neutral roles; HEX/RGB/CMYK; preview on buttons, links, text.
- **Typography:** pairings with web and social size scales (Google Fonts).
- **Mockups:** website header, mobile screen, app icon, favicon, business card, rendered from the logo and palette.
- **Export:** SVG/PNG/JPG packages in brand colors, favicons, backgrounds. Final logo files require Ari's own SVG input (PNG/JPG-only input limits export, shown clearly).
- **Favicon generator and logo background generator** as standalone tools.
- **Client form:** custom brief form (create, fill, store answers) feeding Compare/Review as a brief.
- **Brand identity page:** one-page summary of logo, colors, type, mockups; exported as a standalone folder/zip (index.html + assets) that opens offline and can be sent to a client.
- **Brand workflow / "Create identity":** one action running review → palette → fonts → mockups → identity page; a failed step is reported and others still complete.
- **History ("Explore"):** list of Ari's past projects/reviews.

## Decisions made with Ari
- Single user, local only, all features kept.
- Gemini free tier as default AI, Ollama as optional alternative.
- Client "private link" replaced by exported standalone folder/zip.

## My calls (Ari can override)
- Own name/branding/copy, original visual design.
- Stack: Vite + React frontend, Node (Express) backend, projects stored as files/JSON on disk (no database), `sharp` or equivalent for image work, PDF via a pure-JS library if adequate.
- Provider interface with two implementations (Gemini, Ollama); model name configurable, not hardcoded.
- Reviews cached per project so reruns don't burn free-tier quota.
- No auth; backend binds to localhost only.

## Further calls (added after reviewer read; my calls, Ari can override)
- **Scope:** the Features list above is the complete scope. No further research of other products is needed.
- **Inputs and Export:** upload accepts SVG, PNG, JPG, WebP. Review, colors, mockups, favicons and backgrounds work with any of them. Recolored/final logo files need SVG input; with raster input those options are disabled with a clear explanation. No auto-tracing in v1. SVG recoloring rewrites simple solid fills/strokes only; gradients or embedded images get a warning and are left unchanged.
- **Ollama:** a working second provider on a best-effort basis (tested once with a small vision model, JSON repair/retry on malformed output), not a v1 quality bar. Gemini is the supported path.
- **Scoring:** one shared model: each dimension scored 1–10 with a one-sentence reason. Compare ranks using the same scores plus the brief. The UI, PDF and history all use this scale.
- **Brief / client form:** a brief is free text, a filled client form, or both. Forms are user-defined, reusable templates (questions list); a filled form is attached to a project.
- **Project model:** a project is one logo (with re-uploadable versions) and its reviews, palette, fonts, mockups and exports. A Compare is its own record referencing 2–3 logo files plus a brief.
- **Cache:** reviews keyed by image hash + prompt version + model; a "re-run" button forces fresh output.
- **CMYK:** simple conversion, labelled "approximate, not print-accurate".
- **AI budget:** the builder picks a current free-tier Gemini vision model (configurable); "Create identity" runs AI calls sequentially with backoff and reports failed steps without aborting the rest.
- **Identity zip:** fonts are downloaded and bundled at export so it opens offline; mockups are pre-rendered PNGs. PDF report is multi-page with the logo embedded.
- **Done means:** each feature in the list works end to end on a real logo with the Gemini key configured, with errors (rate limit, bad key, bad file) shown clearly.

## Left to the builder
- Exact file layout, libraries, UI design, prompt wording, JSON schemas, PDF/mockup rendering technique, test strategy, build order (suggest: provider layer + Review first, then Colors/Type, Mockups/Export, then Identity/workflow).
