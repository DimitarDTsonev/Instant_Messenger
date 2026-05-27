import { getDb } from "../db/database";
import { NotFoundError } from "../errors";
import * as Repo from "../repositories/dm.repository";
import * as UserRepo from "../repositories/users.repository";

export function getConversations(userId: number) {
  return Repo.findConversations(getDb(), userId);
}

export function getMessages(userId: number, partnerId: number, limit: number, before: number | null) {
  const db      = getDb();
  const partner = UserRepo.findPublicById(db, partnerId);
  if (!partner) throw new NotFoundError("User not found");

  const messages = Repo.findMessages(db, userId, partnerId, limit, before);
  Repo.markRead(db, partnerId, userId);

  return { messages, hasMore: messages.length === limit, partner };
}

export function markRead(userId: number, partnerId: number) {
  Repo.markRead(getDb(), partnerId, userId);
}
