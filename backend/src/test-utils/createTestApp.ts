import express from "express";

import authRoutes from "../routes/auth";
import channelRoutes from "../routes/channels";
import messageRoutes from "../routes/messages";
import dmRoutes from "../routes/dm";
import inviteRoutes from "../routes/invites";
import adminRoutes from "../routes/admin";

export function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/auth",     authRoutes);
  app.use("/api/channels", channelRoutes);
  app.use("/api/messages", messageRoutes);
  app.use("/api/dm",       dmRoutes);
  app.use("/api/invite",   inviteRoutes);
  app.use("/api/admin",    adminRoutes);
  return app;
}