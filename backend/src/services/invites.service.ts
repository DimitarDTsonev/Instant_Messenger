/**
 * Invite-link service — business logic for public invite-link preview and join.
 *
 * Invite links are used to let non-members join a channel via a shareable URL.
 * Each link can optionally have a maximum use count and an expiry time.
 *
 * Imported by: invites.controller.ts.
 */

import { getDb } from "../db/database";
import { GoneError, NotFoundError } from "../errors";
import * as Repo from "../repositories/channels.repository";

/**
 * Validates that an invite is still usable (not expired, not exhausted).
 * Throws a GoneError if the invite is no longer valid so callers don't
 * need to repeat these checks.
 *
 * @param invite - Partial invite row with expiry and use-count fields.
 * @throws       GoneError if the invite has expired or reached max uses.
 */
function validateInvite(invite: { expires_at?: string | null; max_uses?: number | null; uses_count: number }) {
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    throw new GoneError("This invite has expired");
  }
  if (invite.max_uses !== null && invite.uses_count >= (invite.max_uses ?? Infinity)) {
    throw new GoneError("This invite has reached its maximum number of uses");
  }
}

/**
 * Returns full details about an invite link for the public preview page.
 * Includes channel name, description, member count, and creator username.
 *
 * @param code - The invite code from the URL.
 * @returns    Enriched invite row with channel and creator details.
 * @throws     NotFoundError if no invite exists with that code.
 * @throws     GoneError     if the invite has expired or reached its use limit.
 */
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

/**
 * Processes a user joining a channel via an invite link.
 *
 * Validates the invite, adds the user as a member (no-op if already a member),
 * increments the use counter, and returns the channel record with the user's role.
 *
 * @param code   - The invite code from the URL.
 * @param userId - ID of the authenticated user joining.
 * @returns      The channel record with the user's role attached.
 * @throws       NotFoundError if the invite doesn't exist.
 * @throws       GoneError     if the invite is expired or at its use limit.
 */
export function joinInvite(code: string, userId: number) {
  const db     = getDb();
  const invite = Repo.findInviteByCode(db, code);
  if (!invite) throw new NotFoundError("Invite not found");
  validateInvite(invite);

  // INSERT OR IGNORE — safe to call if the user is already a member
  Repo.addMember(db, invite.channel_id, userId);
  Repo.incrementInviteUses(db, invite.id);

  return Repo.findWithUserRole(db, invite.channel_id, userId);
}
