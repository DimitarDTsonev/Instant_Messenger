/**
 * @fileoverview Tests for SearchModal component
 * Covers: renders, auto-focus, Escape close, backdrop close, search results, navigation
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SearchModal from "../../components/SearchModal";

vi.mock("../../hooks/useApi", () => ({
  useGlobalSearch: vi.fn(() => ({
    results:     [],
    loading:     false,
    query:       "",
    search:      vi.fn(),
    clearSearch: vi.fn(),
  })),
}));

import { useGlobalSearch } from "../../hooks/useApi";

describe("SearchModal", () => {
  test("renders the search input", () => {
    render(<SearchModal onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText(/Search channels/i)).toBeInTheDocument();
  });

  test("shows prompt text when no query has been entered", () => {
    render(<SearchModal onClose={vi.fn()} />);
    expect(screen.getByText(/Search everywhere/i)).toBeInTheDocument();
  });

  test("calls onClose when ESC button is clicked", () => {
    const onClose = vi.fn();
    render(<SearchModal onClose={onClose} />);
    fireEvent.click(screen.getByText("ESC"));
    expect(onClose).toHaveBeenCalled();
  });

  test("calls onClose on Escape key press", () => {
    const onClose = vi.fn();
    render(<SearchModal onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  test("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    const { container } = render(<SearchModal onClose={onClose} />);
    // The outermost div is the backdrop
    fireEvent.click(container.firstChild);
    expect(onClose).toHaveBeenCalled();
  });

  test("shows loading indicator while search is in progress", () => {
    useGlobalSearch.mockReturnValue({
      results: [], loading: true, query: "hello", search: vi.fn(), clearSearch: vi.fn(),
    });
    render(<SearchModal onClose={vi.fn()} />);
    expect(screen.getByText(/Searching/i)).toBeInTheDocument();
  });

  test("shows 'no results' message when query has no matches", () => {
    useGlobalSearch.mockReturnValue({
      results: [], loading: false, query: "xyz123", search: vi.fn(), clearSearch: vi.fn(),
    });
    render(<SearchModal onClose={vi.fn()} />);
    expect(screen.getByText(/No messages found/i)).toBeInTheDocument();
  });

  test("renders result cards for each match", () => {
    useGlobalSearch.mockReturnValue({
      results: [
        { id: 1, type: "channel", username: "alice", avatar: "👤",
          content: "hello world", created_at: new Date().toISOString(),
          channel_name: "general" },
      ],
      loading: false, query: "hello", search: vi.fn(), clearSearch: vi.fn(),
    });
    render(<SearchModal onClose={vi.fn()} />);
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText(/#general/)).toBeInTheDocument();
  });

  test("calls onNavigate and closes when a result is clicked", () => {
    const result = {
      id: 1, type: "channel", username: "alice", avatar: "👤",
      content: "hello world", created_at: new Date().toISOString(), channel_name: "general",
    };
    const onNavigate = vi.fn();
    const onClose    = vi.fn();
    useGlobalSearch.mockReturnValue({
      results: [result], loading: false, query: "hello",
      search: vi.fn(), clearSearch: vi.fn(),
    });

    render(<SearchModal onClose={onClose} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText("alice").closest("[style]"));
    expect(onNavigate).toHaveBeenCalledWith(result);
    expect(onClose).toHaveBeenCalled();
  });

  test("shows result count badge when there are results", () => {
    useGlobalSearch.mockReturnValue({
      results: [
        { id: 1, type: "channel", username: "alice", avatar: "👤",
          content: "match", created_at: new Date().toISOString(), channel_name: "general" },
      ],
      loading: false, query: "match", search: vi.fn(), clearSearch: vi.fn(),
    });
    render(<SearchModal onClose={vi.fn()} />);
    expect(screen.getByText(/1 results/)).toBeInTheDocument();
  });

  test("typing in search input calls search()", async () => {
    const search = vi.fn();
    useGlobalSearch.mockReturnValue({
      results: [], loading: false, query: "", search, clearSearch: vi.fn(),
    });
    render(<SearchModal onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Search channels/i), { target: { value: "hello" } });
    expect(search).toHaveBeenCalledWith("hello");
  });
});
