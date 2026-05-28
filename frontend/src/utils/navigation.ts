/**
 * Client-side navigation utilities for single-page app routing.
 *
 * This project uses the History API directly instead of a routing library,
 * so these helpers wrap `window.history` and dispatch a `popstate` event so
 * the App component re-renders on the new path.
 *
 * Used by: App.tsx (initial path detection), LoginPage.tsx, InvitePage.tsx,
 *          ResetPasswordPage.tsx, ForgotPasswordPage.tsx.
 */

/**
 * Returns the current URL path relative to the app's base URL.
 *
 * Strips the Vite `BASE_URL` prefix so paths like `/MyApp/chat` are returned
 * as `/chat` when the app is deployed under a sub-path (e.g. GitHub Pages).
 *
 * Built-ins used: `import.meta.env.BASE_URL`, `window.location.pathname`,
 *                 `String.prototype.slice`.
 *
 * @returns The current path string, always starting with "/".
 *
 * @example
 * // BASE_URL = "/instant-messenger/", location.pathname = "/instant-messenger/invite/abc"
 * getAppPath() // → "/invite/abc"
 */
export function getAppPath() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return window.location.pathname.slice(base.length) || "/";
}

/**
 * Navigates to a path by pushing or replacing a history entry and
 * dispatching a `popstate` event so the App component updates.
 *
 * @param path - The target path (leading slash added if absent).
 * @param mode - `"push"` (default) adds a new history entry; `"replace"` overwrites the current one.
 *
 * Built-ins used: `window.history.pushState`, `window.history.replaceState`,
 *                 `window.dispatchEvent`, `PopStateEvent`.
 */
export function navigateTo(path: string, mode: "push" | "replace" = "push") {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (mode === "replace") {
    window.history.replaceState({}, "", normalizedPath);
  } else {
    window.history.pushState({}, "", normalizedPath);
  }
  // Trigger re-render in App.tsx which listens to the popstate event
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/**
 * Navigates to the application root ("/").
 *
 * @param mode - `"push"` or `"replace"` — same semantics as `navigateTo`.
 */
export function navigateHome(mode: "push" | "replace" = "push") {
  navigateTo("/", mode);
}
