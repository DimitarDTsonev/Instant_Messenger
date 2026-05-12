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
// Banned IPs: auto-cleared after 1 hour
const BANNED_IPS = new Set<string>();

// Failed login tracker: ip -> { count, firstAt }
const loginFails = new Map<string, LoginFailRecord>();

// Socket message rate tracker: userId -> { count, windowStart }
const msgRateMap = new Map<number, SocketRateRecord>();

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

export function isUserBanned(db: Db, userId: number) {
  try {
    const row = db.prepare("SELECT is_banned FROM users WHERE id = ?").get(userId) as { is_banned?: number } | undefined;
    return row?.is_banned === 1;
  } catch {
    return false;
  }
}

const RATE_WARN  = 20;          // warn + log at this many messages per 10 s
export const RATE_BAN   = 50;   // auto-ban at this many messages per 10 s

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