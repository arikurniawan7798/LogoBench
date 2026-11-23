import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { api, toApiError, SOCIAL_SCALE_KEYS, WEB_SCALE_KEYS, type ApiError, type TypeSystem } from "../api";
import ErrorBanner from "../components/ErrorBanner";

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

  function adopt(t: TypeSystem) {
    setSys(t);
    setDraft({ heading: t.heading, body: t.body, accent: t.accent ?? "" });
  }

  useEffect(() => {
    let live = true;
    setSys(null);
    api.getType(projectId).then(
      (t) => live && adopt(t),
      (e) => live && setError(toApiError(e)),
    );
    return () => {
      live = false;
    };
  }, [projectId]);

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
    } catch (err) {
      setError(toApiError(err));
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
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(null);
    }
  }

  if (!sys) {
    return (
      <div className="type">
        <ErrorBanner error={error} onDismiss={() => setError(null)} />
        {!error && (
          <p className="muted" role="status">
            Loading type…
          </p>
        )}
      </div>
    );
  }

  const headingFont = stack(sys.heading, SANS);
  const bodyFont = stack(sys.body, SANS);

  return (
    <div className="type">
      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      <div className="section-head">
        <div>
          <h2>Type</h2>
          <p className="muted section-note">
            A heading and body pairing from a curated list of Google Fonts, with web and social size scales.
          </p>
        </div>
        <div className="section-actions">
          <button type="button" className="btn" onClick={suggest} disabled={busy !== null} aria-busy={busy === "suggest"}>
            {busy === "suggest" ? "Asking the model…" : "Suggest with AI"}
          </button>
        </div>
      </div>
      <p className="muted small">AI suggestions replace a type system you have edited and saved.</p>

      <p className="note-callout">
        Previews use each font only if it is installed on this computer, otherwise your system font. Nothing is downloaded while you
        work; the identity zip bundles the real font files.
      </p>

      <div className="pairing">
        {ROLES.map(({ key, label }) => {
          const family = key === "accent" ? sys.accent : sys[key];
          return (
            <figure key={key} className="pairing-card">
              <figcaption className="muted small">{label.replace(" (optional)", "")}</figcaption>
              <p className="pairing-name">{family ?? "None"}</p>
              {family && (
                <p className="pairing-sample" style={{ fontFamily: stack(family, SANS) }}>
                  {key === "body" ? "Clear, quiet text that carries the message." : "Brand at a glance"}
                </p>
              )}
            </figure>
          );
        })}
      </div>

      <form className="card type-form" onSubmit={save}>
        <h3>Change fonts</h3>
        <p className="muted small">Use a family name from the curated Google Fonts list, for example Inter, Lora or Montserrat.</p>
        <div className="type-fields">
          {ROLES.map(({ key, label }) => (
            <div key={key} className="field">
              <label htmlFor={`font-${key}`}>{label}</label>
              <input
                id={`font-${key}`}
                type="text"
                value={draft[key]}
                maxLength={60}
                required={key !== "accent"}
                spellCheck={false}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={busy !== null} aria-busy={busy === "save"}>
            {busy === "save" ? "Saving…" : "Save fonts"}
          </button>
          <span className="muted small" role="status">
            {notice}
          </span>
        </div>
      </form>

      <section className="scale" aria-labelledby="web-scale-title">
        <h3 id="web-scale-title">Web scale</h3>
        <p className="muted small">Modular scale, ratio 1.25, from a 1rem body.</p>
        <div className="table-wrap">
          <table className="scale-table">
            <thead>
              <tr>
                <th scope="col">Style</th>
                <th scope="col">Size</th>
                <th scope="col">Sample</th>
              </tr>
            </thead>
            <tbody>
              {WEB_SCALE_KEYS.map((k) => {
                const v = sys.scale.web[k];
                const isHeading = k === "h1" || k === "h2" || k === "h3";
                return (
                  <tr key={k}>
                    <th scope="row">{WEB_LABELS[k]}</th>
                    <td className="mono">{v}</td>
                    <td>
                      <span className="scale-sample" style={{ fontFamily: isHeading ? headingFont : bodyFont, fontSize: sizeOr(v, "1rem") }}>
                        {isHeading ? "Brand headline" : "Readable running text"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="scale" aria-labelledby="social-scale-title">
        <h3 id="social-scale-title">Social scale</h3>
        <p className="muted small">Sizes for a 1080 px square post; samples drawn at half size.</p>
        <div className="table-wrap">
          <table className="scale-table">
            <thead>
              <tr>
                <th scope="col">Style</th>
                <th scope="col">Size</th>
                <th scope="col">Sample</th>
              </tr>
            </thead>
            <tbody>
              {SOCIAL_SCALE_KEYS.map((k) => {
                const v = sys.scale.social[k];
                return (
                  <tr key={k}>
                    <th scope="row">{SOCIAL_LABELS[k]}</th>
                    <td className="mono">{v}</td>
                    <td>
                      <span className="scale-sample" style={{ fontFamily: k === "postTitle" ? headingFont : bodyFont, fontSize: socialPreview(v) }}>
                        {k === "postTitle" ? "Launch day" : k === "postBody" ? "Something new is on the bench." : "Photo: studio"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
