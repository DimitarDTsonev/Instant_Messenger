// ============================================================
//  App.jsx — Application root
//  Manages routing: InvitePage | AdminPage | LoginPage | ChatPage
// ============================================================

import { useEffect } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import LoginPage          from "./pages/LoginPage";
import ChatPage            from "./pages/ChatPage";
import InvitePage          from "./pages/InvitePage";
import AdminPage           from "./pages/AdminPage";
import ResetPasswordPage   from "./pages/ResetPasswordPage";
import { API_BASE } from "./config";

const loadingScreen = (
  <div style={{
    height: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
    background: "#0f0f0f", color: "#5c6068", fontSize: "18px", gap: "12px",
  }}>
    <span>⏳</span> Loading...
  </div>
);

/**
 * AppInner - Inner routing component that reads auth state and renders
 * the appropriate top-level page.
 *
 * Routing priority:
 * 1. If the current URL path starts with "/invite/", render {@link InvitePage}
 *    regardless of auth state so unauthenticated users can accept invites.
 * 2. While the auth token is being validated, render a full-screen loading spinner.
 * 3. If no authenticated user, render {@link LoginPage}.
 * 4. If the path is "/admin" and the user is an admin, render {@link AdminPage}.
 * 5. Otherwise wrap {@link ChatPage} in {@link SocketProvider} so the socket
 *    connection is only established for authenticated sessions.
 *
 * This component must be rendered inside an {@link AuthProvider}.
 *
 * @component
 * @returns {JSX.Element}
 */
function AppInner() {
  const { user, loading } = useAuth();

  const path = window.location.pathname;

  // Invite paths work without auth
  if (path.startsWith("/invite/")) {
    const code = path.replace("/invite/", "").split("/")[0];
    return <InvitePage code={code} />;
  }

  // Password reset page works without auth
  if (path === "/reset-password") return <ResetPasswordPage />;

  if (loading) return loadingScreen;

  if (!user) return <LoginPage />;

  // Admin dashboard — admins navigate here; non-admins get redirected by AdminPage
  if (path === "/admin") return <AdminPage />;

  return (
    <SocketProvider>
      <ChatPage />
    </SocketProvider>
  );
}

/**
 * App - Root component of the Instant Messenger application.
 *
 * Wraps the entire component tree in {@link AuthProvider} so that authentication
 * state is available everywhere.  {@link AppInner} handles the actual routing
 * logic once the provider is in place.
 *
 * @component
 * @returns {JSX.Element}
 */
export default function App() {
  useEffect(() => {
    fetch(`${API_BASE.replace("/api", "")}/api/health`).catch(() => {});
  }, []);

  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
