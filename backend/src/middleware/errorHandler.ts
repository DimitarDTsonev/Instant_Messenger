/**
 * Global Express error-handling middleware.
 *
 * Must be registered AFTER all routes so Express recognises the four-argument
 * signature `(err, req, res, next)` as an error handler.
 *
 * Handles three categories of errors:
 *  1. AppError subclasses (ValidationError, NotFoundError, etc.) — uses their
 *     built-in statusCode and code fields for a structured JSON response.
 *  2. Multer file-upload errors — plain Error objects with a known message or
 *     `code` property.
 *  3. Everything else — logs and returns a generic 500 response.
 *
 * Imported / used by: server.ts (`app.use(errorHandler)` at the bottom).
 */

import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors";

/**
 * Express error-handler middleware.
 *
 * @param err  - The error forwarded by `next(err)` from a route or middleware.
 * @param _req - Not used.
 * @param res  - Express response used to send the error payload.
 * @param _next - Required by Express to identify the function as an error handler.
 */
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  // Known application errors (custom AppError subclasses) — use their own status
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code });
    return;
  }

  // Multer throws plain Error objects for file type / size rejections
  const multerErr = err as { code?: string };
  if (err.message === "Unsupported file type" || multerErr.code === "LIMIT_FILE_SIZE") {
    res.status(400).json({ error: err.message, code: "UPLOAD_ERROR" });
    return;
  }

  // Unexpected / unhandled errors — log and return generic 500
  console.error("[unhandled error]", err);
  res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
}
