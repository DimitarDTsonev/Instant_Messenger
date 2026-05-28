/**
 * Development seed script — populates the database with demo users, channels,
 * and messages for local development and testing.
 *
 * WARNING: Deletes ALL existing users, channels, and messages before inserting.
 * This script is intended for development only. Never run against a production database.
 *
 * Usage: `npx ts-node src/db/seed.ts`  (or via the `seed` npm script).
 *
 * Demo accounts created (all use password `Password@123`):
 *   alice@demo.com, bob@demo.com, charlie@demo.com, diana@demo.com
 */

import bcrypt from "bcryptjs";
import { getDb, initDatabase } from "./database";

/**
 * Seeds the development database.
 *
 * Steps:
 *  1. Initialises the schema (creates tables if they don't exist).
 *  2. Truncates `messages`, `channels`, and `users` tables.
 *  3. Inserts 4 demo users with bcrypt-hashed passwords.
 *  4. Inserts 4 demo channels.
 *  5. Inserts 10 seed messages spread across #general, #tech, and #random.
 *
 * Built-ins used: `bcrypt.hashSync`, `db.prepare`, `db.exec`, `Date.now`.
 */
async function seed() {
  initDatabase();
  const db = getDb();

  console.log("Seeding development data...\n");

  // Development-only truncation — wipes all existing content
  db.exec(`
    DELETE FROM messages;
    DELETE FROM channels;
    DELETE FROM users;
  `);

  // All demo accounts share the same password hash for convenience
  const password = bcrypt.hashSync("Password@123", 10);

  const insertUser = db.prepare(`
    INSERT INTO users (username, email, password, avatar)
    VALUES (?, ?, ?, ?)
  `);

  const users = [
    { username: "alice",   email: "alice@demo.com",   avatar: "AL" },
    { username: "bob",     email: "bob@demo.com",     avatar: "BO" },
    { username: "charlie", email: "charlie@demo.com", avatar: "CH" },
    { username: "diana",   email: "diana@demo.com",   avatar: "DI" },
  ];

  const insertedUsers = users.map((u) => {
    const { lastInsertRowid } = insertUser.run(u.username, u.email, password, u.avatar);
    console.log(`  User: ${u.username} (id=${lastInsertRowid})`);
    return { id: lastInsertRowid, ...u };
  });

  const insertChannel = db.prepare(`
    INSERT INTO channels (name, description, created_by)
    VALUES (?, ?, ?)
  `);

  const channels = [
    { name: "general",       description: "General channel for everyone",    by: insertedUsers[0].id },
    { name: "random",        description: "Off-topic discussion",            by: insertedUsers[1].id },
    { name: "tech",          description: "Technology and programming",      by: insertedUsers[0].id },
    { name: "announcements", description: "Important announcements",         by: insertedUsers[0].id },
  ];

  const insertedChannels = channels.map((c) => {
    const { lastInsertRowid } = insertChannel.run(c.name, c.description, c.by);
    console.log(`   Channel: #${c.name} (id=${lastInsertRowid})`);
    return { id: lastInsertRowid, ...c };
  });

  const insertMessage = db.prepare(`
    INSERT INTO messages (content, channel_id, user_id, created_at)
    VALUES (?, ?, ?, ?)
  `);

  const now = Date.now();
  const min = 60_000; // Milliseconds per minute

  // Messages are back-dated so they appear in a realistic chronological order
  const seedMessages = [
    // #general
    { content: "Hello everyone! ",                                  channelId: insertedChannels[0].id, userId: insertedUsers[0].id, ago: 60 * min },
    { content: "How's the weather where you are?",                  channelId: insertedChannels[0].id, userId: insertedUsers[1].id, ago: 55 * min },
    { content: "Cold, but we're shipping! ",                        channelId: insertedChannels[0].id, userId: insertedUsers[2].id, ago: 50 * min },
    { content: "Welcome to Instant Messenger!",                     channelId: insertedChannels[0].id, userId: insertedUsers[0].id, ago: 45 * min },
    // #tech
    { content: "Anyone using React 19?",                            channelId: insertedChannels[2].id, userId: insertedUsers[1].id, ago: 40 * min },
    { content: "Yes, Server Components are amazing!",               channelId: insertedChannels[2].id, userId: insertedUsers[2].id, ago: 35 * min },
    { content: "Socket.io vs raw WebSocket - which do you prefer?", channelId: insertedChannels[2].id, userId: insertedUsers[0].id, ago: 30 * min },
    { content: "Socket.io has better cross-browser compatibility",  channelId: insertedChannels[2].id, userId: insertedUsers[3].id, ago: 25 * min },
    // #random
    { content: "Anyone watched Oppenheimer?",                       channelId: insertedChannels[1].id, userId: insertedUsers[3].id, ago: 20 * min },
    { content: "Just did. Incredible film! ",                       channelId: insertedChannels[1].id, userId: insertedUsers[0].id, ago: 15 * min },
  ];

  seedMessages.forEach((m) => {
    // Convert the epoch offset to an ISO-like SQLite datetime string
    const ts = new Date(now - m.ago).toISOString().replace("T", " ").slice(0, 19);
    insertMessage.run(m.content, m.channelId, m.userId, ts);
  });

  console.log(`\n   ${seedMessages.length} messages inserted`);
  console.log("\n Done! You can log in with:");
  console.log("   Email: alice@demo.com | Password: Password@123\n");
}

seed().catch(console.error);
