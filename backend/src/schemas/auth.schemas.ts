/**
 * Zod validation schemas for all auth-related request bodies.
 *
 * Schemas are used by the `validate` middleware factory to parse and strip
 * unknown fields from incoming request bodies before they reach the controller.
 * On failure, `validate` throws a `ValidationError` with the first Zod error message.
 *
 * Used by: routes/auth.ts (paired with each route that accepts a body).
 * Mirrors: the password rules also checked client-side in utils/validatePassword.ts.
 */

import { z } from "zod";

/**
 * `POST /api/auth/register` body schema.
 * - `username` — 1–32 characters.
 * - `email`    — Valid email address.
 * - `password` — Non-empty; server-side complexity rules are enforced by auth.service.ts.
 */
export const RegisterSchema = z.object({
  username: z.string().min(1, "Username is required").max(32, "Username must be at most 32 characters"),
  email:    z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

/**
 * `POST /api/auth/login` body schema.
 * - `email`    — Valid email address.
 * - `password` — Non-empty.
 */
export const LoginSchema = z.object({
  email:    z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

/**
 * `POST /api/auth/forgot-password` body schema.
 * Only the email is needed to initiate a password reset.
 */
export const ForgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

/**
 * `POST /api/auth/reset-password` body schema.
 * - `token`    — The reset token from the email link.
 * - `password` — New plain-text password; complexity is validated in auth.service.ts.
 */
export const ResetPasswordSchema = z.object({
  token:    z.string().min(1, "Token is required"),
  password: z.string().min(1, "Password is required"),
});

/**
 * `PATCH /api/auth/users/:id/role` body schema.
 * Restricts `role` to the two valid global roles.
 */
export const UpdateRoleSchema = z.object({
  role: z.string().refine((v) => ["admin", "member"].includes(v), "Invalid role (admin | member)"),
});
