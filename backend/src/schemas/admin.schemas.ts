import { z } from "zod";

export const BanSchema = z.object({
  reason: z.string().max(255).optional(),
});
