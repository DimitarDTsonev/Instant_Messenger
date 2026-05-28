/**
 * Application entry point — mounts the React root and registers the service worker.
 *
 * Uses `ReactDOM.createRoot` (React 18 concurrent-mode API) to render the top-level
 * `<App>` component inside `<React.StrictMode>` for double-invoke warnings in development.
 *
 * Service worker registration:
 *  - Guarded by `"serviceWorker" in navigator` to skip unsupported environments.
 *  - Registers `sw.js` after the `load` event so it does not block the initial paint.
 *  - Uses `import.meta.env.BASE_URL` to handle sub-path deployments (e.g. GitHub Pages).
 *  - Errors are silently swallowed; PWA features degrade gracefully.
 */

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Mount the React tree into the #root div created by index.html
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register service worker for PWA offline support
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const base = import.meta.env.BASE_URL || "/";
    navigator.serviceWorker.register(`${base}sw.js`).catch(() => {});
  });
}
