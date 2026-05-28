/**
 * Express async route wrapper utility.
 *
 * Exports the `asyncRoute` helper — see the function-level JSDoc below for
 * full details. Used by every route file that registers async handlers.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Wraps an async Express route handler so that any rejected promise is
 * forwarded to the global error-handler middleware via `next(err)`.
 *
 * Without this wrapper, unhandled promise rejections inside async route
 * functions are silently swallowed by Express 4, causing the request to
 * hang indefinitely. Express 5 handles this natively, but this project
 * targets Express 4.
 *
 * Used by: all route files that register async handler functions.
 *
 * @param fn - An async Express RequestHandler (req, res, next) => Promise<void>.
 * @returns  A synchronous wrapper that catches rejections and calls next(err).
 *
 * @example
 * router.post("/", asyncRoute(async (req, res) => {
 *   const data = await someAsyncOperation(req.body);
 *   res.json(data);
 * }));
 */
export function asyncRoute(fn: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
