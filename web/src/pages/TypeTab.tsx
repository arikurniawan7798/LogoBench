import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { api, SOCIAL_SCALE_KEYS, WEB_SCALE_KEYS, type ApiError, type TypeSystem } from "../api";
import ErrorBanner from "../components/ErrorBanner";
import { BusyPanel } from "../components/loading";
import { Button, Callout, Card, CardHeader, IconSparkles, Input, PageHeader, Skeleton } from "../components/ui";
import { useApiError, useToast, useToastsEnabled } from "../components/toast";

const ROLES = [
  { key: "heading", label: "Heading" },
  { key: "body", label: "Body" },
  { key: "accent", label: "Accent (optional)" },
] as const;

const WEB_LABELS: Record<(typeof WEB_SCALE_KEYS)[number], string> = { h1: "H1", h2: "H2", h3: "H3", body: "Body", small: "Small" };
const SOCIAL_LABELS: Record<(typeof SOCIAL_SCALE_KEYS)[number], string> = {
  postTitle: "Post title",
  postBody: "Post body",
  caption: "Caption",
};

/** Same rule as the server (SIZE_RE): only plain px/rem sizes reach an inline style. */
const SIZE_RE = /^\d+(\.\d+)?(px|rem)$/;
const FAMILY_RE = /^[A-Za-z0-9 ]{1,60}$/;

/**
 * Font stack for previews. No web font is loaded (LogoBench makes no remote requests while you work): the named
 * family is used only if it is installed locally, else the system stack.
 */
function stack(family: string | undefined, fallback: string): CSSProperties["fontFamily"] {
  return family && FAMILY_RE.test(family) ? `"${family}", ${fallback}` : fallback;
}
const sizeOr = (v: string, fallback: string) => (SIZE_RE.test(v) ? v : fallback);

/** Social sizes are designed for a 1080 px post; previews are drawn at half size. */
const socialPreview = (v: string) => {
  const m = /^(\d+(?:\.\d+)?)px$/.exec(v);
  return m ? `${Math.max(8, Number(m[1]) / 2).toFixed(1)}px` : sizeOr(v, "1rem");
};

const SANS = "var(--font-sans)";

export default function TypeTab({ projectId }: { projectId: string }) {
  const [sys, setSys] = useState<TypeSystem | null>(null);
  const [draft, setDraft] = useState({ heading: "", body: "", accent: "" });
  const [busy, setBusy] = useState<"save" | "suggest" | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState("");
  const report = useApiError();
  const toast = useToast();
  const toastsOn = useToastsEnabled();

  function adopt(t: TypeSystem) {
    setSys(t);
    setDraft({ heading: t.heading, body: t.body, accent: t.accent ?? "" });
  }

  useEffect(() => {
    let live = true;
    setSys(null);
    api.getType(projectId).then(
      (t) => live && adopt(t),
      (e) => live && setError(report(e)),
    );
    return () => {
      live = false;
    };
  }, [projectId, report]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!sys || busy) return;
    setBusy("save");
    setError(null);
    setNotice("");
    try {
      const next: TypeSystem = {
        heading: draft.heading.trim(),
        body: draft.body.trim(),
        ...(draft.accent.trim() ? { accent: draft.accent.trim() } : {}),
        scale: sys.scale,
      };
      adopt(await api.saveType(projectId, next));
      setNotice("Type system saved.");
      toast.success("Type system saved.");
    } catch (err) {
      setError(report(err));
    } finally {
      setBusy(null);
    }
  }

  async function suggest() {
    if (busy) return;
    setBusy("suggest");
    setError(null);
    setNotice("");
    try {
      const r = await api.suggestType(projectId);
      adopt(r.typeSystem);
      const parts = ["AI pairing saved."];
      if (r.replacedSaved) parts.push("It replaced the type system you had saved before.");
      if (r.fallbacks.length) parts.push(`The model named a font outside the curated list for ${r.fallbacks.join(", ")}; a curated font was used instead.`);
      setNotice(parts.join(" "));
      toast.success("Fonts saved.", parts.join(" "));
    } catch (err) {
      setError(report(err));
    } finally {
      setBusy(null);
    }
  }

  if (!sys) {
    return (
      <div className="flex flex-col gap-6">
        <ErrorBanner error={error} onDismiss={() => setError(null)} />
        {!error && <Skeleton label="Loading type…" lines={4} />}
      </div>
    );
  }

  const headingFont = stack(sys.heading, SANS);
  const bodyFont = stack(sys.body, SANS);

  return (
    <div className="flex flex-col gap-6">
      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      <PageHeader
        level={2}
        title="Type"
        description={
          <>
            <p>A heading and body pairing from a curated list of Google Fonts, with web and social size scales.</p>
            <p className="mt-1 text-sm text-fg-subtle">AI suggestions replace a type system you have edited and saved.</p>
          </>
        }
        actions={
          <Button onClick={suggest} disabled={busy !== null} loading={busy === "suggest"} loadingText="Asking the model…" icon={<IconSparkles className="size-4" />}>
            Suggest with AI
          </Button>
        }
      />
      <BusyPanel active={busy === "suggest"} message="Asking the model to pair fonts for your logo…" />

      <Callout tone="info">
        <p>
          Previews use each font only if it is installed on this computer, otherwise your system font. Nothing is downloaded while you
          work; the identity zip bundles the real font files.
        </p>
      </Callout>

      <div className="grid gap-4 md:grid-cols-3">
        {ROLES.map(({ key, label }) => {
          const family = key === "accent" ? sys.accent : sys[key];
          return (
            <Card as="figure" key={key} className="flex flex-col gap-3">
              <figcaption className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">{label.replace(" (optional)", "")}</figcaption>
              <p className="text-lg font-semibold tracking-tight text-fg">{family ?? "None"}</p>
              {family ? (
                <p
                  className={key === "body" ? "text-[0.9375rem] leading-relaxed text-fg-muted" : "text-3xl leading-tight text-fg"}
                  style={{ fontFamily: stack(family, SANS) }}
                >
                  {key === "body" ? "Clear, quiet text that carries the message." : "Brand at a glance"}
                </p>
              ) : (
                <p className="text-sm text-fg-subtle">No accent font in this system.</p>
              )}
            </Card>
          );
        })}
      </div>

      <Card as="form" onSubmit={save}>
        <CardHeader title="Change fonts" description="Use a family name from the curated Google Fonts list, for example Inter, Lora or Montserrat." />
        <div className="grid gap-4 sm:grid-cols-3">
          {ROLES.map(({ key, label }) => (
            <Input
              key={key}
              id={`font-${key}`}
              label={label}
              type="text"
              value={draft[key]}
              maxLength={60}
              required={key !== "accent"}
              spellCheck={false}
              onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
            />
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" disabled={busy !== null} loading={busy === "save"} loadingText="Saving…">
            Save fonts
          </Button>
          <span className="text-sm text-fg-muted" role={toastsOn ? undefined : "status"}>
            {notice}
          </span>
        </div>
      </Card>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <ScaleCard id="web-scale-title" title="Web scale" note="Modular scale, ratio 1.25, from a 1rem body.">
          {WEB_SCALE_KEYS.map((k) => {
            const v = sys.scale.web[k];
            const isHeading = k === "h1" || k === "h2" || k === "h3";
            return (
              <ScaleRow key={k} label={WEB_LABELS[k]} size={v}>
                <span style={{ fontFamily: isHeading ? headingFont : bodyFont, fontSize: sizeOr(v, "1rem") }}>
                  {isHeading ? "Brand headline" : "Readable running text"}
                </span>
              </ScaleRow>
            );
          })}
        </ScaleCard>

        <ScaleCard id="social-scale-title" title="Social scale" note="Sizes for a 1080 px square post; samples drawn at half size.">
          {SOCIAL_SCALE_KEYS.map((k) => {
            const v = sys.scale.social[k];
            return (
              <ScaleRow key={k} label={SOCIAL_LABELS[k]} size={v}>
                <span style={{ fontFamily: k === "postTitle" ? headingFont : bodyFont, fontSize: socialPreview(v) }}>
                  {k === "postTitle" ? "Launch day" : k === "postBody" ? "Something new is on the bench." : "Photo: studio"}
                </span>
              </ScaleRow>
            );
          })}
        </ScaleCard>
      </div>
    </div>
  );
}

function ScaleCard({ id, title, note, children }: { id: string; title: string; note: string; children: ReactNode }) {
  return (
    <Card as="section" padding="none" className="overflow-hidden" aria-labelledby={id}>
      <div className="px-5 pt-5 sm:px-6">
        <CardHeader id={id} title={title} description={note} />
      </div>
      <div className="relative overflow-x-auto focus-visible:outline-offset-[-2px]" tabIndex={0} role="region" aria-label={`${title} table`}>
        <table className="w-full min-w-[28rem] border-collapse text-sm">
          <thead>
            <tr className="border-y border-line bg-subtle text-left text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              <th scope="col" className="w-28 px-5 py-2.5 font-semibold sm:px-6">
                Style
              </th>
              <th scope="col" className="w-24 px-3 py-2.5 font-semibold">
                Size
              </th>
              <th scope="col" className="px-3 py-2.5 font-semibold">
                Sample
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">{children}</tbody>
        </table>
      </div>
    </Card>
  );
}

function ScaleRow({ label, size, children }: { label: string; size: string; children: ReactNode }) {
  return (
    <tr>
      <th scope="row" className="px-5 py-3 text-left font-medium text-fg sm:px-6">
        {label}
      </th>
      <td className="px-3 py-3 font-mono text-[0.8125rem] text-fg-muted">{size}</td>
      <td className="max-w-0 truncate px-3 py-3 pr-5 leading-tight text-fg">{children}</td>
    </tr>
  );
}
