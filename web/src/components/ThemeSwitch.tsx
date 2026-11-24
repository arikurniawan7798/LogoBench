import { useState } from "react";
import { applyTheme, loadTheme, saveTheme, type ThemeChoice } from "../theme";

const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Auto" },
];

/** Light / Dark / Auto (follow the OS). The choice is remembered in this browser only. */
export default function ThemeSwitch() {
  const [choice, setChoice] = useState<ThemeChoice>(() => loadTheme());

  const pick = (value: ThemeChoice) => {
    setChoice(value);
    applyTheme(value);
    saveTheme(value);
  };

  return (
    <div className="theme-switch" role="group" aria-label="Color theme">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={choice === o.value}
          title={o.value === "system" ? "Follow your system setting" : `${o.label} theme`}
          onClick={() => pick(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
