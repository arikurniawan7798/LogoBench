import { useEffect, useState } from "react";
import { api, toApiError, urls, type ApiError, type MockupSpec } from "../api";
import ErrorBanner from "../components/ErrorBanner";
import { href } from "../router";

export default function MockupsTab({ projectId, versionId }: { projectId: string; versionId?: string }) {
  const [specs, setSpecs] = useState<MockupSpec[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [round, setRound] = useState(0);
  const [failed, setFailed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let live = true;
    api.listMockups().then(
      (s) => live && setSpecs(s),
      (e) => {
        if (!live) return;
        setSpecs([]);
        setError(toApiError(e));
      },
    );
    return () => {
      live = false;
    };
  }, []);

  // Rendered fresh by the server on every request; the bust value forces a re-fetch after colors/type change.
  const bust = `${versionId ?? ""}-${round}`;

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
        <p className="muted" role="status">
          Loading mockups…
        </p>
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
