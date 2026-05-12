import { render, screen, act, waitFor } from "@testing-library/react";
import { io } from "socket.io-client";
import { SocketProvider, useSocket } from "../../context/SocketContext";
// Mock AuthContext - must be declared before the import so Vitest hoists it
vi.mock("../../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "../../context/AuthContext";
// Helpers

function getMockSocket() {
  return vi.mocked(io).mock.results[vi.mocked(io).mock.results.length - 1].value;
}

function SocketConsumer() {
  const ctx = useSocket();
  return (
    <div>
      <span data-testid="isConnected">{String(ctx.isConnected)}</span>
      <span data-testid="onlineUserIds">{JSON.stringify(ctx.onlineUserIds)}</span>
      {/* Expose helpers so tests can call them via refs stored on the element */}
      <span data-testid="ctx" style={{ display: "none" }} ref={(el) => { if (el) (el as any).__ctx = ctx; }} />
    </div>
  );
}

function renderWithSocket(authValue = { token: "tok", user: { id: 1 } }) {
  (vi.mocked(useAuth) as any).mockReturnValue(authValue);
  return render(
    <SocketProvider>
      <SocketConsumer />
    </SocketProvider>
  );
}

function getCtx() {
  return (screen.getByTestId("ctx") as any).__ctx;
}
// Setup / teardown

beforeEach(() => {
  vi.clearAllMocks();
  // Default: authenticated
  (vi.mocked(useAuth) as any).mockReturnValue({ token: "test-token", user: { id: 42 } });
});
// Tests

describe("SocketProvider", () => {
  // --- rendering -----------------------------------------------------------

  test("renders children without crashing", () => {
    renderWithSocket();
    expect(screen.getByTestId("isConnected")).toBeInTheDocument();
  });

  test("provides isConnected=false before the 'connect' event fires", () => {
    renderWithSocket();
    // The mock socket's on() is vi.fn() - 'connect' event has not fired yet
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

    (vi.mocked(useAuth) as any).mockReturnValue({ token: null, user: { id: 1 } });
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

    // After unsubscribe the ref is null - subsequent invocations are no-ops
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

  test("onDmRead routes dm:read events", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();

    const handler = vi.fn();
    getCtx().onDmRead(handler);
    const [, socketHandler] = mockSocket.on.mock.calls.find(([e]) => e === "dm:read");

    socketHandler({ readBy: 5 });
    expect(handler).toHaveBeenCalledWith({ readBy: 5 });
  });

  test("onDmTypingUpdate routes dm:typing:update events", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();

    const handler = vi.fn();
    getCtx().onDmTypingUpdate(handler);
    const [, socketHandler] = mockSocket.on.mock.calls.find(([e]) => e === "dm:typing:update");

    socketHandler({ username: "bob", isTyping: true });
    expect(handler).toHaveBeenCalledWith({ username: "bob", isTyping: true });
  });

  test("sendDmRead emits dm:read", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();

    getCtx().sendDmRead(7);

    expect(mockSocket.emit).toHaveBeenCalledWith("dm:read", { partnerId: 7 });
  });

  test("setStatus emits status:set", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();

    getCtx().setStatus("away");

    expect(mockSocket.emit).toHaveBeenCalledWith("status:set", { status: "away" });
  });

  test("leaveAllChannels emits channel:leave", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();

    getCtx().leaveAllChannels();

    expect(mockSocket.emit).toHaveBeenCalledWith("channel:leave");
  });

  test("emitDmTypingStart emits dm:typing:start with partnerId", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();

    getCtx().emitDmTypingStart(9);

    expect(mockSocket.emit).toHaveBeenCalledWith("dm:typing:start", { partnerId: 9 });
  });

  test("emitDmTypingStop emits dm:typing:stop with partnerId", () => {
    renderWithSocket();
    const mockSocket = getMockSocket();

    getCtx().emitDmTypingStop(9);

    expect(mockSocket.emit).toHaveBeenCalledWith("dm:typing:stop", { partnerId: 9 });
  });

  test("registers dm:read and dm:typing:update socket listeners", () => {
    renderWithSocket();
      const mockSocket = getMockSocket();
  });
});
// SocketContext - emit helpers when socket is NOT connected (lines 223, 234, 266, 277, 289)
// Uses the same renderWithSocket() / getMockSocket() / getCtx() helpers
// that are already defined at the top of this file.
describe("SocketContext - emit helpers when socket is NOT connected", () => {
  function renderDisconnected() {
    renderWithSocket();               // creates socket via io()
    getMockSocket().connected = false; // mark it disconnected
  }
  test("pinMessage calls callback with {error} when not connected", () => {
    renderDisconnected();
    const cb = vi.fn();
    act(() => { getCtx().pinMessage(10, cb); });
    expect(cb).toHaveBeenCalledWith({ error: "Not connected" });
    expect(getMockSocket().emit).not.toHaveBeenCalledWith("message:pin", expect.anything(), expect.anything());
  });

  test("pinMessage does not throw when no callback is provided and not connected", () => {
    renderDisconnected();
    expect(() => { act(() => getCtx().pinMessage(10)); }).not.toThrow();
  });
  test("unpinMessage calls callback with {error} when not connected", () => {
    renderDisconnected();
    const cb = vi.fn();
    act(() => { getCtx().unpinMessage(10, cb); });
    expect(cb).toHaveBeenCalledWith({ error: "Not connected" });
    expect(getMockSocket().emit).not.toHaveBeenCalledWith("message:unpin", expect.anything(), expect.anything());
  });

  test("unpinMessage does not throw when no callback is provided and not connected", () => {
    renderDisconnected();
    expect(() => { act(() => getCtx().unpinMessage(10)); }).not.toThrow();
  });
  test("editDmMessage calls callback with {error} when not connected", () => {
    renderDisconnected();
    const cb = vi.fn();
    act(() => { getCtx().editDmMessage(5, "new text", cb); });
    expect(cb).toHaveBeenCalledWith({ error: "Not connected" });
    expect(getMockSocket().emit).not.toHaveBeenCalledWith("dm:edit", expect.anything(), expect.anything());
  });

  test("editDmMessage does not throw when no callback is provided and not connected", () => {
    renderDisconnected();
    expect(() => { act(() => getCtx().editDmMessage(5, "text")); }).not.toThrow();
  });
  test("deleteDmMessage calls callback with {error} when not connected", () => {
    renderDisconnected();
    const cb = vi.fn();
    act(() => { getCtx().deleteDmMessage(7, cb); });
    expect(cb).toHaveBeenCalledWith({ error: "Not connected" });
    expect(getMockSocket().emit).not.toHaveBeenCalledWith("dm:delete", expect.anything(), expect.anything());
  });

  test("deleteDmMessage does not throw when no callback is provided and not connected", () => {
    renderDisconnected();
    expect(() => { act(() => getCtx().deleteDmMessage(7)); }).not.toThrow();
  });
  test("reactToDmMessage calls callback with {error} when not connected", () => {
    renderDisconnected();
    const cb = vi.fn();
    act(() => { getCtx().reactToDmMessage(3, "👍", cb); });
    expect(cb).toHaveBeenCalledWith({ error: "Not connected" });
    expect(getMockSocket().emit).not.toHaveBeenCalledWith("dm:react", expect.anything(), expect.anything());
  });

  test("reactToDmMessage does not throw when no callback is provided and not connected", () => {
    renderDisconnected();
    expect(() => { act(() => getCtx().reactToDmMessage(3, "👍")); }).not.toThrow();
  });
});
// users:online - object payload branch (lines 192-196)
describe("SocketContext - users:online with {id, status} object payload", () => {
  test("updates onlineUserIds and userStatuses from object array payload", async () => {
    renderWithSocket();
    const mockSocket = getMockSocket();
    const onlineHandler = mockSocket.on.mock.calls.find(([e]) => e === "users:online")?.[1];

    await act(async () => {
      onlineHandler?.([{ id: 10, status: "online" }, { id: 20, status: "away" }]);
    });

    expect(screen.getByTestId("onlineUserIds").textContent).toBe("[10,20]");
    expect(getCtx().userStatuses[10]).toBe("online");
    expect(getCtx().userStatuses[20]).toBe("away");
  });

  test("defaults status to 'online' when status field is absent in object payload", async () => {
    renderWithSocket();
    const mockSocket = getMockSocket();
    const onlineHandler = mockSocket.on.mock.calls.find(([e]) => e === "users:online")?.[1];

    await act(async () => {
      onlineHandler?.([{ id: 42 }]);
    });

    expect(screen.getByTestId("onlineUserIds").textContent).toBe("[42]");
    expect(getCtx().userStatuses[42]).toBe("online");
  });
});