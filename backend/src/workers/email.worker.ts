
import "dotenv/config";
import { Worker } from "bullmq";
import { assertEmailConfig, sendEmail, verifyEmailTransport } from "../lib/mailer.js";
import { prisma } from "../lib/prisma.js";

interface EmailJobData {
  notificationId?: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
}

const provider = assertEmailConfig();
void verifyEmailTransport();

const worker = new Worker<EmailJobData>(
  "email-delivery",
  async (job) => {
    const { notificationId, to, subject, text, html } = job.data;

    if (notificationId) {
      const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
        select: { emailSentAt: true },
      });

      if (!notification) {
        throw new Error(`Notification ${notificationId} no longer exists`);
      }

      if (notification.emailSentAt) {
        console.log(
          `Email already sent for notification ${notificationId}; skipping.`,
        );
        return { skipped: true };
      }
    }

    console.log(`Sending email for job ${job.id}`);

    const providerId = await sendEmail({ to, subject, text, html });

    if (notificationId) {
      await prisma.notification.update({
        where: { id: notificationId },
        data: { emailSentAt: new Date() },
      });
    }

    console.log(`Email sent via ${provider}. Message ID: ${providerId}`);
    return { providerId };
  },
  {
    connection: {
      host: process.env.REDIS_HOST || "localhost",
      port: Number(process.env.REDIS_PORT) || 6379,
    },
    concurrency: 5,
  },
);

worker.on("completed", (job) => {
  console.log(`Email job ${job.id} completed`);
});

worker.on("failed", (job, error) => {
  console.error(`Email job ${job?.id} failed:`, error.message);
});

worker.on("error", (error) => {
  console.error("Email worker error:", error);
});

console.log("📧 Email worker is running...");
