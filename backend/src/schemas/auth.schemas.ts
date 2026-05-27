import { z } from "zod";

export const RegisterSchema = z.object({
  username: z.string().min(1, "Username is required").max(32, "Username must be at most 32 characters"),
  email:    z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const LoginSchema = z.object({
  email:    z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const ResetPasswordSchema = z.object({
  token:    z.string().min(1, "Token is required"),
  password: z.string().min(1, "Password is required"),
});

export const UpdateRoleSchema = z.object({
  role: z.string().refine((v) => ["admin", "member"].includes(v), "Invalid role (admin | member)"),
});
