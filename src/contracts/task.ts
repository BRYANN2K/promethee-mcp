import { z } from "zod";

import type { SlicePolicy } from "../policy/slice-policy.js";
import { boundedString, calendarDateSchema, nullableOptional, rfc3339Schema } from "./primitives.js";

export type TaskStatus = "completed" | "open";

export interface Task {
  readonly id: string;
  readonly title: string;
  readonly status: TaskStatus;
  readonly projectId: string | null;
  readonly scheduledDate?: string | null | undefined;
  readonly createdAt?: string | null | undefined;
  readonly updatedAt?: string | null | undefined;
}

export function createTaskSchema(policy: SlicePolicy) {
  const identifier = boundedString(policy.maxIdentifierBytes, "identifier");
  return z
    .object({
      id: identifier,
      title: boundedString(policy.maxTextBytes, "task title"),
      status: z.enum(["open", "completed"]),
      projectId: identifier.nullable(),
      scheduledDate: nullableOptional(calendarDateSchema),
      createdAt: nullableOptional(rfc3339Schema),
      updatedAt: nullableOptional(rfc3339Schema),
    })
    .strict();
}
