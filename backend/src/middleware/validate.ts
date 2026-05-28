/**
 * Zod schema validation middleware factory.
 *
 * Creates an Express middleware that validates `req.body` against a Zod schema.
 * On success it replaces `req.body` with the parsed (and potentially coerced)
 * data and calls `next()`. On failure it forwards a `ValidationError`.
 *
 * Used by: all route files that define body schemas (auth, channels, etc.).
 */

import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";
import { ValidationError } from "../errors";

/**
 * Returns an Express middleware that validates `req.body` against `schema`.
 *
 * All Zod validation issues are joined into a single comma-separated error
 * message so the client receives one clear reason for the rejection.
 *
 * @param schema - A Zod schema describing the expected request body shape.
 * @returns      An Express middleware function.
 *
 * @example
 * router.post("/", validate(CreateChannelSchema), ChannelsController.create);
 */
export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      // Flatten all Zod issues into a single human-readable string
      const message = result.error.issues.map((e) => e.message).join(", ");
      return next(new ValidationError(message));
    }
    // Replace req.body with Zod-parsed data (applies default values, strips unknown fields, etc.)
    req.body = result.data;
    next();
  };
}
