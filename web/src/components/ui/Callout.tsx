import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";
import type { Tone } from "./Badge";
import { IconAlert, IconCheck, IconInfo } from "./icons";

const TONES: Record<Exclude<Tone, "neutral" | "accent">, { box: string; icon: string; Icon: typeof IconInfo }> = {
  info: { box: "border-info-line bg-info-soft", icon: "text-info", Icon: IconInfo },
  warn: { box: "border-warn-line bg-warn-soft", icon: "text-warn", Icon: IconAlert },
  danger: { box: "border-danger-line bg-danger-soft", icon: "text-danger", Icon: IconAlert },
  success: { box: "border-success-line bg-success-soft", icon: "text-success", Icon: IconCheck },
};

/** A tinted note with an icon. Text stays in the regular foreground colour for contrast; the tone is in the icon and tint. */
export function Callout({
  tone = "info",
  title,
  children,
  actions,
  className,
  ...rest
}: Omit<HTMLAttributes<HTMLDivElement>, "title"> & { tone?: keyof typeof TONES; title?: ReactNode; actions?: ReactNode }) {
  const t = TONES[tone];
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 text-sm", t.box, className)} {...rest}>
      <t.Icon className={cn("mt-0.5", t.icon)} />
      <div className="min-w-0 flex-1 space-y-1 text-fg [&_p]:leading-6">
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
      {actions}
    </div>
  );
}
