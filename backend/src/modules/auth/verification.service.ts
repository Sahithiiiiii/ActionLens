import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import emailQueue from "../../queues/email.queue.js";
import { verificationEmail } from "../../lib/emailTemplate.js";

export const CODE_TTL_MS = 10 * 60_000;
export const RESEND_COOLDOWN_MS = 60_000;
export const MAX_ATTEMPTS = 5;

// Only a keyed hash of the code is stored, never the code itself.
export const hashCode = (code: string) =>
  createHmac("sha256", env.jwtSecret).update(code).digest("hex");

/** Creates a fresh 6-digit code and queues the email. Skips if one was sent under a minute ago. */
export async function sendVerificationCode(user: { id: string; name: string; email: string }) {
  const existing = await prisma.emailVerification.findUnique({ where: { userId: user.id } });
  if (existing && Date.now() - existing.lastSentAt.getTime() < RESEND_COOLDOWN_MS) {
    return { sent: false };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const data = {
    codeHash: hashCode(code),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
    attempts: 0,
    lastSentAt: new Date(),
  };
  await prisma.emailVerification.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });

  await emailQueue.add("send-verification-email", {
    to: user.email,
    subject: `${code} is your ActionLens verification code`,
    ...verificationEmail({ name: user.name, code }),
  });

  // Handy while Resend's test sender can only email your own address.
  if (process.env.NODE_ENV !== "production") {
    console.log(`[dev] Verification code for ${user.email}: ${code}`);
  }
  return { sent: true };
}

export type CodeResult = "ok" | "invalid" | "expired" | "locked";

export async function checkVerificationCode(userId: string, code: string): Promise<CodeResult> {
  const record = await prisma.emailVerification.findUnique({ where: { userId } });
  if (!record || record.expiresAt < new Date()) return "expired";
  if (record.attempts >= MAX_ATTEMPTS) return "locked";

  const a = Buffer.from(hashCode(code));
  const b = Buffer.from(record.codeHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await prisma.emailVerification.update({
      where: { userId },
      data: { attempts: { increment: 1 } },
    });
    return record.attempts + 1 >= MAX_ATTEMPTS ? "locked" : "invalid";
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } }),
    prisma.emailVerification.delete({ where: { userId } }),
  ]);
  return "ok";
}
