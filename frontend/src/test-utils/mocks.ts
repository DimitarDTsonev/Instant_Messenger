import { vi } from "vitest";
import type { AuthUser, Message, Conversation } from "../types";
import type { SocketContextValue } from "../context/socketTypes";

/**
 * Factory functions for creating properly-typed mock data in tests.
 * These ensure all required fields are included to satisfy TypeScript's type requirements.
 */

export function createMockAuthUser(overrides?: Partial<AuthUser>): AuthUser {
  return {
    id: 1,
    username: "alice",
    email: "alice@example.com",
    role: "admin",
    avatar: "AL",
    ...overrides,
  };
}

export function createMockMessage(overrides?: Partial<Message>): Message {
  return {
    id: 1,
    content: "Hello world",
    created_at: "2024-01-15T10:00:00.000Z",
    user_id: 2,
    username: "bob",
    avatar: "BO",
    role: "user",
    reactions: {},
    is_edited: 0,
    is_pinned: 0,
    reply_to_id: null,
    file_url: null,
    file_type: null,
    file_name: null,
    file_size: null,
    ...overrides,
  };
}

export function createMockConversation(overrides?: Partial<Conversation>): Conversation {
  return {
    partner_id: 2,
    partner_username: "bob",
    partner_avatar: "BO",
    last_content: "last message",
    last_at: "2024-01-15T10:00:00.000Z",
    unread_count: 0,
    ...overrides,
  };
}

export function createMockSocketContext(overrides?: Partial<SocketContextValue>): SocketContextValue {
  return {
    socket: null,
    isConnected: true,
    onlineUserIds: [1],
    userStatuses: {},
    setStatus: vi.fn(),
    joinChannel: vi.fn(),
    sendMessage: vi.fn(),
    editMessage: vi.fn(),
    deleteMessage: vi.fn(),
    reactToMessage: vi.fn(),
    pinMessage: vi.fn(),
    unpinMessage: vi.fn(),
    sendDm: vi.fn(),
    editDmMessage: vi.fn(),
    deleteDmMessage: vi.fn(),
    reactToDmMessage: vi.fn(),
    sendDmRead: vi.fn(),
    emitTypingStart: vi.fn(),
    emitTypingStop: vi.fn(),
    leaveAllChannels: vi.fn(),
    emitDmTypingStart: vi.fn(),
    emitDmTypingStop: vi.fn(),
    onNewMessage: vi.fn(() => vi.fn()),
    onTypingUpdate: vi.fn(() => vi.fn()),
    onMessageEdited: vi.fn(() => vi.fn()),
    onMessageDeleted: vi.fn(() => vi.fn()),
    onMessageReacted: vi.fn(() => vi.fn()),
    onChannelNotify: vi.fn(() => vi.fn()),
    onMessagePinned: vi.fn(() => vi.fn()),
    onMessageUnpinned: vi.fn(() => vi.fn()),
    onUserMentioned: vi.fn(() => vi.fn()),
    onNewDm: vi.fn(() => vi.fn()),
    onDmEdited: vi.fn(() => vi.fn()),
    onDmDeleted: vi.fn(() => vi.fn()),
    onDmReacted: vi.fn(() => vi.fn()),
    onDmRead: vi.fn(() => vi.fn()),
    onDmTypingUpdate: vi.fn(() => vi.fn()),
    ...overrides,
  };
}

/**
 * Create a fetch mock that returns a properly-typed Response-like object.
 * Returns a mock that satisfies the Response interface for TypeScript.
 */
export function createMockFetch(
  ok = true,
  body: Record<string, unknown> = { success: true }
): typeof fetch {
  return vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status: ok ? 200 : 400,
        statusText: ok ? "OK" : "Bad Request",
        headers: { "Content-Type": "application/json" },
      })
    )
  );
}
