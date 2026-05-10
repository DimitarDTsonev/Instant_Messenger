// ============================================================
//  src/db/seed.ts — Development seed data
//  Run with: npm run seed
// ============================================================

import bcrypt from "bcryptjs";
import { getDb, initDatabase } from "./database";

async function seed() {
  initDatabase();
  const db = getDb();

  console.log("🌱 Seeding development data...\n");

  // -----------------------------------------------------------
  // Wipe existing data (development only)
  // -----------------------------------------------------------
  db.exec(`
    DELETE FROM messages;
    DELETE FROM channels;
    DELETE FROM users;
  `);

  // -----------------------------------------------------------
  // Users
  // -----------------------------------------------------------
  const password = bcrypt.hashSync("password123", 10);

  const insertUser = db.prepare(`
    INSERT INTO users (username, email, password, avatar)
    VALUES (?, ?, ?, ?)
  `);

  const users = [
    { username: "alice",   email: "alice@demo.com",   avatar: "🧑‍💻" },
    { username: "bob",     email: "bob@demo.com",     avatar: "👨‍🎨" },
    { username: "charlie", email: "charlie@demo.com", avatar: "👩‍🔬" },
    { username: "diana",   email: "diana@demo.com",   avatar: "🧑‍🚀" },
  ];

  const insertedUsers = users.map((u) => {
    const { lastInsertRowid } = insertUser.run(u.username, u.email, password, u.avatar);
    console.log(`  ✅ User: ${u.username} (id=${lastInsertRowid})`);
    return { id: lastInsertRowid, ...u };
  });

  // -----------------------------------------------------------
  // Channels
  // -----------------------------------------------------------
  const insertChannel = db.prepare(`
    INSERT INTO channels (name, description, created_by)
    VALUES (?, ?, ?)
  `);

  const channels = [
    { name: "general",       description: "General channel for everyone",   by: insertedUsers[0].id },
    { name: "random",        description: "Off-topic discussion",            by: insertedUsers[1].id },
    { name: "tech",          description: "Technology and programming",      by: insertedUsers[0].id },
    { name: "announcements", description: "Important announcements",         by: insertedUsers[0].id },
  ];

  const insertedChannels = channels.map((c) => {
    const { lastInsertRowid } = insertChannel.run(c.name, c.description, c.by);
    console.log(`  📢 Channel: #${c.name} (id=${lastInsertRowid})`);
    return { id: lastInsertRowid, ...c };
  });

  // -----------------------------------------------------------
  // Messages
  // -----------------------------------------------------------
  const insertMessage = db.prepare(`
    INSERT INTO messages (content, channel_id, user_id, created_at)
    VALUES (?, ?, ?, ?)
  `);

  const now = Date.now();
  const min = 60_000;

  const seedMessages = [
    // #general
    { content: "Hello everyone! 👋",                            channelId: insertedChannels[0].id, userId: insertedUsers[0].id, ago: 60 * min },
    { content: "How's the weather where you are?",              channelId: insertedChannels[0].id, userId: insertedUsers[1].id, ago: 55 * min },
    { content: "Cold, but we're shipping! ❄️",                  channelId: insertedChannels[0].id, userId: insertedUsers[2].id, ago: 50 * min },
    { content: "Welcome to Instant Messenger!",                 channelId: insertedChannels[0].id, userId: insertedUsers[0].id, ago: 45 * min },
    // #tech
    { content: "Anyone using React 19?",                        channelId: insertedChannels[2].id, userId: insertedUsers[1].id, ago: 40 * min },
    { content: "Yes, Server Components are amazing!",           channelId: insertedChannels[2].id, userId: insertedUsers[2].id, ago: 35 * min },
    { content: "Socket.io vs raw WebSocket — which do you prefer?", channelId: insertedChannels[2].id, userId: insertedUsers[0].id, ago: 30 * min },
    { content: "Socket.io has better cross-browser compatibility", channelId: insertedChannels[2].id, userId: insertedUsers[3].id, ago: 25 * min },
    // #random
    { content: "Anyone watched Oppenheimer?",                   channelId: insertedChannels[1].id, userId: insertedUsers[3].id, ago: 20 * min },
    { content: "Just did. Incredible film! 🎬",                 channelId: insertedChannels[1].id, userId: insertedUsers[0].id, ago: 15 * min },
  ];

  seedMessages.forEach((m) => {
    const ts = new Date(now - m.ago).toISOString().replace("T", " ").slice(0, 19);
    insertMessage.run(m.content, m.channelId, m.userId, ts);
  });

  console.log(`\n  💬 ${seedMessages.length} messages inserted`);
  console.log("\n✅ Done! You can log in with:");
  console.log("   Email: alice@demo.com | Password: password123\n");
}

seed().catch(console.error);
