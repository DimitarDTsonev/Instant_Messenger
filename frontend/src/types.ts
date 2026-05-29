/**
 * Shared TypeScript type definitions for the frontend.
 *
 * These types mirror the backend's data shapes and are used throughout
 * all components, hooks, and context files.
 */

/** Global user roles. "admin" grants access to the admin panel and all moderation actions. */
export type UserRole = "admin" | "user";

/** Per-channel membership roles in descending privilege order. */
export type ChannelRole = "owner" | "manager" | "member" | "viewer";

/** Possible online status values shown on user avatars. */
export type UserStatus = "online" | "away" | "dnd";

/** A user account record. Optional fields may be absent in lightweight contexts. */
export interface User {
  id: number;
  username: string;
  email?: string;
  avatar?: string | null;
  role?: UserRole | string;
  global_role?: UserRole | string;
  channel_role?: ChannelRole | string;
  is_guest?: boolean | number;
  is_banned?: boolean | number;
  banned_until?: string | null;
  ban_reason?: string | null;
  created_at?: string;
}

/** Extends User with required email and role fields for the authenticated session. */
export interface AuthUser extends User {
  email: string;
  role: UserRole | string;
}

/** The payload returned by login/register endpoints. */
export interface AuthSession {
  user: AuthUser;
  token: string;
}

/** A channel record as returned by the channels API. */
export interface Channel {
  id: number;
  name: string;
  description?: string;
  created_by?: number;
  created_at?: string;
  is_private?: boolean | number;
  role?: ChannelRole | string;
  channel_role?: ChannelRole | string;
  /** Effective role of the requesting user in this channel. */
  user_role?: ChannelRole | string;
  can_invite?: boolean | number;
  unread_count?: number;
}

/**
 * Emoji reaction map: emoji character → array of user IDs who used it.
 * @example { "👍": [1, 3], "❤️": [2] }
 */
export type ReactionMap = Record<string, number[]>;

/**
 * A message record (channel message or DM). Optional fields vary by context.
 * Both channel messages and DMs are normalised into this shape on the frontend.
 */
export interface Message {
  id: number;
  content: string;
  created_at: string;
  user_id?: number;
  username?: string;
  avatar?: string | null;
  role?: UserRole | string;
  channel_id?: number;
  sender_id?: number;
  receiver_id?: number;
  /** Used by DM:new socket events to identify the sender. */
  from_user_id?: number;
  is_read?: boolean | number;
  is_edited?: boolean | number;
  edited_at?: string | null;
  reply_to_id?: number | null;
  reply_content?: string | null;
  reply_username?: string | null;
  file_url?: string | null;
  file_type?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  reply_file_url?: string | null;
  is_pinned?: boolean | number;
  pinned_at?: string | null;
  pinned_by?: number | null;
  /** Message origin: "user" | "system" | "webhook". */
  source?: string | null;
  /** JSON metadata for webhook/integration messages. */
  metadata?: string | null;
  reactions?: ReactionMap;
}

/** Channel message with required channel_id and user_id fields. */
export type ChannelMessage = Message & {
  channel_id: number;
  user_id: number;
};

/** Direct message with required sender/receiver ID fields. */
export type DirectMessage = Message & {
  sender_id: number;
  receiver_id: number;
};

/** Partial message used by socket edit/react events — id is always present. */
export type MessagePatch = Partial<Message> & { id: number };

/** A DM conversation summary as returned by GET /api/dm/conversations. */
export interface Conversation {
  partner_id: number;
  partner_username: string;
  partner_avatar?: string | null;
  last_content?: string | null;
  last_at?: string | null;
  unread_count: number;
}

/** The four permission flag keys used in channel_permissions. */
export type PermissionKey =
  | "can_write"
  | "can_invite"
  | "can_manage_members"
  | "can_delete_messages";

/** A single role's permission set with 0/1 integer flags. */
export type PermissionSet = Record<PermissionKey, number>;

/** Permission map keyed by role name ("manager", "member"). */
export type ChannelPermissions = Record<string, Partial<PermissionSet>>;

/** An invite link record as returned by the channel invites API. */
export interface ChannelInvite {
  id?: number;
  channel_id?: number;
  code: string;
  max_uses?: number | null;
  uses_count?: number;
  expires_at?: string | null;
  created_at?: string;
  created_by_username?: string;
}

/** A result item from the cross-source search API. Extends Message with type tag and context fields. */
export interface SearchResult extends Message {
  /** Whether this result came from a channel or a DM. */
  type?: "channel" | "dm";
  channel_name?: string;
  dm_partner_username?: string;
  dm_partner_id?: number;
}

/** A row from the security_logs table, shown in the admin panel. */
export interface SecurityLog {
  id: number;
  event: string;
  ip?: string | null;
  user_id?: number | null;
  username?: string | null;
  detail?: string | null;
  created_at?: string;
}