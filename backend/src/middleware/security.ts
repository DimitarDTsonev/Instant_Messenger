/**
 * Security middleware and utilities.
 *
 * Provides three independent security mechanisms:
 *  1. IP-based automatic ban after repeated login failures (`recordLoginFail`, `checkIpBanned`).
 *  2. Security event logging to the `security_logs` DB table (`logSecurityEvent`).
 *  3. Per-user Socket.io message rate limiting (`isSocketRateLimited`).
 *
 * All in-memory state (banned IPs, login fail counters, socket rate counters)
 * lives in module-level Maps/Sets and resets on server restart.
 *
 * Imported by:
 *  - server.ts (app.use(checkIpBanned))
 *  - auth.service.ts (logSecurityEvent, recordLoginFail)
 *  - socket/handlers.ts (isUserBanned, logSecurityEvent)
 *  - socket/messageHandlers.ts (isSocketRateLimited, RATE_BAN, logSecurityEvent)
 *  - admin.service.ts (logSecurityEvent)
 */

import type { NextFunction, Request, Response } from "express";
import type { Db } from "../types";
import { getDb } from "../db/database";

type SecurityEventData = {
  event: string;
  ip?: string | null;
  userId?: number | null;
  username?: string | null;
  detail?: string | null;
};

type LoginFailRecord = {
  count: number;
  firstAt: number;
};

type SocketRateRecord = {
  count: number;
  windowStart: number;
};

/** In-memory set of banned IPs. Each entry is auto-removed after 1 hour. */
const BANNED_IPS = new Set<string>();

/** Per-IP login-fail counter: ip → { count, firstAt }. */
const loginFails = new Map<string, LoginFailRecord>();

/** Per-user Socket.io message rate counter: userId → { count, windowStart }. */
const msgRateMap = new Map<number, SocketRateRecord>();

/**
 * Persists a security event to the `security_logs` table AND logs it to stdout.
 *
 * Never throws — if the DB write fails the warning is still console-printed.
 *
 * @param db   - The better-sqlite3 database instance.
 * @param data - Event details: event type, IP, userId, username, and free-text detail.
 */
export function logSecurityEvent(db: Db, { event, ip, userId, username, detail }: SecurityEventData) {
  try {
    db.prepare(`
      INSERT INTO security_logs (event, ip, user_id, username, detail)
      VALUES (?, ?, ?, ?, ?)
    `).run(event, ip || null, userId || null, username || null, detail || null);
  } catch {
    // never crash the request because of a log write failure
  }
  console.warn(
    `[SECURITY] ${new Date().toISOString()} | ${event.toUpperCase()} | ip=${ip ?? "-"} user=${username ?? userId ?? "-"} | ${detail ?? ""}`,
  );
}

/**
 * Records a failed login attempt for an IP and auto-bans the IP after 10 failures
 * within a 15-minute sliding window.
 *
 * The ban lasts 1 hour and is stored in the in-memory `BANNED_IPS` set, so it is
 * cleared on server restart.
 *
 * @param db       - Database instance (used for security event logging).
 * @param ip       - The IP address that attempted the login.
 * @param username - The email/username that was attempted (for the log record).
 */
export function recordLoginFail(db: Db, ip: string, username: string) {
  const now = Date.now();
  const rec = loginFails.get(ip) || { count: 0, firstAt: now };

  // Reset the window if 15 minutes have passed since the first failure
  if (now - rec.firstAt > 15 * 60 * 1000) {
    rec.count = 0;
    rec.firstAt = now;
  }

  rec.count += 1;
  loginFails.set(ip, rec);

  logSecurityEvent(db, {
    event: "login_fail",
    ip,
    username,
    detail: `attempt ${rec.count} of 10 in window`,
  });

  if (rec.count >= 10) {
    BANNED_IPS.add(ip);
    logSecurityEvent(db, {
      event: "ip_banned",
      ip,
      username,
      detail: `auto-banned after ${rec.count} failed logins`,
    });
    // Auto-lift the ban after 1 hour
    setTimeout(() => {
      BANNED_IPS.delete(ip);
      loginFails.delete(ip);
    }, 60 * 60 * 1000);
  }
}

/**
 * Express middleware that rejects requests from banned IPs with a 403 response.
 *
 * Runs on every request via `app.use(checkIpBanned)` in server.ts.
 *
 * @param req  - Express request (reads `req.ip`).
 * @param res  - Express response (sends 403 if IP is banned).
 * @param next - Called to proceed to the next middleware if the IP is not banned.
 */
export function checkIpBanned(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip;
  if (BANNED_IPS.has(ip)) {
    const db = getDb();
    logSecurityEvent(db, { event: "banned_ip_request", ip, detail: `${req.method} ${req.path}` });
    return res.status(403).json({ error: "Your IP has been temporarily blocked due to suspicious activity." });
  }
  next();
}

/**
 * Checks whether a user's `is_banned` flag is set in the database.
 *
 * Used by the Socket.io connection middleware to block banned users at the
 * WebSocket handshake stage, before they can send any messages.
 *
 * @param db     - Database instance.
 * @param userId - ID of the user to check.
 * @returns `true` if the user is banned, `false` otherwise.
 */
export function isUserBanned(db: Db, userId: number) {
  try {
    const row = db.prepare("SELECT is_banned FROM users WHERE id = ?").get(userId) as { is_banned?: number } | undefined;
    return row?.is_banned === 1;
  } catch {
    return false;
  }
}

/** Number of messages per 10 s window that triggers a warning log. */
const RATE_WARN = 20;

/** Number of messages per 10 s window that triggers an automatic user ban. */
export const RATE_BAN = 50;

/**
 * Tracks Socket.io message volume per user and reports whether the rate
 * exceeds the warning threshold.
 *
 * Uses a 10-second sliding window per user. If the user hits `RATE_BAN`,
 * the caller (messageHandlers / dmHandlers) is responsible for banning them.
 *
 * @param userId - ID of the user who sent the message.
 * @returns `{ limited: boolean, count: number }` — `limited` is true when
 *          the count exceeds `RATE_WARN`; `count` is the current window count.
 */
export function isSocketRateLimited(userId: number) {
  const now = Date.now();
  const rec = msgRateMap.get(userId) || { count: 0, windowStart: now };

  // Reset the window every 10 seconds
  if (now - rec.windowStart > 10_000) {
    rec.count = 1;
    rec.windowStart = now;
  } else {
    rec.count += 1;
  }
  msgRateMap.set(userId, rec);

  return { limited: rec.count > RATE_WARN, count: rec.count };
}
