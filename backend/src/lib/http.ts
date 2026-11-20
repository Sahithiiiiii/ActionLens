import { z } from "zod";

const uuid = z.uuid();

/** Returns the id if it's a valid UUID, otherwise null (avoids Prisma errors on junk ids). */
export function parseId(value: unknown): string | null {
  const parsed = uuid.safeParse(value);
  return parsed.success ? parsed.data : null;
}
