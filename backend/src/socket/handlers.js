// ============================================================
//  src/socket/handlers.js — Socket.io event handlers
//
//  Registers all real-time event handlers on a Socket.io server
//  instance. Each connected socket is authenticated via JWT before
//  any events are processed.
//
//  Socket rooms used:
//    channel:<channelId>        — all members currently viewing a channel
//    notifications:<userId>     — personal room for DMs and mentions
//
//  Events handled (inbound from client):
//    channel:join               — switch the active channel room
//    message:send               — post a new channel message
//    message:edit               — edit an own channel message
//    message:delete             — delete a channel message
//    message:react              — toggle emoji reaction on a channel message
//    message:pin                — pin a channel message
//    message:unpin              — unpin a channel message
//    dm:send                    — send a direct message
//    dm:edit                    — edit an own direct message
//    dm:delete                  — delete an own direct message
//    dm:react                   — toggle emoji reaction on a DM
//    typing:start               — broadcast "user is typing" to a channel
//    typing:stop                — broadcast "user stopped typing" to a channel
//    disconnect                 — clean up online user state
//
//  Events emitted (outbound to clients):
//    users:online               — updated list of online user IDs
//    message:new                — newly created channel message object
//    message:edited             — updated channel message object
//    message:deleted            — { messageId, channelId }
//    message:reacted            — { messageId, reactions }
//    message:pinned             — pinned message object
//    message:unpinned           — { messageId, channelId }
//    channel:notification       — { channelId, messageId } (new message badge)
//    user:mentioned             — { message, mentionedBy, channelId }
//    dm:new                     — new DM object with from_user_id
//    dm:edited                  — updated DM object
//    dm:deleted                 — { messageId, senderId, receiverId }
//    dm:reacted                 — { messageId, reactions }
//    typing:update              — { userId, username, isTyping }
//
//  Connects to:
//    ../db/database             — SQLite via getDb()
//    ../routes/channels         — getUserRole, getPerms helpers
// ============================================================

const jwt = require("jsonwebtoken");
const { getDb } = require("../db/database");
const { getUserRole, getPerms } = require("../routes/channels");
const { logSecurityEvent, isUserBanned, isSocketRateLimited, RATE_BAN } = require("../middleware/security");

// JWT secret must match the one used in middleware/auth.js
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-dev-key-change-in-prod";

// In-memory map of currently connected users: userId -> { socketId, username }
const onlineUsers = new Map();

/**
 * Safely calls an acknowledgement callback if it is a function.
 * Socket.io event handlers receive an optional callback as the last
 * argument; this helper avoids repetitive `typeof fn === "function"` guards.
 *
 * @param {Function|undefined} fn   - The acknowledgement callback (may be undefined)
 * @param {Object}             data - Payload to pass to the callback
 * @returns {void}
 */
function ack(fn, data) {
  if (typeof fn === "function") fn(data);
}

/**
 * Builds an emoji reactions map for a single channel message.
 *
 * Returns an object of the form `{ [emoji]: userId[] }` by querying
 * the `message_reactions` table. Returns an empty object if no reactions
 * exist.
 *
 * @param {import('better-sqlite3').Database} db - SQLite database instance
 * @param {number} messageId - ID of the channel message
 * @returns {{ [emoji: string]: number[] }} Map of emoji to arrays of user IDs
 */
function getReactions(db, messageId) {
  const rows = db
    .prepare("SELECT emoji, user_id FROM message_reactions WHERE message_id = ?")
    .all(messageId);
  const map = {};
  for (const r of rows) {
    if (!map[r.emoji]) map[r.emoji] = [];
    map[r.emoji].push(r.user_id);
  }
  return map;
}

/**
 * Builds an emoji reactions map for a single direct message.
 *
 * Returns an object of the form `{ [emoji]: userId[] }` by querying
 * the `dm_reactions` table. Returns an empty object if no reactions exist.
 *
 * @param {import('better-sqlite3').Database} db - SQLite database instance
 * @param {number} messageId - ID of the direct message
 * @returns {{ [emoji: string]: number[] }} Map of emoji to arrays of user IDs
 */
function getDmReactions(db, messageId) {
  const rows = db
    .prepare("SELECT emoji, user_id FROM dm_reactions WHERE message_id = ?")
    .all(messageId);
  const map = {};
  for (const r of rows) {
    if (!map[r.emoji]) map[r.emoji] = [];
    map[r.emoji].push(r.user_id);
  }
  return map;
}

/**
 * Fetches a fully-hydrated channel message object by ID.
 *
 * Includes author info, reply-to preview (content, file_url, author),
 * reply count, and attached emoji reactions. Returns `undefined` if
 * the message does not exist.
 *
 * @param {import('better-sqlite3').Database} db - SQLite database instance
 * @param {number} messageId - ID of the channel message to fetch
 * @returns {Object|undefined} Full message object with `reactions` attached
 */
function getFullMessage(db, messageId) {
  const msg = db.prepare(`
    SELECT
      m.id, m.content, m.created_at, m.is_edited, m.edited_at,
      m.reply_to_id, m.file_url, m.file_type, m.file_name, m.is_pinned, m.channel_id,
      u.id   AS user_id, u.username, u.avatar, u.role,
      rm.content  AS reply_content,
      rm.file_url AS reply_file_url,
      ru.username AS reply_username,
      ru.avatar   AS reply_avatar,
      (SELECT COUNT(*) FROM messages r WHERE r.reply_to_id = m.id) AS reply_count
    FROM messages m
    JOIN users u ON u.id = m.user_id
    LEFT JOIN messages rm ON rm.id = m.reply_to_id
    LEFT JOIN users ru    ON ru.id = rm.user_id
    WHERE m.id = ?
  `).get(messageId);
  if (msg) msg.reactions = getReactions(db, messageId);
  return msg;
}

/**
 * Fetches a fully-hydrated direct message object by ID.
 *
 * Includes sender info, reply-to preview (content, file_url, sender username),
 * and attached emoji reactions. Returns `undefined` if the message does not exist.
 *
 * @param {import('better-sqlite3').Database} db - SQLite database instance
 * @param {number} messageId - ID of the direct message to fetch
 * @returns {Object|undefined} Full DM object with `reactions` attached
 */
function getFullDmMessage(db, messageId) {
  const msg = db.prepare(`
    SELECT
      dm.id, dm.content, dm.created_at, dm.is_read,
      dm.is_edited, dm.edited_at,
      dm.reply_to_id, dm.file_url, dm.file_type, dm.file_name,
      dm.sender_id   AS user_id,
      dm.sender_id, dm.receiver_id,
      u.username, u.avatar, u.role,
      rdm.content    AS reply_content,
      rdm.file_url   AS reply_file_url,
      ru.username    AS reply_username,
      ru.avatar      AS reply_avatar
    FROM direct_messages dm
    JOIN users u  ON u.id  = dm.sender_id
    LEFT JOIN direct_messages rdm ON rdm.id = dm.reply_to_id
    LEFT JOIN users ru             ON ru.id  = rdm.sender_id
    WHERE dm.id = ?
  `).get(messageId);
  if (msg) msg.reactions = getDmReactions(db, messageId);
  return msg;
}

/**
 * Emits an event to both participants of a direct message conversation.
 *
 * Both the sender and receiver are in their own personal
 * `notifications:<userId>` room, so this function targets both rooms
 * to ensure real-time delivery to whichever socket is currently connected.
 *
 * @param {import('socket.io').Server} io  - Socket.io server instance
 * @param {number} senderId   - ID of the DM sender
 * @param {number} receiverId - ID of the DM receiver
 * @param {string} event      - Socket.io event name to emit
 * @param {Object} data       - Payload to send with the event
 * @returns {void}
 */
function emitToDmPair(io, senderId, receiverId, event, data) {
  io.to(`notifications:${senderId}`).emit(event, data);
  io.to(`notifications:${receiverId}`).emit(event, data);
}

/**
 * Scans a message body for `@username` mentions and, for each mention of
 * a user other than the sender, emits a `user:mentioned` event to that
 * user's personal notification room.
 *
 * The `user:mentioned` payload is:
 *   `{ message: MessageObject, mentionedBy: string, channelId: number }`
 *
 * @param {import('socket.io').Server} io - Socket.io server instance
 * @param {import('better-sqlite3').Database} db - SQLite database instance
 * @param {string} content     - Raw message text to scan for mentions
 * @param {Object} message     - Full message object (used as payload)
 * @param {{ id: number, username: string }} senderUser - The author of the message
 * @returns {void}
 */
function notifyMentions(io, db, content, message, senderUser) {
  const mentionRegex = /@(\w+)/g;
  let match;
  while ((match = mentionRegex.exec(content)) !== null) {
    const username = match[1].toLowerCase();
    const mentioned = db.prepare("SELECT id FROM users WHERE LOWER(username) = ?").get(username);
    if (mentioned && mentioned.id !== senderUser.id) {
      io.to(`notifications:${mentioned.id}`).emit("user:mentioned", {
        message,
        mentionedBy: senderUser.username,
        channelId: message.channel_id,
      });
    }
  }
}

/**
 * Registers all Socket.io event handlers on the provided server instance.
 *
 * Sets up a JWT authentication middleware that runs before any connection
 * is accepted, then registers per-socket event handlers inside the
 * `"connection"` callback.
 *
 * @param {import('socket.io').Server} io - The Socket.io server instance
 * @returns {void}
 */
function registerSocketHandlers(io) {

  /**
   * Socket.io authentication middleware.
   * Reads the JWT from `socket.handshake.auth.token`, verifies it, and
   * attaches the decoded user payload to `socket.user`.
   * Rejects the connection with an error if the token is missing or invalid.
   */
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("Token required"));
    try {
      socket.user = jwt.verify(token, JWT_SECRET);
      // Reject banned users at connection time
      const db = getDb();
      if (isUserBanned(db, socket.user.id)) {
        logSecurityEvent(db, {
          event: "banned_socket_attempt",
          userId: socket.user.id,
          username: socket.user.username,
          detail: "blocked at socket connect",
        });
        return next(new Error("Account suspended"));
      }
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.user; // Decoded JWT payload: { id, username, email, role }
    console.log(`Connected: ${user.username} (${socket.id})`);

    // Track the user as online and broadcast the updated online list
    onlineUsers.set(user.id, { socketId: socket.id, username: user.username });
    io.emit("users:online", Array.from(onlineUsers.keys()));
    // Join the personal notification room so DMs and mentions reach this socket
    socket.join(`notifications:${user.id}`);

    // -----------------------------------------------------------
    // Event: channel:join
    // Payload: channelId (number)
    //
    // Leaves all current channel rooms (keeping the notification room),
    // then joins the room for the specified channel.
    // The client should emit this whenever the user navigates to a channel.
    // -----------------------------------------------------------
    socket.on("channel:join", (channelId) => {
      // Leave all channel rooms before joining the new one
      socket.rooms.forEach((room) => {
        if (room !== socket.id && !room.startsWith("notifications:")) socket.leave(room);
      });
      socket.join(`channel:${channelId}`);
    });

    // -----------------------------------------------------------
    // Event: message:send
    // Payload: { channelId, content, replyToId?, fileUrl?, fileType?, fileName? }
    // Callback: { success: true, message } | { error: string }
    //
    // Validates that the sender has can_write permission, persists the
    // message, and broadcasts it to all clients in the channel room.
    // Also sends a channel:notification to all other online users and
    // resolves any @mention notifications.
    //
    // Emits: message:new → channel:<channelId>
    //        channel:notification → notifications:<uid> (for every other online user)
    //        user:mentioned → notifications:<uid> (for each mentioned user)
    // -----------------------------------------------------------
    socket.on("message:send", ({ channelId, content, replyToId, fileUrl, fileType, fileName }, callback) => {
      const text = (content || "").trim();
      if (!text && !fileUrl) return ack(callback, { error: "Message cannot be empty" });
      if (text.length > 2000) return ack(callback, { error: "Message is too long (max 2000 characters)" });

      const db = getDb();

      // Rate-limit: warn at 20 msg/10s, auto-ban at 50 msg/10s
      const { limited, count } = isSocketRateLimited(user.id);
      if (count >= RATE_BAN) {
        db.prepare("UPDATE users SET is_banned = 1, ban_reason = ? WHERE id = ?")
          .run("Auto-banned: message flooding", user.id);
        logSecurityEvent(db, {
          event: "msg_flood_ban",
          userId: user.id,
          username: user.username,
          detail: `${count} messages in 10s — auto-banned`,
        });
        socket.emit("error", { message: "You have been banned for flooding." });
        socket.disconnect(true);
        return;
      }
      if (limited) {
        logSecurityEvent(db, {
          event: "msg_flood_warn",
          userId: user.id,
          username: user.username,
          detail: `${count} messages in 10s`,
        });
        return ack(callback, { error: "You are sending messages too fast. Please slow down." });
      }
      const role = getUserRole(db, user.id, channelId);
      const perms = role ? getPerms(db, channelId, role) : null;
      if (!perms?.can_write) return ack(callback, { error: "You do not have permission to write in this channel" });
      const { lastInsertRowid } = db
        .prepare("INSERT INTO messages (content, channel_id, user_id, reply_to_id, file_url, file_type, file_name) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(text, channelId, user.id, replyToId || null, fileUrl || null, fileType || null, fileName || null);

      const message = getFullMessage(db, lastInsertRowid);
      // Broadcast the new message to everyone currently in the channel room
      io.to(`channel:${channelId}`).emit("message:new", message);

      // Notify all other online users so they can update unread badges
      onlineUsers.forEach((_, uid) => {
        if (uid !== user.id) {
          io.to(`notifications:${uid}`).emit("channel:notification", {
            channelId: Number(channelId),
            messageId: message.id,
          });
        }
      });

      if (text) notifyMentions(io, db, text, message, user);
      ack(callback, { success: true, message });
    });

    // -----------------------------------------------------------
    // Event: message:edit
    // Payload: { messageId, content }
    // Callback: { success: true, message } | { error: string }
    //
    // Only the original author may edit a message.
    // Sets is_edited = 1 and records edited_at timestamp.
    //
    // Emits: message:edited → channel:<channelId>
    // -----------------------------------------------------------
    socket.on("message:edit", ({ messageId, content }, callback) => {
      if (!content?.trim()) return ack(callback, { error: "Content cannot be empty" });

      const db  = getDb();
      const msg = db.prepare("SELECT * FROM messages WHERE id = ?").get(messageId);
      if (!msg) return ack(callback, { error: "Message not found" });
      if (msg.user_id !== user.id) return ack(callback, { error: "You can only edit your own messages" });

      // Format edited_at as "YYYY-MM-DD HH:MM:SS" for SQLite DATETIME compatibility
      const now = new Date().toISOString().replace("T", " ").slice(0, 19);
      db.prepare("UPDATE messages SET content = ?, is_edited = 1, edited_at = ? WHERE id = ?")
        .run(content.trim(), now, messageId);

      const updated = getFullMessage(db, messageId);
      io.to(`channel:${msg.channel_id}`).emit("message:edited", updated);
      ack(callback, { success: true, message: updated });
    });

    // -----------------------------------------------------------
    // Event: message:delete
    // Payload: { messageId }
    // Callback: { success: true } | { error: string }
    //
    // The original author or any admin may delete a message.
    //
    // Emits: message:deleted → channel:<channelId>
    //   Payload: { messageId, channelId }
    // -----------------------------------------------------------
    socket.on("message:delete", ({ messageId }, callback) => {
      const db  = getDb();
      const msg = db.prepare("SELECT * FROM messages WHERE id = ?").get(messageId);
      if (!msg) return ack(callback, { error: "Message not found" });

      // Check admin status fresh from the database to catch role changes
      const isAdmin = user.role === "admin" ||
        db.prepare("SELECT role FROM users WHERE id = ?").get(user.id)?.role === "admin";

      if (msg.user_id !== user.id && !isAdmin) return ack(callback, { error: "You do not have permission to delete this message" });

      db.prepare("DELETE FROM messages WHERE id = ?").run(messageId);
      io.to(`channel:${msg.channel_id}`).emit("message:deleted", { messageId, channelId: msg.channel_id });
      ack(callback, { success: true });
    });

    // -----------------------------------------------------------
    // Event: message:react
    // Payload: { messageId, emoji }
    // Callback: { success: true, reactions } | { error: string }
    //
    // Toggles the reaction: adds it if absent, removes it if present.
    //
    // Emits: message:reacted → channel:<channelId>
    //   Payload: { messageId, reactions: { [emoji]: userId[] } }
    // -----------------------------------------------------------
    socket.on("message:react", ({ messageId, emoji }, callback) => {
      const db  = getDb();
      const msg = db.prepare("SELECT channel_id FROM messages WHERE id = ?").get(messageId);
      if (!msg) return ack(callback, { error: "Message not found" });

      // Check for an existing reaction from this user with the same emoji
      const existing = db
        .prepare("SELECT id FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?")
        .get(messageId, user.id, emoji);

      if (existing) {
        // Toggle off: remove the existing reaction
        db.prepare("DELETE FROM message_reactions WHERE id = ?").run(existing.id);
      } else {
        // Toggle on: add the reaction
        db.prepare("INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)").run(messageId, user.id, emoji);
      }

      const reactions = getReactions(db, messageId);
      io.to(`channel:${msg.channel_id}`).emit("message:reacted", { messageId, reactions });
      ack(callback, { success: true, reactions });
    });

    // -----------------------------------------------------------
    // Event: message:pin
    // Payload: { messageId }
    // Callback: { success: true, message } | { error: string }
    //
    // Only the channel creator or a global admin may pin messages.
    //
    // Emits: message:pinned → channel:<channelId>
    //   Payload: full message object with is_pinned = 1
    // -----------------------------------------------------------
    socket.on("message:pin", ({ messageId }, callback) => {
      const db     = getDb();
      const msg    = db.prepare("SELECT * FROM messages WHERE id = ?").get(messageId);
      if (!msg) return ack(callback, { error: "Message not found" });

      const channel = db.prepare("SELECT created_by FROM channels WHERE id = ?").get(msg.channel_id);
      // Refresh admin status from the database in case it changed since login
      const isAdmin = user.role === "admin" ||
        db.prepare("SELECT role FROM users WHERE id = ?").get(user.id)?.role === "admin";
      const isCreator = channel?.created_by === user.id;

      if (!isAdmin && !isCreator) return ack(callback, { error: "You do not have permission to pin messages" });

      db.prepare("UPDATE messages SET is_pinned = 1 WHERE id = ?").run(messageId);
      const pinned = getFullMessage(db, messageId);
      io.to(`channel:${msg.channel_id}`).emit("message:pinned", pinned);
      ack(callback, { success: true, message: pinned });
    });

    // -----------------------------------------------------------
    // Event: message:unpin
    // Payload: { messageId }
    // Callback: { success: true } | { error: string }
    //
    // Removes the pin flag from a message.
    //
    // Emits: message:unpinned → channel:<channelId>
    //   Payload: { messageId, channelId }
    // -----------------------------------------------------------
    socket.on("message:unpin", ({ messageId }, callback) => {
      const db  = getDb();
      const msg = db.prepare("SELECT channel_id FROM messages WHERE id = ?").get(messageId);
      if (!msg) return ack(callback, { error: "Message not found" });

      db.prepare("UPDATE messages SET is_pinned = 0 WHERE id = ?").run(messageId);
      io.to(`channel:${msg.channel_id}`).emit("message:unpinned", { messageId, channelId: msg.channel_id });
      ack(callback, { success: true });
    });

    // -----------------------------------------------------------
    // Event: dm:send
    // Payload: { receiverId, content, fileUrl?, fileType?, fileName?, replyToId? }
    // Callback: { success: true, message } | { error: string }
    //
    // Persists the DM and notifies the receiver's personal room.
    // The sender receives the full message object via the ack callback
    // and adds it to their local state without a separate socket event.
    //
    // Emits: dm:new → notifications:<receiverId>
    //   Payload: full DM object with from_user_id appended
    // -----------------------------------------------------------
    socket.on("dm:send", ({ receiverId, content, fileUrl, fileType, fileName, replyToId }, callback) => {
      const text = (content || "").trim();
      if (!text && !fileUrl) return ack(callback, { error: "Message cannot be empty" });

      const db = getDb();

      // Shared rate limit with channel messages — same 20/10s window
      const { limited, count } = isSocketRateLimited(user.id);
      if (count >= RATE_BAN) {
        db.prepare("UPDATE users SET is_banned = 1, ban_reason = ? WHERE id = ?")
          .run("Auto-banned: message flooding", user.id);
        logSecurityEvent(db, {
          event: "msg_flood_ban",
          userId: user.id,
          username: user.username,
          detail: `${count} DMs in 10s — auto-banned`,
        });
        socket.emit("error", { message: "You have been banned for flooding." });
        socket.disconnect(true);
        return;
      }
      if (limited) {
        return ack(callback, { error: "You are sending messages too fast. Please slow down." });
      }

      const receiver = db.prepare("SELECT id FROM users WHERE id = ?").get(receiverId);
      if (!receiver) return ack(callback, { error: "Recipient not found" });

      const { lastInsertRowid } = db
        .prepare("INSERT INTO direct_messages (content, sender_id, receiver_id, file_url, file_type, file_name, reply_to_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(text, user.id, receiverId, fileUrl || null, fileType || null, fileName || null, replyToId || null);

      const message = getFullDmMessage(db, lastInsertRowid);

      // Only the receiver gets a push event; the sender uses the ack callback
      // to add the message to their own local conversation state.
      io.to(`notifications:${receiverId}`).emit("dm:new", { ...message, from_user_id: user.id });
      ack(callback, { success: true, message });
    });

    // -----------------------------------------------------------
    // Event: dm:edit
    // Payload: { messageId, content }
    // Callback: { success: true, message } | { error: string }
    //
    // Only the sender may edit their own direct message.
    // Sets is_edited = 1 and records edited_at.
    //
    // Emits: dm:edited → notifications:<senderId> AND notifications:<receiverId>
    //   Payload: updated full DM object
    // -----------------------------------------------------------
    socket.on("dm:edit", ({ messageId, content }, callback) => {
      if (!content?.trim()) return ack(callback, { error: "Content cannot be empty" });

      const db  = getDb();
      const msg = db.prepare("SELECT * FROM direct_messages WHERE id = ?").get(messageId);
      if (!msg) return ack(callback, { error: "Message not found" });
      if (msg.sender_id !== user.id) return ack(callback, { error: "You can only edit your own messages" });

      const now = new Date().toISOString().replace("T", " ").slice(0, 19);
      db.prepare("UPDATE direct_messages SET content = ?, is_edited = 1, edited_at = ? WHERE id = ?")
        .run(content.trim(), now, messageId);

      const updated = getFullDmMessage(db, messageId);
      emitToDmPair(io, msg.sender_id, msg.receiver_id, "dm:edited", updated);
      ack(callback, { success: true, message: updated });
    });

    // -----------------------------------------------------------
    // Event: dm:delete
    // Payload: { messageId }
    // Callback: { success: true } | { error: string }
    //
    // Only the sender may delete their own direct message.
    //
    // Emits: dm:deleted → notifications:<senderId> AND notifications:<receiverId>
    //   Payload: { messageId, senderId, receiverId }
    // -----------------------------------------------------------
    socket.on("dm:delete", ({ messageId }, callback) => {
      const db  = getDb();
      const msg = db.prepare("SELECT * FROM direct_messages WHERE id = ?").get(messageId);
      if (!msg) return ack(callback, { error: "Message not found" });
      if (msg.sender_id !== user.id) return ack(callback, { error: "You can only delete your own messages" });

      db.prepare("DELETE FROM direct_messages WHERE id = ?").run(messageId);
      emitToDmPair(io, msg.sender_id, msg.receiver_id, "dm:deleted", {
        messageId,
        senderId: msg.sender_id,
        receiverId: msg.receiver_id,
      });
      ack(callback, { success: true });
    });

    // -----------------------------------------------------------
    // Event: dm:react
    // Payload: { messageId, emoji }
    // Callback: { success: true, reactions } | { error: string }
    //
    // Toggles the emoji reaction: adds it if absent, removes it if present.
    //
    // Emits: dm:reacted → notifications:<senderId> AND notifications:<receiverId>
    //   Payload: { messageId, reactions: { [emoji]: userId[] } }
    // -----------------------------------------------------------
    socket.on("dm:react", ({ messageId, emoji }, callback) => {
      const db  = getDb();
      const msg = db.prepare("SELECT sender_id, receiver_id FROM direct_messages WHERE id = ?").get(messageId);
      if (!msg) return ack(callback, { error: "Message not found" });

      const existing = db
        .prepare("SELECT id FROM dm_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?")
        .get(messageId, user.id, emoji);

      if (existing) {
        db.prepare("DELETE FROM dm_reactions WHERE id = ?").run(existing.id);
      } else {
        db.prepare("INSERT INTO dm_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)").run(messageId, user.id, emoji);
      }

      const reactions = getDmReactions(db, messageId);
      emitToDmPair(io, msg.sender_id, msg.receiver_id, "dm:reacted", { messageId, reactions });
      ack(callback, { success: true, reactions });
    });

    // -----------------------------------------------------------
    // Event: typing:start
    // Payload: { channelId }
    //
    // Broadcasts a typing indicator to other members of the channel.
    //
    // Emits: typing:update → channel:<channelId> (excluding sender)
    //   Payload: { userId, username, isTyping: true }
    // -----------------------------------------------------------
    socket.on("typing:start", ({ channelId }) => {
      socket.to(`channel:${channelId}`).emit("typing:update", {
        userId: user.id, username: user.username, isTyping: true,
      });
    });

    // -----------------------------------------------------------
    // Event: typing:stop
    // Payload: { channelId }
    //
    // Clears the typing indicator for this user in the channel.
    //
    // Emits: typing:update → channel:<channelId> (excluding sender)
    //   Payload: { userId, username, isTyping: false }
    // -----------------------------------------------------------
    socket.on("typing:stop", ({ channelId }) => {
      socket.to(`channel:${channelId}`).emit("typing:update", {
        userId: user.id, username: user.username, isTyping: false,
      });
    });

    // -----------------------------------------------------------
    // Event: disconnect
    //
    // Removes the user from the online-users map and broadcasts the
    // updated list to all connected clients.
    // -----------------------------------------------------------
    socket.on("disconnect", () => {
      console.log(`Disconnected: ${user.username}`);
      onlineUsers.delete(user.id);
      io.emit("users:online", Array.from(onlineUsers.keys()));
    });
  });
}

module.exports = { registerSocketHandlers };
