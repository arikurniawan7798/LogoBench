import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, saveBlob, toApiError, type ApiError } from "../api";
import ErrorBanner from "../components/ErrorBanner";
import { ACCEPT, checkFile } from "../files";
import { HEX_RE } from "../color";

const PRESETS = [
  { label: "Desktop 1920×1080", w: 1920, h: 1080 },
  { label: "Square post 1080×1080", w: 1080, h: 1080 },
  { label: "Link preview 1200×630", w: 1200, h: 630 },
  { label: "Header 1500×500", w: 1500, h: 500 },
];
/** Mirrors server/src/export/background.ts limits; the server enforces them. */
const MIN_DIM = 16;
const MAX_DIM = 8192;
const MAX_PIXELS = 33_000_000;

export default function ToolsPage() {
  return (
    <div className="tools">
      <h1>Tools</h1>
      <p className="muted section-note">Quick utilities that work on any image, no project needed. Files are processed on this machine.</p>
      <FaviconTool />
      <BackgroundTool />
    </div>
  );
}

function FileField({ id, label, file, onPick }: { id: string; label: string; file: File | null; onPick: (f: File | null, problem: ApiError | null) => void }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="file"
        accept={ACCEPT}
        aria-describedby={`${id}-hint`}
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          const problem = f ? checkFile(f) : null;
          onPick(problem ? null : f, problem);
        }}
      />
      <span id={`${id}-hint`} className="muted small">
        {file ? `Selected: ${file.name}` : "SVG, PNG, JPG or WebP, up to 10 MB."}
      </span>
    </div>
  );
}

function FaviconTool() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState("");
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!file) {
      setError({ code: "BAD_REQUEST", message: "Choose an image first." });
      return;
    }
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      const blob = await api.makeFavicons(file);
      if (!live.current) return;
      saveBlob(blob, "favicons.zip");
      setNotice("favicons.zip is downloading.");
    } catch (err) {
      if (live.current) setError(toApiError(err));
    } finally {
      if (live.current) setBusy(false);
    }
  }

  return (
    <form className="card tool" onSubmit={onSubmit} aria-labelledby="favicon-title" noValidate>
      <h2 id="favicon-title">Favicon generator</h2>
      <p className="muted small">
        Makes favicon.ico (16, 32 and 48 px), PNG favicons, an apple-touch-icon and Android icons from a square-ish mark.
      </p>
      <ErrorBanner error={error} onDismiss={() => setError(null)} />
      <FileField
        id="favicon-file"
        label="Image"
        file={file}
        onPick={(f, problem) => {
          setFile(f);
          setError(problem);
        }}
      />
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>
          {busy ? "Generating…" : "Download favicons (.zip)"}
        </button>
        <span className="muted small" role="status">
          {notice}
        </span>
      </div>
    </form>
  );
}

function BackgroundTool() {
  const [width, setWidth] = useState("1920");
  const [height, setHeight] = useState("1080");
  const [color, setColor] = useState("#0F6B5E");
  const [logo, setLogo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [preview, setPreview] = useState<{ url: string; w: number; h: number } | null>(null);
  const previewRef = useRef<string | null>(null);
  const live = useRef(true);

  // Revoke the preview's object URL when it is replaced and on unmount.
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    };
  }, []);

  function showPreview(blob: Blob, w: number, h: number) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const url = URL.createObjectURL(blob);
    previewRef.current = url;
    setPreview({ url, w, h });
  }

  const w = Number(width);
  const h = Number(height);
  const dimsOk = Number.isInteger(w) && Number.isInteger(h) && w >= MIN_DIM && h >= MIN_DIM && w <= MAX_DIM && h <= MAX_DIM;
  const colorOk = HEX_RE.test(color);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!dimsOk) {
      setError({ code: "INVALID", message: `Width and height must be whole numbers from ${MIN_DIM} to ${MAX_DIM}.` });
      return;
    }
    if (w * h > MAX_PIXELS) {
      setError({ code: "INVALID", message: "That is too large: width × height must be at most 33 megapixels." });
      return;
    }
    if (!colorOk) {
      setError({ code: "INVALID", message: "Background color must be a hex color like #0F6B5E." });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const blob = await api.makeBackground({ width: w, height: h, color: color.toUpperCase(), logo });
      if (live.current) showPreview(blob, w, h);
    } catch (err) {
      if (live.current) setError(toApiError(err));
    } finally {
      if (live.current) setBusy(false);
    }
  }

  return (
    <form className="card tool" onSubmit={onSubmit} aria-labelledby="bg-title" noValidate>
      <h2 id="bg-title">Background generator</h2>
      <p className="muted small">A solid background in any size, with your logo centered on it if you add one.</p>
      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      <fieldset className="plain-fieldset">
        <legend className="field-legend">Size</legend>
        <div className="preset-row">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="btn btn-small"
              aria-pressed={w === p.w && h === p.h}
              onClick={() => {
                setWidth(String(p.w));
                setHeight(String(p.h));
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="inline-fields">
          <div className="field">
            <label htmlFor="bg-width">Width (px)</label>
            <input id="bg-width" type="number" inputMode="numeric" min={MIN_DIM} max={MAX_DIM} step={1} value={width} onChange={(e) => setWidth(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="bg-height">Height (px)</label>
            <input id="bg-height" type="number" inputMode="numeric" min={MIN_DIM} max={MAX_DIM} step={1} value={height} onChange={(e) => setHeight(e.target.value)} />
          </div>
        </div>
      </fieldset>

      <div className="inline-fields">
        <div className="field">
          <label htmlFor="bg-color-picker">Background color</label>
          <input id="bg-color-picker" type="color" value={colorOk ? color : "#000000"} onChange={(e) => setColor(e.target.value.toUpperCase())} />
        </div>
        <div className="field">
          <label htmlFor="bg-color">Hex</label>
          <input
            id="bg-color"
            type="text"
            maxLength={7}
            spellCheck={false}
            value={color}
            aria-invalid={!colorOk}
            onChange={(e) => setColor(e.target.value)}
          />
        </div>
      </div>

      <FileField
        id="bg-logo"
        label="Logo (optional)"
        file={logo}
        onPick={(f, problem) => {
          setLogo(f);
          setError(problem);
        }}
      />

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>
          {busy ? "Generating…" : "Generate background"}
        </button>
        {preview && (
          <a className="btn" href={preview.url} download="background.png">
            Download PNG
          </a>
        )}
      </div>

      {preview && (
        <figure className="bg-preview">
          <img src={preview.url} alt={`Generated background, ${preview.w} by ${preview.h} pixels`} />
          <figcaption className="muted small">
            {preview.w}×{preview.h} px preview
          </figcaption>
        </figure>
      )}
    </form>
  );
}
