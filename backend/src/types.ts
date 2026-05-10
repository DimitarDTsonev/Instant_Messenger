export type UserRole = "admin" | "user" | "member";
export type ChannelRole = "owner" | "manager" | "member" | "viewer";

export interface AuthUser {
  id: number;
  username: string;
  email?: string;
  role: UserRole | string;
  is_guest?: boolean | number;
}

export type Db = import("better-sqlite3").Database;

export type ReactionMap = Record<string, number[]>;

export interface MessageRow {
  id: number;
  content?: string;
  created_at?: string;
  user_id?: number;
  sender_id?: number;
  receiver_id?: number;
  channel_id?: number;
  username?: string;
  avatar?: string | null;
  role?: string;
  reactions?: ReactionMap;
  [key: string]: unknown;
}

export type PermissionSet = {
  can_write: number;
  can_invite: number;
  can_manage_members: number;
  can_delete_messages: number;
};
