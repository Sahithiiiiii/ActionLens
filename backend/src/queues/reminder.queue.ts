import "dotenv/config";
import { Queue } from "bullmq";
import { getRedisConnectionOptions } from "../config/redis-connection.js";

const reminderQueue = new Queue("deadline-reminders", {
  connection: getRedisConnectionOptions(),
});

export default reminderQueue;
