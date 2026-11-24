import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Title block for a page (h1) or a project section (h2): heading, description and right-aligned actions that wrap
 * below the text on narrow screens.
 */
export function PageHeader({
  title,
  description,
  actions,
  level = 1,
  id,
  className,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  level?: 1 | 2;
  id?: string;
  className?: string;
  children?: ReactNode;
}) {
  const H = level === 1 ? "h1" : "h2";
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-6 gap-y-4", className)}>
      <div className="min-w-0 max-w-3xl flex-[1_1_22rem]">
        <H
          id={id}
          className={cn("font-semibold tracking-tight text-fg", level === 1 ? "text-2xl sm:text-[1.75rem] sm:leading-9" : "text-xl")}
        >
          {title}
        </H>
        {description && <div className="mt-1.5 text-[0.9375rem] leading-relaxed text-fg-muted">{description}</div>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
