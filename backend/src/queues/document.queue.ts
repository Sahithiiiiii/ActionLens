import { Queue } from "bullmq";
import type { DocumentJobData } from "./queue.types.js";
import { getRedisConnectionOptions } from "../config/redis-connection.js";


const documentQueue = new Queue<DocumentJobData>(
  "document-processing",
  {
    connection: getRedisConnectionOptions(),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: false,
      removeOnFail: false,
    },
  }
);
export default documentQueue;