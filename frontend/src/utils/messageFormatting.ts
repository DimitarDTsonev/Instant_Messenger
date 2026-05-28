/**
 * Message formatting utilities for grouping messages and formatting dates/times.
 *
 * The main export `groupMessages` transforms a flat array of messages into a
 * mixed array of date-dividers and message-groups for display in the chat area.
 *
 * Used by: ChatArea.tsx.
 */

import type { Message } from "../types";

/** A date divider item rendered between messages from different days. */
export type MessageDivider = { type: "divider"; label: string; key: string };

/**
 * A group of consecutive messages from the same author on the same day.
 * Only the first message in a group shows the full author header.
 */
export type MessageGroup = {
  type: "group";
  userId?: number;
  username?: string;
  avatar?: string | null;
  role?: string;
  messages: Message[];
  key: string;
};

/** Union type for items rendered in the message list. */
export type GroupedMessageItem = MessageDivider | MessageGroup;

/**
 * Formats a UTC datetime string as a human-readable date label.
 * Uses "Today" and "Yesterday" for recent dates, otherwise a long-form locale date.
 *
 * @param dateStr - ISO datetime string (e.g. "2024-05-15T14:30:00.000Z").
 * @returns       "Today", "Yesterday", or locale date string (e.g. "May 15, 2024").
 *
 * Built-ins used: `Date`, `Date.toDateString`, `Date.toLocaleDateString`.
 */
export function formatDate(dateStr: string) {
  const d         = new Date(dateStr);
  const today     = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString())     return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Formats a UTC datetime string as a 12-hour time (e.g. "02:30 PM").
 *
 * @param dateStr - ISO datetime string.
 * @returns       Locale time string in HH:MM AM/PM format.
 *
 * Built-ins used: `Date`, `Date.toLocaleTimeString`.
 */
export function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Transforms a flat array of messages into grouped display items for the chat area.
 *
 * Algorithm:
 *  1. For each message, compute its date string.
 *  2. If the date changed from the previous message, emit a `MessageDivider`.
 *  3. If the author is the same as the previous group, append to that group.
 *  4. Otherwise, start a new `MessageGroup`.
 *
 * This produces a list like:
 *   [ divider("Today"), group(alice: [msg1, msg2]), group(bob: [msg3]), ... ]
 *
 * @param messages - Flat ordered array of Message objects (ascending by time).
 * @returns        Mixed array of MessageDivider and MessageGroup items.
 */
export function groupMessages(messages: Message[]): GroupedMessageItem[] {
  const result: GroupedMessageItem[] = [];
  let lastDate:  string | null       = null;
  let lastGroup: MessageGroup | null = null;

  for (const msg of messages) {
    const date     = new Date(msg.created_at).toDateString();
    const authorId = msg.user_id ?? msg.sender_id;

    // Insert a date divider when the day changes
    if (date !== lastDate) {
      result.push({ type: "divider", label: formatDate(msg.created_at), key: `d-${msg.id}` });
      lastDate  = date;
      lastGroup = null; // force a new group after a divider
    }

    if (lastGroup && lastGroup.userId === authorId) {
      // Same author as previous group — append to it (compact rendering)
      lastGroup.messages.push(msg);
    } else {
      // New author or first message after a divider — start a new group
      lastGroup = {
        type: "group", userId: authorId, username: msg.username,
        avatar: msg.avatar, role: msg.role, messages: [msg], key: `g-${msg.id}`,
      };
      result.push(lastGroup);
    }
  }
  return result;
}
