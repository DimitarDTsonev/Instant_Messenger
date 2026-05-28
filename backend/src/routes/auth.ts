/**
 * Authentication and user-management routes.
 *
 * Public routes (no auth required):
 *   POST /api/auth/register      — Create a new account.
 *   POST /api/auth/guest         — Create a temporary guest account.
 *   POST /api/auth/login         — Authenticate with email + password.
 *   POST /api/auth/forgot-password — Initiate a password reset by email.
 *   POST /api/auth/reset-password  — Complete a password reset with a token.
 *
 * Authenticated routes (Bearer token required):
 *   GET  /api/auth/me              — Return the current user object.
 *   GET  /api/auth/users           — List all users.
 *   GET  /api/auth/search?q=       — Search users by username prefix.
 *   GET  /api/auth/users/:id       — Get a single user by ID.
 *   PATCH /api/auth/users/:id/role — Update a user's global role (admin only in practice).
 */

import express from "express";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { asyncRoute } from "../utils/asyncRoute";
import {
  RegisterSchema,
  LoginSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  UpdateRoleSchema,
} from "../schemas/auth.schemas";
import * as AuthController from "../controllers/auth.controller";

const router = express.Router();

// ─── Public routes ────────────────────────────────────────────────────────────
router.post("/register",         validate(RegisterSchema),       AuthController.register);
router.post("/guest",                                            AuthController.guest);
router.post("/login",            validate(LoginSchema),          AuthController.login);
// asyncRoute wraps these async controllers so rejected promises reach the error handler
router.post("/forgot-password",                                  asyncRoute(AuthController.forgotPassword));
router.post("/reset-password",   validate(ResetPasswordSchema),  asyncRoute(AuthController.resetPassword));

// ─── Protected routes ─────────────────────────────────────────────────────────
router.get( "/me",               authMiddleware,                 AuthController.me);
router.get( "/users",            authMiddleware,                 AuthController.listUsers);
router.get( "/search",           authMiddleware,                 AuthController.searchUsers);
router.get( "/users/:id",        authMiddleware,                 AuthController.getUserById);
router.patch("/users/:id/role",  authMiddleware, validate(UpdateRoleSchema), AuthController.updateUserRole);

export default router;
