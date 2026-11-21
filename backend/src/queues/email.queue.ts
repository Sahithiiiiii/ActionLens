
import "dotenv/config";
import { Queue } from "bullmq";
import { getRedisConnectionOptions } from "../config/redis-connection.js";

const emailQueue = new Queue("email-delivery", {
  connection: getRedisConnectionOptions(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

export default emailQueue;
