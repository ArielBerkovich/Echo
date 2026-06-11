import { createRoot } from "react-dom/client";
import "./missing-build-only-module.js";
import App from "./App.js";
import "./styles.css";

createRoot(document.getElementById("root")).render(<App />);
