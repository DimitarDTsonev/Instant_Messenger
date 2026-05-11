// ============================================================
//  server.ts — Backend entry point
//
//  Bootstraps the Express HTTP server and Socket.io WebSocket server,
//  initialises the SQLite database, mounts all REST route handlers,
//  and registers real-time Socket.io event handlers.
//
//  REST API base paths:
//    /api/auth     — authentication and user management
//    /api/channels — channel CRUD, members, permissions, invite management
//    /api/messages — channel message history and search
//    /api/dm       — direct message history and conversations
//    /api/upload   — file upload (multipart/form-data)
//    /api/invite   — public invite-link preview and join
//    /api/health   — simple liveness check
//
//  Static files:
//    /uploads/*    — served from the shared uploads/ directory
//                    located at the monorepo root (one level above backend/)
//
//  Connects to:
//    ./src/db/database       — initDatabase() called on startup
//    ./src/routes/*          — Express routers mounted under /api/...
//    ./src/socket/handlers   — registerSocketHandlers(io)
// ============================================================

import express from "express";
import http from "http";
import path from "path";
import { Server } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { getDb, initDatabase } from "./src/db/database.js";
import authRoutes from "./src/routes/auth";
import channelRoutes from "./src/routes/channels";
import messageRoutes from "./src/routes/messages";
import dmRoutes from "./src/routes/dm";
import uploadRoutes from "./src/routes/upload";
import inviteRoutes from "./src/routes/invites";
import adminRoutes from "./src/routes/admin";
import { registerSocketHandlers } from "./src/socket/handlers";
import { checkIpBanned, logSecurityEvent } from "./src/middleware/security";

// Core Express application instance
const app = express();
// Underlying Node.js HTTP server wrapping Express (required for Socket.io)
const httpServer = http.createServer(app);

// -----------------------------------------------------------
// Allowed CORS origins.
// Both "localhost" and "127.0.0.1" must be listed because browsers
// treat them as distinct origins for the purposes of CORS enforcement.
// -----------------------------------------------------------
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
];

// -----------------------------------------------------------
// Socket.io server configuration
// Shares the HTTP server with Express so both run on the same port.
// -----------------------------------------------------------
const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// -----------------------------------------------------------
// Express middleware
// -----------------------------------------------------------

// Security headers (CSP, X-Frame-Options, HSTS, etc.)
app.use(helmet());

// Trust the first proxy (needed for correct req.ip on Render)
app.set("trust proxy", 1);

// Enable CORS for browser REST requests from the Vite dev server
app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
}));

// Block banned IPs on every request
app.use(checkIpBanned);

// Global rate limit — 200 requests per minute per IP
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logSecurityEvent(getDb(), {
      event: "rate_limited",
      ip: req.ip,
      detail: `${req.method} ${req.path} — global limit`,
    });
    res.status(429).json({ error: "Too many requests. Please slow down." });
  },
}));

// Strict rate limit on auth endpoints — 15 requests per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logSecurityEvent(getDb(), {
      event: "rate_limited",
      ip: req.ip,
      detail: `${req.method} ${req.path} — auth limit`,
    });
    res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
  },
});

// Parse incoming JSON request bodies (max 50 KB to prevent payload attacks)
app.use(express.json({ limit: "50kb" }));

// Serve uploaded files statically.
// The uploads/ directory lives at the monorepo root, not inside backend/,
// so we resolve it one level above __dirname.
app.use("/uploads", express.static(path.join(process.cwd(), "../uploads")));

// -----------------------------------------------------------
// REST route mounting
// -----------------------------------------------------------
app.use("/api/auth",     authLimiter, authRoutes); // auth routes get the strict limiter
app.use("/api/channels", channelRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/dm",       dmRoutes);
app.use("/api/upload",   uploadRoutes);
app.use("/api/invite",   inviteRoutes);
app.use("/api/admin",    adminRoutes);  // admin: security logs, ban/unban

/**
 * GET /api/health
 * Simple liveness probe used by monitoring tools and reverse proxies
 * to verify that the server process is running and accepting requests.
 *
 * @route   GET /api/health
 * @access  Public
 * @returns {200} { status: "ok" }
 */
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

// -----------------------------------------------------------
// Register all Socket.io event handlers
// -----------------------------------------------------------
registerSocketHandlers(io);

// -----------------------------------------------------------
// Start the HTTP + WebSocket server
// -----------------------------------------------------------

// Port defaults to 4000; override via the PORT environment variable
const PORT = process.env.PORT || 4000;

// Initialise (or migrate) the SQLite database before accepting connections
initDatabase();

httpServer.listen(PORT, () => {
  console.log(`\nServer running at http://localhost:${PORT}`);
  console.log(`Socket.io listening on ws://localhost:${PORT}\n`);
});
