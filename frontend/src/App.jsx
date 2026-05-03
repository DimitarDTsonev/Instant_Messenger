// ============================================================
//  App.jsx — Application root
//  Manages routing: InvitePage | LoginPage | ChatPage
// ============================================================

import { AuthProvider, useAuth } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import LoginPage  from "./pages/LoginPage";
import ChatPage   from "./pages/ChatPage";
import InvitePage from "./pages/InvitePage";

/**
 * AppInner - Inner routing component that reads auth state and renders
 * the appropriate top-level page.
 *
 * Routing priority:
 * 1. If the current URL path starts with "/invite/", render {@link InvitePage}
 *    regardless of auth state so unauthenticated users can accept invites.
 * 2. While the auth token is being validated, render a full-screen loading spinner.
 * 3. If no authenticated user, render {@link LoginPage}.
 * 4. Otherwise wrap {@link ChatPage} in {@link SocketProvider} so the socket
 *    connection is only established for authenticated sessions.
 *
 * This component must be rendered inside an {@link AuthProvider}.
 *
 * @component
 * @returns {JSX.Element}
 */
function AppInner() {
  const { user, loading } = useAuth();

  // Handle invite paths before anything else — must work for unauthenticated users
  const path = window.location.pathname;
  if (path.startsWith("/invite/")) {
    const code = path.replace("/invite/", "").split("/")[0];
    return <InvitePage code={code} />;
  }

  if (loading) {
    return (
      <div style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0f0f0f",
        color: "#5c6068",
        fontSize: "18px",
        gap: "12px",
      }}>
        <span>⏳</span> Loading...
      </div>
    );
  }

  if (!user) return <LoginPage />;

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
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}