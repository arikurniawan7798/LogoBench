import type { ReactNode } from "react";
import { cn } from "./cn";

/** Centered placeholder for "nothing here yet", with an icon, a title, a line of help and an optional action. */
export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
  titleAs: T = "p",
}: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  titleAs?: "p" | "h1" | "h2" | "h3";
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface/60 px-6 py-12 text-center",
        className,
      )}
    >
      {icon && <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent-text [&_svg]:size-6">{icon}</span>}
      <T className="text-base font-semibold text-fg">{title}</T>
      {children && <div className="max-w-md text-sm text-fg-muted">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
