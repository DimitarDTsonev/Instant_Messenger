import { getDb } from "../db/database";
import { ForbiddenError, ValidationError } from "../errors";
import { getUserRole } from "../repositories/channels.repository";
import * as Repo from "../repositories/messages.repository";

export function getHistory(userId: number, channelId: string, limit: number, before: number | null) {
  const db = getDb();
  if (getUserRole(db, userId, channelId) === null) throw new ForbiddenError("Access denied");
  const messages = Repo.findByChannel(db, channelId, limit, before);
  return { messages, hasMore: messages.length === limit };
}

export function getPinned(userId: number, channelId: string) {
  const db = getDb();
  if (getUserRole(db, userId, channelId) === null) throw new ForbiddenError("Access denied");
  return Repo.findPinned(db, channelId);
}

export function searchAll(userId: number, query: string) {
  if (!query || query.trim().length < 2) throw new ValidationError("Query must be at least 2 characters");
  const results = Repo.searchAll(getDb(), userId, `%${query.trim()}%`);
  return { results, query };
}

export function searchInChannel(userId: number, channelId: string, query: string) {
  if (!query || query.trim().length < 2) throw new ValidationError("Query must be at least 2 characters");
  const db = getDb();
  if (getUserRole(db, userId, channelId) === null) throw new ForbiddenError("Access denied");
  const results = Repo.searchInChannel(db, channelId, query.trim());
  return { results, query, count: results.length };
}
