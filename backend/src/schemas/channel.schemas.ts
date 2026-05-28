/**
 * Zod validation schemas for all channel-related request bodies.
 *
 * Schemas are used by the `validate` middleware factory in routes/channels/*.
 * All unknown fields are stripped by Zod before reaching the controller.
 *
 * Used by: routes/channels/index.ts, routes/channels/members.ts,
 *          routes/channels/channelInvites.ts.
 */

import { z } from "zod";

/**
 * `POST /api/channels` body schema.
 * - `name`        — Minimum 2 characters; the service normalises it to lowercase-kebab.
 * - `description` — Optional, capped at 500 characters; defaults to `""`.
 * - `is_private`  — Boolean or 0/1 flag; defaults to `0` (public).
 */
export const CreateChannelSchema = z.object({
  name:        z.string().min(2, "Channel name must be at least 2 characters"),
  description: z.string().max(500, "Description must be at most 500 characters").optional().default(""),
  is_private:  z.union([z.boolean(), z.number()]).optional().default(0),
});

/**
 * `PATCH /api/channels/:id` body schema.
 * All fields are optional so partial updates are supported.
 */
export const UpdateChannelSchema = z.object({
  description: z.string().max(500).optional(),
  is_private:  z.union([z.boolean(), z.number()]).optional(),
});

/**
 * `POST /api/channels/:id/members` body schema.
 * Adds a member by username rather than ID so the caller does not need to look up the ID.
 */
export const AddMemberSchema = z.object({
  username: z.string().min(1, "Username is required"),
});

/**
 * `PATCH /api/channels/:id/members/:userId` body schema.
 * Restricts `role` to the three non-owner assignable roles.
 * "owner" is excluded: it is assigned at channel creation and cannot be changed via this endpoint.
 */
export const UpdateMemberRoleSchema = z.object({
  role: z.string().refine(
    (v) => ["manager", "member", "viewer"].includes(v),
    "Invalid role (manager | member | viewer)",
  ),
});

/**
 * `POST /api/channels/:id/invites` body schema.
 * Both fields are optional; omitting them creates an unlimited, never-expiring invite.
 * - `maxUses`        — Positive integer cap on redemptions, or `null` for unlimited.
 * - `expiresInHours` — Positive number of hours until expiry, or `null` for no expiry.
 */
export const CreateInviteSchema = z.object({
  maxUses:        z.number().int().positive().nullable().optional(),
  expiresInHours: z.number().positive().nullable().optional(),
});
