import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { isValidIanaTimezone } from "../../lib/timezone.js";
import { env } from "../../config/env.js";
import { getUserId } from "./auth.middleware.js";
import { consumeResetCode, sendResetCode } from "./reset.service.js";
import { checkVerificationCode, sendVerificationCode } from "./verification.service.js";

const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8).max(128),
  timezone: z
    .string()
    .refine(isValidIanaTimezone, "Invalid IANA timezone")
    .optional(),
});

const verifySchema = z.object({
  email: z.string().trim().toLowerCase(),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

const resendSchema = z.object({ email: z.string().trim().toLowerCase() });

const resetSchema = z.object({
  email: z.string().trim().toLowerCase(),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase(),
  password: z.string().min(1),
});

const updateMeSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  timezone: z.string().refine(isValidIanaTimezone, "Invalid IANA timezone").optional(),
});

const publicUser = {
  id: true,
  name: true,
  email: true,
  timezone: true,
  createdAt: true,
} as const;

function signToken(userId: string) {
  return jwt.sign({}, env.jwtSecret, {
    subject: userId,
    expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

export async function register(req: Request, res: Response) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid input", issues: parsed.error.issues });
  }
  const { name, email, password, timezone } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing?.emailVerifiedAt) {
    return res.status(409).json({ message: "Email is already registered" });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  // An unverified account never proved it owns the address, so a new sign-up
  // simply replaces it (prevents squatting on someone else's email).
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { name, passwordHash, ...(timezone ? { timezone } : {}) },
      })
    : await prisma.user.create({
        data: { name, email, passwordHash, ...(timezone ? { timezone } : {}) },
      });

  await sendVerificationCode(user);
  return res.status(201).json({ needsVerification: true, email });
}

export async function verifyEmail(req: Request, res: Response) {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Enter the 6-digit code from your email" });
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || user.emailVerifiedAt) {
    return res.status(400).json({ message: "Invalid or expired code" });
  }

  const result = await checkVerificationCode(user.id, parsed.data.code);
  const messages = {
    invalid: "Incorrect code. Please try again.",
    expired: "That code has expired. Request a new one.",
    locked: "Too many wrong attempts. Request a new code.",
  } as const;
  if (result !== "ok") return res.status(400).json({ message: messages[result] });

  const { passwordHash: _omit, ...safe } = { ...user, emailVerifiedAt: new Date() };
  return res.json({ user: safe, token: signToken(user.id) });
}

export async function resendVerification(req: Request, res: Response) {
  const parsed = resendSchema.safeParse(req.body);
  if (parsed.success) {
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (user && !user.emailVerifiedAt) await sendVerificationCode(user);
  }
  // Same answer whether or not the account exists, so emails can't be probed.
  return res.json({ message: "If that account needs verification, a new code was sent." });
}

export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  const ok = user ? await bcrypt.compare(parsed.data.password, user.passwordHash) : false;
  if (!user || !ok) {
    return res.status(401).json({ message: "Invalid email or password" });
  }

  if (!user.emailVerifiedAt) {
    await sendVerificationCode(user);
    return res.status(403).json({
      code: "EMAIL_NOT_VERIFIED",
      message: "Please verify your email. We sent you a code.",
      email: user.email,
    });
  }

  const { passwordHash: _omit, ...safe } = user;
  return res.json({ user: safe, token: signToken(user.id) });
}

export async function me(req: Request, res: Response) {
  const user = await prisma.user.findUnique({
    where: { id: getUserId(req) },
    select: publicUser,
  });
  if (!user) return res.status(404).json({ message: "User not found" });
  return res.json({ user });
}

export async function updateMe(req: Request, res: Response) {
  const parsed = updateMeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid input", issues: parsed.error.issues });
  }
  const user = await prisma.user.update({
    where: { id: getUserId(req) },
    data: parsed.data,
    select: publicUser,
  });
  return res.json({ user });
}

export async function forgotPassword(req: Request, res: Response) {
  const parsed = resendSchema.safeParse(req.body);
  if (parsed.success) {
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (user?.emailVerifiedAt) await sendResetCode(user);
  }
  // Same answer whether or not the account exists, so emails can't be probed.
  return res.json({ message: "If an account exists for that email, we sent a reset code." });
}

export async function resetPassword(req: Request, res: Response) {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Enter the 6-digit code and a password of at least 8 characters" });
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user?.emailVerifiedAt) {
    return res.status(400).json({ message: "Invalid or expired code" });
  }

  const result = await consumeResetCode(user.id, parsed.data.code, await bcrypt.hash(parsed.data.password, 12));
  const messages = {
    invalid: "Incorrect code. Please try again.",
    expired: "That code has expired. Request a new one.",
    locked: "Too many wrong attempts. Request a new code.",
  } as const;
  if (result !== "ok") return res.status(400).json({ message: messages[result] });

  const { passwordHash: _omit, ...safe } = user;
  return res.json({ user: safe, token: signToken(user.id) });
}
