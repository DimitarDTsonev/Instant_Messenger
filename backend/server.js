// ============================================================
//  server.js — Backend entry point
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

const express = require("express");
const http    = require("http");
const path    = require("path");
const { Server } = require("socket.io");
const cors = require("cors");

const { initDatabase } = require("./src/db/database");
const authRoutes    = require("./src/routes/auth");
const channelRoutes = require("./src/routes/channels");
const messageRoutes = require("./src/routes/messages");
const dmRoutes      = require("./src/routes/dm");
const uploadRoutes  = require("./src/routes/upload");
const inviteRoutes  = require("./src/routes/invites");
const { registerSocketHandlers } = require("./src/socket/handlers");

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

// Enable CORS for browser REST requests from the Vite dev server
app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
}));

// Parse incoming JSON request bodies
app.use(express.json());

// Serve uploaded files statically.
// The uploads/ directory lives at the monorepo root, not inside backend/,
// so we resolve it one level above __dirname.
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// -----------------------------------------------------------
// REST route mounting
// -----------------------------------------------------------
app.use("/api/auth",     authRoutes);    // Registration, login, user management
app.use("/api/channels", channelRoutes); // Channel CRUD, members, permissions, invites
app.use("/api/messages", messageRoutes); // Channel message history and search
app.use("/api/dm",       dmRoutes);      // Direct message history and conversations
app.use("/api/upload",   uploadRoutes);  // File upload endpoint
app.use("/api/invite",   inviteRoutes);  // Public invite-link preview and join

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