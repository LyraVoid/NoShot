import { useEffect, useState } from "react";
import { Shell, type Route } from "./Shell";
import { Home } from "./pages/Home";
import { Apps } from "./pages/Apps";
import { Logs } from "./pages/Logs";
import { Settings } from "./pages/Settings";
import type { AppearanceProps } from "./pages/Appearance";

const routes: Route[] = ["/", "/apps", "/logs", "/settings"];

function normalize(hash: string): Route {
  const value = hash.replace(/^#/, "") as Route;
  return routes.includes(value) ? value : "/";
}

export default function App(appearance: AppearanceProps) {
  const [route, setRoute] = useState<Route>(() => normalize(window.location.hash));

  useEffect(() => {
    const onHash = () => setRoute(normalize(window.location.hash));
    window.addEventListener("hashchange", onHash);
    document.documentElement.lang = "zh-CN";
    const host = (window as unknown as {
      ksu?: { enableEdgeToEdge?: (enabled?: boolean) => void };
    }).ksu;
    try {
      host?.enableEdgeToEdge?.(true);
    } catch {
      // Older hosts may not expose viewport support.
    }
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <Shell route={route}>
      {route === "/apps" ? <Apps /> : route === "/logs" ? <Logs /> : route === "/settings" ? <Settings {...appearance} /> : <Home />}
    </Shell>
  );
}
