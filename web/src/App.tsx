import { useEffect } from "react";
import { href, useRoute, type Route } from "./router";
import Home from "./pages/Home";
import Project from "./pages/Project";
import Settings from "./pages/Settings";
import ComparePage from "./pages/ComparePage";
import FormsPage from "./pages/FormsPage";
import ToolsPage from "./pages/ToolsPage";
import { ToastProvider } from "./components/toast";
import { AppShell } from "./components/AppShell";
import { ButtonLink, EmptyState, IconLogos } from "./components/ui";

function Page({ route }: { route: Route }) {
  switch (route.page) {
    case "home":
      return <Home />;
    case "project":
      return <Project id={route.id} tab={route.tab} />;
    case "settings":
      return <Settings />;
    case "compare":
      return <ComparePage />;
    case "forms":
      return <FormsPage />;
    case "tools":
      return <ToolsPage />;
    default:
      return (
        <EmptyState
          titleAs="h1"
          icon={<IconLogos />}
          title={<span className="text-lg">Page not found</span>}
          action={
            <ButtonLink href={href.home()} variant="primary">
              Back to your logos
            </ButtonLink>
          }
        >
          That address does not match any page in LogoBench.
        </EmptyState>
      );
  }
}

export default function App() {
  const route = useRoute();

  useEffect(() => {
    window.scrollTo?.(0, 0);
  }, [route.page]);

  return (
    <ToastProvider>
      <AppShell route={route}>
        <Page route={route} />
      </AppShell>
    </ToastProvider>
  );
}
