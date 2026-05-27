export type UserRole = "admin" | "user";
export type ChannelRole = "owner" | "manager" | "member" | "viewer";
export type UserStatus = "online" | "away" | "dnd";

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

export interface AuthUser extends User {
  email: string;
  role: UserRole | string;
}

export interface AuthSession {
  user: AuthUser;
  token: string;
}

export interface Channel {
  id: number;
  name: string;
  description?: string;
  created_by?: number;
  created_at?: string;
  is_private?: boolean | number;
  role?: ChannelRole | string;
  channel_role?: ChannelRole | string;
  user_role?: ChannelRole | string;
  can_invite?: boolean | number;
  unread_count?: number;
}

export type ReactionMap = Record<string, number[]>;

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
  source?: string | null;
  metadata?: string | null;
  reactions?: ReactionMap;
}

export type ChannelMessage = Message & {
  channel_id: number;
  user_id: number;
};

export type DirectMessage = Message & {
  sender_id: number;
  receiver_id: number;
};

export type MessagePatch = Partial<Message> & { id: number };

export interface Conversation {
  partner_id: number;
  partner_username: string;
  partner_avatar?: string | null;
  last_content?: string | null;
  last_at?: string | null;
  unread_count: number;
}

export type PermissionKey =
  | "can_write"
  | "can_invite"
  | "can_manage_members"
  | "can_delete_messages";

export type PermissionSet = Record<PermissionKey, number>;
export type ChannelPermissions = Record<string, Partial<PermissionSet>>;

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

export interface SearchResult extends Message {
  type?: "channel" | "dm";
  channel_name?: string;
  dm_partner_username?: string;
  dm_partner_id?: number;
}

export interface SecurityLog {
  id: number;
  event: string;
  ip?: string | null;
  user_id?: number | null;
  username?: string | null;
  detail?: string | null;
  created_at?: string;
}
