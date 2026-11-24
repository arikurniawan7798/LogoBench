import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { api, logoUrl, type ApiError, type Project as ProjectT } from "../api";
import ErrorBanner from "../components/ErrorBanner";
import ProjectTitle from "../components/ProjectTitle";
import { BusyLabel, Skeleton } from "../components/loading";
import { useApiError, useToast } from "../components/toast";
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
  const [renaming, setRenaming] = useState(false);
  const report = useApiError();
  const toast = useToast();
  const uploadingRef = useRef(false); // double-submit guard (state updates are async)
  const idRef = useRef(id);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const active = TABS.some((t) => t.id === tab) ? tab : "review";

  useEffect(() => {
    let live = true;
    idRef.current = id;
    setProject(null);
    setError(null);
    setRenaming(false);
    api.getProject(id).then(
      (p) => live && setProject(p),
      (e) => live && setError(report(e)),
    );
    return () => {
      live = false;
    };
  }, [id, report]);

  async function onNewVersion(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    input.value = ""; // choosing the same file again still fires change
    if (!file || uploadingRef.current) return;
    const problem = checkFile(file);
    if (problem) {
      setError(report(problem));
      return;
    }
    const forId = id;
    uploadingRef.current = true;
    setUploading(true);
    setError(null);
    try {
      const updated = await api.addVersion(forId, file);
      if (idRef.current === forId) {
        setProject(updated);
        toast.success("New version uploaded.", "The tabs now show the latest version.");
      }
    } catch (err) {
      if (idRef.current === forId) setError(report(err));
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  }

  /** PATCH the name; true on success. Errors are toasted and the editor stays open. */
  async function onRename(name: string): Promise<boolean> {
    const forId = id;
    try {
      const updated = await api.renameProject(forId, name);
      if (idRef.current !== forId) return true;
      setProject(updated);
      setRenaming(false);
      toast.success(`Renamed to “${updated.name}”.`, "Mockups, the identity page and exports now use this name.");
      return true;
    } catch (err) {
      if (idRef.current === forId) report(err, { title: "Could not rename" });
      return false;
    }
  }

  /** Opens the title editor (also from the Mockups tab); focusing its input scrolls it into view. */
  function startRename() {
    setRenaming(true);
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
          <Skeleton label="Loading project…" lines={3} />
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
          <ProjectTitle
            name={project.name}
            editing={renaming}
            onStart={startRename}
            onCancel={() => setRenaming(false)}
            onSave={onRename}
          />
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
            <BusyLabel busy={uploading} busyText="Uploading…">
              Upload new version
            </BusyLabel>
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
        <TabContent tab={active} project={project} onRename={startRename} />
      </div>
    </div>
  );
}

/** Keyed by project + version id so a tab never shows (or receives late responses for) another project's or an older version's data. */
function TabContent({ tab, project, onRename }: { tab: string; project: ProjectT; onRename: () => void }) {
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
      return (
        <MockupsTab
          key={key}
          projectId={projectId}
          versionId={project.versions[project.versions.length - 1]?.id}
          projectName={project.name}
          onRename={onRename}
        />
      );
    case "export":
      return <ExportTab key={key} project={project} />;
    case "identity":
      return <IdentityTab key={key} projectId={projectId} />;
    default:
      return <ReviewTab key={key} projectId={projectId} />;
  }
}
