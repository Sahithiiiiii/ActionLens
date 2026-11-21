
import Redis from "ioredis";
const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error("REDIS_URL is not configured");
}

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

redis.on("connect", () => {
  console.log("Connecting to Redis...");
});

redis.on("ready", () => {
  console.log("Redis is ready to use!");
});

redis.on("error", (error) => {
  console.error("Redis connection error:", error);
});

// Pub/Sub needs its own connection: a subscribed connection can't run other commands.
export function createSubscriber() {
  return redis.duplicate();
}

export default redis;