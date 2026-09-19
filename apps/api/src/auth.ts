import { randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcrypt";
import session from "express-session";
import { Router, type Request, type RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { loginSchema, userSchema, type User } from "@ims/contracts";
import type { Database } from "./database.js";
import { HttpError, parseInput } from "./errors.js";

declare module "express-session" {
  interface SessionData { userId?: number; csrfToken?: string }
}
declare module "express-serve-static-core" { interface Request { user?: User } }

const dummyHash = bcrypt.hash(randomBytes(32).toString("hex"), 12);

export type AuthOptions = { store: session.Store; secret: string; secureCookies: boolean; loginLimit?: number };
export function sessionMiddleware(options: AuthOptions) {
  if (options.secret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters.");
  return session({
    name: "ims.sid", secret: options.secret, store: options.store,
    resave: false, saveUninitialized: false, rolling: true,
    cookie: { httpOnly: true, secure: options.secureCookies, sameSite: "lax", maxAge: 8 * 60 * 60 * 1000, path: "/" }
  });
}

function csrfToken(request: Request) {
  request.session.csrfToken ??= randomBytes(32).toString("hex");
  return request.session.csrfToken;
}

export const requireCsrf: RequestHandler = (request, _response, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) { next(); return; }
  const supplied = request.get("x-csrf-token");
  const expected = request.session.csrfToken;
  if (!supplied || !expected || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    throw new HttpError(403, "CSRF_INVALID", "Your session changed. Reload the page and try again.");
  }
  next();
};

const userColumns = `u.id, u.email, u.name, u.role, u.store_id AS "storeId", s.name AS "storeName"`;
async function getCurrentUser(db: Database, id: number) {
  const result = await db.query(`SELECT ${userColumns} FROM users u LEFT JOIN stores s ON s.id = u.store_id WHERE u.id = $1 AND u.is_active`, [id]);
  return result.rows[0] ? userSchema.parse(result.rows[0]) : undefined;
}

export function requireUser(db: Database): RequestHandler {
  return async (request, _response, next) => {
    if (request.session.userId) request.user = await getCurrentUser(db, request.session.userId);
    if (!request.user) throw new HttpError(401, "UNAUTHENTICATED", "Sign in to continue.");
    next();
  };
}
export const requireAdmin: RequestHandler = (request, _response, next) => {
  if (request.user?.role !== "ADMIN") throw new HttpError(403, "FORBIDDEN", "Only administrators can change the shared catalog.");
  next();
};

export function canReadStore(user: User, storeId: number) {
  return user.role === "ADMIN" || user.role === "VIEWER" || user.storeId === storeId;
}

export function authRoutes(db: Database, options: AuthOptions) {
  const router = Router();
  // Same-cost comparison for unknown accounts avoids a cheap username timing probe.
  router.get("/session", async (request, response) => {
    const user = request.session.userId ? await getCurrentUser(db, request.session.userId) : undefined;
    if (!user) delete request.session.userId;
    response.json({ user: user ?? null, csrfToken: csrfToken(request) });
  });
  router.post("/login", rateLimit({
    windowMs: 15 * 60 * 1000, limit: options.loginLimit ?? 10, skipSuccessfulRequests: true,
    standardHeaders: "draft-8", legacyHeaders: false,
    message: { error: { code: "RATE_LIMITED", message: "Too many sign-in attempts. Try again in 15 minutes." } }
  }), requireCsrf, async (request, response) => {
    const input = parseInput(loginSchema, request.body);
    const result = await db.query<{ id: number; password_hash: string; is_active: boolean }>("SELECT id, password_hash, is_active FROM users WHERE email = $1", [input.email]);
    const row = result.rows[0];
    const valid = await bcrypt.compare(input.password, row?.password_hash ?? await dummyHash);
    if (!row?.is_active || !valid) throw new HttpError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    const user = await getCurrentUser(db, row.id);
    if (!user) throw new HttpError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    await new Promise<void>((resolve, reject) => request.session.regenerate((error) => error ? reject(error) : resolve()));
    request.session.userId = row.id;
    const token = csrfToken(request);
    await new Promise<void>((resolve, reject) => request.session.save((error) => error ? reject(error) : resolve()));
    response.json({ user, csrfToken: token });
  });
  router.post("/logout", requireCsrf, async (request, response) => {
    await new Promise<void>((resolve, reject) => request.session.destroy((error) => error ? reject(error) : resolve()));
    response.clearCookie("ims.sid", { path: "/", httpOnly: true, sameSite: "lax", secure: options.secureCookies }).json({ ok: true });
  });
  return router;
}
