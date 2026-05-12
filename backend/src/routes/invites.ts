// ============================================================
//  src/routes/invites.ts — Public invite-link endpoints
//
//  Allows unauthenticated users to preview a channel via an invite
//  code, and authenticated users (including guests) to join a channel
//  by redeeming that code.
//
//  REST routes defined:
//    GET  /api/invite/:code       — preview invite info (public, no auth required)
//    POST /api/invite/:code/join  — join the channel via invite (auth required)
//
//  Connects to:
//    ../db/database     — SQLite via getDb()
//    ../middleware/auth — authMiddleware (join route only)
// ============================================================

import express from "express";
import { getDb } from "../db/database";
import { authMiddleware } from "../middleware/auth";

type InviteRow = {
  id: number;
  channel_id: number;
  expires_at?: string | null;
  max_uses?: number | null;
  uses_count: number;
  [key: string]: unknown;
};

// Express router; individual routes opt-in to authMiddleware as needed
const router = express.Router();

/**
 * GET /api/invite/:code
 * Returns preview information about a channel invite link — including the
 * channel name, description, current member count, and who created it.
 *
 * This endpoint is intentionally public so that un-authenticated visitors
 * (e.g. following a shared link) can see what they are about to join.
 *
 * Returns HTTP 410 (Gone) if the invite has expired or reached its
 * maximum use count.
 *
 * @route   GET /api/invite/:code
 * @access  Public (no authentication required)
 * @param   {string} req.params.code - The 10-character hex invite code
 * @returns {200} { invite: InvitePreviewObject }
 *   InvitePreviewObject includes all channel_invites fields plus:
 *     channel_name, channel_description, is_private,
 *     created_by_username, member_count
 * @returns {404} { error: string } - Invite not found or deleted
 * @returns {410} { error: string } - Invite has expired or reached max uses
 */
router.get("/:code", (req, res) => {
  const db = getDb();
  const invite = db.prepare(`
    SELECT ci.*,
           c.name        AS channel_name,
           c.description AS channel_description,
           c.is_private,
           u.username    AS created_by_username,
           (SELECT COUNT(*) FROM channel_members WHERE channel_id = ci.channel_id) AS member_count
    FROM channel_invites ci
    JOIN channels c ON c.id = ci.channel_id
    JOIN users    u ON u.id = ci.created_by
    WHERE ci.code = ?
  `).get(req.params.code) as InviteRow | undefined;

  if (!invite)
    return res.status(404).json({ error: "Invite not found or has been deleted" });

  // Check expiry — expires_at is stored as an ISO timestamp string
  if (invite.expires_at && new Date(invite.expires_at) < new Date())
    return res.status(410).json({ error: "This invite has expired" });

  // Check use-count limit
  if (invite.max_uses !== null && invite.uses_count >= invite.max_uses)
    return res.status(410).json({ error: "This invite has reached its maximum number of uses" });

  return res.json({ invite });
});

/**
 * POST /api/invite/:code/join
 * Redeems an invite code, adding the authenticated user to the channel
 * as a "member". Uses INSERT OR IGNORE so calling this endpoint multiple
 * times is safe (idempotent membership add).
 *
 * The invite's `uses_count` is incremented on each successful join.
 * Returns the channel object including the user's resolved role.
 *
 * @route   POST /api/invite/:code/join
 * @access  Private — any authenticated user, including guests
 * @param   {string} req.params.code - The 10-character hex invite code
 * @returns {200} { success: true, channel: ChannelObject }
 *   ChannelObject includes all channels fields plus `user_role`
 * @returns {404} { error: string } - Invite not found
 * @returns {410} { error: string } - Invite expired or max uses reached
 */
router.post("/:code/join", authMiddleware, (req, res) => {
  const db     = getDb();
  const invite = db.prepare("SELECT * FROM channel_invites WHERE code = ?").get(req.params.code) as InviteRow | undefined;

  if (!invite)
    return res.status(404).json({ error: "Invite not found" });

  if (invite.expires_at && new Date(invite.expires_at) < new Date())
    return res.status(410).json({ error: "This invite has expired" });

  if (invite.max_uses !== null && invite.uses_count >= invite.max_uses)
    return res.status(410).json({ error: "This invite has reached its maximum number of uses" });

  // Add the user to the channel (safe if already a member due to OR IGNORE)
  db.prepare("INSERT OR IGNORE INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'member')")
    .run(invite.channel_id, req.user.id);

  // Track usage so max_uses limits are enforced correctly
  db.prepare("UPDATE channel_invites SET uses_count = uses_count + 1 WHERE id = ?").run(invite.id);

  // Return the channel with the user's current role
  const channel = db.prepare(`
    SELECT c.*,
      COALESCE(cm.role, 'member') AS user_role
    FROM channels c
    LEFT JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = ?
    WHERE c.id = ?
  `).get(req.user.id, invite.channel_id);

  return res.json({ success: true, channel });
});

export default router;