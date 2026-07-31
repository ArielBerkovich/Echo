import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter } from "react-router";
import App from "./App.js";
import UpdateConfirmation from "./components/UpdateConfirmation.js";
import { queryClient } from "./lib/queryClient.js";
import "./styles.css";

const Router = window.location.protocol === "file:" ? HashRouter : BrowserRouter;

createRoot(document.getElementById("root")).render(
  <QueryClientProvider client={queryClient}>
    <Router>
      <App />
      <UpdateConfirmation />
    </Router>
  </QueryClientProvider>
);
