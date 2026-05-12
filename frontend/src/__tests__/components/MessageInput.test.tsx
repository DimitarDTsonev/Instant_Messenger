import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MessageInput from "../../components/MessageInput";

declare const global: typeof globalThis;

vi.mock("../../context/AuthContext", () => ({
  useAuth: vi.fn(() => ({
    user:      { id: 1, username: "alice", role: "member", avatar: "AL" },
    token:     "test-token",
    authFetch: vi.fn().mockResolvedValue({}),
  })),
}));

vi.mock("../../context/SocketContext", () => ({
  useSocket: vi.fn(() => ({
    sendMessage:      vi.fn(),
    sendDm:           vi.fn(),
    emitTypingStart:   vi.fn(),
    emitTypingStop:    vi.fn(),
    emitDmTypingStart: vi.fn(),
    emitDmTypingStop:  vi.fn(),
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
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.type(input, "hello world");
    expect(input.value).toBe("hello world");
  });

  test("pressing Enter with text calls sendMessage", async () => {
    const { useSocket } = await import("../../context/SocketContext");
    const mockSend = vi.fn();
    (vi.mocked(useSocket) as any).mockReturnValue({
      sendMessage: mockSend, sendDm: vi.fn(),
      emitTypingStart: vi.fn(), emitTypingStop: vi.fn(),
      emitDmTypingStart: vi.fn(), emitDmTypingStop: vi.fn(),
    });

    render(<MessageInput {...DEFAULT_PROPS} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.type(input, "hello{Enter}");
    expect(mockSend).toHaveBeenCalled();
  });

  test("pressing Enter with only whitespace does not send", async () => {
    const { useSocket } = await import("../../context/SocketContext");
    const mockSend = vi.fn();
    (vi.mocked(useSocket) as any).mockReturnValue({
      sendMessage: mockSend, sendDm: vi.fn(),
      emitTypingStart: vi.fn(), emitTypingStop: vi.fn(),
      emitDmTypingStart: vi.fn(), emitDmTypingStop: vi.fn(),
    });

    render(<MessageInput {...DEFAULT_PROPS} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.type(input, "   {Enter}");
    expect(mockSend).not.toHaveBeenCalled();
  });

  test("pressing Enter when canWrite is false does not send", async () => {
    const { useSocket } = await import("../../context/SocketContext");
    const mockSend = vi.fn();
    (vi.mocked(useSocket) as any).mockReturnValue({
      sendMessage: mockSend, sendDm: vi.fn(),
      emitTypingStart: vi.fn(), emitTypingStop: vi.fn(),
      emitDmTypingStart: vi.fn(), emitDmTypingStop: vi.fn(),
    });

    render(<MessageInput {...DEFAULT_PROPS} canWrite={false} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
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
    (vi.mocked(useSocket) as any).mockReturnValue({
      sendMessage: vi.fn((_, __, ___, ____, _____, ______, cb) => cb?.({})),
      sendDm: vi.fn(), emitTypingStart: vi.fn(), emitTypingStop: vi.fn(),
      emitDmTypingStart: vi.fn(), emitDmTypingStop: vi.fn(),
    });

    render(<MessageInput {...DEFAULT_PROPS} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.type(input, "hello{Enter}");
    expect(input.value).toBe("");
  });
});
//  Emoji picker
describe("emoji picker", () => {
  test("clicking the React button opens the emoji picker", async () => {
    render(<MessageInput {...DEFAULT_PROPS} />);
    const emojiBtn = screen.getByTitle(/emoji/i);
    fireEvent.click(emojiBtn);
    // Emoji categories should appear (Smileys, Gestures, ...)
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
    const input = screen.getByRole("textbox") as HTMLInputElement;
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
//  @mention autocomplete
describe("@mention autocomplete", () => {
  const USERS_PROP = [
    { id: 1, username: "alice" },
    { id: 2, username: "bob" },
  ];

  test("typing @al shows alice in the mention list", async () => {
    render(<MessageInput {...DEFAULT_PROPS} users={USERS_PROP} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.type(input, "@al");
    expect(await screen.findByText("@alice")).toBeInTheDocument();
  });

  test("clicking a mention suggestion inserts it into the input", async () => {
    render(<MessageInput {...DEFAULT_PROPS} users={USERS_PROP} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.type(input, "@al");
    const suggestion = await screen.findByText("@alice");
    fireEvent.mouseDown(suggestion);
    expect(input.value).toContain("@alice ");
  });
});
//  File attachment
describe("file attachment", () => {
  test("clicking the Attach button triggers the hidden file input", () => {
    render(<MessageInput {...DEFAULT_PROPS} />);
    const attachBtn = screen.getByTitle(/attach/i);
    // The button calls fileInputRef.current.click() - verify it doesn't throw
    expect(() => fireEvent.click(attachBtn)).not.toThrow();
  });

  test("selecting a file uploads it and shows the file preview", async () => {
    const mockToken = "test-token";
    const { useAuth } = await import("../../context/AuthContext");
    (vi.mocked(useAuth) as any).mockReturnValue({
      user: { id: 1, username: "alice", role: "member", avatar: "AL" },
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

  test("fileIcon covers doc/docx extensions", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ url: "/uploads/doc.docx", type: "file", name: "doc.docx" }),
    });
    render(<MessageInput {...DEFAULT_PROPS} />);
    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(["data"], "doc.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
    fireEvent.change(fileInput);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  });

  test("fileIcon covers spreadsheet extensions (xls, xlsx, csv)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ url: "/uploads/data.xlsx", type: "file", name: "data.xlsx" }),
    });
    render(<MessageInput {...DEFAULT_PROPS} />);
    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(["data"], "data.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
    fireEvent.change(fileInput);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  });

  test("fileIcon covers presentation extensions (ppt, pptx)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ url: "/uploads/slides.pptx", type: "file", name: "slides.pptx" }),
    });
    render(<MessageInput {...DEFAULT_PROPS} />);
    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(["data"], "slides.pptx", { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
    fireEvent.change(fileInput);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  });

  test("fileIcon covers archive extensions (zip, rar, 7z)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ url: "/uploads/archive.zip", type: "file", name: "archive.zip" }),
    });
    render(<MessageInput {...DEFAULT_PROPS} />);
    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(["data"], "archive.zip", { type: "application/zip" });
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
    fireEvent.change(fileInput);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  });

  test("fileIcon covers txt extension", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ url: "/uploads/notes.txt", type: "file", name: "notes.txt" }),
    });
    render(<MessageInput {...DEFAULT_PROPS} />);
    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(["data"], "notes.txt", { type: "text/plain" });
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
    fireEvent.change(fileInput);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  });

  test("fileIcon defaults to paperclip for unknown extension", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ url: "/uploads/file.unknown", type: "file", name: "file.unknown" }),
    });
    render(<MessageInput {...DEFAULT_PROPS} />);
    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(["data"], "file.unknown", { type: "application/octet-stream" });
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
    fireEvent.change(fileInput);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  });
});
//  DM mode
const DM_PROPS = {
  isDm: true,
  dmUser: { id: 2, username: "bob" },
  channelId: undefined,
  channelName: undefined,
  replyTo: null,
  onClearReply: vi.fn(),
  canWrite: true,
};

describe("DM mode", () => {
  test("pressing Enter in DM mode calls sendDm, not sendMessage", async () => {
    const { useSocket } = await import("../../context/SocketContext");
    const sendDm = vi.fn();
    const sendMessage = vi.fn();
    (vi.mocked(useSocket) as any).mockReturnValue({
      sendMessage, sendDm,
      emitTypingStart: vi.fn(), emitTypingStop: vi.fn(),
      emitDmTypingStart: vi.fn(), emitDmTypingStop: vi.fn(),
    });

    render(<MessageInput {...DM_PROPS} />);
    await userEvent.type(screen.getByRole("textbox"), "hello{Enter}");

    expect(sendDm).toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test("sendDm callback calls onAddMessage with the returned message", async () => {
    const { useSocket } = await import("../../context/SocketContext");
    const onAddMessage = vi.fn();
    const sendDm = vi.fn((_, __, ___, ____, _____, ______, cb) =>
      cb?.({ message: { id: 1, content: "hello" } })
    );
    (vi.mocked(useSocket) as any).mockReturnValue({
      sendMessage: vi.fn(), sendDm,
      emitTypingStart: vi.fn(), emitTypingStop: vi.fn(),
      emitDmTypingStart: vi.fn(), emitDmTypingStop: vi.fn(),
    });

    render(<MessageInput {...DM_PROPS} onAddMessage={onAddMessage} />);
    await userEvent.type(screen.getByRole("textbox"), "hello{Enter}");

    expect(onAddMessage).toHaveBeenCalledWith({ id: 1, content: "hello" });
  });

  test("sendDm error restores text in textarea", async () => {
    const { useSocket } = await import("../../context/SocketContext");
    const sendDm = vi.fn((_, __, ___, ____, _____, ______, cb) =>
      cb?.({ error: "network failure" })
    );
    (vi.mocked(useSocket) as any).mockReturnValue({
      sendMessage: vi.fn(), sendDm,
      emitTypingStart: vi.fn(), emitTypingStop: vi.fn(),
      emitDmTypingStart: vi.fn(), emitDmTypingStop: vi.fn(),
    });

    render(<MessageInput {...DM_PROPS} />);
    await userEvent.type(screen.getByRole("textbox"), "hello{Enter}");

    await waitFor(() =>
      expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("hello")
    );
  });

  test("typing in DM mode calls emitDmTypingStart, not emitTypingStart", async () => {
    const { useSocket } = await import("../../context/SocketContext");
    const emitDmTypingStart = vi.fn();
    const emitTypingStart   = vi.fn();
    (vi.mocked(useSocket) as any).mockReturnValue({
      sendMessage: vi.fn(), sendDm: vi.fn(),
      emitTypingStart, emitTypingStop: vi.fn(),
      emitDmTypingStart, emitDmTypingStop: vi.fn(),
    });

    render(<MessageInput {...DM_PROPS} />);
    await userEvent.type(screen.getByRole("textbox"), "a");

    expect(emitDmTypingStart).toHaveBeenCalledWith(2);
    expect(emitTypingStart).not.toHaveBeenCalled();
  });
});
// stopTyping debounce - DM branch (line 205) and channel branch (line 206)
describe("stopTyping debounce", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.runOnlyPendingTimers(); vi.useRealTimers(); });

  test("emits emitDmTypingStop after 1.5 s inactivity when isDm=true and dmUser is set (line 205)", async () => {
    const { useSocket } = await import("../../context/SocketContext");
    const emitDmTypingStop = vi.fn();
    (vi.mocked(useSocket) as any).mockReturnValue({
      sendMessage: vi.fn(), sendDm: vi.fn(),
      emitTypingStart: vi.fn(), emitTypingStop: vi.fn(),
      emitDmTypingStart: vi.fn(), emitDmTypingStop,
    });

    const dmUser = { id: 7, username: "bob" };
    render(<MessageInput isDm={true} dmUser={dmUser} onAddMessage={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "hi" } });
    act(() => { vi.advanceTimersByTime(1600); });

    expect(emitDmTypingStop).toHaveBeenCalledWith(dmUser.id);
  });

  test("emits emitTypingStop after 1.5 s inactivity when channelId is set (line 206)", async () => {
    const { useSocket } = await import("../../context/SocketContext");
    const emitTypingStop = vi.fn();
    (vi.mocked(useSocket) as any).mockReturnValue({
      sendMessage: vi.fn(), sendDm: vi.fn(),
      emitTypingStart: vi.fn(), emitTypingStop,
      emitDmTypingStart: vi.fn(), emitDmTypingStop: vi.fn(),
    });

    render(<MessageInput channelId={3} channelName="general" />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "hello" } });
    act(() => { vi.advanceTimersByTime(1600); });

    expect(emitTypingStop).toHaveBeenCalledWith(3);
  });
});
// File upload error -> alert (line 304)
describe("file upload error (line 304)", () => {
  beforeEach(() => { vi.spyOn(window, "alert").mockImplementation(() => {}); });
  afterEach(() => { vi.restoreAllMocks(); });

  test("shows alert when the upload request fails", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "File too large" }),
    });

    render(<MessageInput channelId={1} channelName="general" />);

    const fileInput = document.querySelector("input[type='file']");
    const file = new File(["data"], "big.pdf", { type: "application/pdf" });
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
    fireEvent.change(fileInput);

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(expect.stringContaining("Upload error"));
    });
  });
});
// File remove button (line 442)
describe("file remove button (line 442)", () => {
  test("removes the file preview when remove attachment is clicked", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: "/uploads/doc.pdf", type: "document", name: "doc.pdf" }),
    });

    render(<MessageInput channelId={1} channelName="general" />);

    const fileInput = document.querySelector("input[type='file']");
    const file = new File(["data"], "doc.pdf", { type: "application/pdf" });
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
    fireEvent.change(fileInput);

    await waitFor(() => expect(screen.getByText("doc.pdf")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Remove attachment" }));

    expect(screen.queryByText("doc.pdf")).not.toBeInTheDocument();
  });
});
