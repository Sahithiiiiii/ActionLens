import type { Deadline } from "../../generated/prisma/client.js";
import { getDueAt } from "../reminders/reminder.scheduler.js";

/** API shape: a plain YYYY-MM-DD date plus the exact UTC instant it is due. */
export function serializeDeadline<T extends Deadline>(deadline: T) {
  return {
    ...deadline,
    date: deadline.date.toISOString().slice(0, 10),
    dueAt: getDueAt(deadline)?.toISOString() ?? null,
  };
}
