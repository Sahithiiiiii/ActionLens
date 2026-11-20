import "dotenv/config";
import app from "./app.js";
import { env } from "./config/env.js";
import redis from "./config/redis.js";
import { prisma } from "./lib/prisma.js";
import { startRealtimeBridge } from "./modules/notifications/notification.stream.js";

async function startServer() {
  try {
    await redis.ping();
    const subscriber = await startRealtimeBridge();

    const server = app.listen(env.port, () => {
      console.log(`ActionLens API running on port ${env.port}`);
    });

    const shutdown = async (signal: string) => {
      console.log(`${signal} received, shutting down...`);
      server.close();
      subscriber.disconnect();
      redis.disconnect();
      await prisma.$disconnect();
      process.exit(0);
    };
    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
