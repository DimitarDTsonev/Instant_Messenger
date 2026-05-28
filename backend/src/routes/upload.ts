/**
 * File upload route — handles multipart/form-data file uploads.
 *
 * Uses `multer` with disk storage to accept image and document uploads.
 * Files are stored in `<project-root>/../uploads/` with randomised filenames
 * to avoid collisions and prevent path traversal via predictable names.
 *
 * Accepted image types:  JPEG, PNG, GIF, WebP.
 * Accepted document types: PDF, Word, Excel, PowerPoint, plain text, CSV,
 *                           ZIP, RAR, 7-Zip.
 * Maximum file size: 25 MB.
 *
 * Route:
 *   POST /api/upload  — Upload a single file; returns `{ url, type, name, size }`.
 *
 * Authentication is required (authMiddleware applied at router level).
 *
 * Used by: MessageInput.tsx (frontend file attachment button).
 */

import express from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import { authMiddleware } from "../middleware/auth";

const router = express.Router();
router.use(authMiddleware);

/**
 * Absolute path to the shared uploads directory at the monorepo root.
 * `process.cwd()` is used instead of `__dirname` so that compiled files
 * under `dist/` keep targeting `../uploads` relative to the project root.
 */
const UPLOADS_DIR = path.join(process.cwd(), "../uploads");
// Create the directory on startup if it does not already exist
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

/**
 * Multer disk storage configuration.
 * Generates a unique filename: `<timestamp>-<random-base36>.<ext>`.
 * Example: `1714900000000-k3j7z9.png`
 */
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});

/** MIME types treated as images — rendered inline by the client. */
const IMAGE_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
]);

/** MIME types treated as generic file attachments — shown with a download link. */
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
 * Multer instance:
 *  - `storage`    — Disk storage with randomised filenames.
 *  - `fileFilter` — Accepts only types in IMAGE_TYPES or FILE_TYPES.
 *  - `limits`     — 25 MB per file.
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
 * Accepts a single `file` field in a multipart form.
 * Responds with `{ url, type, name, size }`:
 *  - `url`  — Public path to the uploaded file (e.g. `/uploads/1714900000000-k3j7z9.png`).
 *  - `type` — `"image"` if the MIME type is in IMAGE_TYPES, otherwise `"file"`.
 *  - `name` — Original filename as supplied by the client.
 *  - `size` — File size in bytes.
 */
router.post("/", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file provided" });
  // Classify the upload so the client can render it appropriately (inline vs download)
  const type = IMAGE_TYPES.has(req.file.mimetype) ? "image" : "file";
  return res.json({
    url:  `/uploads/${req.file.filename}`,
    type,
    name: req.file.originalname,
    size: req.file.size,
  });
});

export default router;
