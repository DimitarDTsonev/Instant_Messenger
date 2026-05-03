/**
 * @fileoverview Creates an Express app wired up with all production routes.
 * Used in integration tests via supertest — no HTTP server is started.
 * The db/database module must be mocked before calling this.
 */

const express = require("express");

const authRoutes    = require("../routes/auth");
const channelRoutes = require("../routes/channels");
const messageRoutes = require("../routes/messages");
const dmRoutes      = require("../routes/dm");
const inviteRoutes  = require("../routes/invites");

/**
 * Returns a configured Express application with all REST routes mounted.
 * No server is started; pass the result directly to supertest().
 *
 * @returns {import('express').Express}
 */
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/auth",     authRoutes);
  app.use("/api/channels", channelRoutes);
  app.use("/api/messages", messageRoutes);
  app.use("/api/dm",       dmRoutes);
  app.use("/api/invite",   inviteRoutes);
  return app;
}

module.exports = { createTestApp };
