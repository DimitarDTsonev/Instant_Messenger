/**
 * @fileoverview Custom React hooks that encapsulate all REST API calls.
 *
 * Every hook uses {@link useAuth}.authFetch under the hood so that the Bearer
 * token is automatically attached to every request.  State mutations are done
 * optimistically where possible (local update first, server confirmation expected).
 *
 * Exported hooks:
 *  - {@link useChannels}          — channel list CRUD
 *  - {@link useMessages}          — paginated channel message list
 *  - {@link useUsers}             — full user roster
 *  - {@link useDm}                — paginated DM conversation
 *  - {@link useConversations}     — DM conversation summaries (sidebar list)
 *  - {@link usePinnedMessages}    — pinned messages for a channel
 *  - {@link useUserSearch}        — user search by username prefix
 *  - {@link useGlobalSearch}      — cross-channel message search
 *  - {@link useChannelMembers}    — member list + CRUD for a single channel
 *  - {@link useChannelPermissions} — per-role permission matrix for a channel
 *  - {@link useChannelInvites}    — invite link management for a channel
 *  - {@link useSearch}            — message search scoped to one channel
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { API_BASE as API } from "../config";
import type {
  Channel,
  ChannelInvite,
  ChannelPermissions,
  ChannelRole,
  Conversation,
  DirectMessage,
  Message,
  MessagePatch,
  PermissionSet,
  SearchResult,
  User,
} from "../types";

type ChannelResponse = { channel: Channel };
type ChannelsResponse = { channels: Channel[] };
type MessagePageResponse<T extends Message = Message> = { messages: T[]; hasMore: boolean };
type UsersResponse = { users: User[] };
type DmPageResponse = MessagePageResponse<DirectMessage> & { partner: User };
type ConversationsResponse = { conversations: Conversation[] };
type PinnedMessagesResponse = { messages?: Message[] };
type SearchResponse = { results: SearchResult[] };
type MembersResponse = { members: User[]; user?: User };
type PermissionsResponse = { permissions: ChannelPermissions };
type InvitesResponse = { invites: ChannelInvite[] };
type InviteResponse = { invite: ChannelInvite };
type EditableChannelRole = Exclude<ChannelRole, "owner">;

// ---------------------------------------------------------------------------
// useChannels
// ---------------------------------------------------------------------------

/**
 * useChannels - Fetches and manages the full list of channels visible to the
 * current user.
 *
 * Loads channels from GET /api/channels on mount.  Keeps the local list sorted
 * alphabetically by name after every create operation.
 *
 * @returns {{
 *   channels: Object[],           Array of channel objects.
 *   loading: boolean,             True during the initial fetch.
 *   reload: Function,             () → Promise<void>; re-fetches the channel list.
 *   createChannel: Function,      (name, description?, is_private?) → Promise<Object>
 *   updateChannel: Function,      (id, updates) → Promise<Object>
 *   deleteChannel: Function,      (id) → Promise<void>
 * }}
 */
export function useChannels() {
  const { authFetch } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading]   = useState(true);

  const load = useCallback(async () => {
    try {
      const { channels } = await authFetch<ChannelsResponse>(`${API}/channels`);
      setChannels(channels);
    } catch (e) {
      console.error("Channels error:", e);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  // Fetch on mount (and whenever authFetch identity changes, i.e. token rotation)
  useEffect(() => { load(); }, [load]);

  /**
   * Creates a new channel and appends it to the local list (sorted).
   *
   * @param {string}  name
   * @param {string}  [description=""]
   * @param {0|1}     [is_private=0]
   * @returns {Promise<Object>} The newly created channel object.
   */
  const createChannel = useCallback(async (name: string, description = "", is_private: 0 | 1 | boolean = 0) => {
    const { channel } = await authFetch<ChannelResponse>(`${API}/channels`, {
      method: "POST",
      body: JSON.stringify({ name, description, is_private }),
    });
    setChannels((prev) => [...prev, channel].sort((a, b) => a.name.localeCompare(b.name)));
    return channel;
  }, [authFetch]);

  /**
   * Updates channel fields (description, is_private, etc.) and syncs local state.
   *
   * @param {number} id       - Channel ID.
   * @param {Object} updates  - Partial channel fields to update.
   * @returns {Promise<Object>} The updated channel object.
   */
  const updateChannel = useCallback(async (id: number, updates: Partial<Channel>) => {
    const { channel } = await authFetch<ChannelResponse>(`${API}/channels/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
    setChannels((prev) => prev.map((c) => c.id === id ? { ...c, ...channel } : c));
    return channel;
  }, [authFetch]);

  /**
   * Deletes a channel and removes it from local state.
   *
   * @param {number} id - Channel ID.
   * @returns {Promise<void>}
   */
  const deleteChannel = useCallback(async (id: number) => {
    await authFetch(`${API}/channels/${id}`, { method: "DELETE" });
    setChannels((prev) => prev.filter((c) => c.id !== id));
  }, [authFetch]);

  return { channels, loading, reload: load, createChannel, updateChannel, deleteChannel };
}

// ---------------------------------------------------------------------------
// useMessages
// ---------------------------------------------------------------------------

/**
 * useMessages - Fetches and manages paginated messages for a single channel.
 *
 * Reloads from GET /api/messages/:channelId whenever channelId changes.
 * Older pages are loaded via GET /api/messages/:channelId?before=<id>.
 *
 * @param {number|null} channelId - ID of the channel to load. Pass null to clear.
 * @returns {{
 *   messages: Object[],       Chronologically ordered message array.
 *   loading: boolean,         True during the initial page fetch.
 *   hasMore: boolean,         True when older messages are available.
 *   loadMore: Function,       () → void; prepends the next older page.
 *   addMessage: Function,     (msg: Object) → void; appends a real-time message.
 *   updateMessage: Function,  (partial: Object) → void; merges partial into matching message.
 *   removeMessage: Function,  (messageId: number) → void; removes a message by ID.
 * }}
 */
export function useMessages(channelId: number | null | undefined) {
  const { authFetch } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading]   = useState(false);
  const [hasMore, setHasMore]   = useState(false);

  // Reset and re-fetch whenever the active channel changes
  useEffect(() => {
    if (!channelId) { setMessages([]); return; }
    setLoading(true);
    authFetch<MessagePageResponse>(`${API}/messages/${channelId}`)
      .then(({ messages, hasMore }) => { setMessages(messages); setHasMore(hasMore); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [channelId, authFetch]);

  /**
   * Loads the next older page of messages and prepends them.
   * Uses the current oldest message ID as the cursor.
   */
  const loadMore = useCallback(async () => {
    if (!hasMore) return;
    setMessages((prev) => {
      if (!prev.length) return prev;
      const oldest = prev[0];
      authFetch<MessagePageResponse>(`${API}/messages/${channelId}?before=${oldest.id}`)
        .then(({ messages: older, hasMore: more }) => {
          setMessages((cur) => [...older, ...cur]);
          setHasMore(more);
        })
        .catch(console.error);
      return prev; // Return the unchanged array so React does not re-render before the fetch resolves
    });
  }, [channelId, hasMore, authFetch]);

  /** Appends a single incoming real-time message to the end of the list. */
  const addMessage = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  /**
   * Merges a partial message object (e.g. from an edit or reaction event)
   * into the matching message by ID.
   *
   * @param {Object} partial - Must contain at least { id }.
   */
  const updateMessage = useCallback((partial: MessagePatch) => {
    setMessages((prev) =>
      prev.map((m) => m.id === partial.id ? { ...m, ...partial } : m)
    );
  }, []);

  /**
   * Removes a message from the list (e.g. after a delete event).
   *
   * @param {number} messageId
   */
  const removeMessage = useCallback((messageId: number) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  return { messages, loading, hasMore, loadMore, addMessage, updateMessage, removeMessage };
}

// ---------------------------------------------------------------------------
// useUsers
// ---------------------------------------------------------------------------

/**
 * useUsers - Fetches and returns the full list of registered users.
 *
 * Calls GET /api/auth/users once on mount.  Used by the Sidebar, ChatArea
 * (for mention rendering) and ChatPage (for DM partner lookup).
 *
 * @returns {{ users: Object[] }} Array of user objects (id, username, avatar, role, …).
 */
export function useUsers() {
  const { authFetch } = useAuth();
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    authFetch<UsersResponse>(`${API}/auth/users`)
      .then(({ users }) => setUsers(users))
      .catch(console.error);
  }, [authFetch]);

  return { users };
}

// ---------------------------------------------------------------------------
// useDm
// ---------------------------------------------------------------------------

/**
 * useDm - Fetches and manages a paginated DM conversation with a specific partner.
 *
 * Reloads from GET /api/dm/:partnerId whenever partnerId changes.
 * Older pages are loaded via GET /api/dm/:partnerId?before=<id>.
 *
 * @param {number|null} partnerId - User ID of the conversation partner. Pass null to clear.
 * @returns {{
 *   messages: Object[],       Chronologically ordered DM array.
 *   loading: boolean,
 *   hasMore: boolean,
 *   partner: Object|null,     Partner user object returned by the API.
 *   loadMore: Function,       () → void
 *   addMessage: Function,     (msg) → void
 *   updateMessage: Function,  (partial) → void
 *   removeMessage: Function,  (messageId) → void
 * }}
 */
export function useDm(partnerId: number | null | undefined) {
  const { authFetch } = useAuth();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading]   = useState(false);
  const [hasMore, setHasMore]   = useState(false);
  const [partner, setPartner]   = useState<User | null>(null);

  // Reset and re-fetch whenever the selected DM partner changes
  useEffect(() => {
    if (!partnerId) { setMessages([]); setPartner(null); return; }
    setLoading(true);
    authFetch<DmPageResponse>(`${API}/dm/${partnerId}`)
      .then(({ messages, hasMore, partner }) => {
        setMessages(messages);
        setHasMore(hasMore);
        setPartner(partner);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [partnerId, authFetch]);

  /**
   * Prepends the next older page of DM messages using the oldest message ID as cursor.
   */
  const loadMore = useCallback(async () => {
    if (!hasMore) return;
    setMessages((prev) => {
      if (!prev.length) return prev;
      const oldest = prev[0];
      authFetch<MessagePageResponse<DirectMessage>>(`${API}/dm/${partnerId}?before=${oldest.id}`)
        .then(({ messages: older, hasMore: more }) => {
          setMessages((cur) => [...older, ...cur]);
          setHasMore(more);
        })
        .catch(console.error);
      return prev;
    });
  }, [partnerId, hasMore, authFetch]);

  /** Appends a new incoming DM to the end of the list. */
  const addMessage = useCallback((msg: DirectMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  /** Merges a partial DM object into the matching message by ID. */
  const updateMessage = useCallback((partial: MessagePatch) => {
    setMessages((prev) =>
      prev.map((m) => m.id === partial.id ? { ...m, ...partial } : m)
    );
  }, []);

  /** Removes a DM from the list by ID. */
  const removeMessage = useCallback((messageId: number) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  return { messages, loading, hasMore, partner, loadMore, addMessage, updateMessage, removeMessage };
}

// ---------------------------------------------------------------------------
// useConversations
// ---------------------------------------------------------------------------

/**
 * useConversations - Fetches and manages the DM conversation summary list
 * shown in the sidebar's "Direct Messages" section.
 *
 * Each conversation summary contains the partner's identity, the last message
 * preview, and an unread count.  The hook exposes helpers to keep the list
 * in sync with real-time events without re-fetching from the server.
 *
 * @returns {{
 *   conversations: Object[],         Array of conversation summary objects.
 *   reload: Function,                () → Promise<void>; re-fetches the list.
 *   markRead: Function,              (partnerId: number) → void; zeroes unread count locally.
 *   upsertConversation: Function,    (msg, partnerId, partnerUsername, partnerAvatar) → void;
 *                                    updates the last-message preview or inserts a new entry.
 * }}
 */
export function useConversations() {
  const { authFetch } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const load = useCallback(async () => {
    try {
      const { conversations } = await authFetch<ConversationsResponse>(`${API}/dm/conversations`);
      setConversations(conversations);
    } catch (e) {
      console.error("Conversations error:", e);
    }
  }, [authFetch]);

  useEffect(() => { load(); }, [load]);

  /**
   * Clears the unread badge for a conversation when the user opens it.
   *
   * @param {number} partnerId
   */
  const markRead = useCallback((partnerId: number) => {
    setConversations((prev) =>
      prev.map((c) => c.partner_id === partnerId ? { ...c, unread_count: 0 } : c)
    );
  }, []);

  /**
   * Updates an existing conversation's last-message preview, or inserts a new
   * entry at the top of the list when the conversation is new.
   *
   * @param {Object} msg              - The incoming message object.
   * @param {number} partnerId
   * @param {string} partnerUsername
   * @param {string} partnerAvatar
   */
  const upsertConversation = useCallback((msg: Message, partnerId: number, partnerUsername: string, partnerAvatar?: string | null, incrementUnread = true) => {
    setConversations((prev) => {
      const exists = prev.find((c) => c.partner_id === partnerId);
      if (exists) {
        return prev.map((c) =>
          c.partner_id === partnerId
            ? { ...c, last_content: msg.content, last_at: msg.created_at, unread_count: incrementUnread ? c.unread_count + 1 : c.unread_count }
            : c
        );
      }
      return [{ partner_id: partnerId, partner_username: partnerUsername, partner_avatar: partnerAvatar, last_content: msg.content, last_at: msg.created_at, unread_count: incrementUnread ? 1 : 0 }, ...prev];
    });
  }, []);

  return { conversations, reload: load, markRead, upsertConversation };
}

// ---------------------------------------------------------------------------
// usePinnedMessages
// ---------------------------------------------------------------------------

/**
 * usePinnedMessages - Fetches and manages the list of pinned messages for a channel.
 *
 * Shown in the PinnedBanner above the chat area.  addPinned / removePin are called
 * directly by real-time socket events so the banner updates without a re-fetch.
 *
 * @param {number|null} channelId - Channel ID. Pass null to clear.
 * @returns {{
 *   pinnedMessages: Object[],  Array of pinned message objects.
 *   addPinned: Function,       (msg) → void; adds a message if not already pinned.
 *   removePin: Function,       (messageId) → void; removes a message from the list.
 * }}
 */
export function usePinnedMessages(channelId: number | null | undefined) {
  const { authFetch } = useAuth();
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);

  useEffect(() => {
    if (!channelId) { setPinnedMessages([]); return; }
    authFetch<PinnedMessagesResponse>(`${API}/messages/${channelId}/pinned`)
      .then(({ messages }) => setPinnedMessages(messages || []))
      .catch(console.error);
  }, [channelId, authFetch]);

  /**
   * Appends a message to the pinned list, ignoring duplicates.
   *
   * @param {Object} msg - The pinned message object (must have an `id`).
   */
  const addPinned = useCallback((msg: Message) => {
    setPinnedMessages((prev) => prev.find((m) => m.id === msg.id) ? prev : [...prev, msg]);
  }, []);

  /**
   * Removes a message from the pinned list by ID.
   *
   * @param {number} messageId
   */
  const removePin = useCallback((messageId: number) => {
    setPinnedMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  return { pinnedMessages, addPinned, removePin };
}

// ---------------------------------------------------------------------------
// useUserSearch
// ---------------------------------------------------------------------------

/**
 * useUserSearch - Provides on-demand user search against GET /api/auth/search.
 *
 * Used by the UserSearchModal to find users by username prefix.
 * Empty or whitespace-only queries clear the results without making a request.
 *
 * @returns {{
 *   results: Object[],   Array of matching user objects.
 *   loading: boolean,    True while a request is in flight.
 *   search: Function,    (q: string) → Promise<void>; triggers a search.
 *   clear: Function,     () → void; empties the results list.
 * }}
 */
export function useUserSearch() {
  const { authFetch } = useAuth();
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  /**
   * Searches for users whose username starts with the given query.
   *
   * @param {string} q - Search query (must be non-empty after trimming).
   */
  const search = useCallback(async (q: string) => {
    if (!q || !q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const data = await authFetch<UsersResponse>(`${API}/auth/search?q=${encodeURIComponent(q)}`);
      setResults(data.users || []);
    } catch (e) {
      console.error("User search error:", e);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  /** Clears the search result list. */
  const clear = useCallback(() => setResults([]), []);

  return { results, loading, search, clear };
}

// ---------------------------------------------------------------------------
// useGlobalSearch
// ---------------------------------------------------------------------------

/**
 * useGlobalSearch - Searches messages across all accessible channels.
 *
 * Calls GET /api/messages/search?q=… and requires at least 2 characters.
 *
 * @returns {{
 *   results: Object[],      Array of matching message objects (include channel context).
 *   loading: boolean,
 *   query: string,          The last query string that was submitted.
 *   search: Function,       (q: string) → Promise<void>
 *   clearSearch: Function,  () → void; resets results and query.
 * }}
 */
export function useGlobalSearch() {
  const { authFetch } = useAuth();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery]     = useState("");

  /**
   * Executes a global message search.  Requires at least 2 non-whitespace characters.
   *
   * @param {string} q
   */
  const search = useCallback(async (q: string) => {
    setQuery(q);
    if (!q || q.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const data = await authFetch<SearchResponse>(`${API}/messages/search?q=${encodeURIComponent(q)}`);
      setResults(data.results || []);
    } catch (e) {
      console.error("Global search error:", e);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  /** Clears both the results list and the stored query string. */
  const clearSearch = useCallback(() => { setResults([]); setQuery(""); }, []);

  return { results, loading, query, search, clearSearch };
}

// ---------------------------------------------------------------------------
// useChannelMembers
// ---------------------------------------------------------------------------

/**
 * useChannelMembers - Fetches and manages the member list for a single channel.
 *
 * Provides CRUD operations: add member by username, remove member (kick),
 * and change a member's channel role (manager ↔ member). The owner role is
 * protected and cannot be assigned or removed through this hook.
 *
 * @param {number|null} channelId - ID of the channel whose members to load. Pass null to skip.
 * @returns {{
 *   members: Object[],        Member rows ordered by role priority then username.
 *   load: Function,           () → Promise<void>; re-fetches members from the API.
 *   addMember: Function,      (username: string) → Promise<Object>
 *   removeMember: Function,   (userId: number) → Promise<void>
 *   changeRole: Function,     (userId: number, role: 'manager'|'member') → Promise<void>
 * }}
 */
export function useChannelMembers(channelId: number | null | undefined) {
  const { authFetch } = useAuth();
  const [members, setMembers] = useState<User[]>([]);

  const load = useCallback(async () => {
    if (!channelId) { setMembers([]); return; }
    try {
      const { members } = await authFetch<MembersResponse>(`${API}/channels/${channelId}/members`);
      setMembers(members);
    } catch (e) { console.error("Members error:", e); }
  }, [channelId, authFetch]);

  useEffect(() => { load(); }, [load]);

  /**
   * Adds a user to the channel by their username.
   *
   * @param {string} username
   * @returns {Promise<Object>} The newly added user object.
   */
  const addMember = useCallback(async (username: string) => {
    const data = await authFetch<MembersResponse>(`${API}/channels/${channelId}/members`, {
      method: "POST",
      body: JSON.stringify({ username }),
    });
    await load(); // Re-fetch to get server-sorted member list
    return data.user;
  }, [channelId, authFetch, load]);

  /**
   * Removes a user from the channel (kick).
   *
   * @param {number} userId
   * @returns {Promise<void>}
   */
  const removeMember = useCallback(async (userId: number) => {
    await authFetch(`${API}/channels/${channelId}/members/${userId}`, { method: "DELETE" });
    setMembers((prev) => prev.filter((m) => m.id !== userId));
  }, [channelId, authFetch]);

  /**
   * Changes a member's channel-level role.
   *
   * @param {number} userId
   * @param {'manager'|'member'} role
   * @returns {Promise<void>}
   */
  const changeRole = useCallback(async (userId: number, role: EditableChannelRole) => {
    await authFetch(`${API}/channels/${channelId}/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
    setMembers((prev) => prev.map((m) => m.id === userId ? { ...m, channel_role: role } : m));
  }, [channelId, authFetch]);

  return { members, load, addMember, removeMember, changeRole };
}

// ---------------------------------------------------------------------------
// useChannelPermissions
// ---------------------------------------------------------------------------

/**
 * useChannelPermissions - Fetches and manages per-role permission settings for a channel.
 *
 * The permissions object is keyed by role ("manager", "member") and each value
 * is a map of permission keys (can_write, can_invite, etc.) to 0/1 integers.
 *
 * @param {number|null} channelId
 * @returns {{
 *   permissions: Object|null,   Permission matrix or null while loading / no channel.
 *   updateRole: Function,       (role: string, perms: Object) → Promise<void>; saves a role's permissions.
 * }}
 */
export function useChannelPermissions(channelId: number | null | undefined) {
  const { authFetch } = useAuth();
  const [permissions, setPermissions] = useState<ChannelPermissions | null>(null);

  const load = useCallback(async () => {
    if (!channelId) { setPermissions(null); return; }
    try {
      const { permissions } = await authFetch<PermissionsResponse>(`${API}/channels/${channelId}/permissions`);
      setPermissions(permissions);
    } catch { setPermissions(null); }
  }, [channelId, authFetch]);

  useEffect(() => { load(); }, [load]);

  /**
   * Persists an updated permission set for a role and merges the result locally.
   *
   * @param {string} role   - "manager" or "member".
   * @param {Object} perms  - Permission key-value pairs to update (e.g. { can_write: 1 }).
   * @returns {Promise<void>}
   */
  const updateRole = useCallback(async (role: string, perms: Partial<PermissionSet>) => {
    await authFetch(`${API}/channels/${channelId}/permissions/${role}`, {
      method: "PUT",
      body: JSON.stringify(perms),
    });
    // Merge the new values into the local permissions state optimistically
    setPermissions((prev) => prev ? { ...prev, [role]: { ...prev[role], ...perms } } : prev);
  }, [channelId, authFetch]);

  return { permissions, updateRole };
}

// ---------------------------------------------------------------------------
// useChannelInvites
// ---------------------------------------------------------------------------

/**
 * useChannelInvites - Fetches and manages invite links for a channel.
 *
 * Each invite has an optional max-use cap and an optional expiry time.
 *
 * @param {number|null} channelId
 * @returns {{
 *   invites: Object[],         Array of invite objects (code, uses_count, max_uses, expires_at, …).
 *   createInvite: Function,    (opts?: { maxUses?, expiresInHours? }) → Promise<Object>
 *   deleteInvite: Function,    (code: string) → Promise<void>
 * }}
 */
export function useChannelInvites(channelId: number | null | undefined) {
  const { authFetch } = useAuth();
  const [invites, setInvites] = useState<ChannelInvite[]>([]);

  const load = useCallback(async () => {
    if (!channelId) { setInvites([]); return; }
    try {
      const { invites } = await authFetch<InvitesResponse>(`${API}/channels/${channelId}/invites`);
      setInvites(invites);
    } catch { setInvites([]); }
  }, [channelId, authFetch]);

  useEffect(() => { load(); }, [load]);

  /**
   * Creates a new invite link with optional constraints.
   *
   * @param {{ maxUses?: number|null, expiresInHours?: number|null }} [opts={}]
   * @returns {Promise<Object>} The created invite object.
   */
  const createInvite = useCallback(async (opts: { maxUses?: number | null; expiresInHours?: number | null } = {}) => {
    const { invite } = await authFetch<InviteResponse>(`${API}/channels/${channelId}/invites`, {
      method: "POST",
      body: JSON.stringify(opts),
    });
    // Prepend so the newest invite appears at the top
    setInvites((prev) => [invite, ...prev]);
    return invite;
  }, [channelId, authFetch]);

  /**
   * Revokes an invite link by its unique code.
   *
   * @param {string} code - The invite code (last path segment of the invite URL).
   * @returns {Promise<void>}
   */
  const deleteInvite = useCallback(async (code: string) => {
    await authFetch(`${API}/channels/${channelId}/invites/${code}`, { method: "DELETE" });
    setInvites((prev) => prev.filter((i) => i.code !== code));
  }, [channelId, authFetch]);

  return { invites, createInvite, deleteInvite };
}

// ---------------------------------------------------------------------------
// useSearch
// ---------------------------------------------------------------------------

/**
 * useSearch - Searches messages within a single channel.
 *
 * Calls GET /api/messages/:channelId/search?q=… and requires at least
 * 2 characters.  Used by the SearchModal opened from the channel topbar.
 *
 * @param {number|null} channelId - Channel to search within.
 * @returns {{
 *   results: Object[],      Array of matching message objects.
 *   loading: boolean,
 *   query: string,          The last submitted query string.
 *   search: Function,       (q: string) → Promise<void>
 *   clearSearch: Function,  () → void
 * }}
 */
export function useSearch(channelId: number | null | undefined) {
  const { authFetch } = useAuth();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery]     = useState("");

  /**
   * @param {string} q - Must be at least 2 non-whitespace characters.
   */
  const search = useCallback(async (q: string) => {
    setQuery(q);
    if (!q || q.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const data = await authFetch<SearchResponse>(`${API}/messages/${channelId}/search?q=${encodeURIComponent(q)}`);
      setResults(data.results);
    } catch (e) {
      console.error("Search error:", e);
    } finally {
      setLoading(false);
    }
  }, [channelId, authFetch]);

  /** Clears results and the query string. */
  const clearSearch = useCallback(() => { setResults([]); setQuery(""); }, []);

  return { results, loading, query, search, clearSearch };
}
