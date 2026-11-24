import { useEffect, useState } from "react";

/** Minimal hash router: "#/projects/abc/review" -> ["projects", "abc", "review"]. No dependency needed for a handful of pages. */
export type Route =
  | { page: "home" }
  | { page: "project"; id: string; tab: string }
  | { page: "settings" }
  | { page: "compare" }
  | { page: "forms" }
  | { page: "tools" }
  | { page: "notfound" };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  });
  const [head, id, tab] = parts;
  if (!head) return { page: "home" };
  if (head === "projects" && id) return { page: "project", id, tab: tab ?? "review" };
  if (head === "settings" || head === "compare" || head === "forms" || head === "tools") return { page: head };
  return { page: "notfound" };
}

export const href = {
  home: () => "#/",
  project: (id: string, tab = "review") => `#/projects/${encodeURIComponent(id)}/${tab}`,
  settings: () => "#/settings",
  compare: () => "#/compare",
  forms: () => "#/forms",
  tools: () => "#/tools",
};

export function navigate(to: string): void {
  window.location.hash = to.replace(/^#/, "");
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
