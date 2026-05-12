import express from "express";
import { getDb } from "../db/database";
import { authMiddleware } from "../middleware/auth";
import { logSecurityEvent } from "../middleware/security";

type AdminTargetRow = {
  id: number;
  username: string;
  role?: string;
};

const router = express.Router();
router.use(authMiddleware);

// Reject non-admins on every route in this file
router.use((req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
});

router.get("/users", (req, res) => {
  const db = getDb();
  const users = db
    .prepare("SELECT id, username, email, avatar, role, is_banned, ban_reason, created_at FROM users ORDER BY username")
    .all();
  return res.json({ users });
});

router.get("/security-logs", (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit || "100")) || 100, 500);
  const event = typeof req.query.event === "string" ? req.query.event : null;
  const db = getDb();

  const rows = event
    ? db.prepare("SELECT * FROM security_logs WHERE event = ? ORDER BY created_at DESC LIMIT ?").all(event, limit)
    : db.prepare("SELECT * FROM security_logs ORDER BY created_at DESC LIMIT ?").all(limit);

  return res.json({ logs: rows });
});

router.post("/ban/:userId", (req, res) => {
  const targetId = Number(req.params.userId);
  if (targetId === req.user.id) {
    return res.status(400).json({ error: "You cannot ban yourself" });
  }

  const db = getDb();
  const target = db.prepare("SELECT id, username, role FROM users WHERE id = ?").get(targetId) as AdminTargetRow | undefined;
  if (!target) return res.status(404).json({ error: "User not found" });
  if (target.role === "admin") return res.status(403).json({ error: "Cannot ban another admin" });

  const reason = (req.body.reason || "Banned by admin").slice(0, 255);
  db.prepare("UPDATE users SET is_banned = 1, ban_reason = ? WHERE id = ?").run(reason, targetId);

  logSecurityEvent(db, {
    event: "user_banned",
    userId: targetId,
    username: target.username,
    detail: `banned by admin ${req.user.username}: ${reason}`,
  });

  return res.json({ success: true, username: target.username, reason });
});

router.post("/unban/:userId", (req, res) => {
  const targetId = Number(req.params.userId);
  const db = getDb();
  const target = db.prepare("SELECT id, username FROM users WHERE id = ?").get(targetId) as AdminTargetRow | undefined;
  if (!target) return res.status(404).json({ error: "User not found" });

  db.prepare("UPDATE users SET is_banned = 0, ban_reason = NULL WHERE id = ?").run(targetId);

  logSecurityEvent(db, {
    event: "user_unbanned",
    userId: targetId,
    username: target.username,
    detail: `unbanned by admin ${req.user.username}`,
  });

  return res.json({ success: true, username: target.username });
});

export default router;