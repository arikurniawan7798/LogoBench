import { useEffect, useState, type DragEvent, type FormEvent } from "react";
import { api, logoUrl, toApiError, type ApiError, type Project } from "../api";
import ErrorBanner from "../components/ErrorBanner";
import { href, navigate } from "../router";

const ACCEPT = ".svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp";
const MIME_OK = new Set(["image/svg+xml", "image/png", "image/jpeg", "image/webp"]);
const EXT_OK = /\.(svg|png|jpe?g|webp)$/i;
/** Mirrors the server's MAX_UPLOAD_BYTES (server/src/limits.ts); the server still enforces it. */
const MAX_BYTES = 10 * 1024 * 1024;

function checkFile(file: File): ApiError | null {
  if (!MIME_OK.has(file.type) && !EXT_OK.test(file.name)) {
    return { code: "UNSUPPORTED_MEDIA", message: `"${file.name}" is not an SVG, PNG, JPG or WebP image.` };
  }
  if (file.size > MAX_BYTES) return { code: "TOO_LARGE", message: "Logo files are limited to 10 MB." };
  return null;
}

export default function Home() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    let live = true;
    api.listProjects().then(
      (list) => live && setProjects([...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
      (e) => {
        if (!live) return;
        setProjects([]);
        setError(toApiError(e));
      },
    );
    return () => {
      live = false;
    };
  }, []);

  function pick(f: File | undefined) {
    if (!f) return;
    const problem = checkFile(f);
    setError(problem);
    setFile(problem ? null : f);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files?.[0]);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setError({ code: "BAD_REQUEST", message: "Choose a logo file first." });
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const project = await api.createProject(file, name);
      navigate(href.project(project.id, "review"));
    } catch (err) {
      setError(toApiError(err));
      setUploading(false);
    }
  }

  return (
    <div className="home">
      <section className="intro" aria-labelledby="home-title">
        <h1 id="home-title">Put a logo on the bench</h1>
        <p className="muted">
          Upload a mark to get a structured critique, then work up its colors, type and mockups. Everything stays on this machine
          except the image sent to the AI provider you choose in Settings.
        </p>
      </section>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      <form className="upload" onSubmit={onSubmit} aria-labelledby="upload-title">
        <h2 id="upload-title" className="sr-only">
          Upload a logo
        </h2>
        <div
          className={`dropzone${dragging ? " is-dragging" : ""}${file ? " has-file" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input
            id="logo-file"
            className="sr-only"
            type="file"
            accept={ACCEPT}
            onChange={(e) => pick(e.target.files?.[0])}
          />
          <label htmlFor="logo-file" className="dropzone-label">
            <svg className="dropzone-icon" aria-hidden="true" viewBox="0 0 24 24" width="28" height="28">
              <path d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="dropzone-main">{file ? file.name : "Drop a logo here"}</span>
            <span className="muted small">
              {file ? "Choose a different file" : "or choose a logo file"} · SVG, PNG, JPG or WebP, up to 10 MB
            </span>
          </label>
        </div>

        <div className="upload-row">
          <div className="field">
            <label htmlFor="project-name">Project name (optional)</label>
            <input
              id="project-name"
              type="text"
              value={name}
              maxLength={120}
              placeholder="Defaults to the file name"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={uploading || !file} aria-busy={uploading}>
            {uploading ? "Uploading…" : "Upload logo"}
          </button>
        </div>
      </form>

      <section className="history" aria-labelledby="history-title">
        <h2 id="history-title">Your logos</h2>
        {projects === null && (
          <p className="muted" role="status">
            Loading…
          </p>
        )}
        {projects !== null && projects.length === 0 && (
          <div className="empty">
            <p className="empty-title">No logos yet</p>
            <p className="muted">Upload one above and it will show up here, with its reviews and identity work.</p>
          </div>
        )}
        {projects !== null && projects.length > 0 && (
          <ul className="project-list">
            {projects.map((p) => {
              const latest = p.versions[p.versions.length - 1];
              return (
                <li key={p.id}>
                  <a className="project-card" href={href.project(p.id)}>
                    <span className="thumb">
                      <img src={logoUrl(p.id, latest?.id)} alt="" loading="lazy" />
                    </span>
                    <span className="project-meta">
                      <span className="project-name">{p.name}</span>
                      <span className="muted small">
                        {new Date(p.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                        {p.versions.length > 1 ? ` · ${p.versions.length} versions` : ""}
                      </span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
