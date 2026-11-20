import { DateTime } from "luxon";
import reminderQueue from "../../queues/reminder.queue.js";
import { prisma } from "../../lib/prisma.js";
import {
  getDeadlineInstant,
  getFirstReminderInstant,
  isValidIanaTimezone,
} from "../../lib/timezone.js";

interface ScheduleReminderInput {
  deadlineId: string;
  reminderAt: Date;
}

/** Minimum gap between "now" and a reminder, so BullMQ always gets a positive delay. */
const MIN_REMINDER_DELAY_MS = 5_000;

export async function scheduleReminder({
  deadlineId,
  reminderAt,
}: ScheduleReminderInput) {
  const delay = reminderAt.getTime() - Date.now();

  if (delay <= 0) {
    throw new Error("Reminder time must be in the future");
  }

  return reminderQueue.add(
    "send-deadline-reminder",
    { deadlineId },
    {
      delay,
      jobId: `deadline-reminder-${deadlineId}`,
      removeOnComplete: true,
    },
  );
}

interface DeadlineLike {
  id: string;
  date: Date;
  time: string | null;
  timezone: string | null;
  reminderLeadMinutes: number;
}

/**
 * Deadlines without a time still get reminders: the first one at 09:00 on the
 * due date, repeating until the end of that day (23:59), all in the deadline's timezone.
 */
const DEFAULT_REMINDER_TIME = "09:00";
const END_OF_DAY_TIME = "23:59";

export function getSchedule(
  d: Pick<DeadlineLike, "date" | "time" | "timezone" | "reminderLeadMinutes">,
): { dueAt: Date; firstReminderAt: Date } | null {
  if (!d.timezone || !isValidIanaTimezone(d.timezone)) return null;
  try {
    const datePart = d.date.toISOString().slice(0, 10);
    if (d.time) {
      const dueAt = getDeadlineInstant(datePart, d.time, d.timezone);
      return { dueAt, firstReminderAt: getFirstReminderInstant(dueAt, d.reminderLeadMinutes) };
    }
    return {
      dueAt: getDeadlineInstant(datePart, END_OF_DAY_TIME, d.timezone),
      firstReminderAt: getDeadlineInstant(datePart, DEFAULT_REMINDER_TIME, d.timezone),
    };
  } catch {
    return null;
  }
}

/** The exact UTC instant a deadline is due (end of day when it has no time). */
export function getDueAt(
  deadline: Pick<DeadlineLike, "date" | "time" | "timezone">,
): Date | null {
  return getSchedule({ ...deadline, reminderLeadMinutes: 0 })?.dueAt ?? null;
}

/** Remove every queued (not currently running) reminder job for a deadline. */
export async function cancelReminders(deadlineId: string) {
  const jobs = await reminderQueue.getJobs([
    "delayed",
    "waiting",
    "prioritized",
    "failed",
    "completed",
  ]);

  for (const job of jobs) {
    if (job.data?.deadlineId !== deadlineId) continue;
    try {
      await job.remove();
    } catch {
      // The job may have just become active; the worker re-checks the deadline's status anyway.
    }
  }
}

export type ScheduleOutcome =
  | { status: "scheduled"; reminderAt: Date }
  | { status: "expired" }
  | { status: "skipped"; reason: string };

/**
 * Schedules the first reminder for a pending deadline.
 * If the normal lead time has already passed but the deadline is still ahead,
 * the reminder fires almost immediately instead of being silently dropped.
 */
export async function scheduleDeadlineReminder(
  deadline: DeadlineLike,
): Promise<ScheduleOutcome> {
  const schedule = getSchedule(deadline);
  if (!schedule) {
    return { status: "skipped", reason: "deadline has an invalid time or timezone" };
  }
  const { dueAt } = schedule;

  const now = Date.now();

  if (dueAt.getTime() <= now) {
    await prisma.deadline.updateMany({
      where: { id: deadline.id, status: "PENDING" },
      data: { status: "EXPIRED", nextReminderAt: null },
    });
    return { status: "expired" };
  }

  let reminderAt = schedule.firstReminderAt;
  const earliest = now + MIN_REMINDER_DELAY_MS;

  if (reminderAt.getTime() < earliest) {
    if (dueAt.getTime() - earliest < 60_000) {
      return { status: "skipped", reason: "deadline is less than a minute away" };
    }
    reminderAt = new Date(earliest);
  }

  await cancelReminders(deadline.id);

  await prisma.deadline.update({
    where: { id: deadline.id },
    data: { nextReminderAt: reminderAt },
  });

  await scheduleReminder({ deadlineId: deadline.id, reminderAt });

  return { status: "scheduled", reminderAt };
}

/**
 * Periodic housekeeping (see maintenance worker):
 *  1. Mark deadlines EXPIRED once their due moment has passed. The reminder
 *     worker never does this for deadlines whose last reminder already fired.
 *  2. Re-queue reminders that exist in PostgreSQL but vanished from Redis
 *     (Redis flush/restart without persistence, manual job removal, ...).
 */
export async function sweepDeadlines() {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 60_000);
  const horizon = new Date(now.getTime() + 2 * 24 * 60 * 60_000);

  const candidates = await prisma.deadline.findMany({
    where: {
      status: "PENDING",
      OR: [{ date: { lte: horizon } }, { nextReminderAt: { lt: staleBefore } }],
    },
  });

  const queuedJobs = await reminderQueue.getJobs([
    "delayed",
    "waiting",
    "prioritized",
    "active",
  ]);
  const queued = new Set<string>(
    queuedJobs.map((job) => job.data?.deadlineId).filter(Boolean),
  );

  let expired = 0;
  let requeued = 0;

  for (const deadline of candidates) {
    if (!deadline.timezone || !isValidIanaTimezone(deadline.timezone)) continue;

    // Deadlines without a time expire at the end of their calendar day.
    const expiresAt = deadline.time
      ? getDueAt(deadline)
      : DateTime.fromISO(deadline.date.toISOString().slice(0, 10), {
          zone: deadline.timezone,
        })
          .endOf("day")
          .toJSDate();

    if (expiresAt && now >= expiresAt) {
      await prisma.deadline.updateMany({
        where: { id: deadline.id, status: "PENDING" },
        data: { status: "EXPIRED", nextReminderAt: null },
      });
      await cancelReminders(deadline.id);
      expired++;
      continue;
    }

    const lost =
      deadline.nextReminderAt &&
      deadline.nextReminderAt < staleBefore &&
      !queued.has(deadline.id);

    if (lost) {
      const outcome = await scheduleDeadlineReminder(deadline);
      if (outcome.status === "scheduled") requeued++;
    }
  }

  return { checked: candidates.length, expired, requeued };
}
