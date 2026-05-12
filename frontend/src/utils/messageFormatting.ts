import type { Message } from "../types";

export type MessageDivider = { type: "divider"; label: string; key: string };
export type MessageGroup = {
  type: "group";
  userId?: number;
  username?: string;
  avatar?: string | null;
  role?: string;
  messages: Message[];
  key: string;
};
export type GroupedMessageItem = MessageDivider | MessageGroup;

export function formatDate(dateStr: string) {
  const d         = new Date(dateStr);
  const today     = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString())     return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
}

export function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

export function groupMessages(messages: Message[]): GroupedMessageItem[] {
  const result: GroupedMessageItem[] = [];
  let lastDate:  string | null       = null;
  let lastGroup: MessageGroup | null = null;

  for (const msg of messages) {
    const date     = new Date(msg.created_at).toDateString();
    const authorId = msg.user_id ?? msg.sender_id;

    if (date !== lastDate) {
      result.push({ type: "divider", label: formatDate(msg.created_at), key: `d-${msg.id}` });
      lastDate  = date;
      lastGroup = null;
    }

    if (lastGroup && lastGroup.userId === authorId) {
      lastGroup.messages.push(msg);
    } else {
      lastGroup = {
        type: "group", userId: authorId, username: msg.username,
        avatar: msg.avatar, role: msg.role, messages: [msg], key: `g-${msg.id}`,
      };
      result.push(lastGroup);
    }
  }
  return result;
}