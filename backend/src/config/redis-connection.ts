import type { RedisOptions } from "bullmq";

export function getRedisConnectionOptions(): RedisOptions {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    return {
      host: process.env.REDIS_HOST || "localhost",
      port: Number(process.env.REDIS_PORT) || 6379,
    };
  }

  const url = new URL(redisUrl);
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new Error("REDIS_URL must use the redis:// or rediss:// protocol");
  }

  const options: RedisOptions = {
    host: url.hostname,
    port: Number(url.port) || 6379,
  };
  if (url.username) options.username = decodeURIComponent(url.username);
  if (url.password) options.password = decodeURIComponent(url.password);

  const database = url.pathname.slice(1);
  if (database) {
    const db = Number(database);
    if (!Number.isInteger(db) || db < 0) {
      throw new Error("REDIS_URL must contain a non-negative integer database path");
    }
    options.db = db;
  }

  if (url.protocol === "rediss:") options.tls = {};
  return options;
}
