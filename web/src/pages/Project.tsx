import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { api, logoUrl, toApiError, type ApiError, type Project as ProjectT } from "../api";
import ErrorBanner from "../components/ErrorBanner";
import ComingNext from "../components/ComingNext";
import { href, navigate } from "../router";
import ReviewTab from "./ReviewTab";

export const TABS = [
  { id: "review", label: "Review" },
  { id: "advanced", label: "Advanced" },
  { id: "colors", label: "Colors" },
  { id: "type", label: "Type" },
  { id: "mockups", label: "Mockups" },
  { id: "export", label: "Export" },
  { id: "identity", label: "Identity" },
] as const;

const PLACEHOLDER_COPY: Record<string, string> = {
  advanced: "Prioritized fixes, a pre-delivery checklist and presentation ideas.",
  colors: "Palette extracted from the logo, with roles, HEX/RGB/CMYK and UI previews.",
  type: "Typeface pairings that suit the mark, previewed in context.",
  mockups: "The logo placed on cards, signage, screens and merchandise.",
  export: "Production files: sizes, formats, favicons and a one-page brand sheet.",
  identity: "One action that runs the whole workflow and builds an identity page.",
};

export default function Project({ id, tab }: { id: string; tab: string }) {
  const [project, setProject] = useState<ProjectT | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const active = TABS.some((t) => t.id === tab) ? tab : "review";

  useEffect(() => {
    let live = true;
    setProject(null);
    api.getProject(id).then(
      (p) => live && setProject(p),
      (e) => live && setError(toApiError(e)),
    );
    return () => {
      live = false;
    };
  }, [id]);

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
  const activeLabel = TABS.find((t) => t.id === active)!.label;

  return (
    <div className="project">
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
        {active === "review" ? (
          <ReviewTab projectId={project.id} />
        ) : (
          <ComingNext title={activeLabel} detail={PLACEHOLDER_COPY[active]} />
        )}
      </div>
    </div>
  );
}
