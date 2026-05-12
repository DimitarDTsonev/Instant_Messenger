import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { vi } from "vitest";
import { useAuth } from "../../context/AuthContext";

declare const global: typeof globalThis;
import AdminPage from "../../pages/AdminPage";
import { navigateHome } from "../../utils/navigation";

vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../../utils/navigation", () => ({
  navigateHome: vi.fn(),
}));

const ADMIN_USER = { id: 1, username: "alice", role: "admin", email: "alice@example.com" };
const TOKEN = "admin-token";

const USERS = [
  { id: 1, username: "alice",  email: "alice@example.com",  role: "admin",  is_banned: 0, ban_reason: null,             avatar: "AL", created_at: "2024-01-01" },
  { id: 2, username: "bob",    email: "bob@example.com",    role: "member", is_banned: 0, ban_reason: null,             avatar: "AL", created_at: "2024-01-02" },
  { id: 3, username: "charlie",email: "charlie@example.com",role: "member", is_banned: 1, ban_reason: "rule violation", avatar: "AL", created_at: "2024-01-03" },
];

const LOGS = [
  { id: 1, event: "user_banned",  username: "charlie", ip: "1.2.3.4", detail: "banned by admin alice", created_at: "2024-06-01T10:00:00" },
  { id: 2, event: "LOGIN_FAIL",   username: "bob",     ip: "5.6.7.8", detail: "attempt 1",             created_at: "2024-06-01T09:00:00" },
];

function jsonResponse(body: Record<string, unknown>, ok = true): Response {
  return new Response(JSON.stringify(body), {
    status: ok ? 200 : 400,
    statusText: ok ? "OK" : "Bad Request",
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetch(usersRes = USERS, logsRes = LOGS) {
  global.fetch = vi.fn((url: RequestInfo | URL) => {
    const href = String(url);
    if (href.includes("/admin/users")) return Promise.resolve(jsonResponse({ users: usersRes }));
    if (href.includes("/admin/security-logs")) return Promise.resolve(jsonResponse({ logs: logsRes }));
    if (href.includes("/admin/ban/") || href.includes("/admin/unban/")) return Promise.resolve(jsonResponse({ success: true }));
    return Promise.resolve(jsonResponse({ error: "Unknown" }, false));
  });
}

beforeEach(() => {
  (vi.mocked(useAuth) as any).mockReturnValue({ user: ADMIN_USER, token: TOKEN });
  mockFetch();
});

afterEach(() => {
  vi.restoreAllMocks();
});
//  1. Access control
describe("access control", () => {
  test("shows 'Admin access required' for non-admins", () => {
    (vi.mocked(useAuth) as any).mockReturnValue({ user: { id: 2, username: "bob", role: "member" }, token: TOKEN });
    render(<AdminPage />);
    expect(screen.getAllByText(/admin access required/i).length).toBeGreaterThan(0);
  });

  test("renders dashboard for admins", async () => {
    render(<AdminPage />);
    await waitFor(() => expect(screen.getByText("Admin Dashboard")).toBeInTheDocument());
  });
});
//  2. Users tab
describe("users tab", () => {
  test("renders user table after loading", async () => {
    render(<AdminPage />);
    await waitFor(() => expect(screen.getByTestId("users-table")).toBeInTheDocument());
  });

  test("shows all users in the table", async () => {
    render(<AdminPage />);
    await waitFor(() => {
      expect(screen.getByText("alice")).toBeInTheDocument();
      expect(screen.getByText("bob")).toBeInTheDocument();
      expect(screen.getByText("charlie")).toBeInTheDocument();
    });
  });

  test("shows 'Active' badge for non-banned users", async () => {
    render(<AdminPage />);
    await waitFor(() => {
      const activeBadges = screen.getAllByText("Active");
      expect(activeBadges.length).toBeGreaterThan(0);
    });
  });

  test("shows 'Banned' badge for banned users", async () => {
    render(<AdminPage />);
    await waitFor(() => expect(screen.getByText("Banned")).toBeInTheDocument());
  });

  test("filters users by username", async () => {
    render(<AdminPage />);
    await waitFor(() => screen.getByTestId("user-filter"));
    fireEvent.change(screen.getByTestId("user-filter"), { target: { value: "bob" } });
    expect(screen.getByText("bob")).toBeInTheDocument();
    expect(screen.queryByText("charlie")).not.toBeInTheDocument();
  });

  test("shows ban button for non-banned non-admin other users", async () => {
    render(<AdminPage />);
    await waitFor(() => expect(screen.getByTestId("ban-2")).toBeInTheDocument());
  });

  test("shows unban button for banned users", async () => {
    render(<AdminPage />);
    await waitFor(() => expect(screen.getByTestId("unban-3")).toBeInTheDocument());
  });

  test("does not show ban button for self", async () => {
    render(<AdminPage />);
    await waitFor(() => {
      expect(screen.queryByTestId("ban-1")).not.toBeInTheDocument();
    });
  });
});
//  3. Ban modal
describe("ban confirmation modal", () => {
  test("opens ban modal when ban button clicked", async () => {
    render(<AdminPage />);
    await waitFor(() => screen.getByTestId("ban-2"));
    fireEvent.click(screen.getByTestId("ban-2"));
    expect(screen.getByTestId("ban-modal")).toBeInTheDocument();
  });

  test("modal shows the target username", async () => {
    render(<AdminPage />);
    await waitFor(() => screen.getByTestId("ban-2"));
    fireEvent.click(screen.getByTestId("ban-2"));
    expect(screen.getByText(/ban bob/i)).toBeInTheDocument();
  });

  test("cancel button closes the modal", async () => {
    render(<AdminPage />);
    await waitFor(() => screen.getByTestId("ban-2"));
    fireEvent.click(screen.getByTestId("ban-2"));
    fireEvent.click(screen.getByTestId("ban-cancel"));
    expect(screen.queryByTestId("ban-modal")).not.toBeInTheDocument();
  });

  test("clicking overlay closes the modal", async () => {
    render(<AdminPage />);
    await waitFor(() => screen.getByTestId("ban-2"));
    fireEvent.click(screen.getByTestId("ban-2"));
    fireEvent.click(screen.getByTestId("ban-modal-overlay"));
    expect(screen.queryByTestId("ban-modal")).not.toBeInTheDocument();
  });

  test("confirming ban calls the API and refreshes users", async () => {
    render(<AdminPage />);
    await waitFor(() => screen.getByTestId("ban-2"));
    fireEvent.click(screen.getByTestId("ban-2"));
    fireEvent.change(screen.getByTestId("ban-reason-input"), { target: { value: "Spamming" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("ban-confirm"));
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/admin/ban/2"),
      expect.objectContaining({ method: "POST" })
    );
    await waitFor(() => expect(screen.queryByTestId("ban-modal")).not.toBeInTheDocument());
  });
});
//  4. Unban
describe("unban action", () => {
  test("clicking unban calls the API and refreshes users", async () => {
    render(<AdminPage />);
    await waitFor(() => screen.getByTestId("unban-3"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("unban-3"));
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/admin/unban/3"),
      expect.objectContaining({ method: "POST" })
    );
  });
});
//  5. Security logs tab
describe("security logs tab", () => {
  test("switching to logs tab shows the logs table", async () => {
    render(<AdminPage />);
    await waitFor(() => screen.getByTestId("tab-logs"));
    await act(async () => { fireEvent.click(screen.getByTestId("tab-logs")); });
    await waitFor(() => expect(screen.getByTestId("logs-table")).toBeInTheDocument());
  });

  test("logs table shows event types", async () => {
    render(<AdminPage />);
    await waitFor(() => screen.getByTestId("tab-logs"));
    await act(async () => { fireEvent.click(screen.getByTestId("tab-logs")); });
    await waitFor(() => {
      expect(screen.getByText("user_banned")).toBeInTheDocument();
      expect(screen.getByText("LOGIN_FAIL")).toBeInTheDocument();
    });
  });

  test("filters logs by keyword", async () => {
    render(<AdminPage />);
    await waitFor(() => screen.getByTestId("tab-logs"));
    await act(async () => { fireEvent.click(screen.getByTestId("tab-logs")); });
    await waitFor(() => screen.getByTestId("log-filter"));
    fireEvent.change(screen.getByTestId("log-filter"), { target: { value: "banned" } });
    expect(screen.queryByText("LOGIN_FAIL")).not.toBeInTheDocument();
  });
});
//  6. Error handling
describe("error handling", () => {
  test("shows error when users fetch fails", async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ error: "Server error" }, false)));
    render(<AdminPage />);
    await waitFor(() => expect(screen.getByTestId("admin-error")).toBeInTheDocument());
  });
});
//  7. Missing branch coverage
describe("additional branch coverage", () => {
  test("shows actionError when unban fails (line 219)", async () => {
    global.fetch = vi.fn((url: RequestInfo | URL) => {
      const href = String(url);
      if (href.includes("/admin/users")) return Promise.resolve(jsonResponse({ users: USERS }));
      if (href.includes("/admin/unban/")) return Promise.resolve(jsonResponse({ error: "Cannot unban system user" }, false));
      return Promise.resolve(jsonResponse({ error: "Unknown" }, false));
    });

    render(<AdminPage />);
    await waitFor(() => screen.getByTestId("unban-3"));
    await act(async () => { fireEvent.click(screen.getByTestId("unban-3")); });

    await waitFor(() =>
      expect(screen.getByTestId("action-error")).toBeInTheDocument()
    );
  });

  test("Go back button calls window.history.back() for non-admins (line 228)", () => {
    (vi.mocked(useAuth) as any).mockReturnValue({ user: { id: 2, username: "bob", role: "member" }, token: TOKEN });
    const backSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});

    render(<AdminPage />);
    fireEvent.click(screen.getByRole("button", { name: /go back/i }));

    expect(backSpy).toHaveBeenCalled();
    backSpy.mockRestore();
  });

  test("Back header button navigates admins home (line 250)", async () => {
    render(<AdminPage />);
    await waitFor(() => screen.getByTestId("back-btn"));
    fireEvent.click(screen.getByTestId("back-btn"));

    expect(navigateHome).toHaveBeenCalled();
  });

  test("tab-users button switches back to Users tab (line 257)", async () => {
    render(<AdminPage />);
    await waitFor(() => screen.getByTestId("tab-logs"));

    // Switch to logs, then back to users
    await act(async () => { fireEvent.click(screen.getByTestId("tab-logs")); });
    await act(async () => { fireEvent.click(screen.getByTestId("tab-users")); });

    await waitFor(() => expect(screen.getByTestId("users-table")).toBeInTheDocument());
  });

  test("shows error when fetching logs fails (line 180)", async () => {
    global.fetch = vi.fn((url: RequestInfo | URL) => {
      const href = String(url);
      if (href.includes("/admin/users")) return Promise.resolve(jsonResponse({ users: USERS }));
      if (href.includes("/admin/security-logs")) return Promise.resolve(jsonResponse({ error: "Failed to load logs" }, false));
      return Promise.resolve(jsonResponse({ error: "Unknown" }, false));
    });

    render(<AdminPage />);
    await waitFor(() => screen.getByTestId("tab-logs"));
    await act(async () => { fireEvent.click(screen.getByTestId("tab-logs")); });

    await waitFor(() =>
      expect(screen.getByTestId("admin-error")).toBeInTheDocument()
    );
  });

  test("shows actionError when banning a user fails (line 204)", async () => {
    global.fetch = vi.fn((url: RequestInfo | URL) => {
      const href = String(url);
      if (href.includes("/admin/users")) return Promise.resolve(jsonResponse({ users: USERS }));
      if (href.includes("/admin/ban/")) return Promise.resolve(jsonResponse({ error: "Cannot ban admin user" }, false));
      return Promise.resolve(jsonResponse({ success: true }));
    });

    render(<AdminPage />);
    await waitFor(() => screen.getByTestId("ban-2"));
    fireEvent.click(screen.getByTestId("ban-2"));

    await waitFor(() => screen.getByTestId("ban-confirm"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("ban-confirm"));
    });

    await waitFor(() =>
      expect(screen.getByTestId("action-error")).toBeInTheDocument()
    );
  });
});
