import { rateLimit } from "express-rate-limit";
import { RedisStore, type RedisReply } from "rate-limit-redis";
import redis from "../config/redis.js";

/** Counters live in Redis, so limits hold across restarts and multiple API instances. */
function limiter(prefix: string, options: { windowMs: number; limit: number; skipSuccessfulRequests?: boolean; message: string }) {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    skipSuccessfulRequests: options.skipSuccessfulRequests ?? false,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { message: options.message },
    store: new RedisStore({
      prefix: `actionlens:rl:${prefix}:`,
      sendCommand: (command: string, ...args: string[]) =>
        redis.call(command, ...args) as Promise<RedisReply>,
    }),
  });
}

/** Only FAILED logins count: 10 wrong attempts per IP per 15 minutes. */
export const loginLimiter = limiter("login", {
  windowMs: 15 * 60_000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: "Too many failed login attempts. Try again in 15 minutes.",
});

export const registerLimiter = limiter("register", {
  windowMs: 60 * 60_000,
  limit: 5,
  message: "Too many sign-ups from this address. Try again later.",
});

/** Safety net for the whole API (the SSE stream is a single long request, so it's unaffected). */
export const apiLimiter = limiter("api", {
  windowMs: 60_000,
  limit: 300,
  message: "Too many requests. Slow down.",
});

export const verifyLimiter = limiter("verify", {
  windowMs: 15 * 60_000,
  limit: 10,
  message: "Too many verification attempts. Try again in 15 minutes.",
});

export const resendLimiter = limiter("resend", {
  windowMs: 60 * 60_000,
  limit: 5,
  message: "Too many code requests. Try again later.",
});

export const forgotLimiter = limiter("forgot", {
  windowMs: 60 * 60_000,
  limit: 5,
  message: "Too many reset requests. Try again later.",
});
