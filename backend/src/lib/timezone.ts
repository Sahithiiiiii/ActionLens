import { DateTime } from "luxon";

export function isValidIanaTimezone(timezone: string | null | undefined): boolean {
  if (!timezone || typeof timezone !== "string" || timezone.trim() === "") {
    return false;
  }

  const dt = DateTime.fromObject(
    { year: 2000, month: 1, day: 1, hour: 0, minute: 0 },
    { zone: timezone },
  );

  return dt.isValid;
}

export function validateDeadlineDateTime(
  date: string,
  time: string | null,
  timezone: string | null,
): DateTime {
  if (!timezone || !isValidIanaTimezone(timezone)) {
    throw new Error(`Invalid timezone identifier: ${timezone ?? "<missing>"}`);
  }

  if (!time || time.trim() === "") {
    throw new Error("Deadline time is required for scheduling a reminder");
  }

  const dateMatch = /^\d{4}-\d{2}-\d{2}$/.test(date);
  if (!dateMatch) {
    throw new Error(`Invalid deadline date format: ${date}`);
  }

  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);

  const parsed = DateTime.fromObject(
    { year, month, day, hour: hours, minute: minutes },
    { zone: timezone },
  );

  if (!parsed.isValid) {
    if (parsed.invalidReason === "nonexistent-local-time") {
      throw new Error(
        `Local deadline time does not exist in ${timezone}: ${date} ${time}`,
      );
    }

    if (parsed.invalidReason === "ambiguous-local-time") {
      throw new Error(
        `Local deadline time is ambiguous in ${timezone}; please resolve it explicitly: ${date} ${time}`,
      );
    }

    throw new Error(
      `Invalid deadline date/time for ${timezone}: ${date} ${time} (${parsed.invalidExplanation ?? "unknown reason"})`,
    );
  }

  // Luxon silently shifts a nonexistent local time (e.g. 02:30 on a US
  // spring-forward day) to the next valid one instead of marking it invalid,
  // so detect that by checking the wall-clock fields survived the round trip.
  if (
    parsed.year !== year ||
    parsed.month !== month ||
    parsed.day !== day ||
    parsed.hour !== hours ||
    parsed.minute !== minutes
  ) {
    throw new Error(
      `Local deadline time does not exist in ${timezone}: ${date} ${time}`,
    );
  }

  return parsed;
}

export function getDeadlineInstant(date: string, time: string | null, timezone: string | null): Date {
  const localDateTime = validateDeadlineDateTime(date, time, timezone);
  return localDateTime.toUTC().toJSDate();
}

export function getFirstReminderInstant(
  deadlineInstant: Date,
  reminderLeadMinutes: number,
): Date {
  return new Date(deadlineInstant.getTime() - reminderLeadMinutes * 60_000);
}

export function getNextReminderInstant(
  now: Date,
  repeatIntervalMinutes: number,
  deadlineInstant: Date,
): Date | null {
  const nextReminderAt = new Date(
    now.getTime() + repeatIntervalMinutes * 60_000,
  );

  return nextReminderAt < deadlineInstant ? nextReminderAt : null;
}
