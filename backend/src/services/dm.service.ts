/**
 * Direct Messages service — business logic for DM retrieval and read-marking.
 *
 * The service verifies that the partner user exists before fetching messages,
 * then automatically marks the partner's unread messages as read after loading.
 *
 * Imported by: dm.controller.ts.
 */

import { getDb } from "../db/database";
import { NotFoundError } from "../errors";
import * as Repo from "../repositories/dm.repository";
import * as UserRepo from "../repositories/users.repository";

/**
 * Returns the list of all DM conversations for the current user, each with
 * the most-recent message preview and the unread message count.
 *
 * @param userId - ID of the authenticated user.
 * @returns      Array of conversation summary objects sorted by last activity.
 */
export function getConversations(userId: number) {
  return Repo.findConversations(getDb(), userId);
}

/**
 * Returns a paginated page of direct messages between the current user and
 * a conversation partner, then marks those messages as read.
 *
 * @param userId    - The authenticated user's ID.
 * @param partnerId - ID of the other participant in the conversation.
 * @param limit     - Maximum messages to return (capped at 100 by the controller).
 * @param before    - Cursor for keyset pagination (returns messages with ID < before).
 * @returns         `{ messages, hasMore, partner }`.
 * @throws          NotFoundError if the partner user doesn't exist.
 */
export function getMessages(userId: number, partnerId: number, limit: number, before: number | null) {
  const db      = getDb();
  const partner = UserRepo.findPublicById(db, partnerId);
  if (!partner) throw new NotFoundError("User not found");

  const messages = Repo.findMessages(db, userId, partnerId, limit, before);
  // Mark the partner's messages to the current user as read now that they are being viewed
  Repo.markRead(db, partnerId, userId);

  return { messages, hasMore: messages.length === limit, partner };
}

/**
 * Marks all unread messages from a partner to the current user as read.
 * Called when the client explicitly signals that messages have been seen
 * (e.g. via the dm:read Socket.io event).
 *
 * @param userId    - The authenticated user (receiver).
 * @param partnerId - The sender whose messages are being acknowledged.
 */
export function markRead(userId: number, partnerId: number) {
  Repo.markRead(getDb(), partnerId, userId);
}