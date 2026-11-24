import { useEffect, useId, useRef, useState, type MouseEvent, type SyntheticEvent } from "react";
import { api, urls, type ApiError, type MockupSpec } from "../api";
import ErrorBanner from "../components/ErrorBanner";
import { BusyLabel, Skeleton } from "../components/loading";
import { useApiError } from "../components/toast";
import { href } from "../router";

type Status = "loading" | "loaded" | "error";

/** Caption notes shown under a card (data, never baked into the PNG). */
const NOTES: Record<string, string> = {
  favicon: "Wordmarks lose detail at 16 px: the small tiles are shown at true size.",
  appicon: "Logos with a plain background are cut out; photos sit on a white badge.",
};

/** Short, stable token for the name so a rename changes every mockup URL (the server renders on each request). */
function nameToken(s: string): string {
  let h = 5381;
  for (const ch of s) h = ((h * 33) ^ (ch.codePointAt(0) ?? 0)) >>> 0;
  return h.toString(36);
}

export default function MockupsTab({
  projectId,
  versionId,
  projectName,
  onRename,
}: {
  projectId: string;
  versionId?: string;
  projectName: string;
  onRename: () => void;
}) {
  const [specs, setSpecs] = useState<MockupSpec[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [round, setRound] = useState(0);
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [retries, setRetries] = useState<Record<string, number>>({});
  const [rerendering, setRerendering] = useState(false);
  const [zoom, setZoom] = useState<MockupSpec | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const report = useApiError();

  useEffect(() => {
    let live = true;
    api.listMockups().then(
      (s) => live && setSpecs(s),
      (e) => {
        if (!live) return;
        setSpecs([]);
        setError(report(e));
      },
    );
    return () => {
      live = false;
    };
  }, [report]);

  // Rendered fresh by the server on every request; the bust value forces a re-fetch after a new version, a rename,
  // or Re-render (colors/type changes).
  const bust = `${versionId ?? ""}-${nameToken(projectName)}-${round}`;

  // Every image starts loading again whenever its URL changes.
  useEffect(() => {
    setStatus({});
    setRetries({});
  }, [bust]);

  const statusOf = (kind: string): Status => status[kind] ?? "loading";
  const anyLoading = !!specs?.some((m) => statusOf(m.kind) === "loading");
  const busy = rerendering && anyLoading;
  useEffect(() => {
    if (rerendering && !anyLoading) setRerendering(false);
  }, [rerendering, anyLoading]);

  // Focus goes back to the preview that opened the dialog.
  useEffect(() => {
    if (!zoom && opener.current) {
      opener.current.focus();
      opener.current = null;
    }
  }, [zoom]);

  const srcFor = (kind: string) => urls.mockup(projectId, kind, retries[kind] ? `${bust}-r${retries[kind]}` : bust);
  const set = (kind: string, s: Status) => setStatus((st) => (st[kind] === s ? st : { ...st, [kind]: s }));

  return (
    <div className="mockups">
      <ErrorBanner error={error} onDismiss={() => setError(null)} />
      <div className="section-head">
        <div>
          <h2>Mockups</h2>
          <p className="muted section-note">
            The logo placed in common settings, drawn with your saved <a href={href.project(projectId, "colors")}>colors</a> and{" "}
            <a href={href.project(projectId, "type")}>type</a>. Text is set in a system font of the same style (serif, sans or
            script) as your chosen fonts.
          </p>
          <p className="mockup-name-note">
            Mockups use the name “{projectName}”{" "}
            <span aria-hidden="true">—</span>{" "}
            <button type="button" className="link-button" onClick={onRename}>
              Rename<span className="sr-only"> logo</span>
            </button>
          </p>
        </div>
        <div className="section-actions">
          <button
            type="button"
            className="btn"
            aria-busy={busy}
            onClick={() => {
              // reset in the same update as the new round, so the button is busy from the first render
              setStatus({});
              setRetries({});
              setRerendering(true);
              setRound((r) => r + 1);
            }}
            disabled={!specs?.length || busy}
          >
            <BusyLabel busy={busy} busyText="Rendering…">
              Re-render
            </BusyLabel>
          </button>
        </div>
      </div>

      {specs === null && <Skeleton label="Loading mockups…" lines={4} variant="cards" />}

      {!!specs?.length && (
        <ul className="mockup-grid" aria-label="Mockups">
          {specs.map((m) => {
            const src = srcFor(m.kind);
            const st = statusOf(m.kind);
            return (
              <li key={m.kind} className="mockup-card">
                <div className={`mockup-preview is-${st}`} aria-busy={st === "loading"}>
                  {st === "error" ? (
                    <div className="mockup-failed">
                      <p className="small">This mockup could not be rendered.</p>
                      <button
                        type="button"
                        className="btn btn-small"
                        onClick={() => {
                          set(m.kind, "loading");
                          setRetries((r) => ({ ...r, [m.kind]: (r[m.kind] ?? 0) + 1 }));
                        }}
                      >
                        Retry<span className="sr-only">: {m.label}</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="mockup-open"
                      aria-label={`Enlarge ${m.label}`}
                      onClick={(e) => {
                        opener.current = e.currentTarget;
                        setZoom(m);
                      }}
                    >
                      {st === "loading" && <span className="mockup-skeleton" aria-hidden="true" />}
                      <img
                        key={src}
                        src={src}
                        alt={`${m.label} mockup`}
                        width={m.width}
                        height={m.height}
                        decoding="async"
                        onLoad={() => set(m.kind, "loaded")}
                        onError={() => set(m.kind, "error")}
                      />
                    </button>
                  )}
                </div>
                <div className="mockup-caption">
                  <div className="mockup-meta">
                    <h3 className="mockup-title">{m.label}</h3>
                    <span className="muted small">
                      {m.width}×{m.height} px
                    </span>
                  </div>
                  <a href={src} download={`${m.kind}.png`} className="btn btn-small btn-download mockup-download">
                    Download PNG<span className="sr-only">: {m.label}</span>
                  </a>
                </div>
                {NOTES[m.kind] && <p className="muted small mockup-note">{NOTES[m.kind]}</p>}
              </li>
            );
          })}
        </ul>
      )}

      {zoom && <MockupDialog spec={zoom} src={srcFor(zoom.kind)} onClose={() => setZoom(null)} />}
    </div>
  );
}

/** Larger view in a modal <dialog>: Esc, the Close button or a backdrop click closes it. */
function MockupDialog({ spec, src, onClose }: { spec: MockupSpec; src: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (typeof d.showModal === "function") {
      if (!d.open) d.showModal();
    } else {
      d.setAttribute("open", ""); // environments without the modal API (jsdom)
    }
    closeRef.current?.focus();
    return () => {
      if (typeof d.close === "function" && d.open) d.close();
    };
  }, []);

  const onBackdrop = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) onClose();
  };
  const onCancel = (e: SyntheticEvent) => {
    e.preventDefault(); // native Esc: let React state close it
    onClose();
  };

  return (
    <dialog
      ref={ref}
      className="mockup-dialog"
      aria-labelledby={titleId}
      onCancel={onCancel}
      onClick={onBackdrop}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div className="mockup-dialog-head">
        <h2 id={titleId}>
          {spec.label}{" "}
          <span className="muted small">
            {spec.width}×{spec.height} px
          </span>
        </h2>
        <div className="mockup-dialog-actions">
          <a href={src} download={`${spec.kind}.png`} className="btn btn-small btn-download">
            Download PNG
          </a>
          <button ref={closeRef} type="button" className="btn btn-small" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <div className="mockup-dialog-body">
        <img src={src} alt={`${spec.label} mockup, enlarged`} width={spec.width} height={spec.height} />
      </div>
    </dialog>
  );
}
