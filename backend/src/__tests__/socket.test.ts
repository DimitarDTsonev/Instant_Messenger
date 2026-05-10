/**
 * @fileoverview Integration tests for socket/handlers.ts
 * Covers: authentication middleware, channel:join, message:send/edit/delete/react/pin/unpin,
 *         dm:send/edit/delete/react, typing:start/stop, disconnect
 */

import http from "http";
import bcrypt from "bcryptjs";
import { Server } from "socket.io";
import { io as Client } from "socket.io-client";

import { getDb } from "../db/database";
import { signToken } from "../middleware/auth";
import { registerSocketHandlers } from "../socket/handlers";
import { clearDb, createTestDb } from "../test-utils/createTestDb";

jest.mock("../db/database", () => ({ getDb: jest.fn(), initDatabase: jest.fn() }));
const mockedGetDb = getDb as jest.Mock;

let db, httpServer, io, port;

// ─── helpers ──────────────────────────────────────────────────────────────────

function seedUser(username = "alice", role = "member") {
  const hash = bcrypt.hashSync("pw", 1);
  const { lastInsertRowid } = db.prepare(
    "INSERT INTO users (username, email, password, avatar, role) VALUES (?, ?, ?, '👤', ?)"
  ).run(username, `${username}@t.com`, hash, role);
  return { id: lastInsertRowid, username, role };
}

function seedChannel(name, createdBy) {
  const { lastInsertRowid } = db.prepare(
    "INSERT INTO channels (name, description, created_by) VALUES (?, 'desc', ?)"
  ).run(name, createdBy);
  db.prepare("INSERT INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'owner')")
    .run(lastInsertRowid, createdBy);
  return lastInsertRowid;
}

function connect(token) {
  return Client(`http://localhost:${port}`, {
    auth: { token },
    transports: ["websocket"],
    forceNew: true,
  });
}

function waitFor(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

function emit(socket, event, data) {
  return new Promise((resolve) => socket.emit(event, data, resolve));
}

// ─── setup / teardown ─────────────────────────────────────────────────────────

beforeAll((done) => {
  db = createTestDb();
  mockedGetDb.mockReturnValue(db);

  httpServer = http.createServer();
  io = new Server(httpServer, { cors: { origin: "*" } });
  registerSocketHandlers(io);

  httpServer.listen(0, () => {
    port = httpServer.address().port;
    done();
  });
});

afterAll((done) => {
  io.close(() => httpServer.close(() => { db.close(); done(); }));
});

beforeEach(() => clearDb(db));

// ─── Auth middleware ──────────────────────────────────────────────────────────

describe("Socket auth middleware", () => {
  test("rejects connection with no token", (done) => {
    const client = Client(`http://localhost:${port}`, {
      auth: {},
      transports: ["websocket"],
      forceNew: true,
    });
    client.on("connect_error", (err) => {
      expect(err.message).toMatch(/token/i);
      client.disconnect();
      done();
    });
  });

  test("rejects connection with invalid token", (done) => {
    const client = connect("bad.token.here");
    client.on("connect_error", (err) => {
      expect(err.message).toMatch(/invalid/i);
      client.disconnect();
      done();
    });
  });

  test("accepts connection with valid token", (done) => {
    const user   = seedUser("authtest");
    const token  = signToken(user);
    const client = connect(token);
    client.on("connect", () => {
      client.disconnect();
      done();
    });
    client.on("connect_error", done);
  });

  test("rejects connection for a banned user", (done) => {
    const user = seedUser("banned_sock");
    db.prepare("UPDATE users SET is_banned = 1 WHERE id = ?").run(user.id);
    const client = connect(signToken(user));
    client.on("connect_error", (err) => {
      expect(err.message).toMatch(/suspended/i);
      client.disconnect();
      done();
    });
    client.on("connect", () => {
      client.disconnect();
      done(new Error("Banned user should not connect"));
    });
  });
});

// ─── connection / disconnect ──────────────────────────────────────────────────

describe("connection and disconnect events", () => {
  test("emits users:online on connect", (done) => {
    const user   = seedUser("online1");
    const client = connect(signToken(user));
    client.on("users:online", (payload) => {
      const ids = payload.map((u) => u.id);
      expect(ids).toContain(user.id);
      client.disconnect();
      done();
    });
  });

  test("users:online payload contains status field", (done) => {
    const user   = seedUser("online3");
    const client = connect(signToken(user));
    client.on("users:online", (payload) => {
      const entry = payload.find((u) => u.id === user.id);
      expect(entry).toBeDefined();
      expect(entry.status).toBe("online");
      client.disconnect();
      done();
    });
  });

  test("removes user from online list on disconnect", (done) => {
    const user   = seedUser("online2");
    const watcher = connect(signToken(seedUser("watcher")));

    watcher.on("connect", () => {
      const client = connect(signToken(user));
      client.on("connect", () => {
        // Once connected, disconnect the watched user
        client.disconnect();
      });
    });

    let sawUserOnline = false;
    watcher.on("users:online", (payload) => {
      const ids = payload.map((u) => u.id);
      if (ids.includes(user.id)) sawUserOnline = true;
      if (sawUserOnline && !ids.includes(user.id)) {
        watcher.disconnect();
        done();
      }
    });
  });
});

// ─── channel:join ─────────────────────────────────────────────────────────────

describe("channel:join", () => {
  test("client can join a channel room without error", (done) => {
    const user   = seedUser("joiner");
    const chId   = seedChannel("testch", user.id);
    const client = connect(signToken(user));

    client.on("connect", () => {
      client.emit("channel:join", chId);
      // No error = success; give it a tick then pass
      setTimeout(() => { client.disconnect(); done(); }, 50);
    });
  });
});

// ─── message:send ─────────────────────────────────────────────────────────────

describe("message:send", () => {
  test("sends a message and gets success ack", (done) => {
    const user   = seedUser("sender");
    const chId   = seedChannel("msgch", user.id);
    const client = connect(signToken(user));

    client.on("connect", () => {
      client.emit("channel:join", chId);
      client.emit("message:send", { channelId: chId, content: "hello" }, (res) => {
        expect(res.success).toBe(true);
        expect(res.message.content).toBe("hello");
        client.disconnect();
        done();
      });
    });
  });

  test("broadcasts message:new to channel room", (done) => {
    const owner  = seedUser("broadowner");
    const other  = seedUser("broadother");
    const chId   = seedChannel("broadch", owner.id);

    const receiver = connect(signToken(other));
    receiver.on("connect", () => {
      receiver.emit("channel:join", chId);

      const sender = connect(signToken(owner));
      sender.on("connect", () => {
        sender.emit("channel:join", chId);
        sender.emit("message:send", { channelId: chId, content: "broadcast me" }, () => {});
      });
    });

    receiver.once("message:new", (msg) => {
      expect(msg.content).toBe("broadcast me");
      receiver.disconnect();
      done();
    });
  });

  test("returns error when content is empty", (done) => {
    const user   = seedUser("emptyuser");
    const chId   = seedChannel("emptych", user.id);
    const client = connect(signToken(user));

    client.on("connect", () => {
      client.emit("message:send", { channelId: chId, content: "   " }, (res) => {
        expect(res.error).toBeDefined();
        client.disconnect();
        done();
      });
    });
  });

  test("returns error when message exceeds 2000 chars", (done) => {
    const user   = seedUser("longuser");
    const chId   = seedChannel("longch", user.id);
    const client = connect(signToken(user));

    client.on("connect", () => {
      client.emit("message:send", { channelId: chId, content: "x".repeat(2001) }, (res) => {
        expect(res.error).toMatch(/too long/i);
        client.disconnect();
        done();
      });
    });
  });

  test("returns error when user lacks write permission", (done) => {
    const owner  = seedUser("permowner");
    const other  = seedUser("noperm");
    const chId   = seedChannel("privch", owner.id);
    // Make channel private — other has no role
    db.prepare("UPDATE channels SET is_private = 1 WHERE id = ?").run(chId);

    const client = connect(signToken(other));
    client.on("connect", () => {
      client.emit("message:send", { channelId: chId, content: "no access" }, (res) => {
        expect(res.error).toBeDefined();
        client.disconnect();
        done();
      });
    });
  });
});

// ─── message:edit ────────────────────────────────────────────────────────────

describe("message:edit", () => {
  test("owner edits own message successfully", (done) => {
    const user  = seedUser("edituser");
    const chId  = seedChannel("editsch", user.id);
    const { lastInsertRowid: msgId } = db.prepare(
      "INSERT INTO messages (content, channel_id, user_id) VALUES ('old', ?, ?)"
    ).run(chId, user.id);

    const client = connect(signToken(user));
    client.on("connect", () => {
      client.emit("channel:join", chId);
      client.emit("message:edit", { messageId: msgId, content: "new content" }, (res) => {
        expect(res.success).toBe(true);
        expect(res.message.content).toBe("new content");
        client.disconnect();
        done();
      });
    });
  });

  test("returns error when editing another user's message", (done) => {
    const owner = seedUser("editown");
    const other = seedUser("editoth");
    const chId  = seedChannel("editothch", owner.id);
    const { lastInsertRowid: msgId } = db.prepare(
      "INSERT INTO messages (content, channel_id, user_id) VALUES ('owner msg', ?, ?)"
    ).run(chId, owner.id);

    const client = connect(signToken(other));
    client.on("connect", () => {
      client.emit("message:edit", { messageId: msgId, content: "hack" }, (res) => {
        expect(res.error).toBeDefined();
        client.disconnect();
        done();
      });
    });
  });

  test("returns error when message not found", (done) => {
    const user   = seedUser("editnf");
    const client = connect(signToken(user));
    client.on("connect", () => {
      client.emit("message:edit", { messageId: 99999, content: "x" }, (res) => {
        expect(res.error).toMatch(/not found/i);
        client.disconnect();
        done();
      });
    });
  });

  test("returns error when content is empty", (done) => {
    const user   = seedUser("editempty");
    const chId   = seedChannel("editemptych", user.id);
    const { lastInsertRowid: msgId } = db.prepare(
      "INSERT INTO messages (content, channel_id, user_id) VALUES ('x', ?, ?)"
    ).run(chId, user.id);

    const client = connect(signToken(user));
    client.on("connect", () => {
      client.emit("message:edit", { messageId: msgId, content: "" }, (res) => {
        expect(res.error).toBeDefined();
        client.disconnect();
        done();
      });
    });
  });
});

// ─── message:delete ──────────────────────────────────────────────────────────

describe("message:delete", () => {
  test("user can delete own message", (done) => {
    const user   = seedUser("deluser");
    const chId   = seedChannel("delch", user.id);
    const { lastInsertRowid: msgId } = db.prepare(
      "INSERT INTO messages (content, channel_id, user_id) VALUES ('bye', ?, ?)"
    ).run(chId, user.id);

    const client = connect(signToken(user));
    client.on("connect", () => {
      client.emit("channel:join", chId);
      client.emit("message:delete", { messageId: msgId }, (res) => {
        expect(res.success).toBe(true);
        client.disconnect();
        done();
      });
    });
  });

  test("admin can delete another user's message", (done) => {
    const owner = seedUser("deladmin", "admin");
    const other = seedUser("delnormal");
    const chId  = seedChannel("deladminch", owner.id);
    const { lastInsertRowid: msgId } = db.prepare(
      "INSERT INTO messages (content, channel_id, user_id) VALUES ('normal msg', ?, ?)"
    ).run(chId, other.id);

    const client = connect(signToken(owner));
    client.on("connect", () => {
      client.emit("channel:join", chId);
      client.emit("message:delete", { messageId: msgId }, (res) => {
        expect(res.success).toBe(true);
        client.disconnect();
        done();
      });
    });
  });

  test("non-owner gets error when deleting others message", (done) => {
    const owner = seedUser("delowner2");
    const other = seedUser("delother2");
    const chId  = seedChannel("delother2ch", owner.id);
    const { lastInsertRowid: msgId } = db.prepare(
      "INSERT INTO messages (content, channel_id, user_id) VALUES ('protected', ?, ?)"
    ).run(chId, owner.id);

    const client = connect(signToken(other));
    client.on("connect", () => {
      client.emit("message:delete", { messageId: msgId }, (res) => {
        expect(res.error).toBeDefined();
        client.disconnect();
        done();
      });
    });
  });

  test("returns error when message not found", (done) => {
    const user   = seedUser("delnf");
    const client = connect(signToken(user));
    client.on("connect", () => {
      client.emit("message:delete", { messageId: 99999 }, (res) => {
        expect(res.error).toMatch(/not found/i);
        client.disconnect();
        done();
      });
    });
  });
});

// ─── message:react ───────────────────────────────────────────────────────────

describe("message:react", () => {
  test("adds and then toggles off a reaction", (done) => {
    const user  = seedUser("reactor");
    const chId  = seedChannel("reactch", user.id);
    const { lastInsertRowid: msgId } = db.prepare(
      "INSERT INTO messages (content, channel_id, user_id) VALUES ('react me', ?, ?)"
    ).run(chId, user.id);

    const client = connect(signToken(user));
    client.on("connect", () => {
      client.emit("channel:join", chId);
      client.emit("message:react", { messageId: msgId, emoji: "👍" }, (res1) => {
        expect(res1.reactions["👍"]).toContain(user.id);
        client.emit("message:react", { messageId: msgId, emoji: "👍" }, (res2) => {
          expect(res2.reactions["👍"]).toBeUndefined();
          client.disconnect();
          done();
        });
      });
    });
  });

  test("returns error for unknown message", (done) => {
    const user   = seedUser("reactnf");
    const client = connect(signToken(user));
    client.on("connect", () => {
      client.emit("message:react", { messageId: 99999, emoji: "👍" }, (res) => {
        expect(res.error).toBeDefined();
        client.disconnect();
        done();
      });
    });
  });
});

// ─── message:pin / unpin ──────────────────────────────────────────────────────

describe("message:pin and message:unpin", () => {
  test("channel creator can pin a message", (done) => {
    const user  = seedUser("pinner");
    const chId  = seedChannel("pinch", user.id);
    const { lastInsertRowid: msgId } = db.prepare(
      "INSERT INTO messages (content, channel_id, user_id) VALUES ('pin me', ?, ?)"
    ).run(chId, user.id);

    const client = connect(signToken(user));
    client.on("connect", () => {
      client.emit("channel:join", chId);
      client.emit("message:pin", { messageId: msgId }, (res) => {
        expect(res.success).toBe(true);
        expect(res.message.is_pinned).toBe(1);
        client.disconnect();
        done();
      });
    });
  });

  test("non-creator/non-admin gets error when pinning", (done) => {
    const owner = seedUser("pinowner");
    const other = seedUser("pinother");
    const chId  = seedChannel("pinotherch", owner.id);
    const { lastInsertRowid: msgId } = db.prepare(
      "INSERT INTO messages (content, channel_id, user_id) VALUES ('blocked', ?, ?)"
    ).run(chId, owner.id);

    const client = connect(signToken(other));
    client.on("connect", () => {
      client.emit("message:pin", { messageId: msgId }, (res) => {
        expect(res.error).toBeDefined();
        client.disconnect();
        done();
      });
    });
  });

  test("channel creator can unpin a message", (done) => {
    const user  = seedUser("unpinner");
    const chId  = seedChannel("unpinch", user.id);
    const { lastInsertRowid: msgId } = db.prepare(
      "INSERT INTO messages (content, channel_id, user_id, is_pinned) VALUES ('pinned', ?, ?, 1)"
    ).run(chId, user.id);

    const client = connect(signToken(user));
    client.on("connect", () => {
      client.emit("channel:join", chId);
      client.emit("message:unpin", { messageId: msgId }, (res) => {
        expect(res.success).toBe(true);
        client.disconnect();
        done();
      });
    });
  });

  test("pin returns error for unknown message", (done) => {
    const user   = seedUser("pinnf");
    const client = connect(signToken(user));
    client.on("connect", () => {
      client.emit("message:pin", { messageId: 99999 }, (res) => {
        expect(res.error).toBeDefined();
        client.disconnect();
        done();
      });
    });
  });

  test("unpin returns error for unknown message", (done) => {
    const user   = seedUser("unpinnf");
    const client = connect(signToken(user));
    client.on("connect", () => {
      client.emit("message:unpin", { messageId: 99999 }, (res) => {
        expect(res.error).toBeDefined();
        client.disconnect();
        done();
      });
    });
  });
});

// ─── dm:send ──────────────────────────────────────────────────────────────────

describe("dm:send", () => {
  test("sends a DM and gets success ack", (done) => {
    const sender   = seedUser("dmsender");
    const receiver = seedUser("dmreceiver");

    const client = connect(signToken(sender));
    client.on("connect", () => {
      client.emit("dm:send", { receiverId: receiver.id, content: "hey" }, (res) => {
        expect(res.success).toBe(true);
        expect(res.message.content).toBe("hey");
        client.disconnect();
        done();
      });
    });
  });

  test("returns error when recipient not found", (done) => {
    const sender = seedUser("dmsendernf");
    const client = connect(signToken(sender));
    client.on("connect", () => {
      client.emit("dm:send", { receiverId: 99999, content: "hey" }, (res) => {
        expect(res.error).toMatch(/recipient/i);
        client.disconnect();
        done();
      });
    });
  });

  test("returns error when content is empty", (done) => {
    const sender   = seedUser("dmempty");
    const receiver = seedUser("dmemptyrec");
    const client   = connect(signToken(sender));
    client.on("connect", () => {
      client.emit("dm:send", { receiverId: receiver.id, content: "" }, (res) => {
        expect(res.error).toBeDefined();
        client.disconnect();
        done();
      });
    });
  });

  test("receiver gets dm:new event", (done) => {
    const sender   = seedUser("dmnewsend");
    const receiver = seedUser("dmnewrec");

    const recvClient = connect(signToken(receiver));
    recvClient.on("connect", () => {
      const sendClient = connect(signToken(sender));
      sendClient.on("connect", () => {
        sendClient.emit("dm:send", { receiverId: receiver.id, content: "hi there" }, () => {});
      });
    });

    recvClient.once("dm:new", (msg) => {
      expect(msg.content).toBe("hi there");
      recvClient.disconnect();
      done();
    });
  });
});

// ─── dm:edit ──────────────────────────────────────────────────────────────────

describe("dm:edit", () => {
  test("sender edits own DM", (done) => {
    const sender   = seedUser("dmeditsend");
    const receiver = seedUser("dmeditrec");
    const { lastInsertRowid: dmId } = db.prepare(
      "INSERT INTO direct_messages (content, sender_id, receiver_id) VALUES ('old dm', ?, ?)"
    ).run(sender.id, receiver.id);

    const client = connect(signToken(sender));
    client.on("connect", () => {
      client.emit("dm:edit", { messageId: dmId, content: "edited dm" }, (res) => {
        expect(res.success).toBe(true);
        expect(res.message.content).toBe("edited dm");
        client.disconnect();
        done();
      });
    });
  });

  test("returns error when editing another user's DM", (done) => {
    const sender   = seedUser("dmeditsend2");
    const receiver = seedUser("dmeditrec2");
    const { lastInsertRowid: dmId } = db.prepare(
      "INSERT INTO direct_messages (content, sender_id, receiver_id) VALUES ('priv', ?, ?)"
    ).run(sender.id, receiver.id);

    const client = connect(signToken(receiver));
    client.on("connect", () => {
      client.emit("dm:edit", { messageId: dmId, content: "hack" }, (res) => {
        expect(res.error).toBeDefined();
        client.disconnect();
        done();
      });
    });
  });

  test("returns error when DM not found", (done) => {
    const user   = seedUser("dmeditnf");
    const client = connect(signToken(user));
    client.on("connect", () => {
      client.emit("dm:edit", { messageId: 99999, content: "x" }, (res) => {
        expect(res.error).toMatch(/not found/i);
        client.disconnect();
        done();
      });
    });
  });
});

// ─── dm:delete ────────────────────────────────────────────────────────────────

describe("dm:delete", () => {
  test("sender deletes own DM", (done) => {
    const sender   = seedUser("dmdelsend");
    const receiver = seedUser("dmdelrec");
    const { lastInsertRowid: dmId } = db.prepare(
      "INSERT INTO direct_messages (content, sender_id, receiver_id) VALUES ('delete me', ?, ?)"
    ).run(sender.id, receiver.id);

    const client = connect(signToken(sender));
    client.on("connect", () => {
      client.emit("dm:delete", { messageId: dmId }, (res) => {
        expect(res.success).toBe(true);
        client.disconnect();
        done();
      });
    });
  });

  test("returns error when deleting another user's DM", (done) => {
    const sender   = seedUser("dmdelsend2");
    const receiver = seedUser("dmdelrec2");
    const { lastInsertRowid: dmId } = db.prepare(
      "INSERT INTO direct_messages (content, sender_id, receiver_id) VALUES ('protected', ?, ?)"
    ).run(sender.id, receiver.id);

    const client = connect(signToken(receiver));
    client.on("connect", () => {
      client.emit("dm:delete", { messageId: dmId }, (res) => {
        expect(res.error).toBeDefined();
        client.disconnect();
        done();
      });
    });
  });

  test("returns error when DM not found", (done) => {
    const user   = seedUser("dmdelnf");
    const client = connect(signToken(user));
    client.on("connect", () => {
      client.emit("dm:delete", { messageId: 99999 }, (res) => {
        expect(res.error).toMatch(/not found/i);
        client.disconnect();
        done();
      });
    });
  });
});

// ─── dm:react ─────────────────────────────────────────────────────────────────

describe("dm:react", () => {
  test("adds and toggles off a DM reaction", (done) => {
    const sender   = seedUser("dmreactsend");
    const receiver = seedUser("dmreactrec");
    const { lastInsertRowid: dmId } = db.prepare(
      "INSERT INTO direct_messages (content, sender_id, receiver_id) VALUES ('react dm', ?, ?)"
    ).run(sender.id, receiver.id);

    const client = connect(signToken(sender));
    client.on("connect", () => {
      client.emit("dm:react", { messageId: dmId, emoji: "❤️" }, (res1) => {
        expect(res1.reactions["❤️"]).toContain(sender.id);
        client.emit("dm:react", { messageId: dmId, emoji: "❤️" }, (res2) => {
          expect(res2.reactions["❤️"]).toBeUndefined();
          client.disconnect();
          done();
        });
      });
    });
  });

  test("returns error for unknown DM", (done) => {
    const user   = seedUser("dmreactnf");
    const client = connect(signToken(user));
    client.on("connect", () => {
      client.emit("dm:react", { messageId: 99999, emoji: "👍" }, (res) => {
        expect(res.error).toBeDefined();
        client.disconnect();
        done();
      });
    });
  });
});

// ─── dm:read ──────────────────────────────────────────────────────────────────

describe("dm:read", () => {
  function seedDm(senderId, receiverId, content = "hi") {
    const { lastInsertRowid } = db.prepare(
      "INSERT INTO direct_messages (sender_id, receiver_id, content) VALUES (?, ?, ?)"
    ).run(senderId, receiverId, content);
    return lastInsertRowid;
  }

  test("marks messages as read and notifies sender", (done) => {
    const sender   = seedUser("dmsender");
    const receiver = seedUser("dmrecvr");
    const dmId     = seedDm(sender.id, receiver.id, "hello");

    const senderClient   = connect(signToken(sender));
    const receiverClient = connect(signToken(receiver));

    senderClient.on("connect", () => {
      receiverClient.on("connect", () => {
        receiverClient.emit("dm:read", { partnerId: sender.id });
      });
    });

    senderClient.once("dm:read", ({ readBy }) => {
      expect(readBy).toBe(receiver.id);
      const msg = db.prepare("SELECT is_read, read_at FROM direct_messages WHERE id = ?").get(dmId);
      expect(msg.is_read).toBe(1);
      expect(msg.read_at).not.toBeNull();
      senderClient.disconnect();
      receiverClient.disconnect();
      done();
    });
  });

  test("does nothing when no partnerId provided", (done) => {
    const user = seedUser("dmnoop");
    const client = connect(signToken(user));
    client.on("connect", () => {
      client.emit("dm:read", {});
      setTimeout(() => { client.disconnect(); done(); }, 100);
    });
  });
});

// ─── status:set ───────────────────────────────────────────────────────────────

describe("status:set", () => {
  test("setting a valid status emits updated users:online", (done) => {
    const user   = seedUser("statususer");
    const client = connect(signToken(user));

    let connected = false;
    client.on("users:online", (payload) => {
      if (!connected) { connected = true; return; }
      const entry = payload.find((u) => u.id === user.id);
      if (entry?.status === "away") {
        client.disconnect();
        done();
      }
    });
    client.on("connect", () => {
      client.emit("status:set", { status: "away" });
    });
  });

  test("ignores invalid status values", (done) => {
    const user   = seedUser("statusbad");
    const client = connect(signToken(user));
    client.on("connect", () => {
      client.emit("status:set", { status: "invisible" });
      setTimeout(() => { client.disconnect(); done(); }, 100);
    });
  });
});

// ─── typing:start / typing:stop ──────────────────────────────────────────────

describe("typing events", () => {
  test("typing:start broadcasts to channel room", (done) => {
    const user1 = seedUser("typer1");
    const user2 = seedUser("typer2");
    const chId  = seedChannel("typingch", user1.id);

    const watcher = connect(signToken(user2));
    watcher.on("connect", () => {
      watcher.emit("channel:join", chId);

      const typer = connect(signToken(user1));
      typer.on("connect", () => {
        typer.emit("channel:join", chId);
        typer.emit("typing:start", { channelId: chId });
      });
    });

    watcher.once("typing:update", (data) => {
      expect(data.isTyping).toBe(true);
      expect(data.userId).toBe(user1.id);
      watcher.disconnect();
      done();
    });
  });

  test("typing:stop broadcasts isTyping=false", (done) => {
    const user1 = seedUser("stopper1");
    const user2 = seedUser("stopper2");
    const chId  = seedChannel("stopch", user1.id);

    const watcher = connect(signToken(user2));
    watcher.on("connect", () => {
      watcher.emit("channel:join", chId);

      const typer = connect(signToken(user1));
      typer.on("connect", () => {
        typer.emit("channel:join", chId);
        typer.emit("typing:stop", { channelId: chId });
      });
    });

    watcher.once("typing:update", (data) => {
      expect(data.isTyping).toBe(false);
      watcher.disconnect();
      done();
    });
  });
});

// ─── @mentions ────────────────────────────────────────────────────────────────

describe("@mention notifications", () => {
  test("mentioned user receives user:mentioned event", (done) => {
    const alice = seedUser("alice_m");
    const bob   = seedUser("bob_m");
    const chId  = seedChannel("mentionch", alice.id);

    const bobClient = connect(signToken(bob));
    bobClient.on("connect", () => {
      const aliceClient = connect(signToken(alice));
      aliceClient.on("connect", () => {
        aliceClient.emit("channel:join", chId);
        aliceClient.emit("message:send", { channelId: chId, content: `Hey @bob_m !` }, () => {});
      });
    });

    bobClient.once("user:mentioned", (data) => {
      expect(data.mentionedBy).toBe("alice_m");
      bobClient.disconnect();
      done();
    });
  });
});

// ─── message flood protection ─────────────────────────────────────────────────

describe("message flood protection", () => {
  test("returns rate-limit error after exceeding 20 messages in 10s", (done) => {
    const user  = seedUser("flooder");
    const chId  = seedChannel("floodch", user.id);
    const client = connect(signToken(user));

    client.on("connect", () => {
      client.emit("channel:join", chId);
      let errorReceived = false;
      let sent = 0;
      const total = 22;
      for (let i = 0; i < total; i++) {
        client.emit("message:send", { channelId: chId, content: `msg ${i}` }, (ack) => {
          sent++;
          if (ack?.error && !errorReceived) {
            errorReceived = true;
            expect(ack.error).toMatch(/too fast/i);
          }
          if (sent === total) {
            expect(errorReceived).toBe(true);
            client.disconnect();
            done();
          }
        });
      }
    });
  }, 15000);
});
