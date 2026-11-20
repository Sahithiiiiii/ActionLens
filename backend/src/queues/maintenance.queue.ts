import "dotenv/config";
import { Queue } from "bullmq";

const maintenanceQueue = new Queue("deadline-maintenance", {
  connection: {
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT) || 6379,
  },
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: 20,
  },
});

export default maintenanceQueue;
