import { z } from "zod";

export const CreateChannelSchema = z.object({
  name:        z.string().min(2, "Channel name must be at least 2 characters"),
  description: z.string().max(500, "Description must be at most 500 characters").optional().default(""),
  is_private:  z.union([z.boolean(), z.number()]).optional().default(0),
});

export const UpdateChannelSchema = z.object({
  description: z.string().max(500).optional(),
  is_private:  z.union([z.boolean(), z.number()]).optional(),
});

export const AddMemberSchema = z.object({
  username: z.string().min(1, "Username is required"),
});

export const UpdateMemberRoleSchema = z.object({
  role: z.string().refine(
    (v) => ["manager", "member", "viewer"].includes(v),
    "Invalid role (manager | member | viewer)",
  ),
});

export const CreateInviteSchema = z.object({
  maxUses:        z.number().int().positive().nullable().optional(),
  expiresInHours: z.number().positive().nullable().optional(),
});
