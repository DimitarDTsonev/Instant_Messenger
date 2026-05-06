// ============================================================
//  src/routes/channels.js — Channel management routes
//
//  Handles channel CRUD, membership management,
//  per-role permission overrides, and invite-link generation.
//
//  All routes require a valid Bearer token (authMiddleware applied
//  globally via router.use at the top of this file).
//
//  REST routes defined:
//    GET    /api/channels                          — list visible channels
//    POST   /api/channels                          — create a channel
//    PATCH  /api/channels/:id                      — update channel settings (owner)
//    DELETE /api/channels/:id                      — delete channel (owner/admin)
//    GET    /api/channels/:id/members              — list channel members
//    POST   /api/channels/:id/members              — add a member
//    PATCH  /api/channels/:id/members/:userId      — change a member's role
//    DELETE /api/channels/:id/members/:userId      — remove a member (kick)
//    GET    /api/channels/:id/permissions          — get role permission settings
//    PUT    /api/channels/:id/permissions/:role    — update role permissions (owner)
//    POST   /api/channels/:id/invites              — generate an invite link
//    GET    /api/channels/:id/invites              — list invite links
//    DELETE /api/channels/:id/invites/:code        — revoke an invite link
//
//  Exports (for socket/handlers.js):
//    getUserRole(db, userId, channelId) — resolves effective role
//    getPerms(db, channelId, role)      — resolves effective permissions
// ============================================================

const express = require("express");
const crypto  = require("crypto");
const { getDb }          = require("../db/database");
const { authMiddleware } = require("../middleware/auth");

// Express router; all sub-routes require authentication
const router = express.Router();
router.use(authMiddleware);

// -------------------------------------------------------
//  Internal helper functions
// -------------------------------------------------------

/**
 * Retrieves the calling user's effective role in a specific channel.
 *
 * Resolution order:
 *  1. Explicit `channel_members` row — returns the stored role (can be "viewer").
 *  2. If the user is the channel's `created_by` value — returns `"owner"`.
 *  3. If the channel is private and the user has no membership — returns `null`.
 *  4. Public channel with no explicit membership — falls back to `"member"`.
 *
 * @param {import('better-sqlite3').Database} db - SQLite database instance
 * @param {number} userId    - ID of the user whose role is being resolved
 * @param {number} channelId - ID of the channel to check
 * @returns {'owner'|'manager'|'member'|'viewer'|null} The user's effective role,
 *   or null if they have no access to a private channel
 */
function getUserRole(db, userId, channelId) {
  const row = db
    .prepare("SELECT role FROM channel_members WHERE channel_id = ? AND user_id = ?")
    .get(channelId, userId);
  if (row) return row.role;

  const ch = db.prepare("SELECT created_by, is_private FROM channels WHERE id = ?").get(channelId);
  if (!ch) return null;
  if (Number(ch.created_by) === Number(userId)) return "owner";
  if (ch.is_private) return null; // private channel with no membership record
  return "member";               // public channel — implicit member access
}

/**
 * Hard-coded fallback permissions used when no `channel_permissions` row
 * exists for a given (channel, role) pair.
 *
 * Managers can do everything except own the channel.
 * Regular members can write but cannot invite, manage members, or delete messages.
 */
const DEFAULT_PERMS = {
  manager: { can_write: 1, can_invite: 1, can_manage_members: 1, can_delete_messages: 1 },
  member:  { can_write: 1, can_invite: 0, can_manage_members: 0, can_delete_messages: 0 },
  viewer:  { can_write: 0, can_invite: 0, can_manage_members: 0, can_delete_messages: 0 },
};

/**
 * Resolves the effective permission set for a role in a specific channel.
 *
 * Owners always have full permissions regardless of any stored overrides.
 * For other roles, the function looks up the `channel_permissions` table
 * and falls back to `DEFAULT_PERMS` when no custom row exists.
 *
 * @param {import('better-sqlite3').Database} db - SQLite database instance
 * @param {number} channelId - ID of the channel
 * @param {'owner'|'manager'|'member'} role - The role whose permissions to resolve
 * @returns {{ can_write: number, can_invite: number, can_manage_members: number, can_delete_messages: number }}
 */
function getPerms(db, channelId, role) {
  if (role === "owner") return { can_write: 1, can_invite: 1, can_manage_members: 1, can_delete_messages: 1 };
  const row = db
    .prepare("SELECT * FROM channel_permissions WHERE channel_id = ? AND role = ?")
    .get(channelId, role);
  return row || DEFAULT_PERMS[role] || DEFAULT_PERMS.member;
}

// -------------------------------------------------------
//  Channel CRUD
// -------------------------------------------------------

/**
 * GET /api/channels
 * Returns all channels visible to the requesting user.
 * A channel is visible if it is public, or if the user is a member,
 * or if the user created it.
 * Each entry includes the user's role in that channel and the total
 * message count.
 *
 * @route   GET /api/channels
 * @access  Private (requires Bearer token)
 * @returns {200} { channels: ChannelObject[] }
 */
router.get("/", (req, res) => {
  const db  = getDb();
  const me  = req.user.id; // ID of the authenticated user

  const channels = db.prepare(`
    SELECT
      c.id, c.name, c.description, c.is_private, c.created_by, c.created_at,
      u.username AS created_by_username,
      COALESCE(cm.role,
        CASE WHEN c.created_by = ? THEN 'owner'
             WHEN c.is_private = 0 THEN 'member'
             ELSE NULL END
      ) AS user_role,
      (SELECT COUNT(*) FROM messages m WHERE m.channel_id = c.id) AS message_count
    FROM channels c
    LEFT JOIN users u ON u.id = c.created_by
    LEFT JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = ?
    WHERE c.is_private = 0
       OR cm.user_id IS NOT NULL
       OR c.created_by = ?
    ORDER BY c.name
  `).all(me, me, me);

  return res.json({ channels });
});

/**
 * POST /api/channels
 * Creates a new channel. The channel name is normalised to lowercase
 * alphanumeric-and-hyphens only. The creator is automatically added as
 * a member with the "owner" role.
 *
 * @route   POST /api/channels
 * @access  Private (requires Bearer token)
 * @param   {Object}  req.body
 * @param   {string}  req.body.name        - Channel name (min 2 chars; normalised)
 * @param   {string}  [req.body.description=""] - Optional description
 * @param   {0|1}     [req.body.is_private=0]   - 1 to create a private channel
 * @returns {201} { channel: ChannelObject }
 * @returns {400} { error: string } - Name too short
 * @returns {409} { error: string } - Channel name already taken
 */
router.post("/", (req, res) => {
  const { name, description = "", is_private = 0 } = req.body;
  if (!name || name.trim().length < 2)
    return res.status(400).json({ error: "Channel name must be at least 2 characters" });

  // Normalise: lowercase, replace non-alphanumeric chars with hyphens
  const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const db = getDb();

  if (db.prepare("SELECT id FROM channels WHERE name = ?").get(cleanName))
    return res.status(409).json({ error: "A channel with that name already exists" });

  const { lastInsertRowid } = db
    .prepare("INSERT INTO channels (name, description, created_by, is_private) VALUES (?, ?, ?, ?)")
    .run(cleanName, description, req.user.id, is_private ? 1 : 0);

  // The creator is automatically the channel owner
  db.prepare("INSERT OR IGNORE INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'owner')")
    .run(lastInsertRowid, req.user.id);

  const channel = db.prepare(`
    SELECT c.*, 'owner' AS user_role FROM channels c WHERE c.id = ?
  `).get(lastInsertRowid);

  return res.status(201).json({ channel });
});

/**
 * PATCH /api/channels/:id
 * Updates the description and/or privacy setting of a channel.
 * Only the channel owner may call this endpoint.
 *
 * @route   PATCH /api/channels/:id
 * @access  Private — channel owner only
 * @param   {string} req.params.id - Channel ID
 * @param   {Object} req.body
 * @param   {string} [req.body.description] - New description text
 * @param   {0|1}    [req.body.is_private]  - Updated privacy flag
 * @returns {200} { channel: ChannelObject }
 * @returns {400} { error: string } - No fields provided to update
 * @returns {403} { error: string } - Caller is not the owner
 */
router.patch("/:id", (req, res) => {
  const db  = getDb();
  const id  = req.params.id;
  const role = getUserRole(db, req.user.id, id);
  if (role !== "owner") return res.status(403).json({ error: "Only the channel owner can edit settings" });

  const { description, is_private } = req.body;
  // Build a dynamic SET clause with only the supplied fields
  const updates = [];
  const vals    = [];

  if (description !== undefined) { updates.push("description = ?"); vals.push(description); }
  if (is_private  !== undefined) { updates.push("is_private = ?");  vals.push(is_private ? 1 : 0); }
  if (!updates.length) return res.status(400).json({ error: "No fields to update" });

  vals.push(id);
  db.prepare(`UPDATE channels SET ${updates.join(", ")} WHERE id = ?`).run(...vals);
  const channel = db.prepare("SELECT * FROM channels WHERE id = ?").get(id);
  return res.json({ channel });
});

/**
 * DELETE /api/channels/:id
 * Permanently deletes a channel and all its messages (via ON DELETE CASCADE).
 * Only the channel creator or a global admin may delete a channel.
 *
 * @route   DELETE /api/channels/:id
 * @access  Private — channel owner or global admin
 * @param   {string} req.params.id - Channel ID
 * @returns {200} { success: true }
 * @returns {403} { error: string } - Insufficient privileges
 * @returns {404} { error: string } - Channel not found
 */
router.delete("/:id", (req, res) => {
  const db  = getDb();
  const ch  = db.prepare("SELECT * FROM channels WHERE id = ?").get(req.params.id);
  if (!ch) return res.status(404).json({ error: "Channel not found" });

  const isAdmin = req.user.role === "admin";
  const isOwner = Number(ch.created_by) === Number(req.user.id);
  if (!isOwner && !isAdmin)
    return res.status(403).json({ error: "You do not have permission to delete this channel" });

  db.prepare("DELETE FROM channels WHERE id = ?").run(req.params.id);
  return res.json({ success: true });
});

// ═══════════════════════════════════════════════════════
//  MEMBERS
// ═══════════════════════════════════════════════════════

/**
 * GET /api/channels/:id/members
 * Returns the list of members in a channel, ordered by role hierarchy
 * (owner first, then manager, then member) and then alphabetically.
 * Includes each member's global role and channel-level role.
 *
 * @route   GET /api/channels/:id/members
 * @access  Private — any channel member
 * @param   {string} req.params.id - Channel ID
 * @returns {200} { members: MemberObject[] }
 * @returns {403} { error: string } - Caller has no access to the channel
 */
router.get("/:id/members", (req, res) => {
  const db  = getDb();
  const id  = req.params.id;
  const role = getUserRole(db, req.user.id, id);
  if (!role) return res.status(403).json({ error: "You do not have access to this channel" });

  const members = db.prepare(`
    SELECT u.id, u.username, u.avatar, u.role AS global_role, cm.role AS channel_role, cm.joined_at
    FROM channel_members cm
    JOIN users u ON u.id = cm.user_id
    WHERE cm.channel_id = ?
    ORDER BY CASE cm.role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, u.username
  `).all(id);

  return res.json({ members });
});

/**
 * POST /api/channels/:id/members
 * Adds a user to a channel by username. The caller must have the
 * `can_manage_members` permission for this channel.
 * The added user receives the "member" role by default.
 *
 * @route   POST /api/channels/:id/members
 * @access  Private — requires can_manage_members permission
 * @param   {string} req.params.id  - Channel ID
 * @param   {Object} req.body
 * @param   {string} req.body.username - Username of the user to add
 * @returns {200} { success: true, user: { id, username, avatar } }
 * @returns {400} { error: string } - Missing username
 * @returns {403} { error: string } - Insufficient permissions
 * @returns {404} { error: string } - User not found
 */
router.post("/:id/members", (req, res) => {
  const db  = getDb();
  const id  = req.params.id;
  const role = getUserRole(db, req.user.id, id);
  const perms = role ? getPerms(db, id, role) : null;

  if (!perms?.can_manage_members)
    return res.status(403).json({ error: "You do not have permission to add members" });

  const { username } = req.body;
  if (!username) return res.status(400).json({ error: "username is required" });

  const target = db.prepare("SELECT id, username, avatar FROM users WHERE username = ?").get(username);
  if (!target) return res.status(404).json({ error: "User not found" });

  db.prepare("INSERT OR IGNORE INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'member')")
    .run(id, target.id);

  return res.json({ success: true, user: target });
});

/**
 * PATCH /api/channels/:id/members/:userId
 * Changes the channel-level role of an existing member.
 * Owners can assign both "manager" and "member".
 * Managers can only assign "member".
 * The owner role itself cannot be changed via this endpoint.
 *
 * @route   PATCH /api/channels/:id/members/:userId
 * @access  Private — owner or manager
 * @param   {string} req.params.id     - Channel ID
 * @param   {string} req.params.userId - Target user's ID
 * @param   {Object} req.body
 * @param   {string} req.body.role     - New role; must be "manager" or "member"
 * @returns {200} { success: true, role: string }
 * @returns {400} { error: string } - Invalid role value
 * @returns {403} { error: string } - Insufficient permissions or target is owner
 */
router.patch("/:id/members/:userId", (req, res) => {
  const db  = getDb();
  const { id, userId } = req.params;
  const myRole = getUserRole(db, req.user.id, id);

  if (!["owner", "manager"].includes(myRole))
    return res.status(403).json({ error: "You do not have permission to change roles" });

  const { role: newRole } = req.body;
  if (!["manager", "member", "viewer"].includes(newRole))
    return res.status(400).json({ error: "Invalid role (manager | member | viewer)" });

  // Only owners can promote to manager
  if (newRole === "manager" && myRole !== "owner")
    return res.status(403).json({ error: "Only the owner can assign the manager role" });

  // The owner role is immutable via this endpoint
  const targetRole = getUserRole(db, userId, id);
  if (targetRole === "owner")
    return res.status(403).json({ error: "The owner role cannot be changed" });

  db.prepare("UPDATE channel_members SET role = ? WHERE channel_id = ? AND user_id = ?")
    .run(newRole, id, userId);

  return res.json({ success: true, role: newRole });
});

/**
 * DELETE /api/channels/:id/members/:userId
 * Removes (kicks) a member from the channel.
 * Requires the `can_manage_members` permission.
 * The channel owner cannot be removed.
 *
 * @route   DELETE /api/channels/:id/members/:userId
 * @access  Private — requires can_manage_members permission
 * @param   {string} req.params.id     - Channel ID
 * @param   {string} req.params.userId - ID of the user to remove
 * @returns {200} { success: true }
 * @returns {403} { error: string } - Insufficient permissions or target is owner
 */
router.delete("/:id/members/:userId", (req, res) => {
  const db  = getDb();
  const { id, userId } = req.params;
  const myRole = getUserRole(db, req.user.id, id);

  const perms = myRole ? getPerms(db, id, myRole) : null;
  if (!perms?.can_manage_members)
    return res.status(403).json({ error: "You do not have permission to remove members" });

  const targetRole = getUserRole(db, userId, id);
  if (targetRole === "owner")
    return res.status(403).json({ error: "The owner cannot be removed" });

  db.prepare("DELETE FROM channel_members WHERE channel_id = ? AND user_id = ?").run(id, userId);
  return res.json({ success: true });
});

// ═══════════════════════════════════════════════════════
//  ROLE PERMISSIONS
// ═══════════════════════════════════════════════════════

/**
 * GET /api/channels/:id/permissions
 * Returns the permission settings for the "manager" and "member" roles
 * in the specified channel. Falls back to default permissions when no
 * custom row exists in `channel_permissions`.
 *
 * @route   GET /api/channels/:id/permissions
 * @access  Private — any channel member
 * @param   {string} req.params.id - Channel ID
 * @returns {200} { permissions: { manager: PermObject, member: PermObject } }
 * @returns {403} { error: string } - Caller has no access to the channel
 */
router.get("/:id/permissions", (req, res) => {
  const db  = getDb();
  const id  = req.params.id;
  const role = getUserRole(db, req.user.id, id);
  if (!role) return res.status(403).json({ error: "Access denied" });

  const rows = db.prepare("SELECT * FROM channel_permissions WHERE channel_id = ?").all(id);
  // Build a keyed object; if no stored row, use the defaults
  const byRole = {};
  for (const r of ["manager", "member"]) {
    byRole[r] = rows.find((x) => x.role === r) || { ...DEFAULT_PERMS[r], role: r, channel_id: Number(id) };
  }
  return res.json({ permissions: byRole });
});

/**
 * PUT /api/channels/:id/permissions/:role
 * Creates or replaces the permission row for a given role in the channel.
 * Uses an UPSERT so the same endpoint handles both create and update.
 * Only the channel owner may call this.
 *
 * @route   PUT /api/channels/:id/permissions/:role
 * @access  Private — channel owner only
 * @param   {string} req.params.id   - Channel ID
 * @param   {string} req.params.role - Role to configure; "manager" or "member"
 * @param   {Object} req.body
 * @param   {0|1}    [req.body.can_write=1]           - May send messages
 * @param   {0|1}    [req.body.can_invite=0]          - May create invite links
 * @param   {0|1}    [req.body.can_manage_members=0]  - May add/remove members
 * @param   {0|1}    [req.body.can_delete_messages=0] - May delete others' messages
 * @returns {200} { success: true }
 * @returns {400} { error: string } - Invalid role value
 * @returns {403} { error: string } - Caller is not the owner
 */
router.put("/:id/permissions/:role", (req, res) => {
  const db  = getDb();
  const { id, role } = req.params;
  const myRole = getUserRole(db, req.user.id, id);

  if (myRole !== "owner") return res.status(403).json({ error: "Only the channel owner can edit permissions" });
  if (!["manager", "member"].includes(role)) return res.status(400).json({ error: "Invalid role" });

  const { can_write = 1, can_invite = 0, can_manage_members = 0, can_delete_messages = 0 } = req.body;

  db.prepare(`
    INSERT INTO channel_permissions (channel_id, role, can_write, can_invite, can_manage_members, can_delete_messages)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(channel_id, role) DO UPDATE SET
      can_write           = excluded.can_write,
      can_invite          = excluded.can_invite,
      can_manage_members  = excluded.can_manage_members,
      can_delete_messages = excluded.can_delete_messages
  `).run(id, role, can_write ? 1 : 0, can_invite ? 1 : 0, can_manage_members ? 1 : 0, can_delete_messages ? 1 : 0);

  return res.json({ success: true });
});

// ═══════════════════════════════════════════════════════
//  INVITE LINKS
// ═══════════════════════════════════════════════════════

/**
 * POST /api/channels/:id/invites
 * Generates a unique invite link code for the channel.
 * Requires the `can_invite` permission. The code is a 10-character
 * hex string. Optional expiry and use-count limits can be set.
 *
 * @route   POST /api/channels/:id/invites
 * @access  Private — requires can_invite permission
 * @param   {string} req.params.id - Channel ID
 * @param   {Object} req.body
 * @param   {number|null} [req.body.maxUses=null]         - Maximum times the link may be used
 * @param   {number|null} [req.body.expiresInHours=null]  - Link validity in hours from now
 * @returns {201} { invite: InviteObject }
 * @returns {403} { error: string } - Insufficient permissions
 */
router.post("/:id/invites", (req, res) => {
  const db  = getDb();
  const id  = req.params.id;
  const role = getUserRole(db, req.user.id, id);
  const perms = role ? getPerms(db, id, role) : null;

  if (!perms?.can_invite)
    return res.status(403).json({ error: "You do not have permission to create invites" });

  const { maxUses = null, expiresInHours = null } = req.body;
  // Generate a 10-character hex invite code
  const code = crypto.randomBytes(5).toString("hex");
  // Compute absolute expiry timestamp or leave null for no expiry
  const expiresAt = expiresInHours
    ? new Date(Date.now() + expiresInHours * 3600 * 1000).toISOString()
    : null;

  const { lastInsertRowid } = db
    .prepare("INSERT INTO channel_invites (channel_id, created_by, code, max_uses, expires_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, req.user.id, code, maxUses, expiresAt);

  const invite = db.prepare("SELECT * FROM channel_invites WHERE id = ?").get(lastInsertRowid);
  return res.status(201).json({ invite });
});

/**
 * GET /api/channels/:id/invites
 * Returns all active invite links for the channel, including the
 * username of the creator. Requires the `can_invite` permission.
 *
 * @route   GET /api/channels/:id/invites
 * @access  Private — requires can_invite permission
 * @param   {string} req.params.id - Channel ID
 * @returns {200} { invites: InviteObject[] }
 * @returns {403} { error: string } - Insufficient permissions
 */
router.get("/:id/invites", (req, res) => {
  const db  = getDb();
  const id  = req.params.id;
  const role = getUserRole(db, req.user.id, id);
  const perms = role ? getPerms(db, id, role) : null;

  if (!perms?.can_invite)
    return res.status(403).json({ error: "Access denied" });

  const invites = db.prepare(`
    SELECT ci.*, u.username AS created_by_username
    FROM channel_invites ci
    JOIN users u ON u.id = ci.created_by
    WHERE ci.channel_id = ?
    ORDER BY ci.created_at DESC
  `).all(id);

  return res.json({ invites });
});

/**
 * DELETE /api/channels/:id/invites/:code
 * Revokes (deletes) a specific invite link by its code.
 * Requires the `can_invite` permission.
 *
 * @route   DELETE /api/channels/:id/invites/:code
 * @access  Private — requires can_invite permission
 * @param   {string} req.params.id   - Channel ID
 * @param   {string} req.params.code - Invite code to revoke
 * @returns {200} { success: true }
 * @returns {403} { error: string } - Insufficient permissions
 */
router.delete("/:id/invites/:code", (req, res) => {
  const db  = getDb();
  const { id, code } = req.params;
  const role = getUserRole(db, req.user.id, id);
  const perms = role ? getPerms(db, id, role) : null;

  if (!perms?.can_invite)
    return res.status(403).json({ error: "You do not have permission to manage invites" });

  db.prepare("DELETE FROM channel_invites WHERE channel_id = ? AND code = ?").run(id, code);
  return res.json({ success: true });
});

// -------------------------------------------------------
//  Export router and helpers (helpers used by socket/handlers.js)
// -------------------------------------------------------
module.exports = router;
module.exports.getUserRole = getUserRole;
module.exports.getPerms    = getPerms;
