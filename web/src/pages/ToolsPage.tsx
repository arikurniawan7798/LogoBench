import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, saveBlob, type ApiError } from "../api";
import ErrorBanner from "../components/ErrorBanner";
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  cn,
  hintClasses,
  IconDownload,
  IconImage,
  IconSparkles,
  Input,
  labelClasses,
  PageHeader,
} from "../components/ui";
import { useApiError, useToast, useToastsEnabled } from "../components/toast";
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
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tools"
        description={<p>Quick utilities that work on any image, no project needed. Files are processed on this machine.</p>}
      />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <FaviconTool />
        <BackgroundTool />
      </div>
    </div>
  );
}

function FileField({ id, label, file, onPick }: { id: string; label: string; file: File | null; onPick: (f: File | null, problem: ApiError | null) => void }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className={labelClasses}>
        {label}
      </label>
      <input
        id={id}
        type="file"
        accept={ACCEPT}
        aria-describedby={`${id}-hint`}
        className={cn(
          "block w-full min-w-0 cursor-pointer rounded-lg border border-dashed border-line-strong bg-subtle p-1.5 text-sm text-fg-muted",
          "file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-fg file:shadow-xs file:ring-1 file:ring-line-strong",
          "hover:border-fg-subtle/60 hover:file:bg-muted-bg",
        )}
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          const problem = f ? checkFile(f) : null;
          onPick(problem ? null : f, problem);
        }}
      />
      <span id={`${id}-hint`} className={hintClasses}>
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
  const report = useApiError();
  const toast = useToast();
  const toastsOn = useToastsEnabled();
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
      setError(report({ code: "BAD_REQUEST", message: "Choose an image first." }));
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
      toast.success("favicons.zip is downloading.");
    } catch (err) {
      if (live.current) setError(report(err));
    } finally {
      if (live.current) setBusy(false);
    }
  }

  return (
    <Card as="form" onSubmit={onSubmit} aria-labelledby="favicon-title" noValidate className="flex flex-col gap-5">
      <CardHeader
        level={2}
        flush
        id="favicon-title"
        title="Favicon generator"
        icon={<IconImage className="size-4" />}
        description="Makes favicon.ico (16, 32 and 48 px), PNG favicons, an apple-touch-icon and Android icons from a square-ish mark."
      />
      <ErrorBanner error={error} onDismiss={() => setError(null)} />
      <FileField
        id="favicon-file"
        label="Image"
        file={file}
        onPick={(f, problem) => {
          setFile(f);
          setError(problem ? report(problem) : null);
        }}
      />
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <Button type="submit" variant="primary" loading={busy} loadingText="Generating…" icon={<IconDownload className="size-4" />}>
          Download favicons (.zip)
        </Button>
        <span className="text-sm text-fg-muted" role={toastsOn ? undefined : "status"}>
          {notice}
        </span>
      </div>
    </Card>
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
  const report = useApiError();
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
      setError(report({ code: "INVALID", message: `Width and height must be whole numbers from ${MIN_DIM} to ${MAX_DIM}.` }));
      return;
    }
    if (w * h > MAX_PIXELS) {
      setError(report({ code: "INVALID", message: "That is too large: width × height must be at most 33 megapixels." }));
      return;
    }
    if (!colorOk) {
      setError(report({ code: "INVALID", message: "Background color must be a hex color like #0F6B5E." }));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const blob = await api.makeBackground({ width: w, height: h, color: color.toUpperCase(), logo });
      if (live.current) showPreview(blob, w, h);
    } catch (err) {
      if (live.current) setError(report(err));
    } finally {
      if (live.current) setBusy(false);
    }
  }

  return (
    <Card as="form" onSubmit={onSubmit} aria-labelledby="bg-title" noValidate className="flex flex-col gap-5">
      <CardHeader
        level={2}
        flush
        id="bg-title"
        title="Background generator"
        icon={<IconSparkles className="size-4" />}
        description="A solid background in any size, with your logo centered on it if you add one."
      />
      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className={cn(labelClasses, "mb-1.5")}>Size</legend>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p.label}
              size="sm"
              aria-pressed={w === p.w && h === p.h}
              onClick={() => {
                setWidth(String(p.w));
                setHeight(String(p.h));
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
          <Input id="bg-width" label="Width (px)" type="number" inputMode="numeric" min={MIN_DIM} max={MAX_DIM} step={1} value={width} onChange={(e) => setWidth(e.target.value)} />
          <Input id="bg-height" label="Height (px)" type="number" inputMode="numeric" min={MIN_DIM} max={MAX_DIM} step={1} value={height} onChange={(e) => setHeight(e.target.value)} />
        </div>
      </fieldset>

      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-3 sm:max-w-sm">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="bg-color-picker" className={labelClasses}>
            Background color
          </label>
          <input
            id="bg-color-picker"
            type="color"
            value={colorOk ? color : "#000000"}
            onChange={(e) => setColor(e.target.value.toUpperCase())}
            className="h-10 w-full min-w-24 cursor-pointer rounded-lg border border-line-strong bg-surface p-1 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-moz-color-swatch]:rounded-md [&::-moz-color-swatch]:border-0"
          />
        </div>
        <Input
          id="bg-color"
          label="Hex"
          type="text"
          maxLength={7}
          spellCheck={false}
          className="font-mono"
          value={color}
          aria-invalid={!colorOk}
          onChange={(e) => setColor(e.target.value)}
        />
      </div>

      <FileField
        id="bg-logo"
        label="Logo (optional)"
        file={logo}
        onPick={(f, problem) => {
          setLogo(f);
          setError(problem ? report(problem) : null);
        }}
      />

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-5">
        <Button type="submit" variant="primary" loading={busy} loadingText="Generating…">
          Generate background
        </Button>
        {preview && (
          <ButtonLink variant="download" href={preview.url} download="background.png">
            Download PNG
          </ButtonLink>
        )}
      </div>

      {preview && (
        <figure className="flex flex-col gap-2">
          <div className="grid place-items-center rounded-xl border border-line bg-subtle p-4">
            <img
              src={preview.url}
              alt={`Generated background, ${preview.w} by ${preview.h} pixels`}
              className="max-h-80 max-w-full rounded-md object-contain shadow-sm ring-1 ring-black/5"
            />
          </div>
          <figcaption className="text-xs text-fg-muted">
            {preview.w}×{preview.h} px preview
          </figcaption>
        </figure>
      )}
    </Card>
  );
}
