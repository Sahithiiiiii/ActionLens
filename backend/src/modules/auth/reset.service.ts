import { randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import emailQueue from "../../queues/email.queue.js";
import { passwordResetEmail } from "../../lib/emailTemplate.js";
import {
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_MS,
  hashCode,
  type CodeResult,
} from "./verification.service.js";

/** Creates a fresh 6-digit reset code and queues the email (max one per minute). */
export async function sendResetCode(user: { id: string; name: string; email: string }) {
  const existing = await prisma.passwordReset.findUnique({ where: { userId: user.id } });
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
  await prisma.passwordReset.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });

  await emailQueue.add("send-password-reset-email", {
    to: user.email,
    subject: `${code} is your ActionLens password reset code`,
    ...passwordResetEmail({ name: user.name, code }),
  });

  if (process.env.NODE_ENV !== "production") {
    console.log(`[dev] Password reset code for ${user.email}: ${code}`);
  }
  return { sent: true };
}

/** Checks the code and, if correct, sets the new password hash in the same transaction. */
export async function consumeResetCode(
  userId: string,
  code: string,
  newPasswordHash: string,
): Promise<CodeResult> {
  const record = await prisma.passwordReset.findUnique({ where: { userId } });
  if (!record || record.expiresAt < new Date()) return "expired";
  if (record.attempts >= MAX_ATTEMPTS) return "locked";

  const a = Buffer.from(hashCode(code));
  const b = Buffer.from(record.codeHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await prisma.passwordReset.update({ where: { userId }, data: { attempts: { increment: 1 } } });
    return record.attempts + 1 >= MAX_ATTEMPTS ? "locked" : "invalid";
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash: newPasswordHash } }),
    prisma.passwordReset.delete({ where: { userId } }),
  ]);
  return "ok";
}
