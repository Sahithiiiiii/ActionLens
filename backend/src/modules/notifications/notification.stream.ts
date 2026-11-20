import type { Response } from "express";
import { createSubscriber } from "../../config/redis.js";
import { CHANNEL_PREFIX, type RealtimeEvent } from "../../lib/realtime.js";

/** userId -> that user's open browser streams (one per tab/device). */
const clients = new Map<string, Set<Response>>();

export function addClient(userId: string, res: Response) {
  let set = clients.get(userId);
  if (!set) {
    set = new Set();
    clients.set(userId, set);
  }
  set.add(res);
}

export function removeClient(userId: string, res: Response) {
  const set = clients.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clients.delete(userId);
}

export function sendEvent(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * Listens to Redis for events published by the workers and forwards them to
 * the matching user's open SSE connections. Call once at API startup.
 */
export async function startRealtimeBridge() {
  const subscriber = createSubscriber();

  subscriber.on("error", (error) => {
    console.error("Realtime subscriber error:", error);
  });

  subscriber.on("pmessage", (_pattern, channel, message) => {
    const userId = channel.slice(CHANNEL_PREFIX.length);
    const connections = clients.get(userId);
    if (!connections?.size) return;

    try {
      const event = JSON.parse(message) as RealtimeEvent;
      for (const res of connections) sendEvent(res, event.type, event.data);
    } catch (error) {
      console.error("Bad realtime message:", error);
    }
  });

  await subscriber.psubscribe(`${CHANNEL_PREFIX}*`);
  console.log("Realtime bridge is listening for worker events");
  return subscriber;
}
