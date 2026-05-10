/**
 * @fileoverview Tests for JWT auth middleware and signToken helper
 * Covers: missing header, wrong format, invalid token, expired token, valid token
 */

import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

import { authMiddleware, signToken } from "../middleware/auth";

const SECRET = process.env.JWT_SECRET || "super-secret-dev-key-change-in-prod";

type MockRequest = Pick<Request, "headers"> & { user?: JwtPayload };
type MockResponse = Pick<Response, "status" | "json">;

// Minimal Express mock helpers
function mockReq(authHeader?: string): MockRequest {
  return { headers: { authorization: authHeader } };
}
function mockRes(): MockResponse {
  const res = {} as MockResponse;
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}
const mockNext = jest.fn() as jest.MockedFunction<NextFunction>;

beforeEach(() => mockNext.mockClear());

// ─── signToken ───────────────────────────────────────────────────────────────

describe("signToken", () => {
  test("returns a string", () => {
    const token = signToken({ id: 1, username: "alice", email: "a@a.com", role: "member" });
    expect(typeof token).toBe("string");
  });

  test("token payload contains user fields", () => {
    const token = signToken({ id: 42, username: "bob", email: "b@b.com", role: "admin" });
    const decoded = jwt.verify(token, SECRET) as JwtPayload;
    expect(decoded.id).toBe(42);
    expect(decoded.username).toBe("bob");
    expect(decoded.role).toBe("admin");
  });

  test("token expires in 7 days", () => {
    const token = signToken({ id: 1, username: "u", email: "u@u.com", role: "member" });
    const { exp, iat } = jwt.decode(token) as JwtPayload;
    expect(exp - iat).toBe(7 * 24 * 3600);
  });

  test("defaults role to member when omitted", () => {
    const token = signToken({ id: 1, username: "u", email: "u@u.com" });
    const { role } = jwt.decode(token) as JwtPayload;
    expect(role).toBe("member");
  });
});

// ─── authMiddleware ───────────────────────────────────────────────────────────

describe("authMiddleware", () => {
  test("returns 401 when Authorization header is missing", () => {
    const req = mockReq(undefined);
    const res = mockRes();
    authMiddleware(req as Request, res as Response, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  test("returns 401 when header does not start with Bearer", () => {
    const req = mockReq("Basic abc123");
    const res = mockRes();
    authMiddleware(req as Request, res as Response, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  test("returns 401 for a malformed / invalid token", () => {
    const req = mockReq("Bearer notavalidtoken");
    const res = mockRes();
    authMiddleware(req as Request, res as Response, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  test("returns 401 for an expired token", () => {
    const expired = jwt.sign(
      { id: 1, username: "u", email: "u@u.com", role: "member" },
      SECRET,
      { expiresIn: -1 }  // already expired
    );
    const req = mockReq(`Bearer ${expired}`);
    const res = mockRes();
    authMiddleware(req as Request, res as Response, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test("attaches decoded payload to req.user and calls next for valid token", () => {
    const token = signToken({ id: 5, username: "alice", email: "a@a.com", role: "admin" });
    const req = mockReq(`Bearer ${token}`);
    const res = mockRes();
    authMiddleware(req as Request, res as Response, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(req.user.id).toBe(5);
    expect(req.user.role).toBe("admin");
    expect(res.status).not.toHaveBeenCalled();
  });
});
