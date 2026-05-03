/**
 * @fileoverview Tests for SocketContext (SocketProvider + useSocket)
 * Covers: provider renders children, connection lifecycle, emit helpers (connected
 * and disconnected), event subscription / unsubscribe helpers, and the guard that
 * throws when useSocket is called outside a provider.
 */

import { render, screen, act, waitFor } from "@testing-library/react";
import { io } from "socket.io-client";
import { SocketProvider, useSocket } from "../../context/SocketContext";

// ---------------------------------------------------------------------------
// Mock AuthContext — must be declared before the import so Vitest hoists it
// ---------------------------------------------------------------------------
vi.mock("../../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "../../context/AuthContext";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the mock socket instance created by the most recent io() call. */
function getMockSocket() {
  return io.mock.results[io.mock.results.length - 1].value;
}

/**
 * Minimal child that reads every value from the socket context and exposes
 * them through data-testid attributes so tests can assert on them.
 */
function SocketConsumer() {
  const ctx = useSocket();
  return (
    <div>
      <span data-testid="isConnected">{String(ctx.isConnected)}</span>
      <span data-testid="onlineUserIds">{JSON.stringify(ctx.onlineUserIds)}</span>
      {/* Expose helpers so tests can call them via refs stored on the element */}
      <span data-testid="ctx" style={{ display: "none" }} ref={(el) => { if (el) el.__ctx = ctx; }} />
    </div>
  );
}

/** Convenience wrapper that provides both AuthContext mock and SocketProvider. */
function renderWithSocket(authValue = { token: "tok", user: { id: 1 } }) {
  useAuth.mockReturnValue(authValue);
  return render(
    <SocketProvider>
      <SocketConsumer />
    </SocketProvider>
  );
}

/** Retrieve the context object stored by SocketConsumer. */
function getCtx() {
  return screen.getByTestId("ctx").__ctx;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Default: authenticated
  useAuth.mockReturnValue({ token: "test-token", user: { id: 42 } });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SocketProvider", () => {
  // --- rendering -----------------------------------------------------------

  test("renders children without crashing", () => {
    renderWithSocket();
    expect(screen.getByTestId("isConnected")).toBeInTheDocument();
  });

  test("provides isConnected=false before the 'connect' event fires", () => {
    renderWithSocket();
    // The mock socket's on() is vi.fn() — 'connect' event has not fired yet
    expect(screen.getByTestId("isConnected").textContent).toBe("false");
  });

  test("provides onlineUserIds as an empty array initially", () => {
    renderWithSocket();
    expect(screen.getByTestId("onlineUserIds").textContent).toBe("[]");
  });

  // --- connection lifecycle ------------------------------------------------

  test("calls io() with the correct URL and auth token when authenticated", () => {
    renderWithSocket({ token: "my-token", user: { id: 7 } });
    expect(io).toHaveBeenCalledWith(
      "http://localhost:4000",
      expect.objectContaining({ auth: { token: "my-token" } })
    );
  });

  test("registers socket event listeners on connect", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();
    const registeredEvents = mockSocket.on.mock.calls.map(([event]) => event);
    expect(registeredEvents).toContain("connect");
    expect(registeredEvents).toContain("disconnect");
    expect(registeredEvents).toContain("connect_error");
    expect(registeredEvents).toContain("users:online");
  });

  test("registers all channel and DM event listeners", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();
    const registeredEvents = mockSocket.on.mock.calls.map(([event]) => event);
    const expected = [
      "message:new",
      "typing:update",
      "message:edited",
      "message:deleted",
      "message:reacted",
      "channel:notification",
      "message:pinned",
      "message:unpinned",
      "user:mentioned",
      "dm:new",
      "dm:edited",
      "dm:deleted",
      "dm:reacted",
    ];
    for (const evt of expected) {
      expect(registeredEvents).toContain(evt);
    }
  });

  test("isConnected becomes true after 'connect' event fires", async () => {
    renderWithSocket();
    const mockSocket = getMockSocket();
    // Find and invoke the 'connect' handler registered by SocketProvider
    const connectCall = mockSocket.on.mock.calls.find(([evt]) => evt === "connect");
    expect(connectCall).toBeTruthy();

    await act(async () => {
      connectCall[1](); // invoke the connect handler
    });

    expect(screen.getByTestId("isConnected").textContent).toBe("true");
  });

  test("isConnected becomes false after 'disconnect' event fires", async () => {
    renderWithSocket();
    const mockSocket = getMockSocket();

    // First connect
    const connectHandler = mockSocket.on.mock.calls.find(([e]) => e === "connect")?.[1];
    await act(async () => { connectHandler?.(); });

    // Then disconnect
    const disconnectHandler = mockSocket.on.mock.calls.find(([e]) => e === "disconnect")?.[1];
    await act(async () => { disconnectHandler?.(); });

    expect(screen.getByTestId("isConnected").textContent).toBe("false");
  });

  test("onlineUserIds is updated when 'users:online' fires", async () => {
    renderWithSocket();
    const mockSocket = getMockSocket();
    const onlineHandler = mockSocket.on.mock.calls.find(([e]) => e === "users:online")?.[1];

    await act(async () => { onlineHandler?.([10, 20, 30]); });

    expect(screen.getByTestId("onlineUserIds").textContent).toBe("[10,20,30]");
  });

  test("does NOT call io() when token is null", () => {
    renderWithSocket({ token: null, user: { id: 1 } });
    expect(io).not.toHaveBeenCalled();
  });

  test("does NOT call io() when user is null", () => {
    renderWithSocket({ token: "tok", user: null });
    expect(io).not.toHaveBeenCalled();
  });

  test("calls socket.disconnect() when token becomes null after connection", async () => {
    const { rerender } = renderWithSocket({ token: "tok", user: { id: 1 } });
    const mockSocket = getMockSocket();

    useAuth.mockReturnValue({ token: null, user: { id: 1 } });
    await act(async () => {
      rerender(
        <SocketProvider>
          <SocketConsumer />
        </SocketProvider>
      );
    });

    expect(mockSocket.disconnect).toHaveBeenCalled();
    expect(screen.getByTestId("isConnected").textContent).toBe("false");
  });

  // --- emit helpers (connected) -------------------------------------------

  test("sendMessage emits 'message:send' with correct payload when connected", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();
    mockSocket.connected = true;

    const cb = vi.fn();
    getCtx().sendMessage(1, "hello", null, null, null, null, cb);

    expect(mockSocket.emit).toHaveBeenCalledWith(
      "message:send",
      { channelId: 1, content: "hello", replyToId: null, fileUrl: null, fileType: null, fileName: null },
      cb
    );
  });

  test("editMessage emits 'message:edit' when connected", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();
    mockSocket.connected = true;

    const cb = vi.fn();
    getCtx().editMessage(99, "updated", cb);

    expect(mockSocket.emit).toHaveBeenCalledWith("message:edit", { messageId: 99, content: "updated" }, cb);
  });

  test("deleteMessage emits 'message:delete' when connected", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();
    mockSocket.connected = true;

    const cb = vi.fn();
    getCtx().deleteMessage(55, cb);

    expect(mockSocket.emit).toHaveBeenCalledWith("message:delete", { messageId: 55 }, cb);
  });

  test("reactToMessage emits 'message:react' when connected", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();
    mockSocket.connected = true;

    const cb = vi.fn();
    getCtx().reactToMessage(12, "👍", cb);

    expect(mockSocket.emit).toHaveBeenCalledWith("message:react", { messageId: 12, emoji: "👍" }, cb);
  });

  test("pinMessage emits 'message:pin' when connected", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();
    mockSocket.connected = true;

    const cb = vi.fn();
    getCtx().pinMessage(7, cb);

    expect(mockSocket.emit).toHaveBeenCalledWith("message:pin", { messageId: 7 }, cb);
  });

  test("unpinMessage emits 'message:unpin' when connected", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();
    mockSocket.connected = true;

    const cb = vi.fn();
    getCtx().unpinMessage(8, cb);

    expect(mockSocket.emit).toHaveBeenCalledWith("message:unpin", { messageId: 8 }, cb);
  });

  test("sendDm emits 'dm:send' when connected", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();
    mockSocket.connected = true;

    const cb = vi.fn();
    getCtx().sendDm(5, "hey", null, null, null, null, cb);

    expect(mockSocket.emit).toHaveBeenCalledWith(
      "dm:send",
      { receiverId: 5, content: "hey", fileUrl: null, fileType: null, fileName: null, replyToId: null },
      cb
    );
  });

  test("editDmMessage emits 'dm:edit' when connected", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();
    mockSocket.connected = true;

    const cb = vi.fn();
    getCtx().editDmMessage(20, "edited dm", cb);

    expect(mockSocket.emit).toHaveBeenCalledWith("dm:edit", { messageId: 20, content: "edited dm" }, cb);
  });

  test("deleteDmMessage emits 'dm:delete' when connected", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();
    mockSocket.connected = true;

    const cb = vi.fn();
    getCtx().deleteDmMessage(21, cb);

    expect(mockSocket.emit).toHaveBeenCalledWith("dm:delete", { messageId: 21 }, cb);
  });

  test("reactToDmMessage emits 'dm:react' when connected", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();
    mockSocket.connected = true;

    const cb = vi.fn();
    getCtx().reactToDmMessage(22, "❤️", cb);

    expect(mockSocket.emit).toHaveBeenCalledWith("dm:react", { messageId: 22, emoji: "❤️" }, cb);
  });

  test("emitTypingStart emits 'typing:start'", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();

    getCtx().emitTypingStart(3);

    expect(mockSocket.emit).toHaveBeenCalledWith("typing:start", { channelId: 3 });
  });

  test("emitTypingStop emits 'typing:stop'", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();

    getCtx().emitTypingStop(3);

    expect(mockSocket.emit).toHaveBeenCalledWith("typing:stop", { channelId: 3 });
  });

  test("joinChannel emits 'channel:join'", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();

    getCtx().joinChannel(4);

    expect(mockSocket.emit).toHaveBeenCalledWith("channel:join", 4);
  });

  // --- emit helpers (disconnected) -----------------------------------------

  test("sendMessage calls callback with { error: 'Not connected' } when socket is disconnected", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();
    mockSocket.connected = false;

    const cb = vi.fn();
    getCtx().sendMessage(1, "hello", null, null, null, null, cb);

    expect(cb).toHaveBeenCalledWith({ error: "Not connected" });
    expect(mockSocket.emit).not.toHaveBeenCalledWith("message:send", expect.anything(), expect.anything());
  });

  test("editMessage calls callback with error when disconnected", () => {
    renderWithSocket();
    getMockSocket().connected = false;

    const cb = vi.fn();
    getCtx().editMessage(1, "x", cb);

    expect(cb).toHaveBeenCalledWith({ error: "Not connected" });
  });

  test("deleteMessage calls callback with error when disconnected", () => {
    renderWithSocket();
    getMockSocket().connected = false;

    const cb = vi.fn();
    getCtx().deleteMessage(1, cb);

    expect(cb).toHaveBeenCalledWith({ error: "Not connected" });
  });

  test("reactToMessage calls callback with error when disconnected", () => {
    renderWithSocket();
    getMockSocket().connected = false;

    const cb = vi.fn();
    getCtx().reactToMessage(1, "👍", cb);

    expect(cb).toHaveBeenCalledWith({ error: "Not connected" });
  });

  test("sendDm calls callback with error when disconnected", () => {
    renderWithSocket();
    getMockSocket().connected = false;

    const cb = vi.fn();
    getCtx().sendDm(5, "hey", null, null, null, null, cb);

    expect(cb).toHaveBeenCalledWith({ error: "Not connected" });
  });

  test("emit helpers do not throw when callback is omitted and socket is disconnected", () => {
    renderWithSocket();
    getMockSocket().connected = false;

    // Should not throw even though no callback was supplied
    expect(() => getCtx().sendMessage(1, "x")).not.toThrow();
    expect(() => getCtx().editMessage(1, "x")).not.toThrow();
    expect(() => getCtx().deleteMessage(1)).not.toThrow();
  });

  // --- event subscriptions -------------------------------------------------

  test("onNewMessage stores handler and returns an unsubscribe function", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();

    const handler = vi.fn();
    const unsub = getCtx().onNewMessage(handler);

    // Find the 'message:new' wrapper registered on the socket
    const [, socketHandler] = mockSocket.on.mock.calls.find(([e]) => e === "message:new");
    socketHandler({ id: 1, content: "hi" });

    expect(handler).toHaveBeenCalledWith({ id: 1, content: "hi" });

    // After unsubscribe the ref is null — subsequent invocations are no-ops
    unsub();
    socketHandler({ id: 2, content: "after unsub" });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("onTypingUpdate stores handler and unsubscribe clears it", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();

    const handler = vi.fn();
    const unsub = getCtx().onTypingUpdate(handler);
    const [, socketHandler] = mockSocket.on.mock.calls.find(([e]) => e === "typing:update");

    socketHandler({ username: "bob", isTyping: true });
    expect(handler).toHaveBeenCalledWith({ username: "bob", isTyping: true });

    unsub();
    socketHandler({ username: "bob", isTyping: false });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("onNewDm stores handler and receives dm:new events", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();

    const handler = vi.fn();
    getCtx().onNewDm(handler);
    const [, socketHandler] = mockSocket.on.mock.calls.find(([e]) => e === "dm:new");

    socketHandler({ id: 99, content: "dm!" });
    expect(handler).toHaveBeenCalledWith({ id: 99, content: "dm!" });
  });

  test("onMessageEdited routes message:edited events to the registered handler", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();

    const handler = vi.fn();
    getCtx().onMessageEdited(handler);
    const [, socketHandler] = mockSocket.on.mock.calls.find(([e]) => e === "message:edited");

    socketHandler({ id: 5, content: "edited" });
    expect(handler).toHaveBeenCalledWith({ id: 5, content: "edited" });
  });

  test("onMessageDeleted routes message:deleted events to the registered handler", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();

    const handler = vi.fn();
    getCtx().onMessageDeleted(handler);
    const [, socketHandler] = mockSocket.on.mock.calls.find(([e]) => e === "message:deleted");

    socketHandler({ messageId: 3, channelId: 1 });
    expect(handler).toHaveBeenCalledWith({ messageId: 3, channelId: 1 });
  });

  test("onMessageReacted routes message:reacted events", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();

    const handler = vi.fn();
    getCtx().onMessageReacted(handler);
    const [, socketHandler] = mockSocket.on.mock.calls.find(([e]) => e === "message:reacted");

    socketHandler({ messageId: 4, reactions: [] });
    expect(handler).toHaveBeenCalledWith({ messageId: 4, reactions: [] });
  });

  test("onChannelNotify routes channel:notification events", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();

    const handler = vi.fn();
    getCtx().onChannelNotify(handler);
    const [, socketHandler] = mockSocket.on.mock.calls.find(([e]) => e === "channel:notification");

    socketHandler({ channelId: 2 });
    expect(handler).toHaveBeenCalledWith({ channelId: 2 });
  });

  test("onMessagePinned routes message:pinned events", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();

    const handler = vi.fn();
    getCtx().onMessagePinned(handler);
    const [, socketHandler] = mockSocket.on.mock.calls.find(([e]) => e === "message:pinned");

    socketHandler({ id: 6 });
    expect(handler).toHaveBeenCalledWith({ id: 6 });
  });

  test("onMessageUnpinned routes message:unpinned events", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();

    const handler = vi.fn();
    getCtx().onMessageUnpinned(handler);
    const [, socketHandler] = mockSocket.on.mock.calls.find(([e]) => e === "message:unpinned");

    socketHandler({ messageId: 7 });
    expect(handler).toHaveBeenCalledWith({ messageId: 7 });
  });

  test("onUserMentioned routes user:mentioned events", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();

    const handler = vi.fn();
    getCtx().onUserMentioned(handler);
    const [, socketHandler] = mockSocket.on.mock.calls.find(([e]) => e === "user:mentioned");

    socketHandler({ message: "hi", mentionedBy: "alice", channelId: 1 });
    expect(handler).toHaveBeenCalledWith({ message: "hi", mentionedBy: "alice", channelId: 1 });
  });

  test("onDmEdited routes dm:edited events", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();

    const handler = vi.fn();
    getCtx().onDmEdited(handler);
    const [, socketHandler] = mockSocket.on.mock.calls.find(([e]) => e === "dm:edited");

    socketHandler({ id: 50, content: "edited dm" });
    expect(handler).toHaveBeenCalledWith({ id: 50, content: "edited dm" });
  });

  test("onDmDeleted routes dm:deleted events", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();

    const handler = vi.fn();
    getCtx().onDmDeleted(handler);
    const [, socketHandler] = mockSocket.on.mock.calls.find(([e]) => e === "dm:deleted");

    socketHandler({ messageId: 51 });
    expect(handler).toHaveBeenCalledWith({ messageId: 51 });
  });

  test("onDmReacted routes dm:reacted events", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();

    const handler = vi.fn();
    getCtx().onDmReacted(handler);
    const [, socketHandler] = mockSocket.on.mock.calls.find(([e]) => e === "dm:reacted");

    socketHandler({ messageId: 52, reactions: ["❤️"] });
    expect(handler).toHaveBeenCalledWith({ messageId: 52, reactions: ["❤️"] });
  });
});

// ---------------------------------------------------------------------------
// useSocket outside provider
// ---------------------------------------------------------------------------

describe("useSocket", () => {
  test("throws 'useSocket must be used inside SocketProvider' when called outside the provider", () => {
    function BareConsumer() {
      useSocket();
      return null;
    }

    // React will log an uncaught error; suppress it for this test
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<BareConsumer />)).toThrow(
      "useSocket must be used inside SocketProvider"
    );
    spy.mockRestore();
  });
});
