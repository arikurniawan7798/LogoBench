import { useEffect } from "react";
import { href, useRoute, type Route } from "./router";
import Home from "./pages/Home";
import Project from "./pages/Project";
import Settings from "./pages/Settings";
import ComingNext from "./components/ComingNext";

const NAV = [
  { page: "compare", label: "Compare", to: href.compare() },
  { page: "forms", label: "Forms", to: href.forms() },
  { page: "tools", label: "Tools", to: href.tools() },
  { page: "settings", label: "Settings", to: href.settings() },
] as const;

function Page({ route }: { route: Route }) {
  switch (route.page) {
    case "home":
      return <Home />;
    case "project":
      return <Project id={route.id} tab={route.tab} />;
    case "settings":
      return <Settings />;
    case "compare":
      return <ComingNext level={1} title="Compare" detail="Put two or three logos side by side against the same brief." />;
    case "forms":
      return <ComingNext level={1} title="Forms" detail="Client questionnaires that feed the brief used in reviews." />;
    case "tools":
      return <ComingNext level={1} title="Tools" detail="Small utilities for working on a mark." />;
    default:
      return (
        <section>
          <h1>Page not found</h1>
          <p>
            <a href={href.home()}>Back to your logos</a>
          </p>
        </section>
      );
  }
}

export default function App() {
  const route = useRoute();

  useEffect(() => {
    window.scrollTo?.(0, 0);
  }, [route.page]);

  return (
    <>
      <a className="skip-link" href="#main" onClick={(e) => {
        e.preventDefault();
        document.getElementById("main")?.focus();
      }}>
        Skip to content
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href={href.home()} aria-current={route.page === "home" ? "page" : undefined}>
            <svg className="brand-mark" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <rect x="3" y="15" width="18" height="3" rx="1" fill="currentColor" />
              <rect x="5" y="18" width="2" height="4" fill="currentColor" />
              <rect x="17" y="18" width="2" height="4" fill="currentColor" />
              <circle cx="12" cy="9" r="5" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
            <span>LogoBench</span>
          </a>
          <nav aria-label="Main">
            <ul>
              {NAV.map((n) => (
                <li key={n.page}>
                  <a href={n.to} aria-current={route.page === n.page ? "page" : undefined}>
                    {n.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <Page route={route} />
      </main>
      <footer className="footer muted small">
        LogoBench runs locally. Scores are feedback from a model, not a verdict on your work.
      </footer>
    </>
  );
}
