/**
 * @file rbac-fail-closed.test.ts
 * @description Verifies the fail-closed RBAC marker pattern.
 *
 * Two layers of testing:
 *   1. Unit: each marker (protect, protectAll, protectAny, authRoute,
 *      publicRoute) stamps its handler correctly and the deny path returns
 *      the right HTTP status.
 *   2. Contract: the RBAC_MARKER symbol survives function-property semantics
 *      so a future lint test can statically scan route files for unmarked
 *      handlers.
 *
 * The full route-coverage lint test (which scans server/routes/ for
 * unwrapped handlers) is a follow-up; this file pins the contract that
 * makes it possible.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import {
  protect,
  protectAll,
  protectAny,
  authRoute,
  publicRoute,
  getRBACMarker,
  describeMarker,
  RBAC_MARKER,
} from "../../server/middleware/rbac-protect";

// Mock the rbac service so unit tests don't depend on the database.
vi.mock("../../server/services/rbac/rbac-service", () => ({
  rbacService: {
    hasPermission: vi.fn(),
    hasAllPermissions: vi.fn(),
    hasAnyPermission: vi.fn(),
  },
}));

vi.mock("../../server/services/audit/audit-service", () => ({
  auditService: {
    contextFromRequest: vi.fn(() => ({})),
  },
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
}));

import { rbacService } from "../../server/services/rbac/rbac-service";

// Build a minimal req/res/next triple. We deliberately keep this small so
// the tests describe the behavior, not the express internals.
function makeReqRes(user?: { id: string; isAdmin?: boolean }) {
  const req = {
    user,
    path: "/test",
    method: "GET",
    get: (header: string) => (header === "x-site-id" ? "site-a" : undefined),
  } as unknown as Request;

  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  } as unknown as Response & { statusCode: number; body: unknown };

  const next = vi.fn() as unknown as NextFunction;
  return { req, res, next };
}

describe("rbac-protect markers", () => {
  it("stamps a permission marker on protect()", () => {
    const wrapped = protect("users:read", (_req, res) => res.json({ ok: true }));
    const marker = getRBACMarker(wrapped);
    expect(marker).toEqual({ kind: "permission", permission: "users:read" });
    expect(describeMarker(marker)).toBe('protect("users:read")');
  });

  it("stamps a permissions-all marker on protectAll()", () => {
    const wrapped = protectAll(["a:read", "a:write"], (_req, res) =>
      res.json({ ok: true })
    );
    expect(getRBACMarker(wrapped)).toEqual({
      kind: "permissions-all",
      permissions: ["a:read", "a:write"],
    });
  });

  it("stamps a permissions-any marker on protectAny()", () => {
    const wrapped = protectAny(["b:x", "b:y"], (_req, res) =>
      res.json({ ok: true })
    );
    expect(getRBACMarker(wrapped)).toEqual({
      kind: "permissions-any",
      permissions: ["b:x", "b:y"],
    });
  });

  it("stamps an auth-only marker on authRoute()", () => {
    const wrapped = authRoute((_req, res) => res.json({ ok: true }));
    expect(getRBACMarker(wrapped)).toEqual({ kind: "auth-only" });
  });

  it("stamps a public marker on publicRoute()", () => {
    const wrapped = publicRoute((_req, res) => res.json({ ok: true }));
    expect(getRBACMarker(wrapped)).toEqual({ kind: "public" });
  });

  it("an unwrapped handler has no marker", () => {
    const handler = (_req: Request, res: Response) => res.json({ ok: true });
    expect(getRBACMarker(handler)).toBeUndefined();
  });

  it("describeMarker reports <unmarked> for missing markers", () => {
    expect(describeMarker(undefined)).toBe("<unmarked>");
  });

  it("the marker symbol is non-enumerable and frozen-once-set", () => {
    const wrapped = protect("x", (_req, res) => res.json({ ok: true }));
    // Object.keys / for-in must not expose the marker — we don't want it
    // accidentally serialized by JSON.stringify or copied via spread.
    expect(Object.keys(wrapped)).toEqual([]);
    // Re-defining the marker must throw — this is what makes the lint
    // contract robust against accidental re-marking.
    expect(() =>
      Object.defineProperty(wrapped, RBAC_MARKER, { value: { kind: "public" } })
    ).toThrow();
  });
});

describe("rbac-protect deny paths", () => {
  // Each test starts with a clean mock surface so the "not.toHaveBeenCalled"
  // assertions in this file are not contaminated by calls from previous tests.
  // Without this, the admin-bypass test sees calls accumulated by sibling
  // tests that exercise the rbacService mock.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("publicRoute always passes through with no auth check", async () => {
    const handler = vi.fn((_req: Request, res: Response) => res.json({ ok: true }));
    const wrapped = publicRoute(handler);
    const { req, res, next } = makeReqRes(); // no user
    await (wrapped as unknown as (r: Request, s: Response, n: NextFunction) => Promise<void>)(
      req,
      res,
      next
    );
    expect(handler).toHaveBeenCalledOnce();
    expect((res as Response & { statusCode: number }).statusCode).toBe(200);
  });

  it("authRoute returns 401 with no user", async () => {
    const handler = vi.fn((_req: Request, res: Response) => res.json({ ok: true }));
    const wrapped = authRoute(handler);
    const { req, res, next } = makeReqRes();
    await (wrapped as unknown as (r: Request, s: Response, n: NextFunction) => Promise<void>)(
      req,
      res,
      next
    );
    expect(handler).not.toHaveBeenCalled();
    expect((res as Response & { statusCode: number }).statusCode).toBe(401);
  });

  it("authRoute calls handler with a user", async () => {
    const handler = vi.fn((_req: Request, res: Response) => res.json({ ok: true }));
    const wrapped = authRoute(handler);
    const { req, res, next } = makeReqRes({ id: "u1" });
    await (wrapped as unknown as (r: Request, s: Response, n: NextFunction) => Promise<void>)(
      req,
      res,
      next
    );
    expect(handler).toHaveBeenCalledOnce();
  });

  it("protect returns 403 when permission denied", async () => {
    vi.mocked(rbacService.hasPermission).mockResolvedValueOnce({
      allowed: false,
    } as never);
    const handler = vi.fn((_req: Request, res: Response) => res.json({ ok: true }));
    const wrapped = protect("users:write", handler);
    const { req, res, next } = makeReqRes({ id: "u1" });
    await (wrapped as unknown as (r: Request, s: Response, n: NextFunction) => Promise<void>)(
      req,
      res,
      next
    );
    expect(handler).not.toHaveBeenCalled();
    expect((res as Response & { statusCode: number }).statusCode).toBe(403);
  });

  it("protect bypasses the permission check for admin users", async () => {
    const handler = vi.fn((_req: Request, res: Response) => res.json({ ok: true }));
    const wrapped = protect("users:write", handler);
    const { req, res, next } = makeReqRes({ id: "admin", isAdmin: true });
    await (wrapped as unknown as (r: Request, s: Response, n: NextFunction) => Promise<void>)(
      req,
      res,
      next
    );
    expect(handler).toHaveBeenCalledOnce();
    expect(rbacService.hasPermission).not.toHaveBeenCalled();
  });

  it("protect fails closed when the rbac service throws", async () => {
    vi.mocked(rbacService.hasPermission).mockRejectedValueOnce(new Error("db down"));
    const handler = vi.fn((_req: Request, res: Response) => res.json({ ok: true }));
    const wrapped = protect("users:read", handler);
    const { req, res, next } = makeReqRes({ id: "u1" });
    await (wrapped as unknown as (r: Request, s: Response, n: NextFunction) => Promise<void>)(
      req,
      res,
      next
    );
    expect(handler).not.toHaveBeenCalled();
    expect((res as Response & { statusCode: number }).statusCode).toBe(500);
  });

  it("protectAll returns 403 if any permission is missing", async () => {
    vi.mocked(rbacService.hasAllPermissions).mockResolvedValueOnce(false);
    const handler = vi.fn((_req: Request, res: Response) => res.json({ ok: true }));
    const wrapped = protectAll(["a", "b"], handler);
    const { req, res, next } = makeReqRes({ id: "u1" });
    await (wrapped as unknown as (r: Request, s: Response, n: NextFunction) => Promise<void>)(
      req,
      res,
      next
    );
    expect(handler).not.toHaveBeenCalled();
    expect((res as Response & { statusCode: number }).statusCode).toBe(403);
  });

  it("protectAny passes if at least one permission is present", async () => {
    vi.mocked(rbacService.hasAnyPermission).mockResolvedValueOnce(true);
    const handler = vi.fn((_req: Request, res: Response) => res.json({ ok: true }));
    const wrapped = protectAny(["a", "b"], handler);
    const { req, res, next } = makeReqRes({ id: "u1" });
    await (wrapped as unknown as (r: Request, s: Response, n: NextFunction) => Promise<void>)(
      req,
      res,
      next
    );
    expect(handler).toHaveBeenCalledOnce();
  });
});
