import "dotenv/config";
import { Queue } from "bullmq";
import { getRedisConnectionOptions } from "../config/redis-connection.js";

const maintenanceQueue = new Queue("deadline-maintenance", {
  connection: getRedisConnectionOptions(),
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: 20,
  },
});

export default maintenanceQueue;
