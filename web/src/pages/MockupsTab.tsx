import { useEffect, useRef, useState } from "react";
import { api, urls, type ApiError, type MockupSpec } from "../api";
import ErrorBanner from "../components/ErrorBanner";
import { Button, ButtonLink, Card, cn, Dialog, IconAlert, IconExpand, IconRefresh, PageHeader, Skeleton } from "../components/ui";
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
    <div className="flex flex-col gap-6">
      <ErrorBanner error={error} onDismiss={() => setError(null)} />
      <PageHeader
        level={2}
        title="Mockups"
        description={
          <>
            <p>
              The logo placed in common settings, drawn with your saved <a href={href.project(projectId, "colors")}>colors</a> and{" "}
              <a href={href.project(projectId, "type")}>type</a>. Text is set in a system font of the same style (serif, sans or
              script) as your chosen fonts.
            </p>
            <p className="mt-2 text-sm text-fg">
              Mockups use the name “{projectName}”{" "}
              <span aria-hidden="true">—</span>{" "}
              <button
                type="button"
                className="rounded font-medium text-accent-text underline decoration-accent-text/40 underline-offset-2 hover:decoration-accent-text"
                onClick={onRename}
              >
                Rename<span className="sr-only"> logo</span>
              </button>
            </p>
          </>
        }
        actions={
          <Button
            loading={busy}
            loadingText="Rendering…"
            icon={<IconRefresh className="size-4" />}
            onClick={() => {
              // reset in the same update as the new round, so the button is busy from the first render
              setStatus({});
              setRetries({});
              setRerendering(true);
              setRound((r) => r + 1);
            }}
            disabled={!specs?.length}
          >
            Re-render
          </Button>
        }
      />

      {specs === null && <Skeleton label="Loading mockups…" lines={4} variant="cards" />}

      {!!specs?.length && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-4" aria-label="Mockups">
          {specs.map((m) => {
            const src = srcFor(m.kind);
            const st = statusOf(m.kind);
            return (
              <Card as="li" padding="none" key={m.kind} className="flex flex-col overflow-hidden">
                <div
                  data-preview=""
                  className="relative grid h-56 place-items-center border-b border-line bg-subtle p-3"
                  aria-busy={st === "loading"}
                >
                  {st === "error" ? (
                    <div className="flex flex-col items-center gap-3 text-center">
                      <IconAlert className="size-6 text-warn" />
                      <p className="text-sm text-fg-muted">This mockup could not be rendered.</p>
                      <Button
                        size="sm"
                        icon={<IconRefresh className="size-4" />}
                        onClick={() => {
                          set(m.kind, "loading");
                          setRetries((r) => ({ ...r, [m.kind]: (r[m.kind] ?? 0) + 1 }));
                        }}
                      >
                        Retry<span className="sr-only">: {m.label}</span>
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="group absolute inset-3 cursor-zoom-in rounded-lg focus-visible:outline-offset-2"
                      aria-label={`Enlarge ${m.label}`}
                      onClick={(e) => {
                        opener.current = e.currentTarget;
                        setZoom(m);
                      }}
                    >
                      {st === "loading" && <span className="absolute inset-0 animate-pulse rounded-lg bg-muted-bg" aria-hidden="true" />}
                      <img
                        key={src}
                        src={src}
                        alt={`${m.label} mockup`}
                        width={m.width}
                        height={m.height}
                        decoding="async"
                        className={cn(
                          "absolute inset-0 size-full object-contain drop-shadow-sm transition-[opacity,transform] duration-200 group-hover:scale-[1.02]",
                          st === "loading" ? "opacity-0" : "opacity-100",
                        )}
                        onLoad={() => set(m.kind, "loaded")}
                        onError={() => set(m.kind, "error")}
                      />
                      <span
                        className="absolute right-2 top-2 grid size-8 place-items-center rounded-lg bg-surface/90 text-fg-muted opacity-0 shadow-sm ring-1 ring-line transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                        aria-hidden="true"
                      >
                        <IconExpand className="size-4" />
                      </span>
                    </button>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-fg">{m.label}</h3>
                      <span className="text-xs tabular-nums text-fg-muted">
                        {m.width}×{m.height} px
                      </span>
                    </div>
                    <ButtonLink variant="download" size="sm" href={src} download={`${m.kind}.png`}>
                      Download PNG<span className="sr-only">: {m.label}</span>
                    </ButtonLink>
                  </div>
                  {NOTES[m.kind] && <p className="text-xs leading-5 text-fg-muted">{NOTES[m.kind]}</p>}
                </div>
              </Card>
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
  return (
    <Dialog
      title={spec.label}
      subtitle={`${spec.width}×${spec.height} px`}
      onClose={onClose}
      actions={
        <ButtonLink variant="download" size="sm" href={src} download={`${spec.kind}.png`}>
          Download PNG
        </ButtonLink>
      }
    >
      <img
        src={src}
        alt={`${spec.label} mockup, enlarged`}
        width={spec.width}
        height={spec.height}
        className="mx-auto h-auto max-h-[calc(100dvh-10rem)] w-auto max-w-full rounded-lg object-contain shadow-sm ring-1 ring-black/5"
      />
    </Dialog>
  );
}
