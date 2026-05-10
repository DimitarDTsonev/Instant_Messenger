// ============================================================
//  src/routes/upload.ts — File upload route
//
//  Accepts multipart/form-data file uploads, validates the MIME
//  type against allowlists, and saves the file to the shared
//  `uploads/` directory at the project root.
//
//  Supported types:
//    Images  — JPEG, PNG, GIF, WebP, SVG
//    Files   — PDF, Word, Excel, PowerPoint, plain text, CSV,
//              ZIP, RAR, 7-Zip
//
//  REST routes defined:
//    POST /api/upload  — upload a single file
//
//  Connects to:
//    ../middleware/auth — authMiddleware (all routes are private)
//    multer             — multipart parsing and disk storage
// ============================================================

import type { NextFunction, Request, Response } from "express";
import express from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import { authMiddleware } from "../middleware/auth";

// Express router; all sub-routes require authentication
const router = express.Router();
router.use(authMiddleware);

// Absolute path to the shared uploads directory at the monorepo root.
// Use process.cwd() so compiled files under dist/ keep targeting ../uploads.
const UPLOADS_DIR = path.join(process.cwd(), "../uploads");
// Create the directory on startup if it does not already exist
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

/**
 * Multer disk storage configuration.
 * Files are saved to UPLOADS_DIR with a collision-resistant filename
 * composed of the current Unix timestamp and a random base-36 string,
 * preserving the original file extension.
 */
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    // e.g. "1714900000000-k3j7z9.png"
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});

/**
 * Set of allowed image MIME types.
 * Files whose MIME type is in this set are returned with `type: "image"`.
 */
const IMAGE_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
]);

/**
 * Set of allowed non-image file MIME types.
 * Files whose MIME type is in this set are returned with `type: "file"`.
 */
const FILE_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/x-zip-compressed",
  "application/x-rar-compressed",
  "application/x-7z-compressed",
]);

/**
 * Configured multer instance.
 * - Uses disk storage defined above.
 * - Rejects files whose MIME type is not in IMAGE_TYPES or FILE_TYPES.
 * - Enforces a 25 MB file size limit.
 */
const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (IMAGE_TYPES.has(file.mimetype) || FILE_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type"));
    }
  },
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB maximum file size
});

/**
 * POST /api/upload
 * Accepts a single file under the form-data field name `"file"`,
 * validates its MIME type, saves it to disk, and returns the public
 * URL and metadata needed to reference it in a message.
 *
 * @route   POST /api/upload
 * @access  Private (requires Bearer token)
 * @param   {File} req.file - Multipart file field named "file"
 * @returns {200} { url: string, type: "image"|"file", name: string, size: number }
 *   - `url`  — server-relative path, e.g. `/uploads/1714900000000-abc123.png`
 *   - `type` — "image" for images, "file" for all other supported types
 *   - `name` — original filename as supplied by the client
 *   - `size` — file size in bytes
 * @returns {400} { error: string } - No file provided or unsupported type
 */
router.post("/", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file provided" });
  // Classify the upload so the client can render it appropriately
  const type = IMAGE_TYPES.has(req.file.mimetype) ? "image" : "file";
  return res.json({
    url:  `/uploads/${req.file.filename}`,
    type,
    name: req.file.originalname,
    size: req.file.size,
  });
});

/**
 * Multer error handler middleware.
 * Catches errors thrown by multer (unsupported type, file too large) and
 * returns them as a structured JSON 400 response instead of crashing.
 *
 * @param {Error} err - Error thrown by multer
 * @param {import('express').Request}  _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
router.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(400).json({ error: err.message });
});

export default router;
