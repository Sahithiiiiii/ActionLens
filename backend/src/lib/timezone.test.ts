import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getDeadlineInstant,
  validateDeadlineDateTime,
} from "./timezone.js";

describe("timezone utility", () => {
  it("converts an Asia/Kolkata deadline to UTC", () => {
    assert.equal(
      getDeadlineInstant("2026-11-15", "17:00", "Asia/Kolkata").toISOString(),
      "2026-11-15T11:30:00.000Z",
    );
  });

  it("converts a winter America/New_York deadline to UTC", () => {
    assert.equal(
      getDeadlineInstant(
        "2026-11-15",
        "17:00",
        "America/New_York",
      ).toISOString(),
      "2026-11-15T22:00:00.000Z",
    );
  });

  it("converts a summer America/New_York deadline to UTC", () => {
    assert.equal(
      getDeadlineInstant(
        "2026-07-15",
        "17:00",
        "America/New_York",
      ).toISOString(),
      "2026-07-15T21:00:00.000Z",
    );
  });

  it("rejects an invalid timezone", () => {
    assert.throws(
      () =>
        validateDeadlineDateTime(
          "2026-11-15",
          "17:00",
          "Invalid/Timezone",
        ),
      /Invalid timezone identifier/,
    );
  });

  it("rejects a nonexistent local time during the spring-forward transition", () => {
    assert.throws(
      () =>
        validateDeadlineDateTime(
          "2026-03-08",
          "02:30",
          "America/New_York",
        ),
      /does not exist/,
    );
  });
});
