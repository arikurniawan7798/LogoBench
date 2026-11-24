import { useEffect, useState } from "react";
import { api, urls, type ApiError, type MockupSpec } from "../api";
import ErrorBanner from "../components/ErrorBanner";
import { Skeleton } from "../components/loading";
import { useApiError } from "../components/toast";
import { href } from "../router";

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
  const [failed, setFailed] = useState<Record<string, boolean>>({});
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

  // Rendered fresh by the server on every request; the bust value forces a re-fetch after colors/type change.
  const bust = `${versionId ?? ""}-${nameToken(projectName)}-${round}`;

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
            onClick={() => {
              setFailed({});
              setRound((r) => r + 1);
            }}
            disabled={!specs?.length}
          >
            Re-render
          </button>
        </div>
      </div>

      {specs === null && (
        <Skeleton label="Loading mockups…" lines={4} variant="cards" />
      )}

      <ul className="mockup-grid">
        {specs?.map((m) => {
          const src = urls.mockup(projectId, m.kind, bust);
          return (
            <li key={m.kind}>
              <figure className="mockup">
                <div className="mockup-frame">
                  {failed[m.kind] ? (
                    <p className="muted small mockup-failed">This mockup could not be rendered. Try Re-render.</p>
                  ) : (
                    <img
                      src={src}
                      alt={`${m.label} mockup`}
                      width={m.width}
                      height={m.height}
                      loading="lazy"
                      onError={() => setFailed((f) => ({ ...f, [m.kind]: true }))}
                    />
                  )}
                </div>
                <figcaption>
                  <span>{m.label}</span>{" "}
                  <span className="muted small">
                    {m.width}×{m.height} px
                  </span>{" "}
                  <a href={src} download={`${m.kind}.png`} className="small">
                    Download PNG<span className="sr-only">: {m.label}</span>
                  </a>
                </figcaption>
              </figure>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
