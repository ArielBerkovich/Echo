import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter } from "react-router";
import App from "./App.js";
import BrowserCompatibilityNotice from "./components/BrowserCompatibilityNotice.js";
import UpdateConfirmation from "./components/UpdateConfirmation.js";
import AppErrorBoundary from "./components/AppErrorBoundary.js";
import ThemedTooltipLayer from "./components/ThemedTooltipLayer.js";
import { LocaleProvider } from "./lib/i18n.js";
import { queryClient } from "./lib/queryClient.js";
import "@fontsource/asap/latin-400.css";
import "@fontsource/asap/latin-500.css";
import "@fontsource/asap/latin-600.css";
import "@fontsource/asap/latin-700.css";
import "@fontsource/rubik/hebrew-400.css";
import "@fontsource/rubik/hebrew-500.css";
import "@fontsource/rubik/hebrew-600.css";
import "@fontsource/rubik/hebrew-700.css";
import "./styles.css";

const Router = window.location.protocol === "file:" ? HashRouter : BrowserRouter;

// A deployment can replace lazy-loaded chunks while an older tab is still
// open. Vite reports that stale-chunk case here; reload once to pick up the
// new index and matching assets.
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  const key = "echo:preload-reload-attempted";
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, "1");
  window.location.reload();
});
window.addEventListener("load", () => sessionStorage.removeItem("echo:preload-reload-attempted"), { once: true });

createRoot(document.getElementById("root")).render(
  <QueryClientProvider client={queryClient}>
    <AppErrorBoundary>
      <Router>
        <LocaleProvider>
          <BrowserCompatibilityNotice />
          <App />
          <ThemedTooltipLayer />
          <UpdateConfirmation />
        </LocaleProvider>
      </Router>
    </AppErrorBoundary>
  </QueryClientProvider>
);
