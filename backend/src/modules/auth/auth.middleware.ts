import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";

export function verifyToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    if (typeof payload === "object" && typeof payload.sub === "string") {
      return payload.sub;
    }
  } catch {
    // fall through
  }
  return null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  let token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  // EventSource (SSE) can't set headers, so the stream endpoint also accepts ?token=.
  if (!token && req.path === "/stream" && typeof req.query.token === "string") {
    token = req.query.token;
  }

  const userId = token ? verifyToken(token) : null;
  if (!userId) {
    return res.status(401).json({ message: "Authentication required" });
  }

  req.userId = userId;
  next();
}

/** For routes behind requireAuth. */
export function getUserId(req: Request): string {
  if (!req.userId) throw new Error("requireAuth middleware is missing");
  return req.userId;
}
