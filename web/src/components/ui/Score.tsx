import { cn } from "./cn";

/** Colour band for a 1-10 score. Kept gentle on purpose: scores are prompts for judgment, not grades. */
export function scoreTone(score: number): { stroke: string; text: string; bar: string } {
  if (score >= 8) return { stroke: "stroke-success", text: "text-success", bar: "bg-success" };
  if (score >= 5) return { stroke: "stroke-accent", text: "text-accent-text", bar: "bg-accent" };
  return { stroke: "stroke-warn", text: "text-warn", bar: "bg-warn" };
}

/**
 * Circular gauge for a 1-10 score with the numeral always visible in the middle. The visible numeral is aria-hidden;
 * screen readers get "N out of 10".
 */
export function ScoreRing({ score, max = 10, size = "md" }: { score: number; max?: number; size?: "sm" | "md" }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, score / max));
  const tone = scoreTone(score);
  return (
    <span className={cn("relative inline-grid shrink-0 place-items-center", size === "sm" ? "size-12" : "size-16")}>
      <svg viewBox="0 0 48 48" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
        <circle cx="24" cy="24" r={r} fill="none" strokeWidth="4.5" className="stroke-muted-bg" />
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeDasharray={`${c * frac} ${c}`}
          className={cn(tone.stroke, "transition-[stroke-dasharray] duration-500")}
        />
      </svg>
      <span className="relative flex flex-col items-center leading-none" aria-hidden="true">
        <span className={cn("font-semibold tabular-nums tracking-tight text-fg", size === "sm" ? "text-base" : "text-xl")}>{score}</span>
        <span className="mt-0.5 text-[0.625rem] font-medium text-fg-subtle">/{max}</span>
      </span>
      <span className="sr-only">
        {score} out of {max}
      </span>
    </span>
  );
}

/** Thin horizontal bar for a score, with the numeral alongside. */
export function ScoreBar({ score, max = 10, className }: { score: number; max?: number; className?: string }) {
  const tone = scoreTone(score);
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted-bg" aria-hidden="true">
        <span className={cn("block h-full rounded-full", tone.bar)} style={{ width: `${(Math.max(0, Math.min(max, score)) / max) * 100}%` }} />
      </span>
      <span className="w-10 text-right text-sm font-semibold tabular-nums text-fg" aria-hidden="true">
        {score}
        <span className="text-xs font-medium text-fg-subtle">/{max}</span>
      </span>
      <span className="sr-only">
        {score} out of {max}
      </span>
    </span>
  );
}
