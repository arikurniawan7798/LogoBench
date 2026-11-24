import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export type Tone = "neutral" | "accent" | "success" | "warn" | "danger" | "info";

const TONES: Record<Tone, string> = {
  neutral: "border-line bg-subtle text-fg-muted",
  accent: "border-accent-line bg-accent-soft text-accent-text",
  success: "border-success-line bg-success-soft text-success",
  warn: "border-warn-line bg-warn-soft text-warn",
  danger: "border-danger-line bg-danger-soft text-danger",
  info: "border-info-line bg-info-soft text-info",
};

/** Small status label. */
export function Badge({
  tone = "neutral",
  icon,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone; icon?: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium leading-5",
        TONES[tone],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </span>
  );
}

/** A labelled value pill, e.g. a personality trait: "Tone · Friendly". */
export function Chip({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xl border border-line bg-subtle px-3.5 py-2.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{label}</dt>
      <dd className="text-sm font-medium text-fg">{value}</dd>
    </div>
  );
}

/** A number with a caption, for headline figures. */
export function Stat({ label, value, hint }: { label: ReactNode; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{label}</span>
      <span className="text-2xl font-semibold tabular-nums tracking-tight text-fg">{value}</span>
      {hint && <span className="text-xs text-fg-muted">{hint}</span>}
    </div>
  );
}
