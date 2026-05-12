import { render, screen, fireEvent } from "@testing-library/react";
import PinnedBanner from "../../components/PinnedBanner";

// Mock both contexts
vi.mock("../../context/AuthContext", () => ({
  useAuth: vi.fn(() => ({
    user: { id: 1, username: "alice", role: "admin" },
  })),
}));

vi.mock("../../context/SocketContext", () => ({
  useSocket: vi.fn(() => ({
    deleteMessage: vi.fn(),
  })),
}));

const PIN1 = { id: 10, username: "alice", content: "first pinned message", file_url: null };
const PIN2 = { id: 11, username: "bob",   content: "second pinned message", file_url: null };

describe("PinnedBanner", () => {
  test("renders nothing when pinnedMessages is empty", () => {
    const { container } = render(
      <PinnedBanner pinnedMessages={[]} channelCreatedBy={1} onUnpin={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  test("renders nothing when pinnedMessages is undefined", () => {
    const { container } = render(
      <PinnedBanner pinnedMessages={undefined} channelCreatedBy={1} onUnpin={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  test("shows the 'Pinned' label and first pin content", () => {
    render(<PinnedBanner pinnedMessages={[PIN1]} channelCreatedBy={1} onUnpin={vi.fn()} />);
    expect(screen.getByText("Pinned")).toBeInTheDocument();
    expect(screen.getByText(/first pinned message/)).toBeInTheDocument();
  });

  test("shows author name in the banner", () => {
    render(<PinnedBanner pinnedMessages={[PIN1]} channelCreatedBy={1} onUnpin={vi.fn()} />);
    expect(screen.getByText(/alice/)).toBeInTheDocument();
  });

  test("collapse button hides message content", () => {
    render(<PinnedBanner pinnedMessages={[PIN1]} channelCreatedBy={1} onUnpin={vi.fn()} />);
    const collapseBtn = screen.getByRole("button", { name: "Collapse pinned message" });
    fireEvent.click(collapseBtn);
    expect(screen.queryByText(/first pinned message/)).not.toBeInTheDocument();
  });

  test("expand button restores message content after collapse", () => {
    render(<PinnedBanner pinnedMessages={[PIN1]} channelCreatedBy={1} onUnpin={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Collapse pinned message" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand pinned message" }));
    expect(screen.getByText(/first pinned message/)).toBeInTheDocument();
  });

  test("shows unpin button for admin/creator and calls onUnpin", () => {
    const onUnpin = vi.fn();
    render(<PinnedBanner pinnedMessages={[PIN1]} channelCreatedBy={1} onUnpin={onUnpin} />);
    fireEvent.click(screen.getByTitle("Unpin"));
    expect(onUnpin).toHaveBeenCalledWith(PIN1.id);
  });

  test("shows navigation for multiple pins", () => {
    render(<PinnedBanner pinnedMessages={[PIN1, PIN2]} channelCreatedBy={1} onUnpin={vi.fn()} />);
    expect(screen.getByText(/1\/2/)).toBeInTheDocument();
  });

  test("advances to next pin when forward arrow is clicked", () => {
    render(<PinnedBanner pinnedMessages={[PIN1, PIN2]} channelCreatedBy={1} onUnpin={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Next pinned message" }));
    expect(screen.getByText(/second pinned message/)).toBeInTheDocument();
  });

  test("wraps back to first pin when back arrow is clicked on last pin", () => {
    render(<PinnedBanner pinnedMessages={[PIN1, PIN2]} channelCreatedBy={1} onUnpin={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Next pinned message" }));
    fireEvent.click(screen.getByRole("button", { name: "First pinned message" }));
    expect(screen.getByText(/first pinned message/)).toBeInTheDocument();
  });

  test("shows [image] for messages with file_url instead of content", () => {
    const imagePin = { id: 12, username: "alice", content: "", file_url: "/uploads/img.png" };
    render(<PinnedBanner pinnedMessages={[imagePin]} channelCreatedBy={1} onUnpin={vi.fn()} />);
    expect(screen.getByText(/\[image\]/)).toBeInTheDocument();
  });

  test("truncates long content at 120 characters", () => {
    const longPin = { id: 13, username: "alice", content: "a".repeat(200), file_url: null };
    render(<PinnedBanner pinnedMessages={[longPin]} channelCreatedBy={1} onUnpin={vi.fn()} />);
    // Should show 120 chars + ellipsis, not the full 200
    const content = screen.getAllByText(/a+\.\.\./)[0];
    expect(content.textContent.length).toBeLessThan(200);
  });
});
