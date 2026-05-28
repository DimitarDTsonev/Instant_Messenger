/**
 * Root application component — wires context providers and handles top-level routing.
 *
 * Provider tree (outermost first):
 *   ThemeProvider  — persists dark/light preference in localStorage.
 *   ErrorBoundary  — catches unhandled render errors at the root level.
 *   AuthProvider   — manages JWT session and authentication state.
 *   AppInner       — renders the correct page based on auth state and URL path.
 *   SocketProvider — created inside AppInner only when the user is authenticated.
 *
 * Routing strategy:
 *   Uses the History API + `popstate` events (no router library). `getAppPath()`
 *   strips the Vite BASE_URL prefix so sub-path deployments work correctly.
 *
 * Route table:
 *   /invite/:code     → InvitePage       (public — unauthenticated access allowed)
 *   /reset-password   → ResetPasswordPage (public)
 *   (loading)         → Loading screen
 *   (unauthenticated) → LoginPage
 *   /admin            → AdminPage        (authenticated; admin role enforced server-side)
 *   *                 → ChatPage         (authenticated default)
 *
 * Server health ping:
 *   On mount, `App` fires a silent `GET /api/health` to wake the server if it
 *   went to sleep on a free hosting tier (e.g. Render).
 */

import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import { ThemeProvider } from "./context/ThemeContext";
import ErrorBoundary       from "./components/ErrorBoundary";
import LoginPage          from "./pages/LoginPage";
import ChatPage            from "./pages/ChatPage";
import InvitePage          from "./pages/InvitePage";
import AdminPage           from "./pages/AdminPage";
import ResetPasswordPage   from "./pages/ResetPasswordPage";
import { API_BASE } from "./config";
import { getAppPath } from "./utils/navigation";

/** Full-page spinner displayed while the auth token is being validated on mount. */
const loadingScreen = (
  <div style={{
    height: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
    background: "var(--col-bg-base)", color: "var(--col-text-muted)", fontSize: "18px", gap: "12px",
  }}>
    Loading...
  </div>
);

/**
 * Inner app shell — reads auth state and the current URL path, then renders
 * the matching page component. Listens to `popstate` events so history-API
 * navigations trigger a re-render.
 */
function AppInner() {
  const { user, loading } = useAuth();
  /** Mirrors the current pathname minus the BASE_URL prefix. */
  const [path, setPath] = useState(getAppPath);

  // Re-derive the path on every history navigation (push/replace/back/forward)
  useEffect(() => {
    const handlePathChange = () => setPath(getAppPath());
    window.addEventListener("popstate", handlePathChange);
    return () => window.removeEventListener("popstate", handlePathChange);
  }, []);

  // Public routes — accessible without authentication
  if (path.startsWith("/invite/")) {
    const code = path.replace("/invite/", "").split("/")[0];
    return <InvitePage code={code} />;
  }
  if (path === "/reset-password") return <ResetPasswordPage />;

  // Show a spinner while the JWT validation request is in-flight
  if (loading) return loadingScreen;

  // Unauthenticated catch-all
  if (!user) return <LoginPage />;

  // Authenticated routes
  if (path === "/admin") return <AdminPage />;

  // Default: the main chat page wrapped in the socket provider
  return (
    <ErrorBoundary>
      <SocketProvider>
        <ChatPage />
      </SocketProvider>
    </ErrorBoundary>
  );
}

/**
 * Root component — wraps the entire tree with global providers and fires a
 * server health ping on mount to warm up the backend.
 */
export default function App() {
  // Silent health ping — wakes a sleeping free-tier server without blocking the UI
  useEffect(() => {
    fetch(`${API_BASE.replace("/api", "")}/api/health`).catch(() => {});
  }, []);

  return (
    <ThemeProvider>
      <ErrorBoundary>
        <AuthProvider>
          <AppInner />
        </AuthProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
