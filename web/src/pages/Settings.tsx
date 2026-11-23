import { useEffect, useState, type FormEvent } from "react";
import { api, toApiError, type ApiError, type PublicSettings, type SettingsInput } from "../api";
import ErrorBanner from "../components/ErrorBanner";

export default function Settings() {
  const [saved, setSaved] = useState<PublicSettings | null>(null);
  const [form, setForm] = useState<SettingsInput | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let live = true;
    api.getSettings().then(
      (s) => {
        if (!live) return;
        setSaved(s);
        setForm({ provider: s.provider, geminiModel: s.geminiModel, ollamaModel: s.ollamaModel, ollamaUrl: s.ollamaUrl });
      },
      (e) => live && setError(toApiError(e)),
    );
    return () => {
      live = false;
    };
  }, []);

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
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings">
      <h1>Settings</h1>
      <p className="muted">Choose which model reads your logos. Changes apply to the next request, no restart needed.</p>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      {!form && !error && (
        <p className="muted" role="status">
          Loading settings…
        </p>
      )}

      {form && saved && (
        <form onSubmit={onSubmit} className="settings-form">
          <fieldset className="card">
            <legend>AI provider</legend>
            <label className="radio">
              <input
                type="radio"
                name="provider"
                value="gemini"
                checked={form.provider === "gemini"}
                onChange={() => set("provider", "gemini")}
              />
              <span>
                <strong>Gemini</strong> <span className="muted">· hosted by Google, free tier available; the logo image is sent to Google</span>
              </span>
            </label>
            <label className="radio">
              <input
                type="radio"
                name="provider"
                value="ollama"
                checked={form.provider === "ollama"}
                onChange={() => set("provider", "ollama")}
              />
              <span>
                <strong>Ollama</strong>{" "}
                <span className="muted">
                  · runs a vision model locally; nothing leaves your machine as long as the Ollama URL points to this machine
                </span>
              </span>
            </label>
          </fieldset>

          <fieldset className="card">
            <legend>Gemini</legend>
            <div className="field">
              <label htmlFor="gemini-model">Model name</label>
              <input
                id="gemini-model"
                type="text"
                required
                value={form.geminiModel}
                onChange={(e) => set("geminiModel", e.target.value)}
                spellCheck={false}
                aria-describedby="gemini-model-hint"
              />
              <p id="gemini-model-hint" className="muted small">
                If reviews fail with &quot;model not found&quot;, check ai.google.dev for a current free-tier vision model.
              </p>
            </div>
            <div className="key-status" aria-live="polite">
              <span className={`dot ${saved.hasGeminiKey ? "ok" : "warn"}`} aria-hidden="true" />
              <span>{saved.hasGeminiKey ? "API key configured on the server" : "No API key configured"}</span>
            </div>
            <p className="muted small">
              The key never passes through this page. Put it in the <code>.env</code> file at the project root as{" "}
              <code>GEMINI_API_KEY=…</code> (or set the <code>GEMINI_API_KEY</code> environment variable) and restart the server.
            </p>
          </fieldset>

          <fieldset className="card">
            <legend>Ollama</legend>
            <div className="field">
              <label htmlFor="ollama-model">Model name</label>
              <input
                id="ollama-model"
                type="text"
                required
                value={form.ollamaModel}
                onChange={(e) => set("ollamaModel", e.target.value)}
                spellCheck={false}
              />
            </div>
            <div className="field">
              <label htmlFor="ollama-url">Server URL</label>
              <input
                id="ollama-url"
                type="url"
                required
                value={form.ollamaUrl}
                onChange={(e) => set("ollamaUrl", e.target.value)}
                spellCheck={false}
              />
            </div>
          </fieldset>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving} aria-busy={saving}>
              {saving ? "Saving…" : "Save settings"}
            </button>
            <span role="status" className="muted">
              {notice}
            </span>
          </div>
        </form>
      )}
    </div>
  );
}
