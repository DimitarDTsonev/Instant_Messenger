/**
 * Shared TypeScript type definitions used across the backend.
 *
 * Imported by: controllers, services, repositories, middleware, socket handlers.
 */

/** Global user roles. "admin" grants full system access; "member" is the default. */
export type UserRole = "admin" | "user" | "member";

/** Per-channel membership roles in descending privilege order. */
export type ChannelRole = "owner" | "manager" | "member" | "viewer";

/** Type alias for the better-sqlite3 Database instance used throughout the app. */
export type Db = import("better-sqlite3").Database;

/**
 * Emoji reaction map: emoji character → array of user IDs who used it.
 * @example { "👍": [1, 3], "❤️": [2] }
 */
export type ReactionMap = Record<string, number[]>;

/**
 * Represents a row returned by message queries (channel messages and DMs).
 * Fields are optional because the same type covers multiple SELECT shapes.
 */
export interface MessageRow {
  id: number;
  content?: string;
  created_at?: string;
  /** Author ID for channel messages. */
  user_id?: number;
  /** Sender ID for direct messages. */
  sender_id?: number;
  /** Recipient ID for direct messages. */
  receiver_id?: number;
  channel_id?: number;
  username?: string;
  avatar?: string | null;
  role?: string;
  /** Message origin: "user" | "system" | "webhook". */
  source?: string;
  /** JSON string with webhook/integration metadata. */
  metadata?: string | null;
  reactions?: ReactionMap;
  [key: string]: unknown;
}

/**
 * Payload attached to `req.user` by the JWT auth middleware.
 * Always includes id, username, email, and role.
 */
export interface AuthUser {
  id: number;
  username: string;
  email?: string;
  role: UserRole | string;
  is_guest?: boolean | number;
}

/**
 * The four permission flags that can be set per role per channel.
 * Stored as 0/1 integers in the channel_permissions table.
 */
export type PermissionSet = {
  can_write: number;
  can_invite: number;
  can_manage_members: number;
  can_delete_messages: number;
};
