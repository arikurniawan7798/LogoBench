import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "./cn";

export type TabItem = { id: string; label: string };

/**
 * WAI-ARIA tablist with automatic activation: Left/Right arrows (wrapping), Home and End move to and select a tab;
 * only the active tab is in the tab order. `idPrefix` builds the tab ids (`${idPrefix}-${id}`), and each tab controls
 * the panel `${panelPrefix}-${id}`.
 */
export function Tabs({
  items,
  active,
  onSelect,
  label,
  idPrefix = "tab",
  panelPrefix = "panel",
  className,
}: {
  items: readonly TabItem[];
  active: string;
  onSelect: (id: string) => void;
  label: string;
  idPrefix?: string;
  panelPrefix?: string;
  className?: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const i = items.findIndex((t) => t.id === active);
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % items.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const id = items[next].id;
    onSelect(id);
    refs.current[id]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKey}
      className={cn("flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}
    >
      {items.map((t) => {
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-${t.id}`}
            aria-selected={selected}
            aria-controls={`${panelPrefix}-${t.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(t.id)}
            className={cn(
              "relative shrink-0 whitespace-nowrap px-3 py-3 text-sm font-medium transition-colors duration-150",
              "after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:transition-colors",
              "focus-visible:-outline-offset-4 focus-visible:rounded-lg",
              selected ? "text-fg after:bg-accent" : "text-fg-muted after:bg-transparent hover:text-fg hover:after:bg-line-strong",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/** The panel for the active tab. Focusable so keyboard users can reach content that has no controls. */
export function TabPanel({ id, labelledBy, children, className }: { id: string; labelledBy: string; children: ReactNode; className?: string }) {
  return (
    <div role="tabpanel" id={id} aria-labelledby={labelledBy} tabIndex={0} className={cn("focus-visible:outline-offset-8 focus-visible:rounded-sm", className)}>
      {children}
    </div>
  );
}
