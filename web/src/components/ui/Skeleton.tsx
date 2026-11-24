import { cn } from "./cn";

/** Placeholder for data that is loading, announced once as a status with `label`. */
export function Skeleton({ label, lines = 3, variant = "lines" }: { label: string; lines?: number; variant?: "lines" | "cards" }) {
  return (
    <div
      role="status"
      className={cn(
        variant === "cards" ? "grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-4" : "flex flex-col gap-3",
      )}
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }, (_, i) =>
        variant === "cards" ? (
          <span key={i} aria-hidden="true" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
            <span className="block aspect-[4/3] animate-pulse rounded-lg bg-muted-bg" />
            <span className="block h-3.5 w-2/3 animate-pulse rounded bg-muted-bg" />
            <span className="block h-3 w-1/3 animate-pulse rounded bg-muted-bg" />
          </span>
        ) : (
          <span
            key={i}
            aria-hidden="true"
            className={cn("block h-4 animate-pulse rounded-md bg-muted-bg", i === lines - 1 ? "w-3/5" : i % 2 ? "w-11/12" : "w-full")}
          />
        ),
      )}
    </div>
  );
}
