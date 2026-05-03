/**
 * @fileoverview Tests for AuthContext (AuthProvider + useAuth)
 * Covers: initial token validation, login, register, logout, loginWithToken (guest/regular), authFetch
 */

import { render, screen, waitFor, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "../../context/AuthContext";

// Helper component that exposes context values via data-testid elements
function ContextDisplay() {
  const { user, token, loading, login, register, logout, loginWithToken, authFetch } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user ? user.username : "null"}</span>
      <span data-testid="token">{token ?? "null"}</span>
      <button onClick={() => login("a@b.com", "pass").catch(() => {})} data-testid="login-btn">Login</button>
      <button onClick={() => register("alice", "a@b.com", "pass").catch(() => {})} data-testid="register-btn">Register</button>
      <button onClick={logout} data-testid="logout-btn">Logout</button>
      <button onClick={() => loginWithToken({ id: 9, username: "guest" }, "gtoken", true)} data-testid="guest-btn">Guest</button>
      <button onClick={() => loginWithToken({ id: 10, username: "inv" }, "itoken", false)} data-testid="invite-btn">Invite</button>
      <button
        onClick={async () => {
          try { await authFetch("http://localhost:4000/api/auth/me"); }
          catch (e) { document.getElementById("fetch-err").textContent = e.message; }
        }}
        data-testid="authfetch-btn"
      >AuthFetch</button>
      <span id="fetch-err"></span>
    </div>
  );
}

function Wrapper({ children }) {
  return <AuthProvider>{children}</AuthProvider>;
}

// A mock that stubs /me to succeed for any token (used in loginWithToken tests)
function mockMeSuccess(username = "mockuser") {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ user: { id: 99, username } }),
  });
}

describe("AuthContext", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    global.fetch = undefined;
  });

  test("loading becomes false when there is no stored token", async () => {
    render(<ContextDisplay />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("user").textContent).toBe("null");
    expect(screen.getByTestId("token").textContent).toBe("null");
  });

  test("validates stored token on mount and sets user on success", async () => {
    localStorage.setItem("im_token", "valid-token");
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ user: { id: 1, username: "alice" } }),
    });

    render(<ContextDisplay />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("alice"));
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
  });

  test("clears stored token when /me validation fails", async () => {
    localStorage.setItem("im_token", "expired-token");
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    render(<ContextDisplay />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(localStorage.getItem("im_token")).toBeNull();
    expect(screen.getByTestId("token").textContent).toBe("null");
  });

  test("login() sets user and token, stores in localStorage", async () => {
    // No stored token → no initial /me call
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ user: { id: 2, username: "bob" }, token: "tok123" }),
    });

    render(<ContextDisplay />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    await act(async () => { screen.getByTestId("login-btn").click(); });

    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("bob"));
    expect(screen.getByTestId("token").textContent).toBe("tok123");
    expect(localStorage.getItem("im_token")).toBe("tok123");
  });

  test("login() propagates error when server returns non-2xx", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "Invalid credentials" }),
    });

    let caught = null;
    function LoginThrower() {
      const { login } = useAuth();
      return (
        <button
          onClick={() => login("x@x.com", "wrong").catch((e) => { caught = e; })}
          data-testid="throw-btn"
        >Try</button>
      );
    }

    render(<LoginThrower />, { wrapper: Wrapper });
    await act(async () => { screen.getByTestId("throw-btn").click(); });
    await waitFor(() => expect(caught?.message).toBe("Invalid credentials"));
  });

  test("register() sets user and stores token in localStorage", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ user: { id: 3, username: "carol" }, token: "reg-tok" }),
    });

    render(<ContextDisplay />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    await act(async () => { screen.getByTestId("register-btn").click(); });

    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("carol"));
    expect(localStorage.getItem("im_token")).toBe("reg-tok");
  });

  test("logout() clears user, token, and both storages", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ user: { id: 2, username: "bob" }, token: "tok123" }),
    });

    render(<ContextDisplay />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    await act(async () => { screen.getByTestId("login-btn").click(); });
    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("bob"));

    await act(async () => { screen.getByTestId("logout-btn").click(); });

    expect(screen.getByTestId("user").textContent).toBe("null");
    expect(screen.getByTestId("token").textContent).toBe("null");
    expect(localStorage.getItem("im_token")).toBeNull();
    expect(sessionStorage.getItem("im_token")).toBeNull();
  });

  test("loginWithToken(guest=true) stores token in sessionStorage only", async () => {
    // loginWithToken will trigger useEffect([token]) → need to mock the /me call
    global.fetch = mockMeSuccess("guest");

    render(<ContextDisplay />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    await act(async () => { screen.getByTestId("guest-btn").click(); });

    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("guest"));
    expect(sessionStorage.getItem("im_token")).toBe("gtoken");
    expect(localStorage.getItem("im_token")).toBeNull();
  });

  test("loginWithToken(guest=false) stores token in localStorage", async () => {
    global.fetch = mockMeSuccess("inv");

    render(<ContextDisplay />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    await act(async () => { screen.getByTestId("invite-btn").click(); });

    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("inv"));
    expect(localStorage.getItem("im_token")).toBe("itoken");
    expect(sessionStorage.getItem("im_token")).toBeNull();
  });

  test("authFetch() sends Authorization header with current token", async () => {
    let capturedHeaders;
    // First call: login response; subsequent calls: authFetch
    global.fetch = vi.fn().mockImplementation((url, opts) => {
      capturedHeaders = opts?.headers;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ user: { id: 2, username: "bob" }, token: "fetch-tok" }),
      });
    });

    render(<ContextDisplay />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    await act(async () => { screen.getByTestId("login-btn").click(); });
    await waitFor(() => expect(screen.getByTestId("token").textContent).toBe("fetch-tok"));

    // Reset capture, then call authFetch
    capturedHeaders = null;
    await act(async () => { screen.getByTestId("authfetch-btn").click(); });

    await waitFor(() => expect(capturedHeaders?.Authorization).toMatch(/Bearer fetch-tok/));
  });

  test("authFetch() throws when server responds with non-2xx", async () => {
    // No stored token → loading immediately false
    // authFetch will use token=null (Bearer null) which is fine for this test
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "Forbidden" }),
    });

    render(<ContextDisplay />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));

    await act(async () => { screen.getByTestId("authfetch-btn").click(); });

    await waitFor(() =>
      expect(document.getElementById("fetch-err").textContent).toBe("Forbidden")
    );
  });
});
