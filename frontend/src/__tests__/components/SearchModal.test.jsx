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

// ---------------------------------------------------------------------------
// Result item hover styles and badge styling (lines 279-293)
// ---------------------------------------------------------------------------
describe("SearchModal — result item hover styles and badges", () => {
  it("changes background to #2d2d3f on mouseEnter and restores transparent on mouseLeave", () => {
    useGlobalSearch.mockReturnValue({
      results: [
        { id: 1, type: "channel", content: "hello world", username: "alice",
          avatar: "🐱", channel_name: "general", created_at: new Date().toISOString() },
      ],
      loading: false, query: "hello",
      search: vi.fn(), clearSearch: vi.fn(),
    });

    render(<SearchModal onClose={vi.fn()} onNavigate={vi.fn()} />);

    // DOM structure: resultItem > resultHeader > span("alice")
    // parentElement.parentElement climbs: span → resultHeader → resultItem
    const aliceSpan  = screen.getByText("alice");
    const resultItem = aliceSpan.parentElement.parentElement;

    fireEvent.mouseEnter(resultItem);
    // jsdom normalises hex colours to rgb() — both represent #2d2d3f
    expect(resultItem.style.background).toMatch(/rgb\(45,\s*45,\s*63\)|#2d2d3f/);

    fireEvent.mouseLeave(resultItem);
    expect(resultItem.style.background).toMatch(/transparent|rgba\(0,\s*0,\s*0,\s*0\)|^$/);
  });

  it("shows green DM badge for DM type result (lines 287-293)", () => {
    useGlobalSearch.mockReturnValue({
      results: [
        { id: 2, type: "dm", content: "hey there", username: "bob",
          avatar: "😊", dm_partner_username: "bob", created_at: new Date().toISOString() },
      ],
      loading: false, query: "hey",
      search: vi.fn(), clearSearch: vi.fn(),
    });

    render(<SearchModal onClose={vi.fn()} />);
    expect(screen.getByText(/💬 bob/)).toBeInTheDocument();
  });

  it("highlightText returns empty string when query is empty (line 154)", () => {
    useGlobalSearch.mockReturnValue({
      results: [
        { id: 1, type: "channel", content: "hello world", username: "alice",
          avatar: "👤", channel_name: "general", created_at: new Date().toISOString() },
      ],
      loading: false, query: "",
      search: vi.fn(), clearSearch: vi.fn(),
    });

    render(<SearchModal onClose={vi.fn()} />);
    expect(screen.getByText("hello world")).toBeInTheDocument();
  });
});