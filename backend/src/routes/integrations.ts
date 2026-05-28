/**
 * External integrations router — webhook endpoint for third-party services.
 *
 * Receives a `POST /api/integrations/webhook` from the Music Dashboard bot (or any
 * compatible source), inserts the message into the specified channel, and broadcasts
 * it in real time over the socket.io `channel:<id>` room.
 *
 * The router factory accepts the socket.io `Server` instance so it can emit
 * `message:new` after persisting the row — this is the only route file that
 * directly couples to socket.io.
 *
 * Routes:
 *   GET  /api/integrations/health   — Health check; returns webhook endpoint info.
 *   POST /api/integrations/webhook  — Ingest a message from an external source.
 *
 * Authentication is required (`authMiddleware` at router level).
 * Accepted body: `{ channelId: number, content: string, source?: string, metadata?: object }`.
 */

import express from "express";
import type { Server } from "socket.io";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db/database";
import { NotFoundError, ValidationError } from "../errors";
import { getFullMessage } from "../socket/socketUtils";

/**
 * Creates and returns the integrations router.
 * The `io` parameter is needed so `POST /webhook` can broadcast `message:new`.
 *
 * @param io - The socket.io server instance.
 * @returns  Express router for the integrations module.
 */
export default function createIntegrationsRouter(io: Server) {
  const router = express.Router();
  router.use(authMiddleware);

  /**
   * GET /api/integrations/health
   * Returns a JSON object describing the webhook endpoint and its accepted fields.
   * Useful for integration setup and connectivity testing.
   */
  router.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      webhook: "/api/integrations/webhook",
      accepts: ["channelId", "content", "source", "metadata"],
    });
  });

  /**
   * POST /api/integrations/webhook
   * Accepts an external message and broadcasts it as if it were a user message.
   *
   * Body fields:
   *  - `channelId` — ID of the target channel (required).
   *  - `content`   — Message text (required, trimmed, non-empty).
   *  - `source`    — Optional source label (e.g. "MusicBot"); capped at 64 chars; defaults to "webhook".
   *  - `metadata`  — Optional JSON-serialisable object stored alongside the message.
   *
   * @throws ValidationError if `channelId` or `content` are missing/invalid.
   * @throws ValidationError if `metadata` is non-null and not a plain object.
   * @throws NotFoundError   if `channelId` does not match an existing channel.
   */
  router.post("/webhook", (req, res) => {
    const { channelId, content, source, metadata } = req.body as {
      channelId?: number;
      content?: string;
      source?: string;
      metadata?: unknown;
    };

    if (!channelId || !content?.trim()) throw new ValidationError("channelId and content are required");

    // Reject arrays and null — only plain objects are valid metadata
    if (metadata !== undefined && (metadata === null || typeof metadata !== "object" || Array.isArray(metadata))) {
      throw new ValidationError("metadata must be an object when provided");
    }

    const db = getDb();

    const channel = db.prepare("SELECT id FROM channels WHERE id = ?").get(channelId);
    if (!channel) throw new NotFoundError("Channel not found");

    // Sanitise the source label: strip whitespace and cap at 64 characters
    const safeSource = typeof source === "string" && source.trim()
      ? source.trim().slice(0, 64)
      : "webhook";
    const metadataJson = metadata ? JSON.stringify(metadata) : null;

    // Insert the message and immediately fetch the full row (with user/reactions joins)
    const { lastInsertRowid } = db
      .prepare("INSERT INTO messages (content, channel_id, user_id, source, metadata) VALUES (?, ?, ?, ?, ?)")
      .run(content.trim(), channelId, req.user.id, safeSource, metadataJson);

    const message = getFullMessage(db, lastInsertRowid);
    // Broadcast to all clients in the channel room so the UI updates in real time
    io.to(`channel:${channelId}`).emit("message:new", message);

    res.json({ success: true, message });
  });

  return router;
}
