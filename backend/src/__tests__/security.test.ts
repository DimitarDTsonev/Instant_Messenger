import { getDb } from "../db/database";
import { clearDb, createTestDb } from "../test-utils/createTestDb";

jest.mock("../db/database", () => ({ getDb: jest.fn(), initDatabase: jest.fn() }));
const mockedGetDb = getDb as jest.Mock;

// Re-require security after mock so internal require("../db/database") is mocked
let security;
let db;

beforeAll(() => {
  db = createTestDb();
  mockedGetDb.mockReturnValue(db);
  security = require("../middleware/security");
});

beforeEach(() => {
  clearDb(db);
  // Reset in-memory state between tests by clearing the module cache
  jest.resetModules();
  mockedGetDb.mockReturnValue(db);
  security = require("../middleware/security");
});

describe("logSecurityEvent", () => {
  test("inserts a row into security_logs", () => {
    security.logSecurityEvent(db, { event: "test_event", ip: "1.2.3.4", username: "alice", detail: "d" });
    const row = db.prepare("SELECT * FROM security_logs WHERE event = 'test_event'").get();
    expect(row).toBeTruthy();
    expect(row.ip).toBe("1.2.3.4");
    expect(row.username).toBe("alice");
    expect(row.detail).toBe("d");
  });

  test("logs to console.warn", () => {
    const spy = jest.spyOn(console, "warn").mockImplementation(() => {});
    security.logSecurityEvent(db, { event: "warn_test", ip: "9.9.9.9" });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("WARN_TEST"));
    spy.mockRestore();
  });

  test("does not throw when DB write fails", () => {
    const badDb = { prepare: () => { throw new Error("db down"); } };
    expect(() =>
      security.logSecurityEvent(badDb, { event: "fail_event" })
    ).not.toThrow();
  });

  test("handles undefined optional fields gracefully", () => {
    expect(() =>
      security.logSecurityEvent(db, { event: "minimal" })
    ).not.toThrow();
    const row = db.prepare("SELECT * FROM security_logs WHERE event = 'minimal'").get();
    expect(row.ip).toBeNull();
    expect(row.user_id).toBeNull();
  });
});

describe("recordLoginFail", () => {
  test("logs a login_fail event", () => {
    security.recordLoginFail(db, "10.0.0.1", "bob@test.com");
    const row = db.prepare("SELECT * FROM security_logs WHERE event = 'login_fail'").get();
    expect(row).toBeTruthy();
    expect(row.ip).toBe("10.0.0.1");
    expect(row.username).toBe("bob@test.com");
  });

  test("records multiple attempts", () => {
    security.recordLoginFail(db, "10.0.0.2", "user@test.com");
    security.recordLoginFail(db, "10.0.0.2", "user@test.com");
    const rows = db.prepare("SELECT * FROM security_logs WHERE event = 'login_fail' AND ip = '10.0.0.2'").all();
    expect(rows.length).toBe(2);
  });

  test("resets the failed-login window after 15 minutes", () => {
    const nowSpy = jest.spyOn(Date, "now");
    nowSpy.mockReturnValue(1_000);
    security.recordLoginFail(db, "10.0.0.3", "reset@test.com");

    nowSpy.mockReturnValue(1_000 + 16 * 60 * 1000);
    security.recordLoginFail(db, "10.0.0.3", "reset@test.com");

    const latest = db
      .prepare("SELECT detail FROM security_logs WHERE event = 'login_fail' AND ip = '10.0.0.3' ORDER BY id DESC")
      .get();
    expect(latest.detail).toContain("attempt 1 of 10");
    nowSpy.mockRestore();
  });

  test("auto-bans IP after 10 failures and logs ip_banned", () => {
    for (let i = 0; i < 10; i++) {
      security.recordLoginFail(db, "10.0.0.99", "brute@test.com");
    }
    const banRow = db.prepare("SELECT * FROM security_logs WHERE event = 'ip_banned'").get();
    expect(banRow).toBeTruthy();
    expect(banRow.ip).toBe("10.0.0.99");
  });
});

describe("checkIpBanned", () => {
  function makeReqRes(ip) {
    const req  = { ip, method: "POST", path: "/api/auth/login" };
    const res  = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    return { req, res, next };
  }

  test("calls next() for a non-banned IP", () => {
    const { req, res, next } = makeReqRes("192.168.1.1");
    security.checkIpBanned(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test("blocks a banned IP with 403", () => {
    // Ban the IP first by triggering 10 failures
    for (let i = 0; i < 10; i++) {
      security.recordLoginFail(db, "6.6.6.6", "evil@test.com");
    }
    const { req, res, next } = makeReqRes("6.6.6.6");
    security.checkIpBanned(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining("blocked") }));
  });
});

describe("isUserBanned", () => {
  test("returns false for a normal user", () => {
    const { lastInsertRowid } = db.prepare(
      "INSERT INTO users (username, email, password) VALUES ('norm', 'n@t.com', 'x')"
    ).run();
    expect(security.isUserBanned(db, lastInsertRowid)).toBe(false);
  });

  test("returns true for a banned user", () => {
    const { lastInsertRowid } = db.prepare(
      "INSERT INTO users (username, email, password, is_banned) VALUES ('banned', 'b@t.com', 'x', 1)"
    ).run();
    expect(security.isUserBanned(db, lastInsertRowid)).toBe(true);
  });

  test("returns false for unknown user id", () => {
    expect(security.isUserBanned(db, 99999)).toBe(false);
  });

  test("returns false (does not throw) when DB errors", () => {
    const badDb = { prepare: () => { throw new Error("boom"); } };
    expect(security.isUserBanned(badDb, 1)).toBe(false);
  });
});

describe("isSocketRateLimited", () => {
  test("returns not limited for first message", () => {
    const { limited } = security.isSocketRateLimited(1001);
    expect(limited).toBe(false);
  });

  test("returns limited after exceeding 20 messages in window", () => {
    let result;
    for (let i = 0; i < 22; i++) {
      result = security.isSocketRateLimited(1002);
    }
    expect(result.limited).toBe(true);
    expect(result.count).toBeGreaterThan(20);
  });

  test("tracks count correctly", () => {
    const { count } = security.isSocketRateLimited(1003);
    expect(count).toBe(1);
    const { count: count2 } = security.isSocketRateLimited(1003);
    expect(count2).toBe(2);
  });

  test("resets socket message counter after the rate window", () => {
    const nowSpy = jest.spyOn(Date, "now");
    nowSpy.mockReturnValue(5_000);
    security.isSocketRateLimited(1004);

    nowSpy.mockReturnValue(16_000);
    const result = security.isSocketRateLimited(1004);

    expect(result).toEqual({ limited: false, count: 1 });
    nowSpy.mockRestore();
  });

  test("different users have independent counters", () => {
    for (let i = 0; i < 22; i++) security.isSocketRateLimited(2001);
    const { limited } = security.isSocketRateLimited(2002);
    expect(limited).toBe(false);
  });
});
