import type { Db } from "../types";
import Database from "better-sqlite3";
import path from "path";
import bcrypt from "bcryptjs";

// Absolute path to the SQLite file. Docker can override it to persist data in a volume.
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "messenger.db");

// Module-level singleton; populated on first call to getDb()
let db: Db | null = null;

export function getDb(): Db {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL"); // Enables Write-Ahead Logging for better concurrency
    db.pragma("foreign_keys = ON");  // Enforce foreign key constraints
  }
  return db;
}

export function initDatabase() {
  const db = getDb();

  db.exec(`
    -- -------------------------------------------------------
    -- Users
    -- -------------------------------------------------------
    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      username    TEXT    NOT NULL UNIQUE,
      email       TEXT    NOT NULL UNIQUE,
      password    TEXT    NOT NULL,
      avatar      TEXT    DEFAULT NULL,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- -------------------------------------------------------
    -- Channels (public and private rooms)
    -- -------------------------------------------------------
    CREATE TABLE IF NOT EXISTS channels (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL UNIQUE,
      description TEXT    DEFAULT '',
      created_by  INTEGER REFERENCES users(id),
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- -------------------------------------------------------
    -- Channel messages
    -- -------------------------------------------------------
    CREATE TABLE IF NOT EXISTS messages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      content     TEXT    NOT NULL,
      channel_id  INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL REFERENCES users(id),
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- -------------------------------------------------------
    -- Direct messages (DM) between two users
    -- -------------------------------------------------------
    CREATE TABLE IF NOT EXISTS direct_messages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      content     TEXT    NOT NULL,
      sender_id   INTEGER NOT NULL REFERENCES users(id),
      receiver_id INTEGER NOT NULL REFERENCES users(id),
      is_read     INTEGER DEFAULT 0,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- -------------------------------------------------------
    -- Indexes for faster lookups
    -- -------------------------------------------------------
    CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id);
    CREATE INDEX IF NOT EXISTS idx_messages_user    ON messages(user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_content ON messages(content);
    CREATE INDEX IF NOT EXISTS idx_dm_sender   ON direct_messages(sender_id);
    CREATE INDEX IF NOT EXISTS idx_dm_receiver ON direct_messages(receiver_id);

    -- -------------------------------------------------------
    -- Emoji reactions on channel messages
    -- -------------------------------------------------------
    CREATE TABLE IF NOT EXISTS message_reactions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id  INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
      emoji       TEXT    NOT NULL,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(message_id, user_id, emoji)
    );

    CREATE INDEX IF NOT EXISTS idx_reactions_message ON message_reactions(message_id);

    -- -------------------------------------------------------
    -- Emoji reactions on direct messages
    -- -------------------------------------------------------
    CREATE TABLE IF NOT EXISTS dm_reactions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL REFERENCES direct_messages(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji      TEXT    NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(message_id, user_id, emoji)
    );

    CREATE INDEX IF NOT EXISTS idx_dm_reactions_message ON dm_reactions(message_id);

    -- -------------------------------------------------------
    -- Channel membership with role (owner | manager | member)
    -- -------------------------------------------------------
    CREATE TABLE IF NOT EXISTS channel_members (
      channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
      role       TEXT    NOT NULL DEFAULT 'member',
      joined_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (channel_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_cm_channel ON channel_members(channel_id);
    CREATE INDEX IF NOT EXISTS idx_cm_user    ON channel_members(user_id);

    -- -------------------------------------------------------
    -- Per-role permission overrides for a specific channel
    -- -------------------------------------------------------
    CREATE TABLE IF NOT EXISTS channel_permissions (
      channel_id          INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      role                TEXT    NOT NULL,
      can_write           INTEGER DEFAULT 1,
      can_invite          INTEGER DEFAULT 0,
      can_manage_members  INTEGER DEFAULT 0,
      can_delete_messages INTEGER DEFAULT 0,
      PRIMARY KEY (channel_id, role)
    );

    -- -------------------------------------------------------
    -- Invite links for channels
    -- -------------------------------------------------------
    CREATE TABLE IF NOT EXISTS channel_invites (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      created_by INTEGER NOT NULL REFERENCES users(id),
      code       TEXT    NOT NULL UNIQUE,
      max_uses   INTEGER DEFAULT NULL,
      uses_count INTEGER DEFAULT 0,
      expires_at DATETIME DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_invites_code    ON channel_invites(code);
    CREATE INDEX IF NOT EXISTS idx_invites_channel ON channel_invites(channel_id);

    -- -------------------------------------------------------
    -- Password reset tokens (single-use, 1-hour TTL)
    -- -------------------------------------------------------
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token      TEXT    NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      used       INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_prt_token ON password_reset_tokens(token);
  `);

  // Migration: add new columns to existing tables if they do not yet exist
  const msgCols  = (db.pragma("table_info(messages)") as 
        Array<{ name: string }>).map((c) => c.name);
  const userCols = (db.pragma("table_info(users)") as 
        Array<{ name: string }>).map((c) => c.name);

  // New columns added to messages over time
  const msgMigrations = [
    ["is_edited",    "INTEGER DEFAULT 0"],
    ["edited_at",    "DATETIME"],
    ["reply_to_id",  "INTEGER"],
    ["file_url",     "TEXT"],
    ["file_type",    "TEXT"],
    ["file_name",    "TEXT"],
    ["is_pinned",    "INTEGER DEFAULT 0"],
    ["source",       "TEXT DEFAULT 'user'"],  // 'user' | 'system' | 'webhook'
    ["metadata",     "TEXT"],
  ];
  for (const [col, def] of msgMigrations) {
    if (!msgCols.includes(col)) {
      db.exec(`ALTER TABLE messages ADD COLUMN ${col} ${def}`);
    }
  }

  // Add global role, guest flag, and ban fields to users
  if (!userCols.includes("role")) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'member'");
  }
  if (!userCols.includes("is_guest")) {
    db.exec("ALTER TABLE users ADD COLUMN is_guest INTEGER DEFAULT 0");
  }
  if (!userCols.includes("is_banned")) {
    db.exec("ALTER TABLE users ADD COLUMN is_banned INTEGER DEFAULT 0");
  }
  if (!userCols.includes("ban_reason")) {
    db.exec("ALTER TABLE users ADD COLUMN ban_reason TEXT");
  }
  if (!userCols.includes("is_system")) {
    db.exec("ALTER TABLE users ADD COLUMN is_system INTEGER DEFAULT 0");
  }

  // Security event log
  db.exec(`
    CREATE TABLE IF NOT EXISTS security_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      event      TEXT    NOT NULL,
      ip         TEXT,
      user_id    INTEGER,
      username   TEXT,
      detail     TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_sec_event   ON security_logs(event);
    CREATE INDEX IF NOT EXISTS idx_sec_ip      ON security_logs(ip);
    CREATE INDEX IF NOT EXISTS idx_sec_user    ON security_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_sec_created ON security_logs(created_at);
  `);

  // Migration: add is_private flag to channels
  const chCols = (db.pragma("table_info(channels)") as Array<{ name: string }>).map((c) => c.name);
  if (!chCols.includes("is_private")) {
    db.exec("ALTER TABLE channels ADD COLUMN is_private INTEGER DEFAULT 0");
  }

  // Migration: back-fill existing channel creators as 'owner' in channel_members
  const existingChannels = db.prepare("SELECT id, created_by FROM channels WHERE created_by IS NOT NULL").all() as 
        Array<{ id: number; created_by: number }>;
  const insertOwner = db.prepare(
    "INSERT OR IGNORE INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'owner')"
  );
  for (const ch of existingChannels) {
    insertOwner.run(ch.id, ch.created_by);
  }

  // Cleanup: remove guest accounts older than 24 hours
  db.prepare(`
    DELETE FROM users
    WHERE is_guest = 1
      AND created_at < datetime('now', '-24 hours')
  `).run();

  // Migration: add file attachment and edit-tracking columns to direct_messages
  const dmCols = (db.pragma("table_info(direct_messages)") as 
        Array<{ name: string }>).map((c) => c.name);
  const dmMigrations = [
    ["file_url",    "TEXT"],
    ["file_type",   "TEXT"],
    ["file_name",   "TEXT"],
    ["reply_to_id", "INTEGER"],
    ["is_edited",   "INTEGER DEFAULT 0"],
    ["edited_at",   "DATETIME"],
    ["read_at",     "DATETIME"],
  ];
  for (const [col, def] of dmMigrations) {
    if (!dmCols.includes(col)) {
      db.exec(`ALTER TABLE direct_messages ADD COLUMN ${col} ${def}`);
    }
  }

  // Auto-seed the Music Dashboard bot user when BOT_* env vars are provided.
  // Runs on every startup but is a no-op if the user already exists.
  const botEmail    = process.env.BOT_EMAIL;
  const botPassword = process.env.BOT_PASSWORD;
  const botUsername = process.env.BOT_USERNAME || "MusicBot";

  if (botEmail && botPassword) {
    const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(botEmail);
    if (!exists) {
      const hashed = bcrypt.hashSync(botPassword, 10);
      const avatar  = botUsername.slice(0, 2).toUpperCase();
      db.prepare("INSERT INTO users (username, email, password, avatar, role, is_system) VALUES (?, ?, ?, ?, 'member', 1)")
        .run(botUsername, botEmail, hashed, avatar);
      console.log("Bot user created automatically (system account)");
    }
  }

  console.log("Database initialised successfully");
}
