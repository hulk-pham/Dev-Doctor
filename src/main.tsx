import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyTheme, readSettings } from "./state/settings";
import "./index.css";

applyTheme(readSettings().theme);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
