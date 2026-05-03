/**
 * @fileoverview Tests for App / AppInner routing
 * Covers: invite path, loading state, unauthenticated → LoginPage, authenticated → ChatPage
 */

import { render, screen, waitFor } from "@testing-library/react";
import App from "../App";

// Mock heavy pages and contexts so the test only exercises App routing logic
vi.mock("../pages/LoginPage",  () => ({ default: () => <div>LoginPage</div> }));
vi.mock("../pages/ChatPage",   () => ({ default: () => <div>ChatPage</div> }));
vi.mock("../pages/InvitePage", () => ({ default: ({ code }) => <div>InvitePage:{code}</div> }));
vi.mock("../context/SocketContext", () => ({
  SocketProvider: ({ children }) => <div>{children}</div>,
}));

// Control AuthProvider behaviour by mocking useAuth inside AuthProvider
vi.mock("../context/AuthContext", async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    // Replace the hook only; keep AuthProvider as a thin pass-through
    AuthProvider: ({ children }) => <>{children}</>,
    useAuth: vi.fn(),
  };
});

import { useAuth } from "../context/AuthContext";

describe("App routing", () => {
  test("shows loading spinner while auth is being validated", () => {
    useAuth.mockReturnValue({ user: null, loading: true });
    render(<App />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  test("renders LoginPage when not authenticated", () => {
    useAuth.mockReturnValue({ user: null, loading: false });
    render(<App />);
    expect(screen.getByText("LoginPage")).toBeInTheDocument();
  });

  test("renders ChatPage when authenticated", () => {
    useAuth.mockReturnValue({ user: { id: 1, username: "alice" }, loading: false });
    render(<App />);
    expect(screen.getByText("ChatPage")).toBeInTheDocument();
  });

  test("renders InvitePage with code when path is /invite/abc123", () => {
    // Override window.location.pathname for this test
    Object.defineProperty(window, "location", {
      value: { ...window.location, pathname: "/invite/abc123" },
      writable: true,
    });

    useAuth.mockReturnValue({ user: null, loading: false });
    render(<App />);
    expect(screen.getByText("InvitePage:abc123")).toBeInTheDocument();

    // Reset
    Object.defineProperty(window, "location", {
      value: { ...window.location, pathname: "/" },
      writable: true,
    });
  });
});
