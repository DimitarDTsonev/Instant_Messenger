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

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    // e.g. "1714900000000-k3j7z9.png"
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});

const IMAGE_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
]);

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

export default router;