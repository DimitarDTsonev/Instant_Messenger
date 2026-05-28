/**
 * App routing tests — verifies that App renders the correct page component
 * based on the current URL path and authentication state.
 *
 * Strategy: all page components and contexts are mocked so the tests only
 * exercise the routing/conditional-render logic in App itself.
 */
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import App from "../App";

// Mock heavy pages and contexts so the test only exercises App routing logic
vi.mock("../pages/LoginPage",  () => ({ default: () => <div>LoginPage</div> }));
vi.mock("../pages/ChatPage",   () => ({ default: () => <div>ChatPage</div> }));
vi.mock("../pages/InvitePage", () => ({ default: ({ code }) => <div>InvitePage:{code}</div> }));
vi.mock("../pages/AdminPage",  () => ({ default: () => <div>AdminPage</div> }));
vi.mock("../pages/ResetPasswordPage", () => ({ default: () => <div>ResetPasswordPage</div> }));
vi.mock("../context/SocketContext", () => ({
  SocketProvider: ({ children }) => <div>{children}</div>,
}));

// Control AuthProvider behaviour by mocking useAuth inside AuthProvider
vi.mock("../context/AuthContext", async (importOriginal) => {
  const mod = await importOriginal() as Record<string, unknown>;
  return {
    ...mod,
    // Replace the hook only; keep AuthProvider as a thin pass-through
    AuthProvider: ({ children }) => <>{children}</>,
    useAuth: vi.fn(),
  };
});

import { useAuth } from "../context/AuthContext";

function authMock(overrides: Record<string, unknown> = {}) {
  return {
    user: null,
    token: null,
    loading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    loginWithToken: vi.fn(),
    authFetch: vi.fn(),
    ...overrides,
  } as any;
}

describe("App routing", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/");
  });

  test("shows loading spinner while auth is being validated", () => {
    vi.mocked(useAuth).mockReturnValue(authMock({ loading: true }));
    render(<App />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  test("renders LoginPage when not authenticated", () => {
    vi.mocked(useAuth).mockReturnValue(authMock());
    render(<App />);
    expect(screen.getByText("LoginPage")).toBeInTheDocument();
  });

  test("renders ChatPage when authenticated", () => {
    vi.mocked(useAuth).mockReturnValue(authMock({ user: { id: 1, username: "alice", email: "alice@demo.com", role: "user" } }));
    render(<App />);
    expect(screen.getByText("ChatPage")).toBeInTheDocument();
  });

  test("renders InvitePage with code when path is /invite/abc123", () => {
    window.history.pushState({}, "", "/invite/abc123");

    vi.mocked(useAuth).mockReturnValue(authMock());
    render(<App />);
    expect(screen.getByText("InvitePage:abc123")).toBeInTheDocument();
  });

  test("renders ResetPasswordPage when path is /reset-password", () => {
    window.history.pushState({}, "", "/reset-password");

    vi.mocked(useAuth).mockReturnValue(authMock());
    render(<App />);
    expect(screen.getByText("ResetPasswordPage")).toBeInTheDocument();
  });

  test("renders AdminPage when path is /admin and user is authenticated", () => {
    window.history.pushState({}, "", "/admin");

    vi.mocked(useAuth).mockReturnValue(authMock({ user: { id: 1, username: "alice", email: "alice@demo.com", role: "user" } }));
    render(<App />);
    expect(screen.getByText("AdminPage")).toBeInTheDocument();
  });
});
