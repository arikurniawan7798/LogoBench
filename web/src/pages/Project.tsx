import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { api, logoUrl, type ApiError, type Project as ProjectT } from "../api";
import ErrorBanner from "../components/ErrorBanner";
import ProjectTitle from "../components/ProjectTitle";
import { buttonClasses, Card, cn, IconUpload, Skeleton, Spinner, TabPanel, Tabs } from "../components/ui";
import { usePageTitle } from "../components/AppShell";
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
  const active = TABS.some((t) => t.id === tab) ? tab : "review";
  usePageTitle(project?.name);

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

  function select(tabId: string) {
    navigate(href.project(id, tabId));
  }

  if (!project) {
    return (
      <div className="flex flex-col gap-6">
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
    <div className="flex flex-col gap-6">
      <ErrorBanner error={error} onDismiss={() => setError(null)} />
      <Card as="header" padding="none" className="flex flex-col gap-5 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-xl border border-line bg-logo-canvas sm:size-24">
          <img src={logoUrl(project.id, latest?.id)} alt={`${project.name} logo`} className="absolute inset-0 size-full object-contain p-2.5" />
        </div>
        <div className="min-w-0 flex-1">
          <ProjectTitle
            name={project.name}
            editing={renaming}
            onStart={startRename}
            onCancel={() => setRenaming(false)}
            onSave={onRename}
          />
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-muted">
            {latest && <span className="max-w-full truncate">{latest.originalName}</span>}
            {latest && <span aria-hidden="true">·</span>}
            <span>
              {project.versions.length} {project.versions.length === 1 ? "version" : "versions"}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5 sm:max-w-[15rem] sm:items-end sm:text-right">
          <input
            id="new-version-file"
            className="sr-only peer"
            type="file"
            accept={ACCEPT}
            disabled={uploading}
            onChange={onNewVersion}
          />
          <label
            htmlFor="new-version-file"
            className={cn(
              buttonClasses({ variant: "secondary" }),
              "cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring",
              uploading && "pointer-events-none opacity-55",
            )}
            aria-busy={uploading}
          >
            {uploading ? (
              <>
                <Spinner />
                Uploading…
              </>
            ) : (
              <>
                <IconUpload className="size-4" />
                Upload new version
              </>
            )}
          </label>
          <p className="text-xs text-fg-muted">SVG, PNG, JPG or WebP, up to 10 MB. Tabs refresh for the new version.</p>
        </div>
      </Card>

      <div className="sticky top-14 z-20 -mt-2 border-b border-line bg-canvas/85 backdrop-blur-md">
        <Tabs items={TABS} active={active} onSelect={select} label="Project sections" className="-ml-3" />
      </div>

      <TabPanel id={`panel-${active}`} labelledBy={`tab-${active}`}>
        <TabContent tab={active} project={project} onRename={startRename} />
      </TabPanel>
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
