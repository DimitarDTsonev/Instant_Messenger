/**
 * @fileoverview Tests for InvitePage component
 * Covers: loading state, invite error state, invite details rendering,
 * guest join (success + error), login tab (success + error), register tab
 * (success + error), already-logged-in flow (success + error), channel meta
 * (member count, expiry, max_uses), and tab switching.
 */

import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InvitePage from "../../pages/InvitePage";
import { navigateHome } from "../../utils/navigation";

vi.mock("../../utils/navigation", () => ({
  navigateHome: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock AuthContext
// ---------------------------------------------------------------------------
vi.mock("../../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "../../context/AuthContext";

declare const global: typeof globalThis;

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const INVITE_CODE = "ABC123";

const mockInvite = {
  channel_name: "general",
  channel_description: "A test channel",
  is_private: false,
  member_count: 5,
  created_by_username: "alice",
  max_uses: null,
  uses_count: 0,
  expires_at: null,
};

const mockUser = { id: 1, username: "alice", email: "alice@demo.com", role: "user" };
const mockToken = "jwt-token-abc";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a minimal fetch mock for the initial GET /api/invite/:code request.
 * Subsequent fetch calls return a sensible 200 by default unless overridden.
 */
function fetchOk(invite = mockInvite) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ invite }),
  });
}

function fetchInviteError(message = "Invite not found") {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ error: message }),
  });
}

function fetchNetworkError() {
  return vi.fn().mockRejectedValue(new Error("Network error"));
}

/** Resolves a fake POST response (login / register / guest / join). */
function postOk(body = {}) {
  return { ok: true, json: () => Promise.resolve(body) };
}

function postErr(message = "Server error") {
  return { ok: false, json: () => Promise.resolve({ error: message }) };
}

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

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // Default: not logged in
  vi.mocked(useAuth).mockReturnValue(authMock());

  localStorage.clear();
  sessionStorage.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("InvitePage", () => {
  // --- loading state --------------------------------------------------------

  test("shows loading spinner while invite is being fetched", () => {
    // Never resolves → stays in loading state
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<InvitePage code={INVITE_CODE} />);
    expect(screen.getByText(/Loading invite/i)).toBeInTheDocument();
  });

  // --- error state ----------------------------------------------------------

  test("shows invite error message when API returns { error }", async () => {
    global.fetch = fetchInviteError("This invite has expired");
    render(<InvitePage code={INVITE_CODE} />);
    await waitFor(() => expect(screen.getByText(/This invite has expired/i)).toBeInTheDocument());
  });

  test("shows 'Back to home' button in error state", async () => {
    global.fetch = fetchInviteError("Bad invite");
    render(<InvitePage code={INVITE_CODE} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Back to home/i })).toBeInTheDocument());
  });

  test("shows error message when network request for invite fails", async () => {
    global.fetch = fetchNetworkError();
    render(<InvitePage code={INVITE_CODE} />);
    await waitFor(() => expect(screen.getByText(/Error loading invite/i)).toBeInTheDocument());
  });

  // --- invite details -------------------------------------------------------

  test("displays channel name after invite loads", async () => {
    global.fetch = fetchOk();
    render(<InvitePage code={INVITE_CODE} />);
    await waitFor(() => expect(screen.getByText(/general/i)).toBeInTheDocument());
  });

  test("displays channel description when present", async () => {
    global.fetch = fetchOk();
    render(<InvitePage code={INVITE_CODE} />);
    await waitFor(() => expect(screen.getByText(/A test channel/i)).toBeInTheDocument());
  });

  test("displays member count with correct singular/plural", async () => {
    global.fetch = fetchOk({ ...mockInvite, member_count: 1 });
    render(<InvitePage code={INVITE_CODE} />);
    await waitFor(() => expect(screen.getByText(/1 member\b/i)).toBeInTheDocument());
  });

  test("displays member count with plural when more than one member", async () => {
    global.fetch = fetchOk({ ...mockInvite, member_count: 5 });
    render(<InvitePage code={INVITE_CODE} />);
    await waitFor(() => expect(screen.getByText(/5 members/i)).toBeInTheDocument());
  });

  test("displays invited-by username", async () => {
    global.fetch = fetchOk();
    render(<InvitePage code={INVITE_CODE} />);
    await waitFor(() => expect(screen.getByText(/Invited by alice/i)).toBeInTheDocument());
  });

  test("displays expiry date when expires_at is set", async () => {
    const expiresAt = "2099-12-31T00:00:00.000Z";
    global.fetch = fetchOk({ ...mockInvite, expires_at: expiresAt });
    render(<InvitePage code={INVITE_CODE} />);
    await waitFor(() => expect(screen.getByText(/Expires:/i)).toBeInTheDocument());
  });

  test("does not display expiry line when expires_at is null", async () => {
    global.fetch = fetchOk({ ...mockInvite, expires_at: null });
    render(<InvitePage code={INVITE_CODE} />);
    await waitFor(() => screen.getByText(/Invited by alice/i));
    expect(screen.queryByText(/Expires:/i)).not.toBeInTheDocument();
  });

  test("displays uses count when max_uses is set", async () => {
    global.fetch = fetchOk({ ...mockInvite, max_uses: 10, uses_count: 3 });
    render(<InvitePage code={INVITE_CODE} />);
    await waitFor(() => expect(screen.getByText(/3\/10 uses/i)).toBeInTheDocument());
  });

  test("does not display uses count when max_uses is null", async () => {
    global.fetch = fetchOk({ ...mockInvite, max_uses: null });
    render(<InvitePage code={INVITE_CODE} />);
    await waitFor(() => screen.getByText(/Invited by alice/i));
    expect(screen.queryByText(/uses/i)).not.toBeInTheDocument();
  });

  test("shows lock icon for private channel", async () => {
    global.fetch = fetchOk({ ...mockInvite, is_private: true });
    render(<InvitePage code={INVITE_CODE} />);
    await waitFor(() => expect(screen.getByTitle("Private channel")).toBeInTheDocument());
  });

  // --- tabs (not logged in) ------------------------------------------------

  test("renders Guest, Login, and Register tabs when not logged in", async () => {
    global.fetch = fetchOk();
    render(<InvitePage code={INVITE_CODE} />);
    await waitFor(() => screen.getByText(/general/i));
    // Use exact tab button text to avoid ambiguity with content inside the active tab
    expect(screen.getByRole("button", { name: /^Guest$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Login$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Register$/ })).toBeInTheDocument();
  });

  test("Guest tab is active by default and shows 'Continue as guest' button", async () => {
    global.fetch = fetchOk();
    render(<InvitePage code={INVITE_CODE} />);
    await waitFor(() => screen.getByText(/general/i));
    expect(screen.getByRole("button", { name: /Continue as guest/i })).toBeInTheDocument();
  });

  test("clicking Login tab shows email and password fields", async () => {
    global.fetch = fetchOk();
    render(<InvitePage code={INVITE_CODE} />);
    await waitFor(() => screen.getByText(/general/i));

    fireEvent.click(screen.getByRole("button", { name: /^Login$/ }));
    // Labels in InvitePage have no htmlFor — match by placeholder text
    expect(screen.getByPlaceholderText(/you@example.com/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/••••••/)).toBeInTheDocument();
  });

  test("clicking Register tab shows username, email and password fields", async () => {
    global.fetch = fetchOk();
    render(<InvitePage code={INVITE_CODE} />);
    await waitFor(() => screen.getByText(/general/i));

    fireEvent.click(screen.getByRole("button", { name: /^Register$/ }));
    // Labels in InvitePage have no htmlFor — match by placeholder text
    expect(screen.getByPlaceholderText(/^username$/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/you@example.com/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/min\. 6 characters/i)).toBeInTheDocument();
  });

  // --- guest flow -----------------------------------------------------------

  test("guest join: calls POST /api/auth/guest then POST /api/invite/:code/join on success", async () => {
    const loginWithToken = vi.fn();
    vi.mocked(useAuth).mockReturnValue(authMock({ loginWithToken }));

    const fetchMock = vi.fn()
      // GET /api/invite/ABC123 — initial invite fetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ invite: mockInvite }) })
      // POST /api/auth/guest
      .mockResolvedValueOnce(postOk({ user: mockUser, token: mockToken }))
      // POST /api/invite/ABC123/join
      .mockResolvedValueOnce(postOk({ success: true }));

    global.fetch = fetchMock;
    render(<InvitePage code={INVITE_CODE} />);
    await waitFor(() => screen.getByRole("button", { name: /Continue as guest/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Continue as guest/i }));
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:4000/api/auth/guest",
        expect.objectContaining({ method: "POST" })
      );
      expect(fetchMock).toHaveBeenCalledWith(
        `http://localhost:4000/api/invite/${INVITE_CODE}/join`,
        expect.objectContaining({ method: "POST" })
      );
    });

    expect(loginWithToken).toHaveBeenCalledWith(mockUser, mockToken, true);
    expect(navigateHome).toHaveBeenCalledWith("replace");
  });

  test("guest join: shows error message when guest auth fails", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ invite: mockInvite }) })
      .mockResolvedValueOnce(postErr("Guest accounts disabled"));

    render(<InvitePage code={INVITE_CODE} />);
    await waitFor(() => screen.getByRole("button", { name: /Continue as guest/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Continue as guest/i }));
    });

    await waitFor(() => expect(screen.getByText(/Guest accounts disabled/i)).toBeInTheDocument());
  });

  test("guest join: shows error message when join call fails", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ invite: mockInvite }) })
      .mockResolvedValueOnce(postOk({ user: mockUser, token: mockToken }))
      .mockResolvedValueOnce(postErr("Already a member"));

    render(<InvitePage code={INVITE_CODE} />);
    await waitFor(() => screen.getByRole("button", { name: /Continue as guest/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Continue as guest/i }));
    });

    await waitFor(() => expect(screen.getByText(/Already a member/i)).toBeInTheDocument());
  });

  test("guest join: button shows ' Joining...' while in flight", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ invite: mockInvite }) })
      // guest auth hangs
      .mockReturnValueOnce(new Promise(() => {}));

    render(<InvitePage code={INVITE_CODE} />);
    await waitFor(() => screen.getByRole("button", { name: /Continue as guest/i }));

    fireEvent.click(screen.getByRole("button", { name: /Continue as guest/i }));
    await waitFor(() => expect(screen.getByText(/Joining\.\.\./i)).toBeInTheDocument());
  });

  // --- login flow -----------------------------------------------------------

  test("login: calls POST /api/auth/login then join and redirects on success", async () => {
    const loginWithToken = vi.fn();
    vi.mocked(useAuth).mockReturnValue(authMock({ loginWithToken }));

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ invite: mockInvite }) })
      .mockResolvedValueOnce(postOk({ user: mockUser, token: mockToken }))
      .mockResolvedValueOnce(postOk({ success: true }));

    global.fetch = fetchMock;
    render(<InvitePage code={INVITE_CODE} />);
    await waitFor(() => screen.getByText(/general/i));

    fireEvent.click(screen.getByRole("button", { name: /^Login$/ }));

    await userEvent.type(screen.getByPlaceholderText(/you@example.com/i), "alice@test.com");
    await userEvent.type(screen.getByPlaceholderText(/••••••/), "secret123");

    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: /Sign in and join/i }).closest("form"));
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:4000/api/auth/login",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("alice@test.com"),
        })
      );
    });

    expect(loginWithToken).toHaveBeenCalledWith(mockUser, mockToken, false);
    expect(navigateHome).toHaveBeenCalledWith("replace");
  });

  test("login: shows error message when credentials are wrong", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ invite: mockInvite }) })
      .mockResolvedValueOnce(postErr("Invalid credentials"));

    render(<InvitePage code={INVITE_CODE} />);
    await waitFor(() => screen.getByText(/general/i));
    fireEvent.click(screen.getByRole("button", { name: /^Login$/ }));

    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: /Sign in and join/i }).closest("form"));
    });

    await waitFor(() => expect(screen.getByText(/Invalid credentials/i)).toBeInTheDocument());
  });

  // --- register flow --------------------------------------------------------

  test("register: calls POST /api/auth/register then join and redirects on success", async () => {
    const loginWithToken = vi.fn();
    vi.mocked(useAuth).mockReturnValue(authMock({ loginWithToken }));

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ invite: mockInvite }) })
      .mockResolvedValueOnce(postOk({ user: mockUser, token: mockToken }))
      .mockResolvedValueOnce(postOk({ success: true }));

    global.fetch = fetchMock;
    render(<InvitePage code={INVITE_CODE} />);
    await waitFor(() => screen.getByText(/general/i));

    fireEvent.click(screen.getByRole("button", { name: /^Register$/ }));

    await userEvent.type(screen.getByPlaceholderText(/^username$/i), "newuser");
    await userEvent.type(screen.getByPlaceholderText(/you@example.com/i), "new@test.com");
    await userEvent.type(screen.getByPlaceholderText(/min\. 6 characters/i), "Newpass1!");

    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: /Register and join/i }).closest("form"));
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:4000/api/auth/register",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("newuser"),
        })
      );
    });

    expect(loginWithToken).toHaveBeenCalledWith(mockUser, mockToken, false);
    expect(navigateHome).toHaveBeenCalledWith("replace");
  });

  test("register: shows error message when registration fails", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ invite: mockInvite }) })
      .mockResolvedValueOnce(postErr("Username already taken"));

    render(<InvitePage code={INVITE_CODE} />);
    await waitFor(() => screen.getByText(/general/i));
    fireEvent.click(screen.getByRole("button", { name: /^Register$/ }));

    await userEvent.type(screen.getByPlaceholderText(/^username$/i), "newuser");
    await userEvent.type(screen.getByPlaceholderText(/you@example.com/i), "new@test.com");
    await userEvent.type(screen.getByPlaceholderText(/min\. 6 characters/i), "Newpass1!");

    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: /Register and join/i }).closest("form"));
    });

    await waitFor(() => expect(screen.getByText(/Username already taken/i)).toBeInTheDocument());
  });

  // --- already logged in ----------------------------------------------------

  test("shows 'Signed in as {username}' and 'Join channel' button when user is logged in", async () => {
    vi.mocked(useAuth).mockReturnValue(authMock({ user: mockUser }));

    global.fetch = fetchOk();
    render(<InvitePage code={INVITE_CODE} />);
    await waitFor(() => screen.getByText(/general/i));

    expect(screen.getByText(/Signed in as/i)).toBeInTheDocument();
    // "alice" appears twice (channel meta + signed-in label) — confirm at least one is present
    expect(screen.getAllByText(/alice/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: /Join channel/i })).toBeInTheDocument();
  });

  test("does not show tabs when user is already logged in", async () => {
    vi.mocked(useAuth).mockReturnValue(authMock({ user: mockUser }));

    global.fetch = fetchOk();
    render(<InvitePage code={INVITE_CODE} />);
    await waitFor(() => screen.getByText(/general/i));

    // Tab buttons should not be present for logged-in users
    expect(screen.queryByRole("button", { name: /^Guest$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Login$/ })).not.toBeInTheDocument();
  });

  test("already logged in: calls POST /api/invite/:code/join with stored token", async () => {
    vi.mocked(useAuth).mockReturnValue(authMock({ user: mockUser }));
    localStorage.setItem("im_token", "stored-token");

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ invite: mockInvite }) })
      .mockResolvedValueOnce(postOk({ success: true }));

    global.fetch = fetchMock;
    render(<InvitePage code={INVITE_CODE} />);
    await waitFor(() => screen.getByRole("button", { name: /Join channel/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Join channel/i }));
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `http://localhost:4000/api/invite/${INVITE_CODE}/join`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ Authorization: "Bearer stored-token" }),
        })
      );
    });
  });

  test("already logged in: shows error when join fails", async () => {
    vi.mocked(useAuth).mockReturnValue(authMock({ user: mockUser }));
    localStorage.setItem("im_token", "stored-token");

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ invite: mockInvite }) })
      .mockResolvedValueOnce(postErr("Cannot join: banned"));

    render(<InvitePage code={INVITE_CODE} />);
    await waitFor(() => screen.getByRole("button", { name: /Join channel/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Join channel/i }));
    });

    await waitFor(() => expect(screen.getByText(/Cannot join: banned/i)).toBeInTheDocument());
  });

  test("already logged in: uses sessionStorage token when localStorage token is absent", async () => {
    vi.mocked(useAuth).mockReturnValue(authMock({ user: mockUser }));
    sessionStorage.setItem("im_token", "session-token");

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ invite: mockInvite }) })
      .mockResolvedValueOnce(postOk({ success: true }));

    global.fetch = fetchMock;
    render(<InvitePage code={INVITE_CODE} />);
    await waitFor(() => screen.getByRole("button", { name: /Join channel/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Join channel/i }));
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `http://localhost:4000/api/invite/${INVITE_CODE}/join`,
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: "Bearer session-token" }),
        })
      );
    });
  });

  // --- error display clears on tab switch -----------------------------------

  test("switching tabs clears the displayed error message", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ invite: mockInvite }) })
      .mockResolvedValueOnce(postErr("Guest accounts disabled"));

    render(<InvitePage code={INVITE_CODE} />);
    await waitFor(() => screen.getByRole("button", { name: /Continue as guest/i }));

    // Trigger an error
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Continue as guest/i }));
    });
    await waitFor(() => screen.getByText(/Guest accounts disabled/i));

    // Switch tab → error should be cleared
    fireEvent.click(screen.getByRole("button", { name: /^Login$/ }));
    expect(screen.queryByText(/Guest accounts disabled/i)).not.toBeInTheDocument();
  });
});
