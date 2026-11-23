import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { api, logoUrl, toApiError, type ApiError, type Project as ProjectT } from "../api";
import ErrorBanner from "../components/ErrorBanner";
import { ACCEPT, checkFile } from "../files";
import { href, navigate } from "../router";
import ReviewTab from "./ReviewTab";
import AdvancedTab from "./AdvancedTab";
import ColorsTab from "./ColorsTab";
import TypeTab from "./TypeTab";
import MockupsTab from "./MockupsTab";
import ExportTab from "./ExportTab";
import IdentityTab from "./IdentityTab";

export const TABS = [
  { id: "review", label: "Review" },
  { id: "advanced", label: "Advanced" },
  { id: "colors", label: "Colors" },
  { id: "type", label: "Type" },
  { id: "mockups", label: "Mockups" },
  { id: "export", label: "Export" },
  { id: "identity", label: "Identity" },
] as const;

export default function Project({ id, tab }: { id: string; tab: string }) {
  const [project, setProject] = useState<ProjectT | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [uploading, setUploading] = useState(false);
  const uploadingRef = useRef(false); // double-submit guard (state updates are async)
  const idRef = useRef(id);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const active = TABS.some((t) => t.id === tab) ? tab : "review";

  useEffect(() => {
    let live = true;
    idRef.current = id;
    setProject(null);
    setError(null);
    api.getProject(id).then(
      (p) => live && setProject(p),
      (e) => live && setError(toApiError(e)),
    );
    return () => {
      live = false;
    };
  }, [id]);

  async function onNewVersion(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    input.value = ""; // choosing the same file again still fires change
    if (!file || uploadingRef.current) return;
    const problem = checkFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    const forId = id;
    uploadingRef.current = true;
    setUploading(true);
    setError(null);
    try {
      const updated = await api.addVersion(forId, file);
      if (idRef.current === forId) setProject(updated);
    } catch (err) {
      if (idRef.current === forId) setError(toApiError(err));
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  }

  function select(tabId: string, focus = false) {
    navigate(href.project(id, tabId));
    if (focus) tabRefs.current[tabId]?.focus();
  }

  function onTabKey(e: KeyboardEvent<HTMLDivElement>) {
    const i = TABS.findIndex((t) => t.id === active);
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    select(TABS[next].id, true);
  }

  if (!project) {
    return (
      <div className="project">
        <ErrorBanner error={error} onDismiss={() => setError(null)} />
        {error ? (
          <p>
            <a href={href.home()}>Back to your logos</a>
          </p>
        ) : (
          <p className="muted" role="status">
            Loading project…
          </p>
        )}
      </div>
    );
  }

  const latest = project.versions[project.versions.length - 1];

  return (
    <div className="project">
      <ErrorBanner error={error} onDismiss={() => setError(null)} />
      <header className="project-head">
        <div className="project-logo">
          <img src={logoUrl(project.id, latest?.id)} alt={`${project.name} logo`} />
        </div>
        <div>
          <p className="crumb">
            <a href={href.home()}>Your logos</a> <span aria-hidden="true">/</span>
          </p>
          <h1>{project.name}</h1>
          <p className="muted small">
            {latest ? `${latest.originalName} · ` : ""}
            {project.versions.length} {project.versions.length === 1 ? "version" : "versions"}
          </p>
        </div>
        <div className="project-upload">
          <input
            id="new-version-file"
            className="sr-only"
            type="file"
            accept={ACCEPT}
            disabled={uploading}
            onChange={onNewVersion}
          />
          <label htmlFor="new-version-file" className={`btn${uploading ? " is-disabled" : ""}`} aria-busy={uploading}>
            {uploading ? "Uploading…" : "Upload new version"}
          </label>
          <p className="muted small">SVG, PNG, JPG or WebP, up to 10 MB. Tabs refresh for the new version.</p>
        </div>
      </header>

      <div className="tabs" role="tablist" aria-label="Project sections" onKeyDown={onTabKey}>
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={t.id === active}
            aria-controls={`panel-${t.id}`}
            tabIndex={t.id === active ? 0 : -1}
            className="tab"
            onClick={() => select(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="tabpanel" role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`} tabIndex={0}>
        <TabContent tab={active} project={project} />
      </div>
    </div>
  );
}

/** Keyed by project + version id so a tab never shows (or receives late responses for) another project's or an older version's data. */
function TabContent({ tab, project }: { tab: string; project: ProjectT }) {
  const key = `${project.id}:${project.versions[project.versions.length - 1]?.id ?? ""}`;
  const projectId = project.id;
  switch (tab) {
    case "advanced":
      return <AdvancedTab key={key} projectId={projectId} />;
    case "colors":
      return <ColorsTab key={key} projectId={projectId} />;
    case "type":
      return <TypeTab key={key} projectId={projectId} />;
    case "mockups":
      return <MockupsTab key={key} projectId={projectId} versionId={project.versions[project.versions.length - 1]?.id} />;
    case "export":
      return <ExportTab key={key} project={project} />;
    case "identity":
      return <IdentityTab key={key} projectId={projectId} />;
    default:
      return <ReviewTab key={key} projectId={projectId} />;
  }
}
