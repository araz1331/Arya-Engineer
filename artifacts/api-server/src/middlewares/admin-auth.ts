import type { NextFunction, Request, Response } from "express";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Stateless admin auth. Replit Autoscale runs several instances, so tokens are
// self-contained: base64url(JSON payload) + "." + base64url(HMAC-SHA256).
// The signing key is derived from ADMIN_TOKEN_SECRET *and* ADMIN_PASSWORD, so
// rotating either one invalidates every issued token.

export const ADMIN_TOKEN_TTL_SECONDS = 12 * 60 * 60;
const MIN_TOKEN_SECRET_LENGTH = 32;
const TOKEN_VERSION = 1;

function sha256(value: string | Buffer): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Constant-time string comparison (hashing first removes the length leak). */
export function secretsMatch(candidate: string, expected: string): boolean {
  return timingSafeEqual(sha256(candidate), sha256(expected));
}

function signingKey(): Buffer | null {
  const secret = process.env.ADMIN_TOKEN_SECRET;
  const password = process.env.ADMIN_PASSWORD;
  if (!secret || secret.length < MIN_TOKEN_SECRET_LENGTH || !password) return null;
  return createHmac("sha256", secret)
    .update("arya-admin-token-v1:")
    .update(sha256(password))
    .digest();
}

export function isAdminAuthConfigured(): boolean {
  return signingKey() !== null;
}

function sign(key: Buffer, payload: string): Buffer {
  return createHmac("sha256", key).update(payload).digest();
}

export function issueAdminToken(): { token: string; expiresAt: number } | null {
  const key = signingKey();
  if (!key) return null;
  const exp = Math.floor(Date.now() / 1000) + ADMIN_TOKEN_TTL_SECONDS;
  const payload = Buffer.from(JSON.stringify({ v: TOKEN_VERSION, sub: "admin", exp })).toString("base64url");
  const signature = sign(key, payload).toString("base64url");
  return { token: `${payload}.${signature}`, expiresAt: exp * 1000 };
}

export function verifyAdminToken(token: string): boolean {
  const key = signingKey();
  if (!key || !token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, signature] = parts;
  // Compare the canonical encoded signature so non-canonical base64 variants are rejected.
  const expected = Buffer.from(sign(key, payload).toString("base64url"));
  const received = Buffer.from(signature);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return false;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { v?: unknown; sub?: unknown; exp?: unknown };
    return claims.v === TOKEN_VERSION
      && claims.sub === "admin"
      && typeof claims.exp === "number"
      && claims.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function getBearerToken(req: Request): string {
  const authorization = req.get("authorization") ?? "";
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!isAdminAuthConfigured()) {
    res.status(503).json({ error: "Admin access is not configured." });
    return;
  }
  if (!verifyAdminToken(getBearerToken(req))) {
    res.status(401).json({ error: "Admin authentication required." });
    return;
  }
  next();
}

// Simple per-client failed-login throttle. In-memory and per instance, so it is
// a slowdown rather than a hard guarantee; the fixed failure delay applies everywhere.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 20;
export const LOGIN_FAILURE_DELAY_MS = 750;
const failedLogins = new Map<string, { count: number; resetAt: number }>();

export function loginClientKey(req: Request): string {
  // The platform proxy appends the real client address as the last hop.
  const forwarded = req.get("x-forwarded-for")?.split(",").map((part) => part.trim()).filter(Boolean);
  return forwarded?.at(-1) ?? req.socket.remoteAddress ?? "unknown";
}

export function isLoginThrottled(key: string): boolean {
  const entry = failedLogins.get(key);
  if (!entry) return false;
  if (entry.resetAt <= Date.now()) {
    failedLogins.delete(key);
    return false;
  }
  return entry.count >= LOGIN_MAX_FAILURES;
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  if (failedLogins.size > 10_000) {
    for (const [storedKey, entry] of failedLogins) {
      if (entry.resetAt <= now) failedLogins.delete(storedKey);
    }
  }
  const entry = failedLogins.get(key);
  if (!entry || entry.resetAt <= now) {
    failedLogins.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

export function clearLoginFailures(key: string): void {
  failedLogins.delete(key);
}
