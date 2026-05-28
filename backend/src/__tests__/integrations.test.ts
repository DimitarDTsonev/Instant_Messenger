/**
 * Integrations API tests — exercises the webhook and music-dashboard
 * integration endpoints from the factory-style `createIntegrationsRouter(io)`.
 *
 * Uses a real in-memory SQLite database and a mocked socket.io server so
 * that messages posted via the API are verified to be broadcast over the
 * socket without requiring a live WebSocket connection.
 */
import express from "express";
import request from "supertest";
import bcrypt from "bcryptjs";

import { getDb } from "../db/database";
import { signToken } from "../middleware/auth";
import createIntegrationsRouter from "../routes/integrations";
import { clearDb, createTestDb } from "../test-utils/createTestDb";

jest.mock("../db/database", () => ({ getDb: jest.fn(), initDatabase: jest.fn() }));
const mockedGetDb = getDb as jest.Mock;

let db, app, ioTo, ioEmit;

beforeAll(() => {
  db = createTestDb();
  mockedGetDb.mockReturnValue(db);
});

beforeEach(() => {
  clearDb(db);
  ioEmit = jest.fn();
  ioTo = jest.fn(() => ({ emit: ioEmit }));
  app = express();
  app.use(express.json());
  app.use("/api/integrations", createIntegrationsRouter({ to: ioTo } as any));
});

afterAll(() => db.close());

function seedUser(username = "music_bot") {
  const hash = bcrypt.hashSync("pw", 1);
  const { lastInsertRowid } = db.prepare(
    "INSERT INTO users (username, email, password, avatar, role) VALUES (?, ?, ?, 'MB', 'member')"
  ).run(username, `${username}@t.com`, hash);
  return { id: Number(lastInsertRowid), username, email: `${username}@t.com`, role: "member" };
}

function seedChannel(name, createdBy) {
  const { lastInsertRowid } = db.prepare(
    "INSERT INTO channels (name, created_by) VALUES (?, ?)"
  ).run(name, createdBy);
  db.prepare("INSERT INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'owner')")
    .run(lastInsertRowid, createdBy);
  return Number(lastInsertRowid);
}

describe("POST /api/integrations/webhook", () => {
  test("stores metadata and broadcasts a channel message", async () => {
    const user = seedUser();
    const token = signToken(user);
    const channelId = seedChannel("music", user.id);
    const metadata = {
      integration: "music-dashboard",
      title: "Song",
      artist: "Artist",
      score: 91,
      spotifyUrl: "https://open.spotify.com/track/1",
    };

    const res = await request(app)
      .post("/api/integrations/webhook")
      .set("Authorization", `Bearer ${token}`)
      .send({
        channelId,
        content: "**Artist - Song**",
        source: "music-dashboard",
        metadata,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message.source).toBe("music-dashboard");
    expect(JSON.parse(res.body.message.metadata)).toMatchObject(metadata);
    expect(ioTo).toHaveBeenCalledWith(`channel:${channelId}`);
    expect(ioEmit).toHaveBeenCalledWith("message:new", expect.objectContaining({
      content: "**Artist - Song**",
      source: "music-dashboard",
    }));
  });

  test("rejects non-object metadata", async () => {
    const user = seedUser("bad_meta_bot");
    const token = signToken(user);
    const channelId = seedChannel("music-bad", user.id);

    const res = await request(app)
      .post("/api/integrations/webhook")
      .set("Authorization", `Bearer ${token}`)
      .send({ channelId, content: "x", metadata: "bad" });

    expect(res.status).toBe(400);
  });
});
