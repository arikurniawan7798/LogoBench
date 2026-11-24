import { cn } from "./cn";

const SIZES = { sm: "size-4", md: "size-5", lg: "size-7" } as const;

/**
 * Decorative spinning ring. Pass `label` for screen-reader text (made visible with `showLabel`).
 * The ring itself is always aria-hidden.
 */
export function Spinner({
  label,
  showLabel = false,
  size = "sm",
  className,
}: {
  label?: string;
  showLabel?: boolean;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg data-spinner="" className={cn("shrink-0 animate-spin", SIZES[size])} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.22" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {label && <span className={showLabel ? "text-sm text-fg-muted" : "sr-only"}>{label}</span>}
    </span>
  );
}
