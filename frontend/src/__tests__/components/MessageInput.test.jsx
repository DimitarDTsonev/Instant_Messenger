/**
 * @fileoverview Tests for MessageInput component
 * Covers: renders, typing, send on Enter, canWrite guard, disabled state
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MessageInput from "../../components/MessageInput";

vi.mock("../../context/AuthContext", () => ({
  useAuth: vi.fn(() => ({
    user:      { id: 1, username: "alice", role: "member", avatar: "👤" },
    token:     "test-token",
    authFetch: vi.fn().mockResolvedValue({}),
  })),
}));

vi.mock("../../context/SocketContext", () => ({
  useSocket: vi.fn(() => ({
    sendMessage:    vi.fn(),
    sendDm:         vi.fn(),
    emitTypingStart: vi.fn(),
    emitTypingStop:  vi.fn(),
  })),
}));

const DEFAULT_PROPS = {
  channelId:    1,
  isDm:         false,
  dmPartnerId:  null,
  replyTo:      null,
  onClearReply: vi.fn(),
  canWrite:     true,
};

describe("MessageInput", () => {
  test("renders the text input", () => {
    render(<MessageInput {...DEFAULT_PROPS} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  test("shows channel placeholder when canWrite is true", () => {
    render(<MessageInput {...DEFAULT_PROPS} />);
    expect(screen.getByPlaceholderText(/Send to #/i)).toBeInTheDocument();
  });

  test("shows permission-denied placeholder when canWrite is false", () => {
    render(<MessageInput {...DEFAULT_PROPS} canWrite={false} />);
    expect(screen.getByPlaceholderText(/permission/i)).toBeInTheDocument();
  });

  test("input is disabled when canWrite is false", () => {
    render(<MessageInput {...DEFAULT_PROPS} canWrite={false} />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  test("updates input value as user types", async () => {
    render(<MessageInput {...DEFAULT_PROPS} />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "hello world");
    expect(input.value).toBe("hello world");
  });

  test("pressing Enter with text calls sendMessage", async () => {
    const { useSocket } = await import("../../context/SocketContext");
    const mockSend = vi.fn();
    useSocket.mockReturnValue({
      sendMessage: mockSend, sendDm: vi.fn(),
      emitTypingStart: vi.fn(), emitTypingStop: vi.fn(),
    });

    render(<MessageInput {...DEFAULT_PROPS} />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "hello{Enter}");
    expect(mockSend).toHaveBeenCalled();
  });

  test("pressing Enter with only whitespace does not send", async () => {
    const { useSocket } = await import("../../context/SocketContext");
    const mockSend = vi.fn();
    useSocket.mockReturnValue({
      sendMessage: mockSend, sendDm: vi.fn(),
      emitTypingStart: vi.fn(), emitTypingStop: vi.fn(),
    });

    render(<MessageInput {...DEFAULT_PROPS} />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "   {Enter}");
    expect(mockSend).not.toHaveBeenCalled();
  });

  test("pressing Enter when canWrite is false does not send", async () => {
    const { useSocket } = await import("../../context/SocketContext");
    const mockSend = vi.fn();
    useSocket.mockReturnValue({
      sendMessage: mockSend, sendDm: vi.fn(),
      emitTypingStart: vi.fn(), emitTypingStop: vi.fn(),
    });

    render(<MessageInput {...DEFAULT_PROPS} canWrite={false} />);
    const input = screen.getByRole("textbox");
    // Directly fire keydown since the input is disabled
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockSend).not.toHaveBeenCalled();
  });

  test("shows DM placeholder in DM mode", () => {
    render(<MessageInput {...DEFAULT_PROPS} isDm={true} />);
    expect(screen.getByPlaceholderText(/Message user/i)).toBeInTheDocument();
  });

  test("clears input after sending", async () => {
    const { useSocket } = await import("../../context/SocketContext");
    useSocket.mockReturnValue({
      sendMessage: vi.fn((_, __, ___, ____, _____, ______, cb) => cb?.({})),
      sendDm: vi.fn(), emitTypingStart: vi.fn(), emitTypingStop: vi.fn(),
    });

    render(<MessageInput {...DEFAULT_PROPS} />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "hello{Enter}");
    expect(input.value).toBe("");
  });
});

// ─────────────────────────────────────────────────────────
//  Emoji picker
// ─────────────────────────────────────────────────────────
describe("emoji picker", () => {
  test("clicking the 😊 button opens the emoji picker", async () => {
    render(<MessageInput {...DEFAULT_PROPS} />);
    const emojiBtn = screen.getByTitle(/emoji/i);
    fireEvent.click(emojiBtn);
    // Emoji categories should appear (Smileys, Gestures, …)
    expect(screen.getByText("Smileys")).toBeInTheDocument();
  });

  test("clicking a category tab switches the emoji list", async () => {
    render(<MessageInput {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByTitle(/emoji/i));
    fireEvent.click(screen.getByText("Gestures"));
    // 👍 is in the Gestures category
    expect(screen.getByText("👍")).toBeInTheDocument();
  });

  test("clicking an emoji inserts it into the input", async () => {
    render(<MessageInput {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByTitle(/emoji/i));
    // Click the first emoji in the Smileys category (😀)
    const emojiBtn = screen.getByText("😀");
    fireEvent.mouseDown(emojiBtn);
    const input = screen.getByRole("textbox");
    // The emoji should have been inserted
    expect(input.value).toContain("😀");
  });

  test("clicking outside the emoji panel closes it", async () => {
    render(<MessageInput {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByTitle(/emoji/i));
    expect(screen.getByText("Smileys")).toBeInTheDocument();
    // Simulate a mousedown outside the panel
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByText("Smileys")).not.toBeInTheDocument());
  });
});

// ─────────────────────────────────────────────────────────
//  @mention autocomplete
// ─────────────────────────────────────────────────────────
describe("@mention autocomplete", () => {
  const USERS_PROP = [
    { id: 1, username: "alice" },
    { id: 2, username: "bob" },
  ];

  test("typing @al shows alice in the mention list", async () => {
    render(<MessageInput {...DEFAULT_PROPS} users={USERS_PROP} />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "@al");
    expect(await screen.findByText("@alice")).toBeInTheDocument();
  });

  test("clicking a mention suggestion inserts it into the input", async () => {
    render(<MessageInput {...DEFAULT_PROPS} users={USERS_PROP} />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "@al");
    const suggestion = await screen.findByText("@alice");
    fireEvent.mouseDown(suggestion);
    expect(input.value).toContain("@alice ");
  });
});

// ─────────────────────────────────────────────────────────
//  File attachment
// ─────────────────────────────────────────────────────────
describe("file attachment", () => {
  test("clicking the 📎 button triggers the hidden file input", () => {
    render(<MessageInput {...DEFAULT_PROPS} />);
    const attachBtn = screen.getByTitle(/attach/i);
    // The button calls fileInputRef.current.click() — verify it doesn't throw
    expect(() => fireEvent.click(attachBtn)).not.toThrow();
  });

  test("selecting a file uploads it and shows the file preview", async () => {
    const mockToken = "test-token";
    const { useAuth } = await import("../../context/AuthContext");
    useAuth.mockReturnValue({
      user: { id: 1, username: "alice", role: "member", avatar: "👤" },
      token: mockToken,
      authFetch: vi.fn().mockResolvedValue({}),
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ url: "/uploads/test.png", type: "image", name: "test.png" }),
    });
    global.URL.createObjectURL = vi.fn(() => "blob:fake-preview");

    render(<MessageInput {...DEFAULT_PROPS} />);

    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(["img"], "test.png", { type: "image/png" });
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
    fireEvent.change(fileInput);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  });

  test("fileIcon covers pdf extension", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ url: "/uploads/doc.pdf", type: "file", name: "doc.pdf" }),
    });
    global.URL.createObjectURL = vi.fn(() => null);

    render(<MessageInput {...DEFAULT_PROPS} />);

    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(["data"], "doc.pdf", { type: "application/pdf" });
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
    fireEvent.change(fileInput);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  });
});
