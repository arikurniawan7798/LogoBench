import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { href, type Route } from "../router";
import ThemeSwitch from "./ThemeSwitch";
import { GlobalProgress } from "./loading";
import { cn } from "./ui/cn";
import { buttonClasses } from "./ui/Button";
import {
  BrandMark,
  IconChevronRight,
  IconClose,
  IconCompare,
  IconForms,
  IconLogos,
  IconMenu,
  IconPlus,
  IconSettings,
  IconTools,
} from "./ui/icons";

type NavPage = "home" | "compare" | "forms" | "tools" | "settings";

export const NAV: { page: NavPage; label: string; to: string; Icon: typeof IconLogos }[] = [
  { page: "home", label: "Logos", to: href.home(), Icon: IconLogos },
  { page: "compare", label: "Compare", to: href.compare(), Icon: IconCompare },
  { page: "forms", label: "Forms", to: href.forms(), Icon: IconForms },
  { page: "tools", label: "Tools", to: href.tools(), Icon: IconTools },
  { page: "settings", label: "Settings", to: href.settings(), Icon: IconSettings },
];

const LABELS: Record<Route["page"], string> = {
  home: "Logos",
  project: "Project",
  compare: "Compare",
  forms: "Forms",
  tools: "Tools",
  settings: "Settings",
  notfound: "Page not found",
};

/* ---------- page title (breadcrumb leaf + document title) ---------- */

const TitleContext = createContext<(title: string | null) => void>(() => {});

/** Lets a page name itself (e.g. the project name) in the top bar breadcrumb and the window title. */
export function usePageTitle(title: string | null | undefined) {
  const set = useContext(TitleContext);
  useEffect(() => {
    set(title ?? null);
    return () => set(null);
  }, [set, title]);
}

/* ---------- shell ---------- */

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * App frame: skip link, global progress, a sidebar (full on lg, an icon rail on md, an off-canvas drawer with a menu
 * button below md), a slim top bar with the breadcrumb, and the main landmark.
 */
export function AppShell({ route, children }: { route: Route; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState<string | null>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const restoreFocus = useRef(false);
  const activePage: NavPage | null = route.page === "project" ? "home" : route.page === "notfound" ? null : route.page;

  const close = useCallback((returnFocus: boolean) => {
    restoreFocus.current = returnFocus;
    setOpen(false);
  }, []);

  // Navigating (from the drawer or anywhere else) closes the drawer.
  useEffect(() => {
    setOpen(false);
  }, [route]);

  useEffect(() => {
    if (open) {
      const first = drawerRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
      const onKey = (e: globalThis.KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          close(true);
        }
      };
      document.addEventListener("keydown", onKey);
      // Widening to the rail/sidebar layout ends the drawer.
      const wide = typeof window.matchMedia === "function" ? window.matchMedia("(min-width: 48rem)") : null;
      const onWide = () => {
        if (wide?.matches) close(false);
      };
      wide?.addEventListener?.("change", onWide);
      const overflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", onKey);
        wide?.removeEventListener?.("change", onWide);
        document.body.style.overflow = overflow;
      };
    }
    if (restoreFocus.current) {
      restoreFocus.current = false;
      menuRef.current?.focus();
    }
  }, [open, close]);

  // Keep Tab inside the open drawer.
  function trap(e: KeyboardEvent<HTMLElement>) {
    if (!open || e.key !== "Tab") return;
    const items = Array.from(drawerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  useEffect(() => {
    document.title = title ? `${title} · LogoBench` : route.page === "home" ? "LogoBench" : `${LABELS[route.page]} · LogoBench`;
  }, [title, route.page]);

  const crumbs = useMemo(() => {
    const list: { label: string; to?: string }[] = [];
    if (route.page === "project") {
      list.push({ label: "Logos", to: href.home() });
      list.push({ label: title ?? "Project" });
    } else {
      list.push({ label: LABELS[route.page] });
    }
    return list;
  }, [route.page, title]);

  return (
    <TitleContext.Provider value={setTitle}>
      <GlobalProgress />
      <a
        href="#main"
        className={cn(
          "sr-only rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink no-underline shadow-pop focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80]",
        )}
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>

      {open && (
        <div
          className="fixed inset-0 z-40 animate-fade-in bg-black/50 backdrop-blur-[1px] md:hidden"
          aria-hidden="true"
          onClick={() => close(true)}
        />
      )}

      <div className="flex min-h-dvh">
      <aside
        ref={drawerRef}
        id="app-sidebar"
        onKeyDown={trap}
        {...(open ? { role: "dialog", "aria-modal": true, "aria-label": "Menu" } : {})}
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[min(18rem,85vw)] flex-col border-r border-line bg-surface md:sticky md:top-0 md:z-30 md:flex md:h-dvh md:w-16 md:shrink-0 lg:w-64",
          open ? "flex animate-drawer-in shadow-pop md:animate-none md:shadow-none" : "hidden",
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-4 md:max-lg:justify-center md:max-lg:px-0">
          <a
            href={href.home()}
            className="flex items-center gap-2.5 rounded-lg text-fg no-underline"
            aria-current={route.page === "home" ? "page" : undefined}
          >
            <BrandMark />
            <span className="text-[0.9375rem] font-semibold tracking-tight md:max-lg:sr-only">LogoBench</span>
          </a>
          {open && (
            <button
              type="button"
              onClick={() => close(true)}
              className="grid size-9 place-items-center rounded-lg text-fg-muted hover:bg-accent-soft hover:text-accent-text md:hidden"
              aria-label="Close menu"
            >
              <IconClose />
            </button>
          )}
        </div>

        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-2 md:max-lg:px-2">
          <p className="px-3 pb-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-subtle md:max-lg:sr-only">Workspace</p>
          <ul className="flex flex-col gap-0.5">
            {NAV.map(({ page, label, to, Icon }) => {
              const current = activePage === page;
              return (
                <li key={page}>
                  <a
                    href={to}
                    title={label}
                    aria-current={current ? "page" : undefined}
                    onClick={() => {
                      if (open) {
                        // the drawer closes on the route change; move focus to the new page, not back to the menu button
                        restoreFocus.current = false;
                        setTimeout(() => document.getElementById("main")?.focus(), 0);
                      }
                    }}
                    className={cn(
                      "group flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium no-underline transition-colors md:max-lg:justify-center md:max-lg:px-0",
                      current ? "bg-accent-soft text-accent-text" : "text-fg-muted hover:bg-accent-soft hover:text-accent-text",
                    )}
                  >
                    <Icon className={cn("size-5", current ? "text-accent-text" : "text-fg-subtle group-hover:text-fg")} />
                    <span className="md:max-lg:sr-only">{label}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex shrink-0 flex-col gap-3 border-t border-line p-3 md:max-lg:px-2">
          <ThemeSwitch />
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-1 md:max-lg:justify-center md:max-lg:px-0" title="Runs locally">
            <span className="relative grid size-2.5 shrink-0 place-items-center" aria-hidden="true">
              <span className="absolute inset-0 rounded-full bg-success/30" />
              <span className="size-1.5 rounded-full bg-success" />
            </span>
            <p className="min-w-0 text-xs leading-4 text-fg-muted md:max-lg:sr-only">
              <span className="font-medium text-fg">Runs locally</span>
              <span className="block">Only the logo goes to your AI provider.</span>
            </p>
          </div>
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-md supports-[backdrop-filter]:bg-canvas/70">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              ref={menuRef}
              type="button"
              className="-ml-1.5 grid size-9 place-items-center rounded-lg text-fg-muted hover:bg-accent-soft hover:text-accent-text md:hidden"
              aria-label="Open menu"
              aria-expanded={open}
              aria-controls="app-sidebar"
              onClick={() => setOpen(true)}
            >
              <IconMenu className="size-5" />
            </button>
            <a href={href.home()} className="shrink-0 rounded-lg md:hidden" aria-label="LogoBench home">
              <BrandMark className="size-7" />
            </a>
            <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
              <ol className="flex min-w-0 items-center gap-1.5 text-sm">
                {crumbs.map((c, i) => {
                  const last = i === crumbs.length - 1;
                  return (
                    <li key={i} className={cn("flex min-w-0 items-center gap-1.5", !last && "max-sm:hidden")}>
                      {c.to ? (
                        <a href={c.to} className="truncate rounded text-fg-muted no-underline hover:text-fg">
                          {c.label}
                        </a>
                      ) : (
                        <span className="truncate font-medium text-fg" aria-current={last ? "page" : undefined}>
                          {c.label}
                        </span>
                      )}
                      {!last && <IconChevronRight className="size-4 shrink-0 text-fg-subtle" />}
                    </li>
                  );
                })}
              </ol>
            </nav>
            {route.page !== "home" && (
              <a href={href.home()} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                <IconPlus className="size-4" />
                <span className="max-sm:sr-only">New logo</span>
              </a>
            )}
          </div>
        </header>

        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 focus:outline-none sm:px-6 sm:py-8 lg:px-8">
          {children}
        </main>

        <footer className="mx-auto w-full max-w-6xl px-4 pb-8 text-xs text-fg-subtle sm:px-6 lg:px-8">
          <p className="border-t border-line pt-5">LogoBench runs locally. Scores are feedback from a model, not a verdict on your work.</p>
        </footer>
      </div>
      </div>
    </TitleContext.Provider>
  );
}
