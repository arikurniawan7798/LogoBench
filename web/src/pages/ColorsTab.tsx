import { useEffect, useState, type FormEvent } from "react";
import { api, type ApiError, type BrandPalette, type PaletteResponse, type Swatch } from "../api";
import ErrorBanner from "../components/ErrorBanner";
import { BusyPanel } from "../components/loading";
import { Button, Callout, Card, CardHeader, cn, IconPencil, IconSparkles, Input, PageHeader, Skeleton } from "../components/ui";
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
      <div className="flex flex-col gap-6">
        <ErrorBanner error={error} onDismiss={() => setError(null)} />
        {!error && <Skeleton label="Loading colors…" lines={4} variant="cards" />}
      </div>
    );
  }

  const slots = slotsOf(palette);
  const neutrals = [...palette.neutral].sort((a, b) => luminance(a.hex) - luminance(b.hex));
  const dark = safeHex(neutrals[0]?.hex ?? "#1B1D21");
  const light = safeHex(neutrals[neutrals.length - 1]?.hex ?? "#FFFFFF");
  const main = safeHex(palette.main.hex);

  return (
    <div className="flex flex-col gap-6">
      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      <PageHeader
        level={2}
        title="Colors"
        description={
          <>
            <p>Extracted from the logo and sorted into roles. Edit any role, or ask the model to name the colors and pick the main one.</p>
            <p className="mt-1 text-sm text-fg-subtle">AI suggestions replace a palette you have edited and saved.</p>
          </>
        }
        actions={
          <Button onClick={suggest} disabled={busy !== null} loading={busy === "suggest"} loadingText="Asking the model…" icon={<IconSparkles className="size-4" />}>
            Suggest with AI
          </Button>
        }
      />
      <BusyPanel active={busy === "suggest"} message="Asking the model to name your colors and pick the main one…" />

      <Callout tone="info">
        <p>
          <strong>CMYK</strong> values are a simple conversion: approximate, not print-accurate. Ask your printer for a proof.
        </p>
      </Callout>

      {palette.rationale && (
        <Card className="relative overflow-hidden">
          <span className="absolute inset-y-0 left-0 w-1" style={{ background: main }} aria-hidden="true" />
          <p className="text-base leading-7 text-fg">{palette.rationale}</p>
        </Card>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,12.5rem),1fr))] gap-4">
        {slots.map((slot) => {
          const s = slot.swatch;
          const titleId = `swatch-${slot.key}`;
          const isEditing = editing === slot.key;
          const hexId = `hex-${slot.key}`;
          const bg = safeHex(s.hex);
          return (
            <Card as="article" padding="none" key={slot.key} className="flex overflow-hidden max-sm:flex-row sm:flex-col" aria-labelledby={titleId}>
              <div className="w-20 shrink-0 border-line shadow-[inset_0_0_0_1px_rgb(0_0_0/0.04)] max-sm:border-r sm:h-28 sm:w-auto sm:border-b" style={{ background: bg }} aria-hidden="true" />
              <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 id={titleId} className="flex items-center gap-2 text-sm font-semibold text-fg">
                      {slot.label}
                      {slot.role === "main" ? " color" : ""}
                    </h3>
                    {s.name && <p className="truncate text-sm text-fg-muted">{s.name}</p>}
                  </div>
                  {!isEditing && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-mr-1.5 -mt-1"
                      onClick={() => startEdit(slot)}
                      disabled={busy !== null}
                      aria-label={`Edit ${slot.label}${slot.role === "main" ? " color" : ""}`}
                      icon={<IconPencil className="size-4" />}
                    >
                      Edit
                    </Button>
                  )}
                </div>
                <dl className="flex flex-col gap-1 text-[0.8125rem]">
                  {[
                    { k: "HEX", v: s.hex },
                    { k: "RGB", v: s.rgb.join(", ") },
                    { k: "CMYK", v: s.cmyk.join(", "), note: true },
                  ].map((row) => (
                    <div key={row.k} className="flex items-baseline justify-between gap-3">
                      <dt className="min-w-0 font-medium text-fg-subtle">
                        {row.k}
                        {row.note && <span className="font-normal"> (approx.)</span>}
                      </dt>
                      <dd className="whitespace-nowrap font-mono text-fg">{row.v}</dd>
                    </div>
                  ))}
                </dl>
                {isEditing && (
                  <form className="flex flex-col gap-3 border-t border-line pt-3" onSubmit={(e) => save(e, slot)} noValidate>
                    <Input
                      id={hexId}
                      label={`${slot.label} hex`}
                      type="text"
                      value={draftHex}
                      maxLength={7}
                      spellCheck={false}
                      autoComplete="off"
                      className="font-mono"
                      error={invalid ? "Not a valid color." : undefined}
                      hint={HEX_HINT}
                      aria-invalid={invalid}
                      onChange={(e) => {
                        setDraftHex(e.target.value);
                        if (invalid && HEX_RE.test(e.target.value.trim())) setInvalid(false);
                      }}
                    />
                    <Input
                      id={`name-${slot.key}`}
                      label={`${slot.label} name (optional)`}
                      type="text"
                      value={draftName}
                      maxLength={40}
                      onChange={(e) => setDraftName(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" variant="primary" size="sm" disabled={busy !== null} loading={busy === "save"} loadingText="Saving…">
                        Save
                      </Button>
                      <Button size="sm" onClick={() => setEditing(null)} disabled={busy === "save"}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <p className={cn("text-sm text-fg-muted", toastsOn && "empty:hidden")} role={toastsOn ? undefined : "status"}>
        {notice}
      </p>

      <Card as="section" aria-labelledby="preview-title">
        <CardHeader
          id="preview-title"
          title="In use"
          description="The main color on a button, as a link and next to text, over your lightest and darkest neutrals."
        />
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { bg: light, ink: dark, label: "On light" },
            { bg: dark, ink: light, label: "On dark" },
          ].map((v) => {
            const ratio = contrastRatio(main, v.bg);
            return (
              <div key={v.label} className="flex flex-col gap-3 rounded-xl p-5 ring-1 ring-line ring-inset" style={{ background: v.bg, color: v.ink }}>
                <p className="text-xs font-semibold uppercase tracking-wider opacity-70">{v.label}</p>
                <p className="text-xl font-semibold tracking-tight">Fresh from the bench</p>
                <p className="text-sm leading-6">
                  Body text in your neutral, with{" "}
                  <a
                    href="#preview-title"
                    className="font-medium underline underline-offset-2"
                    style={{ color: main }}
                    onClick={(e) => e.preventDefault()}
                  >
                    a link in the main color
                  </a>
                  .
                </p>
                <span className="inline-flex w-fit rounded-lg px-4 py-2 text-sm font-semibold" style={{ background: main, color: inkOn(main) }}>
                  Primary button
                </span>
                <p className="text-xs opacity-80">
                  Main on this background: {ratio.toFixed(1)}:1{" "}
                  {ratio >= 4.5 ? "(meets AA for text)" : ratio >= 3 ? "(AA for large text only)" : "(below AA)"}
                </p>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
