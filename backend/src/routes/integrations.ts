import express from "express";
import type { Server } from "socket.io";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db/database";
import { NotFoundError, ValidationError } from "../errors";
import { getFullMessage } from "../socket/socketUtils";

export default function createIntegrationsRouter(io: Server) {
  const router = express.Router();
  router.use(authMiddleware);

  router.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      webhook: "/api/integrations/webhook",
      accepts: ["channelId", "content", "source", "metadata"],
    });
  });

  // POST /api/integrations/webhook
  // Accepts a report from Music Dashboard and posts it as a message in a channel.
  // Body: { channelId: number, content: string, source?: string, metadata?: object }
  router.post("/webhook", (req, res) => {
    const { channelId, content, source, metadata } = req.body as {
      channelId?: number;
      content?: string;
      source?: string;
      metadata?: unknown;
    };

    if (!channelId || !content?.trim()) throw new ValidationError("channelId and content are required");

    if (metadata !== undefined && (metadata === null || typeof metadata !== "object" || Array.isArray(metadata))) {
      throw new ValidationError("metadata must be an object when provided");
    }

    const db = getDb();

    const channel = db.prepare("SELECT id FROM channels WHERE id = ?").get(channelId);
    if (!channel) throw new NotFoundError("Channel not found");

    const safeSource = typeof source === "string" && source.trim()
      ? source.trim().slice(0, 64)
      : "webhook";
    const metadataJson = metadata ? JSON.stringify(metadata) : null;

    const { lastInsertRowid } = db
      .prepare("INSERT INTO messages (content, channel_id, user_id, source, metadata) VALUES (?, ?, ?, ?, ?)")
      .run(content.trim(), channelId, req.user.id, safeSource, metadataJson);

    const message = getFullMessage(db, lastInsertRowid);
    io.to(`channel:${channelId}`).emit("message:new", message);

    res.json({ success: true, message });
  });

  return router;
}
