import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { PROJECT_NAME_MAX, projectNameProblem } from "../api";
import { Button } from "./ui/Button";
import { Input } from "./ui/Field";
import { IconPencil } from "./ui/icons";

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
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <h1 className="min-w-0 break-words text-2xl font-semibold tracking-tight text-fg sm:text-[1.75rem] sm:leading-9">{name}</h1>
        <Button ref={buttonRef} variant="ghost" size="sm" icon={<IconPencil className="size-4" />} onClick={onStart}>
          Rename<span className="sr-only"> logo</span>
        </Button>
      </div>
    );
  }

  const count = Array.from(draft.trim()).length;
  return (
    <form className="flex max-w-xl flex-col gap-2" onSubmit={submit} noValidate>
      {/* the page keeps its heading while the editor is open */}
      <h1 className="sr-only">{name}</h1>
      <Input
        ref={inputRef}
        id={`${id}-input`}
        label="Logo name"
        hideLabel
        type="text"
        value={draft}
        autoComplete="off"
        spellCheck={false}
        className="h-11 text-lg font-semibold"
        error={problem}
        hint={
          <span className={count > PROJECT_NAME_MAX ? "font-medium text-danger" : undefined}>
            {count}/{PROJECT_NAME_MAX} · Shown in mockups, the identity page and export file names. Esc cancels.
          </span>
        }
        aria-invalid={problem ? true : false}
        onChange={(e) => {
          setDraft(e.target.value);
          if (problem) setProblem(null);
        }}
        onKeyDown={onKey}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" size="sm" loading={saving} loadingText="Saving…">
          Save
        </Button>
        <Button size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
