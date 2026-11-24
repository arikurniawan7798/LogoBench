import { useEffect, useState, type FormEvent } from "react";
import { api, type ApiError, type BrandPalette, type PaletteResponse, type Swatch } from "../api";
import ErrorBanner from "../components/ErrorBanner";
import { BusyLabel, BusyPanel, Skeleton } from "../components/loading";
import { useApiError, useToast, useToastsEnabled } from "../components/toast";
import { contrastRatio, HEX_RE, inkOn, luminance, makeSwatch, safeHex } from "../color";

type Slot = { key: string; label: string; role: "main" | "support" | "neutral"; index: number; swatch: Swatch };

function slotsOf(p: BrandPalette): Slot[] {
  return [
    { key: "main", label: "Main", role: "main", index: 0, swatch: p.main },
    ...p.support.map((s, i) => ({ key: `support-${i}`, label: `Support ${i + 1}`, role: "support" as const, index: i, swatch: s })),
    ...p.neutral.map((s, i) => ({ key: `neutral-${i}`, label: `Neutral ${i + 1}`, role: "neutral" as const, index: i, swatch: s })),
  ];
}

function withSwatch(p: BrandPalette, slot: Slot, s: Swatch): BrandPalette {
  if (slot.role === "main") return { ...p, main: s };
  const list = p[slot.role].map((x, i) => (i === slot.index ? s : x));
  return { ...p, [slot.role]: list };
}

/** Keep only palette fields: `note`/`replacedSaved` are response metadata and must not be sent back on save. */
const strip = (p: PaletteResponse & { replacedSaved?: boolean }): BrandPalette => {
  const { note: _note, replacedSaved: _replaced, ...rest } = p;
  return rest;
};

const HEX_HINT = "Use a 6-digit hex color in the form #RRGGBB, for example #1A6B5E.";

export default function ColorsTab({ projectId }: { projectId: string }) {
  const [palette, setPalette] = useState<BrandPalette | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftHex, setDraftHex] = useState("");
  const [draftName, setDraftName] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState<"save" | "suggest" | null>(null);
  const [notice, setNotice] = useState("");
  const report = useApiError();
  const toast = useToast();
  const toastsOn = useToastsEnabled();

  useEffect(() => {
    let live = true;
    setPalette(null);
    setError(null);
    api.getPalette(projectId).then(
      (p) => live && setPalette(strip(p)),
      (e) => live && setError(report(e)),
    );
    return () => {
      live = false;
    };
  }, [projectId, report]);

  function startEdit(slot: Slot) {
    setEditing(slot.key);
    setDraftHex(slot.swatch.hex);
    setDraftName(slot.swatch.name ?? "");
    setInvalid(false);
    setNotice("");
  }

  async function save(e: FormEvent, slot: Slot) {
    e.preventDefault();
    if (!palette || busy) return;
    const hex = draftHex.trim();
    if (!HEX_RE.test(hex)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setBusy("save");
    setError(null);
    try {
      const next = withSwatch(palette, slot, makeSwatch(hex, draftName.trim().slice(0, 40) || undefined));
      const saved = await api.savePalette(projectId, next);
      setPalette(strip(saved));
      setEditing(null);
      setNotice(`${slot.label} color saved.`);
      toast.success(`${slot.label} color saved.`);
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
      const r = await api.suggestPalette(projectId);
      setPalette(strip(r));
      setEditing(null);
      const msg = r.replacedSaved ? "AI suggestion saved. It replaced the palette you had saved before." : "AI suggestion saved.";
      setNotice(msg);
      toast.success("Colors saved.", msg);
    } catch (err) {
      setError(report(err));
    } finally {
      setBusy(null);
    }
  }

  if (!palette) {
    return (
      <div className="colors">
        <ErrorBanner error={error} onDismiss={() => setError(null)} />
        {!error && (
          <Skeleton label="Loading colors…" lines={4} variant="cards" />
        )}
      </div>
    );
  }

  const slots = slotsOf(palette);
  const neutrals = [...palette.neutral].sort((a, b) => luminance(a.hex) - luminance(b.hex));
  const dark = safeHex(neutrals[0]?.hex ?? "#1B1D21");
  const light = safeHex(neutrals[neutrals.length - 1]?.hex ?? "#FFFFFF");
  const main = safeHex(palette.main.hex);

  return (
    <div className="colors">
      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      <div className="section-head">
        <div>
          <h2>Colors</h2>
          <p className="muted section-note">
            Extracted from the logo and sorted into roles. Edit any role, or ask the model to name the colors and pick the main one.
          </p>
        </div>
        <div className="section-actions">
          <button type="button" className="btn" onClick={suggest} disabled={busy !== null} aria-busy={busy === "suggest"}>
            <BusyLabel busy={busy === "suggest"} busyText="Asking the model…">
              Suggest with AI
            </BusyLabel>
          </button>
        </div>
      </div>
      <p className="muted small">AI suggestions replace a palette you have edited and saved.</p>
      <BusyPanel active={busy === "suggest"} message="Asking the model to name your colors and pick the main one…" />

      <p className="note-callout">
        <strong>CMYK</strong> values are a simple conversion: approximate, not print-accurate. Ask your printer for a proof.
      </p>

      {palette.rationale && <p className="review-summary">{palette.rationale}</p>}

      <div className="swatches">
        {slots.map((slot) => {
          const s = slot.swatch;
          const titleId = `swatch-${slot.key}`;
          const isEditing = editing === slot.key;
          const hexId = `hex-${slot.key}`;
          return (
            <article key={slot.key} className="swatch" aria-labelledby={titleId}>
              <div className="swatch-chip" style={{ background: safeHex(s.hex) }} aria-hidden="true" />
              <div className="swatch-body">
                <h3 id={titleId} className="swatch-title">
                  {slot.label}
                  {slot.role === "main" ? " color" : ""}
                </h3>
                {s.name && <p className="swatch-name">{s.name}</p>}
                <dl className="swatch-values">
                  <div>
                    <dt>HEX</dt>
                    <dd>{s.hex}</dd>
                  </div>
                  <div>
                    <dt>RGB</dt>
                    <dd>{s.rgb.join(", ")}</dd>
                  </div>
                  <div>
                    <dt>
                      CMYK <span className="muted">(approx.)</span>
                    </dt>
                    <dd>{s.cmyk.join(", ")}</dd>
                  </div>
                </dl>
                {isEditing ? (
                  <form className="swatch-edit" onSubmit={(e) => save(e, slot)} noValidate>
                    <div className="field">
                      <label htmlFor={hexId}>{slot.label} hex</label>
                      <input
                        id={hexId}
                        type="text"
                        value={draftHex}
                        maxLength={7}
                        spellCheck={false}
                        autoComplete="off"
                        aria-invalid={invalid}
                        aria-describedby={`${hexId}-hint`}
                        onChange={(e) => {
                          setDraftHex(e.target.value);
                          if (invalid && HEX_RE.test(e.target.value.trim())) setInvalid(false);
                        }}
                      />
                      <span id={`${hexId}-hint`} className={invalid ? "field-error" : "muted small"}>
                        {invalid ? `Not a valid color. ${HEX_HINT}` : HEX_HINT}
                      </span>
                    </div>
                    <div className="field">
                      <label htmlFor={`name-${slot.key}`}>{slot.label} name (optional)</label>
                      <input
                        id={`name-${slot.key}`}
                        type="text"
                        value={draftName}
                        maxLength={40}
                        onChange={(e) => setDraftName(e.target.value)}
                      />
                    </div>
                    <div className="form-actions">
                      <button type="submit" className="btn btn-primary" disabled={busy !== null} aria-busy={busy === "save"}>
                        <BusyLabel busy={busy === "save"} busyText="Saving…">
                          Save
                        </BusyLabel>
                      </button>
                      <button type="button" className="btn" onClick={() => setEditing(null)} disabled={busy === "save"}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => startEdit(slot)}
                    disabled={busy !== null}
                    aria-label={`Edit ${slot.label}${slot.role === "main" ? " color" : ""}`}
                  >
                    Edit
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <p className="muted small" role={toastsOn ? undefined : "status"}>
        {notice}
      </p>

      <section className="preview" aria-labelledby="preview-title">
        <h3 id="preview-title">In use</h3>
        <p className="muted small">The main color on a button, as a link and next to text, over your lightest and darkest neutrals.</p>
        <div className="preview-row">
          {[
            { bg: light, ink: dark, label: "On light" },
            { bg: dark, ink: light, label: "On dark" },
          ].map((v) => (
            <div key={v.label} className="preview-panel" style={{ background: v.bg, color: v.ink }}>
              <p className="preview-label">{v.label}</p>
              <p className="preview-heading">Fresh from the bench</p>
              <p>
                Body text in your neutral, with{" "}
                <a href="#preview-title" style={{ color: main }} onClick={(e) => e.preventDefault()}>
                  a link in the main color
                </a>
                .
              </p>
              <span className="preview-button" style={{ background: main, color: inkOn(main) }}>
                Primary button
              </span>
              <p className="small preview-contrast">
                Main on this background: {contrastRatio(main, v.bg).toFixed(1)}:1{" "}
                {contrastRatio(main, v.bg) >= 4.5 ? "(meets AA for text)" : contrastRatio(main, v.bg) >= 3 ? "(AA for large text only)" : "(below AA)"}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
