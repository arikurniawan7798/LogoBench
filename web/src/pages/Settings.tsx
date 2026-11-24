import { useEffect, useState, type FormEvent } from "react";
import { api, type ApiError, type PublicSettings, type SettingsInput } from "../api";
import ErrorBanner from "../components/ErrorBanner";
import { Badge, Button, Card, CardHeader, cn, IconAlert, IconCheck, Input, PageHeader, Skeleton } from "../components/ui";
import { useApiError, useToast, useToastsEnabled } from "../components/toast";

export default function Settings() {
  const [saved, setSaved] = useState<PublicSettings | null>(null);
  const [form, setForm] = useState<SettingsInput | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const report = useApiError();
  const toast = useToast();
  const toastsOn = useToastsEnabled();

  useEffect(() => {
    let live = true;
    api.getSettings().then(
      (s) => {
        if (!live) return;
        setSaved(s);
        setForm({ provider: s.provider, geminiModel: s.geminiModel, ollamaModel: s.ollamaModel, ollamaUrl: s.ollamaUrl });
      },
      (e) => live && setError(report(e)),
    );
    return () => {
      live = false;
    };
  }, [report]);

  const set = <K extends keyof SettingsInput>(k: K, v: SettingsInput[K]) => {
    setNotice("");
    setForm((f) => (f ? { ...f, [k]: v } : f));
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError(null);
    setNotice("");
    try {
      const s = await api.saveSettings(form);
      setSaved(s);
      setNotice("Settings saved. They apply to the next AI request.");
      toast.success("Settings saved.", "They apply to the next AI request.");
    } catch (err) {
      setError(report(err));
    } finally {
      setSaving(false);
    }
  }

  const providers = [
    {
      id: "gemini" as const,
      name: "Gemini",
      note: "hosted by Google, free tier available; the logo image is sent to Google",
    },
    {
      id: "ollama" as const,
      name: "Ollama",
      note: "runs a vision model locally; nothing leaves your machine as long as the Ollama URL points to this machine",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description={<p>Choose which model reads your logos. Changes apply to the next request, no restart needed.</p>}
      />

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      {!form && !error && <Skeleton label="Loading settings…" lines={4} />}

      {form && saved && (
        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          <Card as="fieldset" className="min-w-0">
            <legend className="sr-only">AI provider</legend>
            <CardHeader level={2} title="AI provider" description="Which service reviews your logos and suggests colors and type." />
            <div className="grid gap-3 md:grid-cols-2">
              {providers.map((p) => {
                const checked = form.provider === p.id;
                return (
                  <label
                    key={p.id}
                    className={cn(
                      "relative flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-[border-color,background-color] duration-150",
                      "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring",
                      checked ? "border-accent bg-accent-soft/60 ring-1 ring-accent" : "border-line hover:border-line-strong hover:bg-subtle",
                    )}
                  >
                    <input
                      type="radio"
                      name="provider"
                      value={p.id}
                      checked={checked}
                      onChange={() => set("provider", p.id)}
                      className="mt-1 size-4 shrink-0 cursor-pointer accent-[var(--lb-accent)] focus-visible:outline-none"
                    />
                    <span className="min-w-0 text-sm leading-6">
                      <strong className="font-semibold text-fg">{p.name}</strong>{" "}
                      <span className="text-fg-muted">· {p.note}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </Card>

          <div className="grid items-start gap-6 lg:grid-cols-2">
            <Card as="fieldset" className="min-w-0">
              <legend className="sr-only">Gemini</legend>
              <CardHeader
                level={2}
                title="Gemini"
                actions={
                  <Badge
                    tone={saved.hasGeminiKey ? "success" : "warn"}
                    icon={<span className={cn("size-1.5 rounded-full", saved.hasGeminiKey ? "bg-success" : "bg-warn")} aria-hidden="true" />}
                  >
                    {saved.hasGeminiKey ? "Key set" : "No key"}
                  </Badge>
                }
              />
              <div className="flex flex-col gap-4">
                <Input
                  id="gemini-model"
                  label="Model name"
                  type="text"
                  required
                  className="font-mono"
                  value={form.geminiModel}
                  onChange={(e) => set("geminiModel", e.target.value)}
                  spellCheck={false}
                  hint={<>If reviews fail with &quot;model not found&quot;, check ai.google.dev for a current free-tier vision model.</>}
                />
                <div
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm font-medium",
                    saved.hasGeminiKey ? "border-success-line bg-success-soft text-success" : "border-warn-line bg-warn-soft text-warn",
                  )}
                  aria-live="polite"
                >
                  {saved.hasGeminiKey ? <IconCheck className="size-4" /> : <IconAlert className="size-4" />}
                  <span>{saved.hasGeminiKey ? "API key configured on the server" : "No API key configured"}</span>
                </div>
                <div className="rounded-lg bg-subtle p-3.5 text-[0.8125rem] leading-6 text-fg-muted">
                  <p>
                    The key never passes through this page. Put it in the <code>.env</code> file at the project root as{" "}
                    <code>GEMINI_API_KEY=…</code> (or set the <code>GEMINI_API_KEY</code> environment variable) and restart the server.
                  </p>
                </div>
              </div>
            </Card>

            <Card as="fieldset" className="min-w-0">
              <legend className="sr-only">Ollama</legend>
              <CardHeader level={2} title="Ollama" description="A local model server on this machine." />
              <div className="flex flex-col gap-4">
                <Input
                  id="ollama-model"
                  label="Model name"
                  type="text"
                  required
                  className="font-mono"
                  value={form.ollamaModel}
                  onChange={(e) => set("ollamaModel", e.target.value)}
                  spellCheck={false}
                />
                <Input
                  id="ollama-url"
                  label="Server URL"
                  type="url"
                  required
                  className="font-mono"
                  value={form.ollamaUrl}
                  onChange={(e) => set("ollamaUrl", e.target.value)}
                  spellCheck={false}
                />
              </div>
            </Card>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" loading={saving} loadingText="Saving…">
              Save settings
            </Button>
            {/* With toasts on, the success toast is the announcer; this stays as a visible note. */}
            <span role={toastsOn ? undefined : "status"} className="text-sm text-fg-muted">
              {notice}
            </span>
          </div>
        </form>
      )}
    </div>
  );
}
