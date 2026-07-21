import { createRoot } from "react-dom/client";
import App from "./App.js";
import UpdateConfirmation from "./components/UpdateConfirmation.js";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <>
    <App />
    <UpdateConfirmation />
  </>
);
