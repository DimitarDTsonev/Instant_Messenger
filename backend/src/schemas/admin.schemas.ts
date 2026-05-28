/**
 * Zod validation schemas for admin endpoint request bodies.
 *
 * Used by: routes/admin.ts (`POST /api/admin/ban/:userId`).
 */

import { z } from "zod";

/**
 * `POST /api/admin/ban/:userId` body schema.
 * The `reason` field is optional; if omitted no reason is stored.
 * Capped at 255 characters to fit in a single database column.
 */
export const BanSchema = z.object({
  reason: z.string().max(255).optional(),
});
