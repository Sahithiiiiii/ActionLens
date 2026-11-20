import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { parseId } from "../../lib/http.js";
import { getUserId } from "../auth/auth.middleware.js";
import {
  cancelReminders,
  scheduleDeadlineReminder,
} from "../reminders/reminder.scheduler.js";
import { serializeDeadline } from "./deadline.serializer.js";

const listQuery = z.object({
  status: z.enum(["PENDING", "COMPLETED", "EXPIRED"]).optional(),
  documentId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

const updateBody = z
  .object({
    // 1 minute .. 7 days before the deadline
    reminderLeadMinutes: z.number().int().min(1).max(7 * 24 * 60).optional(),
    // 5 minutes .. 1 day between repeated reminders
    repeatIntervalMinutes: z.number().int().min(5).max(24 * 60).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

const withDocument = { document: { select: { id: true, fileName: true } } } as const;

async function findOwned(req: Request, res: Response) {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ message: "Invalid deadline id" });
    return null;
  }
  const deadline = await prisma.deadline.findFirst({
    where: { id, document: { userId: getUserId(req) } },
    include: withDocument,
  });
  if (!deadline) {
    res.status(404).json({ message: "Deadline not found" });
    return null;
  }
  return deadline;
}

/** GET /api/deadlines?status=PENDING&documentId=... */
export const listDeadlines = async (req: Request, res: Response) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid query", issues: parsed.error.issues });
  }
  const { status, documentId, limit } = parsed.data;

  const deadlines = await prisma.deadline.findMany({
    where: {
      document: { userId: getUserId(req) },
      ...(status ? { status } : {}),
      ...(documentId ? { documentId } : {}),
    },
    include: withDocument,
    orderBy: [{ date: "asc" }, { time: "asc" }],
    take: limit,
  });

  return res.json({ deadlines: deadlines.map(serializeDeadline) });
};

/** GET /api/deadlines/:id */
export const getDeadline = async (req: Request, res: Response) => {
  const deadline = await findOwned(req, res);
  if (!deadline) return;
  return res.json({ deadline: serializeDeadline(deadline) });
};

/** PATCH /api/deadlines/:id  — change reminder lead time / repeat interval */
export const updateDeadline = async (req: Request, res: Response) => {
  const parsed = updateBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid input", issues: parsed.error.issues });
  }

  const existing = await findOwned(req, res);
  if (!existing) return;

  if (existing.status !== "PENDING") {
    return res.status(409).json({ message: `Deadline is ${existing.status}; it can't be changed` });
  }

  const updated = await prisma.deadline.update({
    where: { id: existing.id },
    data: parsed.data,
    include: withDocument,
  });

  // Replace the queued reminder so the new settings take effect immediately.
  const outcome = await scheduleDeadlineReminder(updated);

  const fresh = await prisma.deadline.findUniqueOrThrow({
    where: { id: existing.id },
    include: withDocument,
  });

  return res.json({ deadline: serializeDeadline(fresh), reminder: outcome.status });
};

/** POST /api/deadlines/:id/complete  — stop all further reminders */
export const completeDeadline = async (req: Request, res: Response) => {
  const existing = await findOwned(req, res);
  if (!existing) return;

  if (existing.status !== "PENDING") {
    return res.status(409).json({ message: `Deadline is already ${existing.status}` });
  }

  const deadline = await prisma.deadline.update({
    where: { id: existing.id },
    data: { status: "COMPLETED", completedAt: new Date(), nextReminderAt: null },
    include: withDocument,
  });
  await cancelReminders(existing.id);

  return res.json({ deadline: serializeDeadline(deadline) });
};

/** POST /api/deadlines/:id/reopen  — undo "complete" */
export const reopenDeadline = async (req: Request, res: Response) => {
  const existing = await findOwned(req, res);
  if (!existing) return;

  if (existing.status !== "COMPLETED") {
    return res.status(409).json({ message: "Only completed deadlines can be reopened" });
  }

  const reopened = await prisma.deadline.update({
    where: { id: existing.id },
    data: { status: "PENDING", completedAt: null },
    include: withDocument,
  });
  const outcome = await scheduleDeadlineReminder(reopened);

  const fresh = await prisma.deadline.findUniqueOrThrow({
    where: { id: existing.id },
    include: withDocument,
  });

  return res.json({ deadline: serializeDeadline(fresh), reminder: outcome.status });
};

/** DELETE /api/deadlines/:id */
export const deleteDeadline = async (req: Request, res: Response) => {
  const existing = await findOwned(req, res);
  if (!existing) return;

  await prisma.deadline.delete({ where: { id: existing.id } });
  await cancelReminders(existing.id);

  return res.status(204).send();
};
