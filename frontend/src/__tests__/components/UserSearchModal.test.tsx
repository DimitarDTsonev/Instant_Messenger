/**
 * UserSearchModal tests — verifies the user search input, result display,
 * "Start DM" and "View profile" actions, and modal dismiss.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UserSearchModal from "../../components/UserSearchModal";

vi.mock("../../hooks/useApi", () => ({
  useUserSearch: vi.fn(() => ({
    results: [],
    loading: false,
    search:  vi.fn(),
    clear:   vi.fn(),
  })),
}));

import { useUserSearch } from "../../hooks/useApi";

const ALICE = { id: 2, username: "alice", email: "alice@test.com", avatar: "AL", role: "member" };

describe("UserSearchModal", () => {
  test("renders search input", () => {
    render(<UserSearchModal onClose={vi.fn()} onSelectDm={vi.fn()} onViewProfile={vi.fn()} />);
    expect(screen.getByPlaceholderText(/username/i)).toBeInTheDocument();
  });

  test("shows prompt when no query entered", () => {
    render(<UserSearchModal onClose={vi.fn()} onSelectDm={vi.fn()} onViewProfile={vi.fn()} />);
    expect(screen.getByText(/Enter a username/i)).toBeInTheDocument();
  });

  test("calls onClose when ESC button is clicked", () => {
    const onClose = vi.fn();
    render(<UserSearchModal onClose={onClose} onSelectDm={vi.fn()} onViewProfile={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Close user search" }));
    expect(onClose).toHaveBeenCalled();
  });

  test("calls onClose on Escape key", () => {
    const onClose = vi.fn();
    render(<UserSearchModal onClose={onClose} onSelectDm={vi.fn()} onViewProfile={vi.fn()} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  test("shows loading indicator while searching", () => {
    useUserSearch.mockReturnValue({
      results: [], loading: true, search: vi.fn(), clear: vi.fn(),
    });
    render(<UserSearchModal onClose={vi.fn()} onSelectDm={vi.fn()} onViewProfile={vi.fn()} />);
    expect(screen.getByText(/Searching/i)).toBeInTheDocument();
  });

  test("renders a user row for each result", () => {
    useUserSearch.mockReturnValue({
      results: [ALICE], loading: false, search: vi.fn(), clear: vi.fn(),
    });
    render(<UserSearchModal onClose={vi.fn()} onSelectDm={vi.fn()} onViewProfile={vi.fn()} />);
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("alice@test.com")).toBeInTheDocument();
  });

  test("DM button calls onSelectDm and closes modal", () => {
    const onSelectDm = vi.fn();
    const onClose    = vi.fn();
    useUserSearch.mockReturnValue({
      results: [ALICE], loading: false, search: vi.fn(), clear: vi.fn(),
    });
    render(<UserSearchModal onClose={onClose} onSelectDm={onSelectDm} onViewProfile={vi.fn()} />);
    fireEvent.click(screen.getByTitle("Send message"));
    expect(onSelectDm).toHaveBeenCalledWith(ALICE);
    expect(onClose).toHaveBeenCalled();
  });

  test("profile button calls onViewProfile and closes modal", () => {
    const onViewProfile = vi.fn();
    const onClose       = vi.fn();
    useUserSearch.mockReturnValue({
      results: [ALICE], loading: false, search: vi.fn(), clear: vi.fn(),
    });
    render(<UserSearchModal onClose={onClose} onSelectDm={vi.fn()} onViewProfile={onViewProfile} />);
    fireEvent.click(screen.getByTitle("View profile"));
    expect(onViewProfile).toHaveBeenCalledWith(ALICE.id);
    expect(onClose).toHaveBeenCalled();
  });

  test("shows 'no users' message when query matches nothing", () => {
    useUserSearch.mockReturnValue({
      results: [], loading: false, search: vi.fn(), clear: vi.fn(),
    });
    // Simulate a query being set by updating the input
    render(<UserSearchModal onClose={vi.fn()} onSelectDm={vi.fn()} onViewProfile={vi.fn()} />);
    // Directly update the input to have a value
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "xyz" } });
    expect(screen.getByText(/No users found/i)).toBeInTheDocument();
  });

  test("shows admin shield icon for admin users", () => {
    const adminUser = { ...ALICE, role: "admin" };
    useUserSearch.mockReturnValue({
      results: [adminUser], loading: false, search: vi.fn(), clear: vi.fn(),
    });
    render(<UserSearchModal onClose={vi.fn()} onSelectDm={vi.fn()} onViewProfile={vi.fn()} />);
    expect(screen.getByTitle("Admin")).toBeInTheDocument();
  });
});
