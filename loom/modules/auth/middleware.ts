/**
 * Auth middleware: extract session cookie → load user → bind user scope.
 *
 * The middleware is permissive by default: a missing or invalid cookie
 * just leaves `req.user` undefined and calls `next()`. Routes that
 * REQUIRE auth use `requireAuth` (also exported from this file) to
 * answer 401. This split lets the same middleware run on every request
 * — including public ones — without forcing authentication everywhere.
 *
 * When a valid cookie resolves to a user, the rest of the request
 * pipeline (downstream middleware, route handlers, async operations
 * triggered from them) runs inside `runInUserScope(user.id, ...)`. That
 * propagates through AsyncLocalStorage, so `tenantScope.scoped()` /
 * `withDbUserScope()` inside any handler see the bound userId without
 * the handler having to plumb it explicitly.
 */

import type {
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";
import { runInUserScope } from "../../engines/tenant-scope";
import type { DbHandle } from "../../core/db";
import { loadSessionUser } from "./service";
import type { User } from "./schema";

/**
 * Global type augmentation: every Express Request can carry an
 * authenticated User. The @types/express package declares Request via
 * the global Express namespace, so this is the canonical extension
 * point. Loaded once when middleware.ts is imported anywhere in the
 * build.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by createAuthMiddleware when a valid session cookie is present. */
      user?: User;
    }
  }
}

export interface AuthMiddlewareConfig {
  /**
   * Cookie name to read. Default: `"session"`. In production, callers
   * should use `"__Host-session"` to take advantage of the browser's
   * `__Host-` prefix guarantees (Secure, no Domain, path=/).
   */
  cookieName?: string;
}

/**
 * Build the auth middleware. Bind it once per app at boot.
 */
export function createAuthMiddleware(
  handle: DbHandle,
  config: AuthMiddlewareConfig = {},
): RequestHandler {
  const cookieName = config.cookieName ?? "session";

  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const cookieHeader = req.headers.cookie;
      if (!cookieHeader) {
        next();
        return;
      }
      const cookies = parseCookieHeader(cookieHeader);
      const sessionCookie = cookies.get(cookieName);
      if (!sessionCookie) {
        next();
        return;
      }
      const user = await loadSessionUser(handle, sessionCookie);
      if (!user) {
        next();
        return;
      }
      req.user = user;
      // Wrap the rest of the chain in the user scope. AsyncLocalStorage
      // propagates through await, so every downstream tenantScope call
      // sees the bound userId without callers having to plumb it.
      runInUserScope(user.id, () => next());
    } catch (err) {
      // Loading the session must not crash the request — a DB blip
      // should be loggable but not 500 the entire stack. Treat as
      // "unauthenticated" and let the route decide.
      next(err);
    }
  };
}

/**
 * Refuse the request unless `req.user` is set. Mount on routes that
 * require authentication. Returns 401 with a stable JSON shape so the
 * client can distinguish auth failure from other 4xxs.
 */
export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.user) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  next();
};

/**
 * Parse a `Cookie:` header into a name → value map. Handles whitespace
 * and quoted values. Does not validate cookie names; junk entries get
 * stored as-is rather than throwing — a malformed cookie should not
 * crash the request handler.
 */
function parseCookieHeader(header: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const name = trimmed.slice(0, eq);
    const rawValue = trimmed.slice(eq + 1);
    const stripped =
      rawValue.startsWith('"') && rawValue.endsWith('"')
        ? rawValue.slice(1, -1)
        : rawValue;
    try {
      map.set(name, decodeURIComponent(stripped));
    } catch {
      map.set(name, stripped);
    }
  }
  return map;
}
