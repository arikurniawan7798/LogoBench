import { useEffect, useId, useRef, type MouseEvent, type ReactNode, type SyntheticEvent } from "react";
import { cn } from "./cn";
import { Button } from "./Button";

/**
 * Modal built on the native <dialog>. Mount it to open it: Esc, the Close button or a click on the backdrop calls
 * `onClose`, and focus starts on Close. The caller returns focus to whatever opened it.
 */
export function Dialog({
  title,
  subtitle,
  actions,
  onClose,
  children,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (typeof d.showModal === "function") {
      if (!d.open) d.showModal();
    } else {
      d.setAttribute("open", ""); // environments without the modal API (jsdom)
    }
    closeRef.current?.focus();
    return () => {
      if (typeof d.close === "function" && d.open) d.close();
    };
  }, []);

  const onBackdrop = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) onClose();
  };
  const onCancel = (e: SyntheticEvent) => {
    e.preventDefault(); // native Esc: let React state close it
    onClose();
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={onCancel}
      onClick={onBackdrop}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
      className={cn(
        "m-auto max-h-[calc(100dvh-2rem)] w-[min(64rem,calc(100vw-2rem))] max-w-none overflow-hidden rounded-2xl border border-line bg-surface p-0 text-fg shadow-pop",
        "open:flex open:animate-fade-in open:flex-col",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 id={titleId} className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-base font-semibold tracking-tight">
          {title}
          {subtitle && <span className="text-sm font-normal text-fg-muted">{subtitle}</span>}
        </h2>
        <div className="flex items-center gap-2">
          {actions}
          <Button ref={closeRef} size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-subtle p-4 sm:p-6">{children}</div>
    </dialog>
  );
}
