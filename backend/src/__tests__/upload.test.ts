import fs from "fs";
import path from "path";
import express from "express";
import request from "supertest";

import { getDb } from "../db/database";
import { signToken } from "../middleware/auth";
import uploadRouter from "../routes/upload";

// authMiddleware now queries the DB to check for bans/role changes
jest.mock("../db/database", () => ({ getDb: jest.fn() }));
const mockedGetDb = getDb as jest.Mock;
beforeAll(() => {
  mockedGetDb.mockReturnValue({
    prepare: jest.fn().mockReturnValue({
      get: jest.fn().mockReturnValue({ id: 1, username: "tester", email: "t@t.com", role: "member", is_banned: 0 }),
    }),
  });
});

// Build a minimal app that mounts the upload router directly.
// Multer writes to ../../uploads (two levels up from src/routes/), which
// is the real project uploads/ folder.  We clean up after each test.
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/upload", uploadRouter);
  return app;
}

function makeToken() {
  return signToken({ id: 1, username: "tester", email: "t@t.com", role: "member" });
}

// Minimal valid 1×1 PNG (67 bytes)
function pngBuffer() {
  return Buffer.from(
    "89504e470d0a1a0a0000000d494844520000000100000001080600000" +
    "01f15c4890000000a49444154789c6260000000020001e221bc330000" +
    "000049454e44ae426082",
    "hex"
  );
}

// Clean up any files written to uploads/ after each test
const UPLOADS_DIR = path.join(__dirname, "../../../../uploads");

afterEach(() => {
  if (fs.existsSync(UPLOADS_DIR)) {
    for (const f of fs.readdirSync(UPLOADS_DIR)) {
      if (f !== ".gitkeep") {
        try { fs.unlinkSync(path.join(UPLOADS_DIR, f)); } catch {}
      }
    }
  }
});

describe("POST /api/upload", () => {
  test("returns 401 without auth token", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/upload")
      .attach("file", pngBuffer(), { filename: "t.png", contentType: "image/png" });
    expect(res.status).toBe(401);
  });

  test("returns 400 when no file is attached", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/upload")
      .set("Authorization", `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test("accepts a PNG and returns url/type/name/size", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/upload")
      .set("Authorization", `Bearer ${makeToken()}`)
      .attach("file", pngBuffer(), { filename: "photo.png", contentType: "image/png" });
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^\/uploads\//);
    expect(res.body.type).toBe("image");
    expect(res.body.name).toBe("photo.png");
    expect(typeof res.body.size).toBe("number");
  });

  test("accepts a JPEG and classifies it as image", async () => {
    const app = buildApp();
    // Minimal JPEG bytes (SOI marker + EOI marker with tiny JFIF header)
    const jpeg = Buffer.alloc(32);
    jpeg[0] = 0xff; jpeg[1] = 0xd8; // SOI
    jpeg[2] = 0xff; jpeg[3] = 0xe0; // APP0
    jpeg[30] = 0xff; jpeg[31] = 0xd9; // EOI
    const res = await request(app)
      .post("/api/upload")
      .set("Authorization", `Bearer ${makeToken()}`)
      .attach("file", jpeg, { filename: "photo.jpg", contentType: "image/jpeg" });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe("image");
  });

  test("accepts a GIF and classifies it as image", async () => {
    const app = buildApp();
    const gif = Buffer.from("4749463839610100010080000000ffffff00000021f90401000000002c00000000010001000002024401003b", "hex");
    const res = await request(app)
      .post("/api/upload")
      .set("Authorization", `Bearer ${makeToken()}`)
      .attach("file", gif, { filename: "anim.gif", contentType: "image/gif" });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe("image");
  });

  test("accepts a PDF and classifies it as file", async () => {
    const app = buildApp();
    const pdf = Buffer.from("%PDF-1.4 minimal");
    const res = await request(app)
      .post("/api/upload")
      .set("Authorization", `Bearer ${makeToken()}`)
      .attach("file", pdf, { filename: "doc.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe("file");
    expect(res.body.name).toBe("doc.pdf");
  });

  test("accepts plain text and classifies it as file", async () => {
    const app = buildApp();
    const txt = Buffer.from("hello world");
    const res = await request(app)
      .post("/api/upload")
      .set("Authorization", `Bearer ${makeToken()}`)
      .attach("file", txt, { filename: "notes.txt", contentType: "text/plain" });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe("file");
  });

  test("rejects unsupported MIME type with 400", async () => {
    const app = buildApp();
    const exe = Buffer.from("MZ fake exe content");
    const res = await request(app)
      .post("/api/upload")
      .set("Authorization", `Bearer ${makeToken()}`)
      .attach("file", exe, { filename: "evil.exe", contentType: "application/octet-stream" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unsupported/i);
  });

  test("accepts a ZIP archive and classifies it as file", async () => {
    const app = buildApp();
    const zip = Buffer.from("504b0304", "hex"); // PK header
    const res = await request(app)
      .post("/api/upload")
      .set("Authorization", `Bearer ${makeToken()}`)
      .attach("file", zip, { filename: "archive.zip", contentType: "application/zip" });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe("file");
  });
});
