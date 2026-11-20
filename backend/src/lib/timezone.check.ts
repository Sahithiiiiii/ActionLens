
import {
  getDeadlineInstant,
  getFirstReminderInstant,
  getNextReminderInstant,
} from "../lib/timezone.js";

const cases = [
  {
    date: "2026-11-15",
    time: "17:00",
    timezone: "Asia/Kolkata",
    expected: "2026-11-15T11:30:00.000Z",
  },
  {
    date: "2026-11-15",
    time: "17:00",
    timezone: "America/New_York",
    expected: "2026-11-15T22:00:00.000Z",
  },
  {
    date: "2026-07-15",
    time: "17:00",
    timezone: "America/New_York",
    expected: "2026-07-15T21:00:00.000Z",
  },
];

for (const test of cases) {
  const actual = getDeadlineInstant(
    test.date,
    test.time,
    test.timezone,
  ).toISOString();

  console.log(
    `${actual === test.expected ? "PASS" : "FAIL"}:`,
    test.timezone,
    actual,
    "| expected:",
    test.expected,
  );
}

const deadline = new Date("2026-11-15T11:30:00.000Z");
const firstReminder = getFirstReminderInstant(deadline, 120);

console.log(
  firstReminder.toISOString() === "2026-11-15T09:30:00.000Z"
    ? "PASS: first reminder"
    : "FAIL: first reminder",
  firstReminder.toISOString(),
);

const nextReminder = getNextReminderInstant(
  new Date("2026-11-15T10:00:00.000Z"),
  30,
  deadline,
);

console.log(
  nextReminder?.toISOString() === "2026-11-15T10:30:00.000Z"
    ? "PASS: next reminder"
    : "FAIL: next reminder",
  nextReminder?.toISOString(),
);

const afterDeadline = getNextReminderInstant(
  new Date("2026-11-15T11:15:00.000Z"),
  30,
  deadline,
);

console.log(
  afterDeadline === null
    ? "PASS: no reminder after deadline"
    : "FAIL: reminder scheduled after deadline",
);
