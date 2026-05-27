import { getDb } from "../db/database";
import { GoneError, NotFoundError } from "../errors";
import * as Repo from "../repositories/channels.repository";

function validateInvite(invite: { expires_at?: string | null; max_uses?: number | null; uses_count: number }) {
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    throw new GoneError("This invite has expired");
  }
  if (invite.max_uses !== null && invite.uses_count >= (invite.max_uses ?? Infinity)) {
    throw new GoneError("This invite has reached its maximum number of uses");
  }
}

export function getInvite(code: string) {
  const db     = getDb();
  const invite = Repo.findInviteByCodeWithDetails(db, code) as {
    expires_at?: string | null;
    max_uses?: number | null;
    uses_count: number;
    [key: string]: unknown;
  } | undefined;

  if (!invite) throw new NotFoundError("Invite not found or has been deleted");
  validateInvite(invite);
  return invite;
}

export function joinInvite(code: string, userId: number) {
  const db     = getDb();
  const invite = Repo.findInviteByCode(db, code);
  if (!invite) throw new NotFoundError("Invite not found");
  validateInvite(invite);

  Repo.addMember(db, invite.channel_id, userId);
  Repo.incrementInviteUses(db, invite.id);

  return Repo.findWithUserRole(db, invite.channel_id, userId);
}
