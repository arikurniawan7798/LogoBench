import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

type CardProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "section" | "article" | "form" | "fieldset" | "li" | "header" | "figure";
  padding?: "none" | "sm" | "md";
};

export const cardClasses = "rounded-xl border border-line bg-surface shadow-card";

/** Rounded surface with a hairline border and a soft shadow (a plain border in dark mode). */
export function Card({ as: Tag = "div", padding = "md", className, ...rest }: CardProps & Record<string, unknown>) {
  const pad = padding === "none" ? "" : padding === "sm" ? "p-4" : "p-5 sm:p-6";
  return <Tag className={cn(cardClasses, pad, className)} {...rest} />;
}

/** Title row for a card: heading (with optional description) on the left, actions on the right. */
export function CardHeader({
  title,
  description,
  actions,
  id,
  level = 3,
  icon,
  flush = false,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  id?: string;
  level?: 2 | 3;
  icon?: ReactNode;
  /** No bottom margin: for cards that already space their children with a gap. */
  flush?: boolean;
}) {
  const H = level === 2 ? "h2" : "h3";
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", !flush && "mb-4")}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-text">{icon}</span>
        )}
        <div className="min-w-0">
          <H id={id} className="text-base font-semibold tracking-tight text-fg">
            {title}
          </H>
          {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
