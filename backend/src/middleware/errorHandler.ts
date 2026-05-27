import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors";

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code });
    return;
  }

  // Multer throws plain Error objects for file type/size rejections
  const multerErr = err as { code?: string };
  if (err.message === "Unsupported file type" || multerErr.code === "LIMIT_FILE_SIZE") {
    res.status(400).json({ error: err.message, code: "UPLOAD_ERROR" });
    return;
  }

  console.error("[unhandled error]", err);
  res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
}
