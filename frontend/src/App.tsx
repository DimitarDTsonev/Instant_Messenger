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

const loadingScreen = (
  <div style={{
    height: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
    background: "var(--col-bg-base)", color: "var(--col-text-muted)", fontSize: "18px", gap: "12px",
  }}>
    Loading...
  </div>
);

function AppInner() {
  const { user, loading } = useAuth();
  const [path, setPath] = useState(getAppPath);

  useEffect(() => {
    const handlePathChange = () => setPath(getAppPath());
    window.addEventListener("popstate", handlePathChange);
    return () => window.removeEventListener("popstate", handlePathChange);
  }, []);

  if (path.startsWith("/invite/")) {
    const code = path.replace("/invite/", "").split("/")[0];
    return <InvitePage code={code} />;
  }

  if (path === "/reset-password") return <ResetPasswordPage />;

  if (loading) return loadingScreen;

  if (!user) return <LoginPage />;

  if (path === "/admin") return <AdminPage />;

  return (
    <ErrorBoundary>
      <SocketProvider>
        <ChatPage />
      </SocketProvider>
    </ErrorBoundary>
  );
}

export default function App() {
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
