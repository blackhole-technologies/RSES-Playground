/**
 * First-boot admin setup — GET /setup (HTML form) + POST /setup (consume).
 *
 * SPEC §5.1's anti-enumeration rule is the load-bearing invariant
 * here: any miss (no token, wrong token, already-consumed token, or
 * system_settings unreachable) returns 404. Distinguishing these
 * states would let an attacker probe for "/setup exists" — which
 * leaks whether the admin has been created yet, and whether the
 * deployment is still in its first-boot window.
 *
 * The HTML form is read once at module load via readFileSync; the
 * `{{TOKEN}}` placeholder is replaced per-request with the URL's
 * `?token=` value (HTML-escaped). Templating is deliberately minimal
 * — no engine, no layout system. This page exists for ~30 seconds in
 * a deployment's lifetime.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import { z } from "zod";
import {
  verifyBootstrapToken,
  consumeBootstrapToken,
  createSession,
} from "./service";
import { setSessionCookie } from "./routes";
import type { DbHandle } from "../../core/db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETUP_HTML = readFileSync(
  path.join(__dirname, "pages", "setup.html"),
  "utf8",
);

/**
 * Setup form payload. Token is required; everything else mirrors
 * `BootstrapUserInput` so consumeBootstrapToken's Zod schema does the
 * real validation. We Zod-pre-validate here to fail fast with a 400
 * before opening any DB transaction — but the same rules also apply
 * inside consume.
 *
 * Empty-string email/displayName arrives from un-filled HTML inputs;
 * we coerce those to undefined so the optional-email partial unique
 * index isn't pestered with "" values that would all collide.
 */
const SetupBodySchema = z.object({
  token: z.string().min(1),
  username: z.string().regex(/^[a-zA-Z0-9_-]{3,32}$/),
  password: z.string().min(8),
  email: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.string().email().optional(),
  ),
  displayName: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.string().min(1).max(64).optional(),
  ),
});

export interface SetupRoutesConfig {
  cookieName?: string;
  cookieSecure?: boolean;
  /** Where to redirect after successful setup. SPEC §5.1 says `/app`. */
  postSetupRedirect?: string;
}

export function createSetupRouter(
  handle: DbHandle,
  config: SetupRoutesConfig = {},
): Router {
  const cookieName = config.cookieName ?? "session";
  const cookieSecure =
    config.cookieSecure ?? process.env.NODE_ENV === "production";
  const postSetupRedirect = config.postSetupRedirect ?? "/app";

  const router = Router();

  router.get("/", async (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    if (!token) {
      res.status(404).end();
      return;
    }
    const valid = await verifyBootstrapToken(handle, token);
    if (!valid) {
      res.status(404).end();
      return;
    }
    const html = SETUP_HTML.replace(/{{TOKEN}}/g, escapeHtml(token));
    res.set("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
  });

  router.post("/", async (req, res) => {
    const parsed = SetupBodySchema.safeParse(req.body);
    if (!parsed.success) {
      // Body shape failure: respond 400 (developer error) rather than
      // 404. SPEC's anti-enumeration is about whether the route
      // exists, not about whether the request is well-formed; a
      // malformed body discloses nothing.
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    const { token, ...userInput } = parsed.data;

    const user = await consumeBootstrapToken(handle, token, userInput);
    if (!user) {
      // Wrong token, already consumed, or no token set — all the same
      // 404 to the caller. consumeBootstrapToken's FOR UPDATE
      // serializes any concurrent consumer, so a race between two
      // valid POSTs gives one a User and the other a clean null here.
      res.status(404).end();
      return;
    }

    const userAgent = req.headers["user-agent"];
    const session = await createSession(handle, user.id, {
      ip: req.ip,
      userAgent: Array.isArray(userAgent)
        ? userAgent.join(", ")
        : userAgent,
    });
    setSessionCookie(res, cookieName, session.cookie, cookieSecure);
    res.redirect(302, postSetupRedirect);
  });

  return router;
}

/**
 * Minimal HTML escaping — only the chars that matter for attribute
 * context (we interpolate into a `value="..."` attribute). The token
 * itself is base64url so it is structurally safe; this is defense in
 * depth.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
