export type ThemeChoice = "system" | "light" | "dark";

export const THEME_KEY = "logobench.theme";

export function isThemeChoice(v: unknown): v is ThemeChoice {
  return v === "system" || v === "light" || v === "dark";
}

/** The saved choice, or "system" when nothing (valid) is saved or storage is unavailable. */
export function loadTheme(): ThemeChoice {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return isThemeChoice(v) ? v : "system";
  } catch {
    return "system";
  }
}

/** Light/Dark force a palette through data-theme; System removes it so the OS preference decides. */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
}

export function saveTheme(choice: ThemeChoice): void {
  try {
    if (choice === "system") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, choice);
  } catch {
    /* private mode / blocked storage: the choice still applies for this page view */
  }
}
