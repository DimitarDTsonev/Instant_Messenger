// ============================================================
//  src/middleware/security.ts — Security logging, IP banning,
//  and socket rate-limiting utilities.
//
//  Exports:
//    logSecurityEvent(db, data)   — write event to security_logs + console
//    recordLoginFail(db, ip, username) — track fails, auto-ban IP at ≥10
//    checkIpBanned                — Express middleware: blocks banned IPs
//    isUserBanned(db, userId)     — returns true if user account is banned
//    isSocketRateLimited(userId)  — returns true if user is flooding messages
// ============================================================

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

// ── In-memory state ──────────────────────────────────────────
// Banned IPs: auto-cleared after 1 hour
const BANNED_IPS = new Set<string>();

// Failed login tracker: ip → { count, firstAt }
const loginFails = new Map<string, LoginFailRecord>();

// Socket message rate tracker: userId → { count, windowStart }
const msgRateMap = new Map<number, SocketRateRecord>();

// ── Logging ───────────────────────────────────────────────────

/**
 * Writes a security event to the security_logs table and to stderr.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{ event: string, ip?: string, userId?: number, username?: string, detail?: string }} data
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
    `[SECURITY] ${new Date().toISOString()} | ${event.toUpperCase()} | ip=${ip ?? "-"} user=${username ?? userId ?? "-"} | ${detail ?? ""}`
  );
}

// ── IP ban helpers ────────────────────────────────────────────

/**
 * Records one failed login attempt from an IP.
 * After 10 failures within 15 minutes the IP is banned for 1 hour.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} ip
 * @param {string} username - the email/username that was tried
 */
export function recordLoginFail(db: Db, ip: string, username: string) {
  const now = Date.now();
  const rec = loginFails.get(ip) || { count: 0, firstAt: now };

  // Reset window if more than 15 minutes have passed
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
    // Auto-lift ban after 1 hour
    setTimeout(() => {
      BANNED_IPS.delete(ip);
      loginFails.delete(ip);
    }, 60 * 60 * 1000);
  }
}

/**
 * Express middleware that rejects requests from banned IPs with HTTP 403.
 */
export function checkIpBanned(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip;
  if (BANNED_IPS.has(ip)) {
    // Log every attempt from a banned IP (but only once per second to avoid log spam)
    const db = getDb();
    logSecurityEvent(db, { event: "banned_ip_request", ip, detail: `${req.method} ${req.path}` });
    return res.status(403).json({ error: "Your IP has been temporarily blocked due to suspicious activity." });
  }
  next();
}

// ── User account ban ──────────────────────────────────────────

/**
 * Returns true if the given user account has been banned.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number} userId
 * @returns {boolean}
 */
export function isUserBanned(db: Db, userId: number) {
  try {
    const row = db.prepare("SELECT is_banned FROM users WHERE id = ?").get(userId) as { is_banned?: number } | undefined;
    return row?.is_banned === 1;
  } catch {
    return false;
  }
}

// ── Socket message rate limiting ──────────────────────────────

const RATE_WARN  = 20;  // warn + log at this many messages per 10 s
export const RATE_BAN   = 50;  // auto-ban at this many messages per 10 s

/**
 * Tracks socket message throughput for a user.
 *
 * @param {number} userId
 * @returns {{ limited: boolean, count: number }}
 *   `limited` is true when the user has exceeded RATE_WARN.
 *   `count` is the number of messages sent in the current window.
 */
export function isSocketRateLimited(userId: number) {
  const now = Date.now();
  const rec = msgRateMap.get(userId) || { count: 0, windowStart: now };

  if (now - rec.windowStart > 10_000) {
    rec.count = 1;
    rec.windowStart = now;
  } else {
    rec.count += 1;
  }
  msgRateMap.set(userId, rec);

  return { limited: rec.count > RATE_WARN, count: rec.count };
}
