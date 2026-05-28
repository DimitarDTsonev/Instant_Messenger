/**
 * Test application factory — creates a bare Express app with all API routes
 * mounted but without the Socket.io server, so HTTP-level tests can run
 * without WebSocket infrastructure.
 *
 * The upload route is intentionally omitted because file upload tests use
 * separate test helpers with `multer` memory storage.
 *
 * Used by: all backend integration test files via `supertest(createTestApp())`.
 */
import express from "express";

import authRoutes from "../routes/auth";
import channelRoutes from "../routes/channels";
import messageRoutes from "../routes/messages";
import dmRoutes from "../routes/dm";
import inviteRoutes from "../routes/invites";
import adminRoutes from "../routes/admin";
import { errorHandler } from "../middleware/errorHandler";

export function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/auth",     authRoutes);
  app.use("/api/channels", channelRoutes);
  app.use("/api/messages", messageRoutes);
  app.use("/api/dm",       dmRoutes);
  app.use("/api/invite",   inviteRoutes);
  app.use("/api/admin",    adminRoutes);
  app.use(errorHandler);
  return app;
}
