/**
 * @fileoverview Tests for UserProfileModal component
 * Covers: loading, profile display, DM button, admin role management, Escape close
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import UserProfileModal from "../../components/UserProfileModal";

const MOCK_PROFILE = {
  id: 2, username: "bob", email: "bob@test.com", avatar: "👤",
  role: "member", created_at: "2024-01-01T00:00:00Z",
};

vi.mock("../../context/AuthContext", () => ({
  useAuth: vi.fn(() => ({
    user:      { id: 1, username: "alice", role: "admin" },
    authFetch: vi.fn().mockResolvedValue({ user: MOCK_PROFILE }),
  })),
}));

import { useAuth } from "../../context/AuthContext";

describe("UserProfileModal", () => {
  test("shows loading state initially", () => {
    // authFetch never resolves — still loading
    useAuth.mockReturnValue({
      user: { id: 1, username: "alice", role: "admin" },
      authFetch: vi.fn(() => new Promise(() => {})),
    });
    render(<UserProfileModal userId={2} onClose={vi.fn()} onStartDm={vi.fn()} />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  test("shows user profile after fetch resolves", async () => {
    useAuth.mockReturnValue({
      user: { id: 1, username: "alice", role: "admin" },
      authFetch: vi.fn().mockResolvedValue({ user: MOCK_PROFILE }),
    });
    render(<UserProfileModal userId={2} onClose={vi.fn()} onStartDm={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("bob")).toBeInTheDocument());
    expect(screen.getByText("bob@test.com")).toBeInTheDocument();
  });

  test("shows 'not found' when fetch returns no user", async () => {
    useAuth.mockReturnValue({
      user: { id: 1, username: "alice", role: "admin" },
      authFetch: vi.fn().mockRejectedValue(new Error("not found")),
    });
    render(<UserProfileModal userId={999} onClose={vi.fn()} onStartDm={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/User not found/i)).toBeInTheDocument());
  });

  test("shows online indicator when isOnline is true", async () => {
    useAuth.mockReturnValue({
      user: { id: 1, username: "alice", role: "admin" },
      authFetch: vi.fn().mockResolvedValue({ user: MOCK_PROFILE }),
    });
    render(<UserProfileModal userId={2} isOnline={true} onClose={vi.fn()} onStartDm={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Online")).toBeInTheDocument());
  });

  test("shows offline indicator when isOnline is false", async () => {
    useAuth.mockReturnValue({
      user: { id: 1, username: "alice", role: "admin" },
      authFetch: vi.fn().mockResolvedValue({ user: MOCK_PROFILE }),
    });
    render(<UserProfileModal userId={2} isOnline={false} onClose={vi.fn()} onStartDm={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Offline")).toBeInTheDocument());
  });

  test("DM button calls onStartDm and onClose", async () => {
    useAuth.mockReturnValue({
      user: { id: 1, username: "alice", role: "admin" },
      authFetch: vi.fn().mockResolvedValue({ user: MOCK_PROFILE }),
    });
    const onStartDm = vi.fn();
    const onClose   = vi.fn();
    render(<UserProfileModal userId={2} onClose={onClose} onStartDm={onStartDm} />);
    await waitFor(() => screen.getByText(/Send direct message/i));
    fireEvent.click(screen.getByText(/Send direct message/i));
    expect(onStartDm).toHaveBeenCalledWith(MOCK_PROFILE);
    expect(onClose).toHaveBeenCalled();
  });

  test("hides DM button when viewing own profile", async () => {
    useAuth.mockReturnValue({
      // me.id === userId = 2
      user: { id: 2, username: "bob", role: "admin" },
      authFetch: vi.fn().mockResolvedValue({ user: MOCK_PROFILE }),
    });
    render(<UserProfileModal userId={2} onClose={vi.fn()} onStartDm={vi.fn()} />);
    await waitFor(() => screen.getByText("bob"));
    expect(screen.queryByText("Send direct message")).not.toBeInTheDocument();
  });

  test("admin sees role management section for other users", async () => {
    useAuth.mockReturnValue({
      user: { id: 1, username: "alice", role: "admin" },
      authFetch: vi.fn().mockResolvedValue({ user: MOCK_PROFILE }),
    });
    render(<UserProfileModal userId={2} onClose={vi.fn()} onStartDm={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Role Management")).toBeInTheDocument());
  });

  test("non-admin does not see role management section", async () => {
    useAuth.mockReturnValue({
      user: { id: 1, username: "alice", role: "member" },
      authFetch: vi.fn().mockResolvedValue({ user: MOCK_PROFILE }),
    });
    render(<UserProfileModal userId={2} onClose={vi.fn()} onStartDm={vi.fn()} />);
    await waitFor(() => screen.getByText("bob"));
    expect(screen.queryByText("Role Management")).not.toBeInTheDocument();
  });

  test("close button calls onClose", async () => {
    useAuth.mockReturnValue({
      user: { id: 1, username: "alice", role: "admin" },
      authFetch: vi.fn().mockResolvedValue({ user: MOCK_PROFILE }),
    });
    const onClose = vi.fn();
    render(<UserProfileModal userId={2} onClose={onClose} onStartDm={vi.fn()} />);
    await waitFor(() => screen.getByText("bob"));
    fireEvent.click(screen.getByTitle("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  test("Escape key calls onClose", () => {
    useAuth.mockReturnValue({
      user: { id: 1, username: "alice", role: "admin" },
      authFetch: vi.fn().mockResolvedValue({ user: MOCK_PROFILE }),
    });
    const onClose = vi.fn();
    render(<UserProfileModal userId={2} onClose={onClose} onStartDm={vi.fn()} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  test("clicking overlay backdrop calls onClose", async () => {
    useAuth.mockReturnValue({
      user: { id: 1, username: "alice", role: "admin" },
      authFetch: vi.fn().mockResolvedValue({ user: MOCK_PROFILE }),
    });
    const onClose = vi.fn();
    const { container } = render(<UserProfileModal userId={2} onClose={onClose} onStartDm={vi.fn()} />);
    await waitFor(() => screen.getByText("bob"));
    // Click the outermost overlay div (the first div child of body)
    const overlay = container.firstChild;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  test("handleSaveRole updates role on success", async () => {
    const patchFetch = vi.fn()
      .mockResolvedValueOnce({ user: MOCK_PROFILE }) // initial profile load
      .mockResolvedValueOnce({});                    // PATCH role
    useAuth.mockReturnValue({
      user: { id: 1, username: "alice", role: "admin" },
      authFetch: patchFetch,
    });
    render(<UserProfileModal userId={2} onClose={vi.fn()} onStartDm={vi.fn()} />);
    await waitFor(() => screen.getByText("Role Management"));

    // Change the select to "admin"
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "admin" } });

    // Save role button appears when role differs
    const saveBtn = await waitFor(() => screen.getByText(/Save role/i));
    fireEvent.click(saveBtn);

    await waitFor(() => expect(screen.getByText(/Role updated successfully/i)).toBeInTheDocument());
  });

  test("handleSaveRole shows error message on failure", async () => {
    const patchFetch = vi.fn()
      .mockResolvedValueOnce({ user: MOCK_PROFILE })
      .mockRejectedValueOnce(new Error("Forbidden"));
    useAuth.mockReturnValue({
      user: { id: 1, username: "alice", role: "admin" },
      authFetch: patchFetch,
    });
    render(<UserProfileModal userId={2} onClose={vi.fn()} onStartDm={vi.fn()} />);
    await waitFor(() => screen.getByText("Role Management"));

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "admin" } });
    const saveBtn = await waitFor(() => screen.getByText(/Save role/i));
    fireEvent.click(saveBtn);

    await waitFor(() => expect(screen.getByText(/Forbidden/i)).toBeInTheDocument());
  });

  test("handleSaveRole does nothing when selected role equals current role", async () => {
    const authFetch = vi.fn().mockResolvedValue({ user: MOCK_PROFILE });
    useAuth.mockReturnValue({
      user: { id: 1, username: "alice", role: "admin" },
      authFetch,
    });
    render(<UserProfileModal userId={2} onClose={vi.fn()} onStartDm={vi.fn()} />);
    await waitFor(() => screen.getByText("Role Management"));

    // Role is already "member" — clicking save without changing should be a no-op
    // The save button should not be visible when role hasn't changed
    expect(screen.queryByText(/Save role/i)).not.toBeInTheDocument();
    // Only the initial profile fetch should have been called
    expect(authFetch).toHaveBeenCalledTimes(1);
  });
});
