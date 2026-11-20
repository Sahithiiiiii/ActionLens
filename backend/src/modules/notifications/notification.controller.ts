import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { parseId } from "../../lib/http.js";
import { getUserId } from "../auth/auth.middleware.js";
import { addClient, removeClient, sendEvent } from "./notification.stream.js";

const listQuery = z.object({
  unread: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.uuid().optional(),
});

/** GET /api/notifications?unread=true&limit=20&cursor=<lastId> */
export const listNotifications = async (req: Request, res: Response) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid query", issues: parsed.error.issues });
  }
  const { unread, limit, cursor } = parsed.data;
  const userId = getUserId(req);

  const rows = await prisma.notification.findMany({
    where: { userId, ...(unread === "true" ? { readAt: null } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const notifications = hasMore ? rows.slice(0, limit) : rows;
  const unreadCount = await prisma.notification.count({ where: { userId, readAt: null } });

  return res.json({
    notifications,
    nextCursor: hasMore ? notifications[notifications.length - 1]?.id ?? null : null,
    unreadCount,
  });
};

/** GET /api/notifications/unread-count */
export const unreadCount = async (req: Request, res: Response) => {
  const count = await prisma.notification.count({
    where: { userId: getUserId(req), readAt: null },
  });
  return res.json({ unreadCount: count });
};

/** PATCH /api/notifications/:id/read */
export const markRead = async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid notification id" });

  const userId = getUserId(req);
  const result = await prisma.notification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  });

  if (result.count === 0) {
    // Either it doesn't exist / isn't theirs, or it was already read.
    const exists = await prisma.notification.findFirst({ where: { id, userId } });
    if (!exists) return res.status(404).json({ message: "Notification not found" });
  }

  const notification = await prisma.notification.findFirstOrThrow({ where: { id, userId } });
  return res.json({ notification });
};

/** POST /api/notifications/read-all */
export const markAllRead = async (req: Request, res: Response) => {
  const result = await prisma.notification.updateMany({
    where: { userId: getUserId(req), readAt: null },
    data: { readAt: new Date() },
  });
  return res.json({ updated: result.count });
};

/** DELETE /api/notifications/:id */
export const deleteNotification = async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid notification id" });

  const result = await prisma.notification.deleteMany({
    where: { id, userId: getUserId(req) },
  });
  if (result.count === 0) return res.status(404).json({ message: "Notification not found" });
  return res.status(204).send();
};

/**
 * GET /api/notifications/stream  — Server-Sent Events.
 * Browser: new EventSource(`/api/notifications/stream?token=${jwt}`)
 * Events: "ready", "notification", "document".
 */
export const stream = (req: Request, res: Response) => {
  const userId = getUserId(req);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // don't let nginx buffer the stream
  });
  res.write("retry: 5000\n\n");

  addClient(userId, res);
  sendEvent(res, "ready", { connected: true });

  // Comment lines keep proxies from closing an idle connection.
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    removeClient(userId, res);
  });
};
