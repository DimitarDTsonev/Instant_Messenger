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

router.post("/register",         validate(RegisterSchema),       AuthController.register);
router.post("/guest",                                            AuthController.guest);
router.post("/login",            validate(LoginSchema),          AuthController.login);
router.get( "/me",               authMiddleware,                 AuthController.me);
router.get( "/users",            authMiddleware,                 AuthController.listUsers);
router.get( "/search",           authMiddleware,                 AuthController.searchUsers);
router.get( "/users/:id",        authMiddleware,                 AuthController.getUserById);
router.patch("/users/:id/role",  authMiddleware, validate(UpdateRoleSchema), AuthController.updateUserRole);
router.post("/forgot-password",                                  asyncRoute(AuthController.forgotPassword));
router.post("/reset-password",   validate(ResetPasswordSchema),  asyncRoute(AuthController.resetPassword));

export default router;
