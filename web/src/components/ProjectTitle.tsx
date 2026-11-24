import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { PROJECT_NAME_MAX, projectNameProblem } from "../api";
import { BusyLabel } from "./loading";

/**
 * The project's <h1> with inline rename. "Rename" swaps the title for a labelled input (focused, text selected);
 * Enter or Save submits, Esc or Cancel restores the title. Focus returns to the Rename button when the editor closes.
 * Validation mirrors the server (1-80 characters, no control characters) and is shown inline; `onSave` resolves true
 * when the rename succeeded (the caller toasts success or failure).
 */
export default function ProjectTitle({
  name,
  editing,
  onStart,
  onCancel,
  onSave,
}: {
  name: string;
  editing: boolean;
  onStart: () => void;
  onCancel: () => void;
  onSave: (name: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(name);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false); // double-submit guard (state updates are async)
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  // While closed, the draft tracks the saved name, so the editor always opens with it (however it was opened).
  useEffect(() => {
    if (!editing) {
      setDraft(name);
      setProblem(null);
    }
  }, [editing, name]);

  useEffect(() => {
    if (editing && !wasEditing.current) {
      inputRef.current?.focus(); // the input is mounted in this same commit
      inputRef.current?.select();
    } else if (!editing && wasEditing.current) {
      buttonRef.current?.focus();
    }
    wasEditing.current = editing;
  }, [editing]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (savingRef.current) return;
    const p = projectNameProblem(draft);
    if (p) {
      setProblem(p);
      inputRef.current?.focus();
      return;
    }
    const next = draft.trim();
    if (next === name) {
      onCancel();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setProblem(null);
    try {
      const ok = await onSave(next);
      if (!ok) inputRef.current?.focus();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape" && !savingRef.current) {
      e.preventDefault();
      onCancel();
    }
  }

  if (!editing) {
    return (
      <div className="title-row">
        <h1>{name}</h1>
        <button ref={buttonRef} type="button" className="btn btn-small title-rename" onClick={onStart}>
          Rename<span className="sr-only"> logo</span>
        </button>
      </div>
    );
  }

  const count = Array.from(draft.trim()).length;
  return (
    <form className="rename-form" onSubmit={submit} noValidate>
      {/* the page keeps its heading while the editor is open */}
      <h1 className="sr-only">{name}</h1>
      <label htmlFor={`${id}-input`} className="sr-only">
        Logo name
      </label>
      <input
        ref={inputRef}
        id={`${id}-input`}
        type="text"
        value={draft}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={problem ? "true" : "false"}
        aria-describedby={problem ? `${errorId} ${hintId}` : hintId}
        onChange={(e) => {
          setDraft(e.target.value);
          if (problem) setProblem(null);
        }}
        onKeyDown={onKey}
      />
      <div className="rename-actions">
        <button type="submit" className="btn btn-primary btn-small" disabled={saving} aria-busy={saving}>
          <BusyLabel busy={saving} busyText="Saving…">
            Save
          </BusyLabel>
        </button>
        <button type="button" className="btn btn-small" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <span id={hintId} className={`muted small${count > PROJECT_NAME_MAX ? " over" : ""}`}>
          {count}/{PROJECT_NAME_MAX} · Shown in mockups, the identity page and export file names. Esc cancels.
        </span>
      </div>
      {problem && (
        <p id={errorId} className="field-error">
          {problem}
        </p>
      )}
    </form>
  );
}
