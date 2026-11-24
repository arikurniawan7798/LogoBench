import { useState } from "react";
import { applyTheme, loadTheme, saveTheme, type ThemeChoice } from "../theme";
import { cn } from "./ui/cn";
import { IconMonitor, IconMoon, IconSun } from "./ui/icons";

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof IconSun }[] = [
  { value: "light", label: "Light", Icon: IconSun },
  { value: "dark", label: "Dark", Icon: IconMoon },
  { value: "system", label: "Auto", Icon: IconMonitor },
];

/**
 * Light / Dark / Auto (follow the OS). The choice is remembered in this browser only. In the icon rail (md) the labels
 * are visually hidden but stay the buttons' names.
 */
export default function ThemeSwitch({ className }: { className?: string }) {
  const [choice, setChoice] = useState<ThemeChoice>(() => loadTheme());

  const pick = (value: ThemeChoice) => {
    setChoice(value);
    applyTheme(value);
    saveTheme(value);
  };

  return (
    <div
      className={cn("grid grid-cols-3 gap-0.5 rounded-lg border border-line bg-subtle p-0.5 md:max-lg:grid-cols-1", className)}
      role="group"
      aria-label="Color theme"
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={choice === value}
          title={value === "system" ? "Follow your system setting" : `${label} theme`}
          onClick={() => pick(value)}
          className={cn(
            "flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors",
            choice === value ? "bg-surface text-fg shadow-xs ring-1 ring-line" : "text-fg-muted hover:text-fg",
          )}
        >
          <Icon className="size-4" />
          <span className="md:max-lg:sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
