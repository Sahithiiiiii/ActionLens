import redis from "../config/redis.js";

/**
 * Workers run in separate processes from the API server, so they can't talk to
 * browser connections directly. They publish to Redis; the API server
 * subscribes and forwards to the right user's open SSE streams.
 */
export const CHANNEL_PREFIX = "actionlens:user:";

export type RealtimeEvent =
  | { type: "notification"; data: unknown }
  | { type: "document"; data: { documentId: string; status: string } };

export async function publishToUser(userId: string, event: RealtimeEvent) {
  try {
    await redis.publish(`${CHANNEL_PREFIX}${userId}`, JSON.stringify(event));
  } catch (error) {
    // Realtime is best-effort. The notification is already saved in PostgreSQL.
    console.error("Failed to publish realtime event:", error);
  }
}
