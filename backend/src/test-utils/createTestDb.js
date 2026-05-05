/**
 * @fileoverview Test database utilities
 * Creates an isolated in-memory SQLite database with the full app schema.
 * Import these helpers in every backend test file instead of touching the real DB.
 */

const Database = require("better-sqlite3");

/** Full application schema — mirrors initDatabase() but runs against :memory: */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT    NOT NULL UNIQUE,
    email      TEXT    NOT NULL UNIQUE,
    password   TEXT    NOT NULL,
    avatar     TEXT    DEFAULT NULL,
    role       TEXT    DEFAULT 'member',
    is_guest   INTEGER DEFAULT 0,
    is_banned  INTEGER DEFAULT 0,
    ban_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS security_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    event      TEXT    NOT NULL,
    ip         TEXT,
    user_id    INTEGER,
    username   TEXT,
    detail     TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS channels (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    description TEXT    DEFAULT '',
    created_by  INTEGER REFERENCES users(id),
    is_private  INTEGER DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    content     TEXT    NOT NULL,
    channel_id  INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    is_edited   INTEGER DEFAULT 0,
    edited_at   DATETIME,
    reply_to_id INTEGER,
    file_url    TEXT,
    file_type   TEXT,
    file_name   TEXT,
    is_pinned   INTEGER DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS direct_messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    content     TEXT    NOT NULL,
    sender_id   INTEGER NOT NULL REFERENCES users(id),
    receiver_id INTEGER NOT NULL REFERENCES users(id),
    is_read     INTEGER DEFAULT 0,
    read_at     DATETIME,
    reply_to_id INTEGER,
    file_url    TEXT,
    file_type   TEXT,
    file_name   TEXT,
    is_edited   INTEGER DEFAULT 0,
    edited_at   DATETIME,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS message_reactions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    emoji      TEXT    NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(message_id, user_id, emoji)
  );

  CREATE TABLE IF NOT EXISTS dm_reactions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL REFERENCES direct_messages(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id)           ON DELETE CASCADE,
    emoji      TEXT    NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(message_id, user_id, emoji)
  );

  CREATE TABLE IF NOT EXISTS channel_members (
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    role       TEXT    NOT NULL DEFAULT 'member',
    joined_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (channel_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS channel_permissions (
    channel_id          INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    role                TEXT    NOT NULL,
    can_write           INTEGER DEFAULT 1,
    can_invite          INTEGER DEFAULT 0,
    can_manage_members  INTEGER DEFAULT 0,
    can_delete_messages INTEGER DEFAULT 0,
    PRIMARY KEY (channel_id, role)
  );

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

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      TEXT    NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used       INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

/**
 * Creates and returns a fresh in-memory SQLite database with the full schema.
 * Each test file should create one instance shared across all tests in that file.
 *
 * @returns {import('better-sqlite3').Database}
 */
function createTestDb() {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

/**
 * Deletes all rows from every table while keeping the schema intact.
 * Call this in beforeEach to isolate each test.
 *
 * @param {import('better-sqlite3').Database} db
 */
function clearDb(db) {
  db.exec(`
    DELETE FROM dm_reactions;
    DELETE FROM message_reactions;
    DELETE FROM direct_messages;
    DELETE FROM messages;
    DELETE FROM channel_invites;
    DELETE FROM channel_permissions;
    DELETE FROM channel_members;
    DELETE FROM channels;
    DELETE FROM security_logs;
    DELETE FROM password_reset_tokens;
    DELETE FROM users;
  `);
}

module.exports = { createTestDb, clearDb };
