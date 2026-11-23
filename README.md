# LogoBench

A local, single-user app for reviewing a logo and building a small brand identity from it. You upload a logo,
an AI model critiques it, and the app helps with colors, typography, mockups, exports and a downloadable
brand-identity bundle. It runs on your own machine and listens on `127.0.0.1` only (no accounts, no login).

## Requirements

- Node.js 20.19 or newer
- A Gemini API key (free tier works), or a local [Ollama](https://ollama.com) with a vision model

## Install

```
npm install
```

## Run

- **Production-style (one process):** `npm start` builds the web app and serves it, together with the API,
  from Express. Open http://127.0.0.1:3001.
- **Development:** `npm run dev` starts the API (with reload) and the Vite dev server. Open http://localhost:5173
  (Vite uses that port strictly and fails rather than picking another); it proxies `/api` to the server on port 3001.

The port is 3001 unless you set `PORT` (see below). Other scripts: `npm run build` (type-check server, build web),
`npm test` (server and web tests).

## Gemini API key

1. Copy `.env.example` to `.env` in the repository root (next to `package.json`).
2. Set `GEMINI_API_KEY=` to your key, then restart the server.

The server reads `.env` at startup. Optional variables in the same file: `PORT` (default 3001) and `DATA_DIR`
(default `data/`). `.env` is gitignored; never commit it. The key is stored in plaintext in that file. It is only
used by the server and is never sent to the browser (the settings screen only reports whether a key is set).

The Settings screen only shows whether a key is configured; it cannot set one. The server's settings API also accepts a
`geminiKey`, which would be stored in plaintext in `data/settings.json` and take precedence over `.env`, but the app does not use this.

Default model: the code uses `gemini-3.6-flash` (`DEFAULT_GEMINI_MODEL` in `server/src/config.ts`). Model names and
free-tier availability change, so check it against the current Gemini documentation before relying on it. To use a
different model, change the Gemini model in Settings (no restart needed).

## Using Ollama instead

Open Settings, choose the Ollama provider, set the Ollama URL (default `http://127.0.0.1:11434`) and a vision-capable
model (default `llama3.2-vision`, which you must have pulled: `ollama pull llama3.2-vision`). Support is best-effort:
local models vary a lot in how well they follow the structured-output format, so expect more failed or low-quality
reviews than with Gemini.

## Your data

Everything is stored under `data/` in the repository (gitignored): projects, uploaded logos and versions, reviews,
colors, type systems, settings. To back up or move your work, copy that folder (set `DATA_DIR` to put it elsewhere).
It could contain a plaintext API key only if one was saved through the settings API; your `.env` key is not in it.

## Features

- Upload a logo (SVG, PNG, JPG or WebP, up to 10 MB) and add new versions later with "Upload new version" on the
  project page. Illustrator "Save As" SVGs are accepted; SVGs whose DOCTYPE uses external or nested entities are
  refused (re-export with File > Export > SVG)
- AI review with scores, personality read, summary, advanced review and a PDF report; compare 2 or 3 logos (the
  Compare brief can be loaded from a project's brief, including filled client forms)
- Color palette extraction and editing (HEX, RGB and CMYK; CMYK values are approximate, not print-accurate)
- Typography suggestions and pairings
- Mockups (website, app icon and more), favicon and background tools
- Client brief forms
- Export zip, and a brand-identity zip (single `index.html` page, logo, palette, mockups, fonts)
- "Create identity" runs review, colors, type, mockups and the bundle in one go, reporting any step that failed.
  A palette or type system you saved yourself is kept: those steps are skipped, never overwritten

Caveat: recolored logos and the final production files are produced only from SVG sources. Raster uploads (PNG, JPG,
WebP) can be reviewed, but the export tells you which files were skipped because they need an SVG (upload an SVG as a
new version to get them).

## Privacy

- With Gemini selected, your logo and brief are sent to Google for each AI call.
- With Ollama, AI calls stay on your machine only if the Ollama URL in Settings points to this machine (the default
  `http://127.0.0.1:11434` does); a remote Ollama URL receives your logo and brief.
- The identity zip embeds fonts that are downloaded from Google Fonts at export time (this request carries only the
  font names). The resulting zip works offline.
- Nothing else leaves the machine; the server binds to 127.0.0.1 only.
- Web pages you visit cannot drive the app: the server answers only requests addressed to `127.0.0.1`, `localhost`
  or `[::1]` on its port (anything else, e.g. a DNS-rebinding host name, gets 403), and refuses POST/PUT/DELETE
  requests whose `Origin` is another site. Open the app by one of those addresses.

## Known limitation

On Windows with Node 24 we observed a native crash (exit code 0xC0000409, no JS error) that can kill the node process
at random, roughly once per 7,000 to 20,000 loopback TCP connections. It is suspected to be an antivirus or Node bug
and is unproven. If the server disappears, just start it again; your data is on disk. The test suite avoids the problem
by talking to the app over an IPC socket (named pipe) instead of TCP.

## First-run check (manual, needs a real key)

Automated tests use a fake AI provider and fake fonts, so nothing has yet exercised a real Gemini key. After putting
your key in `.env` and running `npm start`:

1. Upload a real logo (SVG first, then a PNG).
2. Run Review. Confirm scores and summary appear, and that a repeated review is served from cache.
3. Run Create identity. Note the status of each step.
4. Download identity.zip, disconnect from the network, unzip it, and open `index.html`. Fonts and images must
   all load with no network.
5. Write down anything that failed: step name, the error banner text, and (for model errors) whether the model
   name in Settings is still valid.
