import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App.js";
import UpdateConfirmation from "./components/UpdateConfirmation.js";
import { queryClient } from "./lib/queryClient.js";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <QueryClientProvider client={queryClient}>
    <App />
    <UpdateConfirmation />
  </QueryClientProvider>
);
