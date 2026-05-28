/**
 * Messages service — business logic for channel message retrieval and search.
 *
 * All functions enforce channel access control before returning data:
 * users who are not members of a private channel receive a ForbiddenError.
 *
 * Imported by: messages.controller.ts.
 */

import { getDb } from "../db/database";
import { ForbiddenError, ValidationError } from "../errors";
import { getUserRole } from "../repositories/channels.repository";
import * as Repo from "../repositories/messages.repository";

/**
 * Returns a paginated page of channel messages, newest-first with reactions.
 *
 * @param userId    - Requesting user's ID (used for access control).
 * @param channelId - Target channel ID string.
 * @param limit     - Page size (capped at 100 by the controller).
 * @param before    - Cursor: return only messages with ID < before. Pass `null` for the first page.
 * @returns         `{ messages, hasMore }` — the page and whether an older page exists.
 * @throws          ForbiddenError if the user is not a member of a private channel.
 */
export function getHistory(userId: number, channelId: string, limit: number, before: number | null) {
  const db = getDb();
  if (getUserRole(db, userId, channelId) === null) throw new ForbiddenError("Access denied");
  const messages = Repo.findByChannel(db, channelId, limit, before);
  return { messages, hasMore: messages.length === limit };
}

/**
 * Returns all pinned messages in a channel, newest pin first.
 *
 * @param userId    - Requesting user's ID (used for access control).
 * @param channelId - Target channel ID string.
 * @returns         Array of pinned message rows.
 * @throws          ForbiddenError if the user lacks channel access.
 */
export function getPinned(userId: number, channelId: string) {
  const db = getDb();
  if (getUserRole(db, userId, channelId) === null) throw new ForbiddenError("Access denied");
  return Repo.findPinned(db, channelId);
}

/**
 * Searches across all channel messages and DMs the user can access.
 *
 * @param userId - Requesting user's ID.
 * @param query  - Raw search string (must be at least 2 characters).
 * @returns      `{ results, query }` — up to 50 mixed channel/DM results.
 * @throws       ValidationError if the query is too short.
 */
export function searchAll(userId: number, query: string) {
  if (!query || query.trim().length < 2) throw new ValidationError("Query must be at least 2 characters");
  const results = Repo.searchAll(getDb(), userId, `%${query.trim()}%`);
  return { results, query };
}

/**
 * Searches messages within a specific channel using content matching.
 *
 * @param userId    - Requesting user's ID (used for access control).
 * @param channelId - Channel to search.
 * @param query     - Raw search string (must be at least 2 characters).
 * @returns         `{ results, query, count }` — matching messages in the channel.
 * @throws          ForbiddenError   if the user lacks channel access.
 * @throws          ValidationError  if the query is too short.
 */
export function searchInChannel(userId: number, channelId: string, query: string) {
  if (!query || query.trim().length < 2) throw new ValidationError("Query must be at least 2 characters");
  const db = getDb();
  if (getUserRole(db, userId, channelId) === null) throw new ForbiddenError("Access denied");
  const results = Repo.searchInChannel(db, channelId, query.trim());
  return { results, query, count: results.length };
}
