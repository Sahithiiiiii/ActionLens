import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getRedisConnectionOptions } from "./redis-connection.js";

function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const previous = new Map(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("Redis connection options", () => {
  it("uses credentials, database, and TLS from REDIS_URL", () => {
    withEnv(
      { REDIS_URL: "rediss://default:p%40ss@redis.example.com:6380/2" },
      () => {
        assert.deepEqual(getRedisConnectionOptions(), {
          host: "redis.example.com",
          port: 6380,
          username: "default",
          password: "p@ss",
          db: 2,
          tls: {},
        });
      },
    );
  });

  it("falls back to REDIS_HOST and REDIS_PORT when REDIS_URL is unset", () => {
    withEnv(
      {
        REDIS_URL: undefined,
        REDIS_HOST: "redis.local",
        REDIS_PORT: "6381",
      },
      () => {
        assert.deepEqual(getRedisConnectionOptions(), {
          host: "redis.local",
          port: 6381,
        });
      },
    );
  });

  it("rejects unsupported REDIS_URL protocols", () => {
    withEnv({ REDIS_URL: "https://redis.example.com" }, () => {
      assert.throws(
        () => getRedisConnectionOptions(),
        /REDIS_URL must use the redis:\/\/ or rediss:\/\/ protocol/,
      );
    });
  });
});
