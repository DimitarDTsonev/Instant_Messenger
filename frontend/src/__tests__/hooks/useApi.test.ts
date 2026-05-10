/**
 * @fileoverview Tests for all hooks in useApi.ts
 * Uses renderHook + a mocked useAuth (authFetch) to verify state transitions.
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useChannels,
  useMessages,
  useUsers,
  useDm,
  useConversations,
  usePinnedMessages,
  useUserSearch,
  useGlobalSearch,
  useChannelMembers,
  useChannelPermissions,
  useChannelInvites,
  useSearch,
} from "../../hooks/useApi";

// ── Mock useAuth ──────────────────────────────────────────────────────────────

vi.mock("../../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "../../context/AuthContext";

function setupAuthFetch(impl) {
  useAuth.mockReturnValue({ authFetch: impl });
}

// ── useChannels ───────────────────────────────────────────────────────────────

describe("useChannels", () => {
  test("fetches channels on mount", async () => {
    const channels = [{ id: 1, name: "general" }];
    setupAuthFetch(vi.fn().mockResolvedValue({ channels }));

    const { result } = renderHook(() => useChannels());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.channels).toEqual(channels);
  });

  test("loading starts true and becomes false after fetch", async () => {
    setupAuthFetch(vi.fn().mockResolvedValue({ channels: [] }));
    const { result } = renderHook(() => useChannels());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  test("createChannel appends channel sorted", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ channels: [{ id: 1, name: "general" }] })
      .mockResolvedValueOnce({ channel: { id: 2, name: "alpha" } });
    setupAuthFetch(mockFetch);

    const { result } = renderHook(() => useChannels());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createChannel("alpha");
    });

    expect(result.current.channels[0].name).toBe("alpha");
    expect(result.current.channels[1].name).toBe("general");
  });

  test("updateChannel merges updated fields", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ channels: [{ id: 1, name: "ch", description: "old" }] })
      .mockResolvedValueOnce({ channel: { id: 1, name: "ch", description: "new" } });
    setupAuthFetch(mockFetch);

    const { result } = renderHook(() => useChannels());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.updateChannel(1, { description: "new" }); });
    expect(result.current.channels[0].description).toBe("new");
  });

  test("deleteChannel removes the channel from list", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ channels: [{ id: 1, name: "ch" }] })
      .mockResolvedValueOnce({ success: true });
    setupAuthFetch(mockFetch);

    const { result } = renderHook(() => useChannels());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.deleteChannel(1); });
    expect(result.current.channels).toHaveLength(0);
  });

  test("handles fetch error gracefully", async () => {
    setupAuthFetch(vi.fn().mockRejectedValue(new Error("Network error")));
    const { result } = renderHook(() => useChannels());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.channels).toEqual([]);
  });

  test("reload re-fetches channels", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ channels: [] })
      .mockResolvedValueOnce({ channels: [{ id: 1, name: "new-ch" }] });
    setupAuthFetch(mockFetch);

    const { result } = renderHook(() => useChannels());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.reload(); });
    expect(result.current.channels).toHaveLength(1);
  });
});

// ── useMessages ───────────────────────────────────────────────────────────────

describe("useMessages", () => {
  test("fetches messages when channelId is provided", async () => {
    const msgs = [{ id: 1, content: "hello" }];
    setupAuthFetch(vi.fn().mockResolvedValue({ messages: msgs, hasMore: false }));
    const { result } = renderHook(() => useMessages(1));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.messages).toEqual(msgs);
    expect(result.current.hasMore).toBe(false);
  });

  test("clears messages when channelId is null", async () => {
    setupAuthFetch(vi.fn());
    const { result } = renderHook(() => useMessages(null));
    expect(result.current.messages).toEqual([]);
  });

  test("addMessage appends to list", async () => {
    setupAuthFetch(vi.fn().mockResolvedValue({ messages: [], hasMore: false }));
    const { result } = renderHook(() => useMessages(1));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { result.current.addMessage({ id: 5, content: "new" }); });
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe("new");
  });

  test("updateMessage merges partial into matching message", async () => {
    setupAuthFetch(vi.fn().mockResolvedValue({
      messages: [{ id: 1, content: "old", is_edited: 0 }], hasMore: false,
    }));
    const { result } = renderHook(() => useMessages(1));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { result.current.updateMessage({ id: 1, content: "edited", is_edited: 1 }); });
    expect(result.current.messages[0].content).toBe("edited");
    expect(result.current.messages[0].is_edited).toBe(1);
  });

  test("updateMessage leaves non-matching messages unchanged", async () => {
    setupAuthFetch(vi.fn().mockResolvedValue({
      messages: [{ id: 1, content: "old" }, { id: 2, content: "keep" }],
      hasMore: false,
    }));
    const { result } = renderHook(() => useMessages(1));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { result.current.updateMessage({ id: 1, content: "edited" }); });
    expect(result.current.messages[1].content).toBe("keep");
  });

  test("removeMessage filters by id", async () => {
    setupAuthFetch(vi.fn().mockResolvedValue({
      messages: [{ id: 1, content: "keep" }, { id: 2, content: "delete" }], hasMore: false,
    }));
    const { result } = renderHook(() => useMessages(1));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { result.current.removeMessage(2); });
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].id).toBe(1);
  });

  test("loadMore does nothing when hasMore is false", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ messages: [], hasMore: false });
    setupAuthFetch(mockFetch);
    const { result } = renderHook(() => useMessages(1));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.loadMore(); });
    expect(mockFetch).toHaveBeenCalledTimes(1); // only the initial fetch
  });

  test("loadMore fetches older messages when hasMore is true", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ messages: [{ id: 5, content: "msg5" }], hasMore: true })
      .mockResolvedValueOnce({ messages: [{ id: 1, content: "older" }], hasMore: false });
    setupAuthFetch(mockFetch);
    const { result } = renderHook(() => useMessages(1));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    await act(async () => { result.current.loadMore(); });
    await waitFor(() => expect(result.current.messages[0].content).toBe("older"));
  });

  test("loadMore returns unchanged state when there are no messages", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ messages: [], hasMore: true });
    setupAuthFetch(mockFetch);
    const { result } = renderHook(() => useMessages(1));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    await act(async () => { result.current.loadMore(); });
    expect(result.current.messages).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ── useUsers ──────────────────────────────────────────────────────────────────

describe("useUsers", () => {
  test("fetches users on mount", async () => {
    const users = [{ id: 1, username: "alice" }];
    setupAuthFetch(vi.fn().mockResolvedValue({ users }));
    const { result } = renderHook(() => useUsers());
    await waitFor(() => expect(result.current.users).toEqual(users));
  });

  test("returns empty array on error", async () => {
    setupAuthFetch(vi.fn().mockRejectedValue(new Error("err")));
    const { result } = renderHook(() => useUsers());
    await waitFor(() => {}, { timeout: 200 });
    expect(result.current.users).toEqual([]);
  });
});

// ── useDm ─────────────────────────────────────────────────────────────────────

describe("useDm", () => {
  test("fetches DMs on mount when partnerId is provided", async () => {
    const dms = [{ id: 1, content: "hey" }];
    setupAuthFetch(vi.fn().mockResolvedValue({ messages: dms, hasMore: false, partner: { id: 2 } }));
    const { result } = renderHook(() => useDm(2));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.messages).toEqual(dms);
    expect(result.current.partner).toEqual({ id: 2 });
  });

  test("clears state when partnerId is null", async () => {
    setupAuthFetch(vi.fn());
    const { result } = renderHook(() => useDm(null));
    expect(result.current.messages).toEqual([]);
    expect(result.current.partner).toBeNull();
  });

  test("addMessage appends to DM list", async () => {
    setupAuthFetch(vi.fn().mockResolvedValue({ messages: [], hasMore: false, partner: null }));
    const { result } = renderHook(() => useDm(2));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { result.current.addMessage({ id: 99, content: "new dm" }); });
    expect(result.current.messages[0].content).toBe("new dm");
  });

  test("updateMessage merges partial", async () => {
    setupAuthFetch(vi.fn().mockResolvedValue({
      messages: [{ id: 1, content: "old" }], hasMore: false, partner: null,
    }));
    const { result } = renderHook(() => useDm(2));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { result.current.updateMessage({ id: 1, content: "edited" }); });
    expect(result.current.messages[0].content).toBe("edited");
  });

  test("updateMessage keeps non-matching DMs unchanged", async () => {
    setupAuthFetch(vi.fn().mockResolvedValue({
      messages: [{ id: 1, content: "old" }, { id: 2, content: "keep" }],
      hasMore: false,
      partner: null,
    }));
    const { result } = renderHook(() => useDm(2));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { result.current.updateMessage({ id: 1, content: "edited" }); });
    expect(result.current.messages[1].content).toBe("keep");
  });

  test("removeMessage removes by id", async () => {
    setupAuthFetch(vi.fn().mockResolvedValue({
      messages: [{ id: 1 }, { id: 2 }], hasMore: false, partner: null,
    }));
    const { result } = renderHook(() => useDm(2));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { result.current.removeMessage(1); });
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].id).toBe(2);
  });

  test("loadMore fetches older DMs when hasMore is true", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ messages: [{ id: 10 }], hasMore: true, partner: null })
      .mockResolvedValueOnce({ messages: [{ id: 5 }], hasMore: false });
    setupAuthFetch(mockFetch);
    const { result } = renderHook(() => useDm(2));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    await act(async () => { result.current.loadMore(); });
    await waitFor(() => expect(result.current.messages[0].id).toBe(5));
  });

  test("loadMore returns unchanged state when DM list is empty", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ messages: [], hasMore: true, partner: null });
    setupAuthFetch(mockFetch);
    const { result } = renderHook(() => useDm(2));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    await act(async () => { result.current.loadMore(); });
    expect(result.current.messages).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ── useConversations ──────────────────────────────────────────────────────────

describe("useConversations", () => {
  test("fetches conversations on mount", async () => {
    const convs = [{ partner_id: 2, last_content: "hi", unread_count: 1 }];
    setupAuthFetch(vi.fn().mockResolvedValue({ conversations: convs }));
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(result.current.conversations).toEqual(convs));
  });

  test("markRead zeros unread count for partner", async () => {
    setupAuthFetch(vi.fn().mockResolvedValue({
      conversations: [{ partner_id: 2, unread_count: 5 }],
    }));
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(result.current.conversations[0].unread_count).toBe(5));
    act(() => { result.current.markRead(2); });
    expect(result.current.conversations[0].unread_count).toBe(0);
  });

  test("markRead leaves other conversations unchanged", async () => {
    setupAuthFetch(vi.fn().mockResolvedValue({
      conversations: [
        { partner_id: 2, unread_count: 5 },
        { partner_id: 3, unread_count: 4 },
      ],
    }));
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(result.current.conversations).toHaveLength(2));
    act(() => { result.current.markRead(2); });
    expect(result.current.conversations[1].unread_count).toBe(4);
  });

  test("upsertConversation updates existing conversation", async () => {
    setupAuthFetch(vi.fn().mockResolvedValue({
      conversations: [{ partner_id: 2, last_content: "old", unread_count: 0 }],
    }));
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));
    act(() => {
      result.current.upsertConversation(
        { content: "new", created_at: new Date().toISOString() },
        2, "bob", "👤"
      );
    });
    expect(result.current.conversations[0].last_content).toBe("new");
    expect(result.current.conversations[0].unread_count).toBe(1);
  });

  test("upsertConversation can update existing conversation without incrementing unread", async () => {
    setupAuthFetch(vi.fn().mockResolvedValue({
      conversations: [{ partner_id: 2, last_content: "old", unread_count: 3 }],
    }));
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));
    act(() => {
      result.current.upsertConversation(
        { content: "new", created_at: new Date().toISOString() },
        2, "bob", "👤", false
      );
    });
    expect(result.current.conversations[0].unread_count).toBe(3);
  });

  test("upsertConversation prepends new conversation", async () => {
    setupAuthFetch(vi.fn().mockResolvedValue({ conversations: [] }));
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(result.current.conversations).toEqual([]));
    act(() => {
      result.current.upsertConversation(
        { content: "hello", created_at: new Date().toISOString() },
        99, "carol", "🦊"
      );
    });
    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.conversations[0].partner_id).toBe(99);
  });

  test("upsertConversation prepends new conversation without unread increment", async () => {
    setupAuthFetch(vi.fn().mockResolvedValue({ conversations: [] }));
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(result.current.conversations).toEqual([]));
    act(() => {
      result.current.upsertConversation(
        { content: "hello", created_at: new Date().toISOString() },
        99, "carol", null, false
      );
    });
    expect(result.current.conversations[0].unread_count).toBe(0);
    expect(result.current.conversations[0].partner_avatar).toBeNull();
  });

  test("handles fetch error gracefully", async () => {
    setupAuthFetch(vi.fn().mockRejectedValue(new Error("err")));
    const { result } = renderHook(() => useConversations());
    await waitFor(() => {}, { timeout: 300 });
    expect(result.current.conversations).toEqual([]);
  });
});

// ── usePinnedMessages ─────────────────────────────────────────────────────────

describe("usePinnedMessages", () => {
  test("fetches pinned messages when channelId is set", async () => {
    const msgs = [{ id: 3, content: "pinned" }];
    setupAuthFetch(vi.fn().mockResolvedValue({ messages: msgs }));
    const { result } = renderHook(() => usePinnedMessages(1));
    await waitFor(() => expect(result.current.pinnedMessages).toEqual(msgs));
  });

  test("defaults pinned messages to empty array when API omits messages", async () => {
    setupAuthFetch(vi.fn().mockResolvedValue({}));
    const { result } = renderHook(() => usePinnedMessages(1));
    await waitFor(() => expect(result.current.pinnedMessages).toEqual([]));
  });

  test("clears list when channelId is null", async () => {
    setupAuthFetch(vi.fn());
    const { result } = renderHook(() => usePinnedMessages(null));
    expect(result.current.pinnedMessages).toEqual([]);
  });

  test("addPinned appends message", async () => {
    setupAuthFetch(vi.fn().mockResolvedValue({ messages: [] }));
    const { result } = renderHook(() => usePinnedMessages(1));
    await waitFor(() => expect(result.current.pinnedMessages).toEqual([]));
    act(() => { result.current.addPinned({ id: 7, content: "new pin" }); });
    expect(result.current.pinnedMessages).toHaveLength(1);
  });

  test("addPinned does not add duplicates", async () => {
    setupAuthFetch(vi.fn().mockResolvedValue({ messages: [{ id: 7, content: "pin" }] }));
    const { result } = renderHook(() => usePinnedMessages(1));
    await waitFor(() => expect(result.current.pinnedMessages).toHaveLength(1));
    act(() => { result.current.addPinned({ id: 7, content: "pin" }); });
    expect(result.current.pinnedMessages).toHaveLength(1);
  });

  test("removePin removes by id", async () => {
    setupAuthFetch(vi.fn().mockResolvedValue({ messages: [{ id: 7 }, { id: 8 }] }));
    const { result } = renderHook(() => usePinnedMessages(1));
    await waitFor(() => expect(result.current.pinnedMessages).toHaveLength(2));
    act(() => { result.current.removePin(7); });
    expect(result.current.pinnedMessages).toHaveLength(1);
    expect(result.current.pinnedMessages[0].id).toBe(8);
  });
});

// ── useUserSearch ─────────────────────────────────────────────────────────────

describe("useUserSearch", () => {
  test("search returns users from API", async () => {
    setupAuthFetch(vi.fn().mockResolvedValue({ users: [{ id: 1, username: "alice" }] }));
    const { result } = renderHook(() => useUserSearch());
    await act(async () => { await result.current.search("ali"); });
    expect(result.current.results[0].username).toBe("alice");
    expect(result.current.loading).toBe(false);
  });

  test("search defaults results to empty array when API omits users", async () => {
    setupAuthFetch(vi.fn().mockResolvedValue({}));
    const { result } = renderHook(() => useUserSearch());
    await act(async () => { await result.current.search("ali"); });
    expect(result.current.results).toEqual([]);
  });

  test("empty query clears results without calling API", async () => {
    const mockFetch = vi.fn();
    setupAuthFetch(mockFetch);
    const { result } = renderHook(() => useUserSearch());
    await act(async () => { await result.current.search(""); });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.results).toEqual([]);
  });

  test("whitespace query clears results", async () => {
    const mockFetch = vi.fn();
    setupAuthFetch(mockFetch);
    const { result } = renderHook(() => useUserSearch());
    await act(async () => { await result.current.search("   "); });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("clear() empties the results", async () => {
    setupAuthFetch(vi.fn().mockResolvedValue({ users: [{ id: 1 }] }));
    const { result } = renderHook(() => useUserSearch());
    await act(async () => { await result.current.search("a"); });
    expect(result.current.results).toHaveLength(1);
    act(() => { result.current.clear(); });
    expect(result.current.results).toEqual([]);
  });

  test("handles search error gracefully", async () => {
    setupAuthFetch(vi.fn().mockRejectedValue(new Error("err")));
    const { result } = renderHook(() => useUserSearch());
    await act(async () => { await result.current.search("fail"); });
    expect(result.current.loading).toBe(false);
    expect(result.current.results).toEqual([]);
  });
});

// ── useGlobalSearch ───────────────────────────────────────────────────────────

describe("useGlobalSearch", () => {
  test("search with 2+ chars returns results and sets query", async () => {
    const results = [{ id: 1, content: "hello" }];
    setupAuthFetch(vi.fn().mockResolvedValue({ results }));
    const { result } = renderHook(() => useGlobalSearch());
    await act(async () => { await result.current.search("hi"); });
    expect(result.current.results).toEqual(results);
    expect(result.current.query).toBe("hi");
  });

  test("short query clears results but still sets query", async () => {
    const mockFetch = vi.fn();
    setupAuthFetch(mockFetch);
    const { result } = renderHook(() => useGlobalSearch());
    await act(async () => { await result.current.search("x"); });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.results).toEqual([]);
    expect(result.current.query).toBe("x");
  });

  test("clearSearch resets results and query", async () => {
    setupAuthFetch(vi.fn().mockResolvedValue({ results: [{ id: 1 }] }));
    const { result } = renderHook(() => useGlobalSearch());
    await act(async () => { await result.current.search("hello"); });
    act(() => { result.current.clearSearch(); });
    expect(result.current.results).toEqual([]);
    expect(result.current.query).toBe("");
  });
});

// ── useChannelMembers ─────────────────────────────────────────────────────────

describe("useChannelMembers", () => {
  test("fetches members on mount", async () => {
    const members = [{ id: 1, username: "alice" }];
    setupAuthFetch(vi.fn().mockResolvedValue({ members }));
    const { result } = renderHook(() => useChannelMembers(1));
    await waitFor(() => expect(result.current.members).toEqual(members));
  });

  test("clears members when channelId is null", async () => {
    setupAuthFetch(vi.fn());
    const { result } = renderHook(() => useChannelMembers(null));
    await waitFor(() => expect(result.current.members).toEqual([]));
  });

  test("addMember calls API and reloads", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ members: [] })
      .mockResolvedValueOnce({ user: { id: 5, username: "bob" }, success: true })
      .mockResolvedValueOnce({ members: [{ id: 5, username: "bob" }] });
    setupAuthFetch(mockFetch);
    const { result } = renderHook(() => useChannelMembers(1));
    await waitFor(() => expect(result.current.members).toEqual([]));
    await act(async () => { await result.current.addMember("bob"); });
    expect(result.current.members).toHaveLength(1);
  });

  test("removeMember filters member by id", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ members: [{ id: 1 }, { id: 2 }] })
      .mockResolvedValueOnce({ success: true });
    setupAuthFetch(mockFetch);
    const { result } = renderHook(() => useChannelMembers(1));
    await waitFor(() => expect(result.current.members).toHaveLength(2));
    await act(async () => { await result.current.removeMember(1); });
    expect(result.current.members).toHaveLength(1);
    expect(result.current.members[0].id).toBe(2);
  });

  test("changeRole updates member's channel_role", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ members: [{ id: 1, channel_role: "member" }] })
      .mockResolvedValueOnce({ success: true });
    setupAuthFetch(mockFetch);
    const { result } = renderHook(() => useChannelMembers(1));
    await waitFor(() => expect(result.current.members).toHaveLength(1));
    await act(async () => { await result.current.changeRole(1, "manager"); });
    expect(result.current.members[0].channel_role).toBe("manager");
  });
});

// ── useChannelPermissions ─────────────────────────────────────────────────────

describe("useChannelPermissions", () => {
  test("fetches permissions on mount", async () => {
    const perms = { manager: { can_write: 1 }, member: { can_write: 1 } };
    setupAuthFetch(vi.fn().mockResolvedValue({ permissions: perms }));
    const { result } = renderHook(() => useChannelPermissions(1));
    await waitFor(() => expect(result.current.permissions).toEqual(perms));
  });

  test("sets null when channelId is null", async () => {
    setupAuthFetch(vi.fn());
    const { result } = renderHook(() => useChannelPermissions(null));
    await waitFor(() => expect(result.current.permissions).toBeNull());
  });

  test("updateRole merges into local state", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ permissions: { member: { can_write: 1, can_invite: 0 } } })
      .mockResolvedValueOnce({ success: true });
    setupAuthFetch(mockFetch);
    const { result } = renderHook(() => useChannelPermissions(1));
    await waitFor(() => expect(result.current.permissions?.member.can_invite).toBe(0));
    await act(async () => { await result.current.updateRole("member", { can_invite: 1 }); });
    expect(result.current.permissions.member.can_invite).toBe(1);
  });

  test("handles fetch error by setting null", async () => {
    setupAuthFetch(vi.fn().mockRejectedValue(new Error("err")));
    const { result } = renderHook(() => useChannelPermissions(1));
    await waitFor(() => expect(result.current.permissions).toBeNull());
  });
});

// ── useChannelInvites ─────────────────────────────────────────────────────────

describe("useChannelInvites", () => {
  test("fetches invites on mount", async () => {
    const invites = [{ code: "abc", uses_count: 0 }];
    setupAuthFetch(vi.fn().mockResolvedValue({ invites }));
    const { result } = renderHook(() => useChannelInvites(1));
    await waitFor(() => expect(result.current.invites).toEqual(invites));
  });

  test("clears invites when channelId is null", async () => {
    setupAuthFetch(vi.fn());
    const { result } = renderHook(() => useChannelInvites(null));
    await waitFor(() => expect(result.current.invites).toEqual([]));
  });

  test("createInvite prepends to list", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ invites: [{ code: "old" }] })
      .mockResolvedValueOnce({ invite: { code: "new" } });
    setupAuthFetch(mockFetch);
    const { result } = renderHook(() => useChannelInvites(1));
    await waitFor(() => expect(result.current.invites).toHaveLength(1));
    await act(async () => { await result.current.createInvite({}); });
    expect(result.current.invites[0].code).toBe("new");
    expect(result.current.invites).toHaveLength(2);
  });

  test("deleteInvite removes by code", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ invites: [{ code: "del" }, { code: "keep" }] })
      .mockResolvedValueOnce({ success: true });
    setupAuthFetch(mockFetch);
    const { result } = renderHook(() => useChannelInvites(1));
    await waitFor(() => expect(result.current.invites).toHaveLength(2));
    await act(async () => { await result.current.deleteInvite("del"); });
    expect(result.current.invites).toHaveLength(1);
    expect(result.current.invites[0].code).toBe("keep");
  });

  test("handles fetch error gracefully", async () => {
    setupAuthFetch(vi.fn().mockRejectedValue(new Error("err")));
    const { result } = renderHook(() => useChannelInvites(1));
    await waitFor(() => expect(result.current.invites).toEqual([]));
  });
});

// ── useSearch ─────────────────────────────────────────────────────────────────

describe("useSearch", () => {
  test("search with 2+ chars returns results", async () => {
    const results = [{ id: 1, content: "match" }];
    setupAuthFetch(vi.fn().mockResolvedValue({ results }));
    const { result } = renderHook(() => useSearch(1));
    await act(async () => { await result.current.search("ma"); });
    expect(result.current.results).toEqual(results);
    expect(result.current.query).toBe("ma");
  });

  test("short query clears results", async () => {
    const mockFetch = vi.fn();
    setupAuthFetch(mockFetch);
    const { result } = renderHook(() => useSearch(1));
    await act(async () => { await result.current.search("x"); });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.results).toEqual([]);
  });

  test("clearSearch resets results and query", async () => {
    setupAuthFetch(vi.fn().mockResolvedValue({ results: [{ id: 1 }] }));
    const { result } = renderHook(() => useSearch(1));
    await act(async () => { await result.current.search("he"); });
    act(() => { result.current.clearSearch(); });
    expect(result.current.results).toEqual([]);
    expect(result.current.query).toBe("");
  });

  test("handles error and sets loading false", async () => {
    setupAuthFetch(vi.fn().mockRejectedValue(new Error("err")));
    const { result } = renderHook(() => useSearch(1));
    await act(async () => { await result.current.search("xx"); });
    expect(result.current.loading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// useGlobalSearch — error path (line 507)
// ---------------------------------------------------------------------------
describe("useGlobalSearch", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    console.error.mockRestore?.();
    vi.restoreAllMocks();
  });

  it("logs error and keeps loading false when authFetch throws", async () => {
    // Override the authFetch mock to reject
    const { useAuth } = await import("../../context/AuthContext");
    useAuth.mockReturnValue({
      authFetch: vi.fn().mockRejectedValue(new Error("search network fail")),
      token: "tok",
    });

    const { result } = renderHook(() => useGlobalSearch());

    await act(async () => {
      await result.current.search("hello world");
    });

    // loading must be reset to false even after the error
    expect(result.current.loading).toBe(false);
    // results stay empty
    expect(result.current.results).toEqual([]);
    // the error is logged
    expect(console.error).toHaveBeenCalledWith(
      "Global search error:",
      expect.any(Error)
    );
  });

  it("returns empty results and does NOT fetch when query is shorter than 2 chars", async () => {
    const mockFetch = vi.fn();
    const { useAuth } = await import("../../context/AuthContext");
    useAuth.mockReturnValue({ authFetch: mockFetch, token: "tok" });

    const { result } = renderHook(() => useGlobalSearch());

    await act(async () => {
      await result.current.search("a");
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.results).toEqual([]);
  });

  it("clearSearch resets results and query", async () => {
    const { useAuth } = await import("../../context/AuthContext");
    useAuth.mockReturnValue({
      authFetch: vi.fn().mockResolvedValue({ results: [{ id: 1 }] }),
      token: "tok",
    });

    const { result } = renderHook(() => useGlobalSearch());

    await act(async () => {
      await result.current.search("hello");
    });

    act(() => {
      result.current.clearSearch();
    });

    expect(result.current.results).toEqual([]);
    expect(result.current.query).toBe("");
  });
});

// ---------------------------------------------------------------------------
// useChannelMembers — error path (line 548)
// ---------------------------------------------------------------------------
describe("useChannelMembers", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs error when fetching members fails", async () => {
    const { useAuth } = await import("../../context/AuthContext");
    useAuth.mockReturnValue({
      authFetch: vi.fn().mockRejectedValue(new Error("members network fail")),
      token: "tok",
    });

    const { result } = renderHook(() => useChannelMembers(42));

    // wait for the useEffect → load() to run
    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith(
        "Members error:",
        expect.any(Error)
      );
    });

    expect(result.current.members).toEqual([]);
  });

  it("sets members to [] and skips fetch when channelId is null", async () => {
    const mockFetch = vi.fn();
    const { useAuth } = await import("../../context/AuthContext");
    useAuth.mockReturnValue({ authFetch: mockFetch, token: "tok" });

    const { result } = renderHook(() => useChannelMembers(null));

    await waitFor(() => {
      expect(result.current.members).toEqual([]);
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────
  // Missing branch coverage tests
  // ─────────────────────────────────────────────────────────────────

  test("useGlobalSearch defaults results to empty array when API returns falsy (line 505)", async () => {
    setupAuthFetch(vi.fn().mockResolvedValue({ results: null }));
    const { result } = renderHook(() => useGlobalSearch());
    await act(async () => { await result.current.search("hello"); });
    expect(result.current.results).toEqual([]);
  });

  test("changeRole preserves other members' roles (line 591 else branch)", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ members: [
        { id: 1, username: "alice", channel_role: "member" },
        { id: 2, username: "bob", channel_role: "member" },
      ]})
      .mockResolvedValueOnce({ success: true });
    setupAuthFetch(mockFetch);
    const { result } = renderHook(() => useChannelMembers(1));
    await waitFor(() => expect(result.current.members).toHaveLength(2));

    // Change only the first member's role
    await act(async () => { await result.current.changeRole(1, "manager"); });

    expect(result.current.members[0].channel_role).toBe("manager");
    expect(result.current.members[1].channel_role).toBe("member"); // unchanged
  });

  test("updateRole handles null permissions gracefully (line 640 else branch)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ success: true });
    setupAuthFetch(mockFetch);
    const { result } = renderHook(() => useChannelPermissions(null));
    await waitFor(() => expect(result.current.permissions).toBeNull());

    // When permissions is null (because channelId is null), calling updateRole should not crash
    // The test is just checking it doesn't throw an error
    await act(async () => {
      // This will hit the else branch of the ternary: prev ? {...} : prev
      // Since prev is null, it returns null unchanged
      await result.current.updateRole("member", { can_write: 1 });
    });

    expect(result.current.permissions).toBeNull();
  });
});

// ── upsertConversation with incrementUnread=false ─────────────────────────────

describe("useConversations — upsertConversation incrementUnread=false branch", () => {
  test("does not increment unread_count when updating existing conversation", async () => {
    setupAuthFetch(vi.fn().mockResolvedValue({
      conversations: [{ partner_id: 2, last_content: "old", unread_count: 3 }],
    }));
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));
    act(() => {
      result.current.upsertConversation(
        { content: "new", created_at: new Date().toISOString() },
        2, "bob", "👤", false
      );
    });
    expect(result.current.conversations[0].last_content).toBe("new");
    expect(result.current.conversations[0].unread_count).toBe(3);
  });

  test("sets unread_count=0 when prepending a new conversation with incrementUnread=false", async () => {
    setupAuthFetch(vi.fn().mockResolvedValue({ conversations: [] }));
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(result.current.conversations).toEqual([]));
    act(() => {
      result.current.upsertConversation(
        { content: "hi", created_at: new Date().toISOString() },
        99, "carol", "🦊", false
      );
    });
    expect(result.current.conversations[0].unread_count).toBe(0);
  });
});

// ── usePinnedMessages — missing messages field ────────────────────────────────

describe("usePinnedMessages — missing messages field fallback", () => {
  test("defaults to [] when API response omits the messages field", async () => {
    setupAuthFetch(vi.fn().mockResolvedValue({}));
    const { result } = renderHook(() => usePinnedMessages(1));
    await waitFor(() => expect(result.current.pinnedMessages).toEqual([]));
  });
});

// ── useUserSearch — missing users field ──────────────────────────────────────

describe("useUserSearch — missing users field fallback", () => {
  test("defaults to [] when API response omits the users field", async () => {
    setupAuthFetch(vi.fn().mockResolvedValue({}));
    const { result } = renderHook(() => useUserSearch());
    await act(async () => { await result.current.search("ali"); });
    expect(result.current.results).toEqual([]);
  });
});
