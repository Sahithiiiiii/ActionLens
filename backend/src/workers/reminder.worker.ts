
import "dotenv/config";
import { Worker } from "bullmq";
import { getRedisConnectionOptions } from "../config/redis-connection.js";
import type { Job } from "bullmq";
import { prisma } from "../lib/prisma.js";
import reminderQueue from "../queues/reminder.queue.js";
import emailQueue from "../queues/email.queue.js";
import maintenanceQueue from "../queues/maintenance.queue.js";
import { getNextReminderInstant } from "../lib/timezone.js";
import { reminderEmail } from "../lib/emailTemplate.js";
import { env } from "../config/env.js";
import { publishToUser } from "../lib/realtime.js";
import { getSchedule, sweepDeadlines } from "../modules/reminders/reminder.scheduler.js";

interface ReminderJobData {
  deadlineId: string;
}

const worker = new Worker<ReminderJobData>(
  "deadline-reminders",
  async (job: Job<ReminderJobData>) => {
    const { deadlineId } = job.data;

    const deadline = await prisma.deadline.findUnique({
      where: { id: deadlineId },
      include: {
        document: {
          include: { user: true },
        },
      },
    });

    if (!deadline) {
      console.log(`Deadline ${deadlineId} no longer exists.`);
      return;
    }

    if (deadline.status !== "PENDING") {
      console.log(`Deadline ${deadlineId} is ${deadline.status}; skipping.`);
      return;
    }

    const schedule = getSchedule(deadline);
    if (!schedule || !deadline.timezone) {
      console.warn(`Deadline ${deadlineId} has an invalid time or timezone; skipping reminder.`);
      return;
    }

    const datePart = deadline.date.toISOString().slice(0, 10);
    const dueAt = schedule.dueAt;
    const dueLabel = deadline.time
      ? `at ${deadline.time} (${deadline.timezone})`
      : `by the end of the day (${deadline.timezone})`;
    const now = new Date();

    if (now >= dueAt) {
      await prisma.deadline.updateMany({
        where: { id: deadlineId, status: "PENDING" },
        data: { status: "EXPIRED", nextReminderAt: null },
      });

      console.log(`Deadline ${deadlineId} expired.`);
      return;
    }

    const title = "Upcoming deadline";
    const message = `"${deadline.event}" is due ${dueLabel} on ${datePart}.`;
    const existingNotification = await prisma.notification.findFirst({
      where: {
        userId: deadline.document.userId,
        deadlineId,
        title,
        message,
        createdAt: { gte: new Date(job.timestamp) },
      },
      orderBy: { createdAt: "asc" },
    });
    const notification =
      existingNotification ??
      (await prisma.notification.create({
        data: {
          userId: deadline.document.userId,
          deadlineId,
          title,
          message,
        },
      }));

    console.log(
      `${existingNotification ? "Reusing" : "Created"} in-app notification ${notification.id}`,
    );

    // Push to the browser in real time (API server forwards it over SSE).
    if (!existingNotification) {
      await publishToUser(deadline.document.userId, {
        type: "notification",
        data: notification,
      });
    }
    const emailJob = await emailQueue.add(
      "send-reminder-email",
      {
        notificationId: notification.id,
        to: deadline.document.user.email,
        subject: `ActionLens Reminder: ${deadline.event}`,
        ...reminderEmail({
          name: deadline.document.user.name,
          event: deadline.event,
          date: datePart,
          time: deadline.time,
          timezone: deadline.timezone,
          appUrl: env.appUrl,
        }),
      },
      {
        jobId: `deadline-reminder-email-${deadlineId}-${job.timestamp}`,
      },
    );
    console.log(`Email job ${emailJob.id} queued for deadline ${deadlineId}`);

    const nextReminderAt = getNextReminderInstant(
      now,
      deadline.repeatIntervalMinutes,
      dueAt,
    );

    if (nextReminderAt) {
      const update = await prisma.deadline.updateMany({
        where: { id: deadlineId, status: "PENDING" },
        data: { nextReminderAt },
      });

      if (update.count === 1) {
        await reminderQueue.add(
          "send-deadline-reminder",
          { deadlineId },
          {
            delay: Math.max(0, nextReminderAt.getTime() - Date.now()),
            jobId: `deadline-reminder-${deadlineId}-${nextReminderAt.getTime()}`,
            removeOnComplete: true,
          },
        );

        console.log(`Next reminder scheduled for ${nextReminderAt.toISOString()}`);
      } else {
        console.log(`Deadline ${deadlineId} is no longer pending; not rescheduling.`);
      }
    } else {
      await prisma.deadline.updateMany({
        where: { id: deadlineId, status: "PENDING" },
        data: { nextReminderAt: null },
      });

      console.log(`No more reminders before deadline ${deadlineId}.`);
    }
  },
  {
    connection: getRedisConnectionOptions(),
  },
);

worker.on("completed", (job) => {
  console.log(`Reminder job ${job.id} completed.`);
});

worker.on("failed", (job, error) => {
  console.error(`Reminder job ${job?.id} failed:`, error.message);
});

worker.on("error", (error) => {
  console.error("Reminder worker error:", error);
});

// ---------------------------------------------------------------------------
// Maintenance: expire past-due deadlines and recover reminders lost from Redis.
// Runs in the same process as the reminder worker, on its own queue.
// ---------------------------------------------------------------------------
const maintenanceWorker = new Worker(
  "deadline-maintenance",
  async () => {
    const result = await sweepDeadlines();
    console.log(
      `🧹 Sweep: checked ${result.checked}, expired ${result.expired}, re-queued ${result.requeued}`,
    );
    return result;
  },
  {
    connection: getRedisConnectionOptions(),
  },
);

maintenanceWorker.on("failed", (job, error) => {
  console.error(`Maintenance job ${job?.id} failed:`, error.message);
});
maintenanceWorker.on("error", (error) => {
  console.error("Maintenance worker error:", error);
});

maintenanceQueue
  .upsertJobScheduler(
    "sweep-deadlines",
    { every: 5 * 60_000 },
    { name: "sweep-deadlines" },
  )
  .catch((error) => console.error("Failed to register sweep scheduler:", error));

console.log("🔔 Deadline reminder worker is running...");
