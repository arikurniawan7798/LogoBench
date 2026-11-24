import { useEffect, useState, type DragEvent, type FormEvent } from "react";
import { api, logoUrl, type ApiError, type Project } from "../api";
import ErrorBanner from "../components/ErrorBanner";
import { Badge, Button, Card, cardClasses, cn, EmptyState, IconImage, IconLogos, IconUpload, Input, PageHeader, Skeleton } from "../components/ui";
import { useApiError } from "../components/toast";
import { href, navigate } from "../router";
import { ACCEPT, checkFile } from "../files";

export default function Home() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const report = useApiError();

  useEffect(() => {
    let live = true;
    api.listProjects().then(
      (list) => live && setProjects([...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
      (e) => {
        if (!live) return;
        setProjects([]);
        setError(report(e));
      },
    );
    return () => {
      live = false;
    };
  }, [report]);

  function pick(f: File | undefined) {
    if (!f) return;
    const problem = checkFile(f);
    setError(problem ? report(problem) : null);
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
      setError(report({ code: "BAD_REQUEST", message: "Choose a logo file first." }));
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const project = await api.createProject(file, name);
      navigate(href.project(project.id, "review"));
    } catch (err) {
      setError(report(err));
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        id="home-title"
        title="Put a logo on the bench"
        description={
          <p>
            Upload a mark to get a structured critique, then work up its colors, type and mockups. Everything stays on this machine
            except the image sent to the AI provider you choose in Settings.
          </p>
        }
      />

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      <Card as="form" padding="none" className="overflow-hidden" onSubmit={onSubmit} aria-labelledby="upload-title">
        <h2 id="upload-title" className="sr-only">
          Upload a logo
        </h2>
        <div className="p-4 sm:p-5">
          <div
            className={cn(
              "relative rounded-xl border-2 border-dashed transition-colors duration-150",
              "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring",
              dragging
                ? "border-accent bg-accent-soft"
                : file
                  ? "border-accent-line bg-accent-soft/50"
                  : "border-line-strong bg-subtle hover:border-fg-subtle/60 hover:bg-muted-bg/60",
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input id="logo-file" className="sr-only" type="file" accept={ACCEPT} onChange={(e) => pick(e.target.files?.[0])} />
            <label
              htmlFor="logo-file"
              className="flex cursor-pointer flex-col items-center gap-3 px-6 py-10 text-center sm:py-14"
            >
              <span
                className={cn(
                  "grid size-14 place-items-center rounded-2xl shadow-card transition-transform duration-150",
                  dragging ? "scale-110 bg-accent text-accent-ink" : "bg-surface text-accent-text ring-1 ring-line",
                )}
              >
                {file ? <IconImage className="size-6" /> : <IconUpload className="size-6" />}
              </span>
              <span className="max-w-full break-all text-base font-semibold text-fg">
                {dragging ? "Drop to choose this file" : file ? file.name : "Drop a logo here"}
              </span>
              <span className="text-sm text-fg-muted">
                {file ? "Choose a different file" : <span className="font-medium text-accent-text">or choose a logo file</span>} · SVG,
                PNG, JPG or WebP, up to 10 MB
              </span>
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-line bg-subtle/60 px-4 py-4 sm:flex-row sm:items-end sm:px-5">
          <Input
            id="project-name"
            label="Project name (optional)"
            wrapperClassName="flex-1"
            type="text"
            value={name}
            maxLength={120}
            placeholder="Defaults to the file name"
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            type="submit"
            variant="primary"
            disabled={!file}
            loading={uploading}
            loadingText="Uploading…"
            icon={<IconUpload className="size-4" />}
          >
            Upload logo
          </Button>
        </div>
      </Card>

      <section aria-labelledby="history-title" className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <h2 id="history-title" className="text-lg font-semibold tracking-tight">
            Your logos
          </h2>
          {projects !== null && projects.length > 0 && <Badge>{projects.length}</Badge>}
        </div>
        {projects === null && <Skeleton label="Loading your logos…" lines={3} variant="cards" />}
        {projects !== null && projects.length === 0 && (
          <EmptyState icon={<IconLogos />} title="No logos yet">
            Upload one above and it will show up here, with its reviews and identity work.
          </EmptyState>
        )}
        {projects !== null && projects.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] sm:gap-4">
            {projects.map((p) => {
              const latest = p.versions[p.versions.length - 1];
              return (
                <li key={p.id}>
                  <a
                    className={cn(
                      cardClasses,
                      "group flex h-full flex-col overflow-hidden no-underline transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-accent-line hover:shadow-pop",
                    )}
                    href={href.project(p.id)}
                  >
                    <span className="relative block aspect-[4/3] border-b border-line bg-logo-canvas">
                      <img
                        src={logoUrl(p.id, latest?.id)}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 size-full object-contain p-4 transition-transform sm:p-7 duration-200 group-hover:scale-[1.03]"
                      />
                    </span>
                    <span className="flex flex-1 flex-col gap-1 p-3 sm:p-4">
                      <span className="truncate font-semibold text-fg group-hover:text-accent-text">{p.name}</span>
                      <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs text-fg-muted">
                        <span>{new Date(p.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}</span>
                        <span className="rounded-full bg-muted-bg px-2 py-0.5 font-medium">
                          {p.versions.length} {p.versions.length === 1 ? "version" : "versions"}
                        </span>
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
