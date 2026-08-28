import { z } from "zod";

import type { SlicePolicy } from "../policy/slice-policy.js";
import { boundedString } from "./primitives.js";

function pageLimit(policy: SlicePolicy) {
  return z.number().int().min(1).max(policy.maxPageSize).optional();
}

function cursor(policy: SlicePolicy) {
  return boundedString(policy.maxCursorBytes, "cursor").optional();
}

function isWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      if (index + 1 >= value.length) return false;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function createMutationText(policy: SlicePolicy, label: string) {
  return boundedString(policy.maxTextBytes, label)
    .refine((value) => value.trim().length > 0, `${label} must not be blank`)
    .refine(isWellFormedUnicode, `${label} must contain valid Unicode`);
}

const clientRequestId = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/u);

export function createListTasksInputSchema(policy: SlicePolicy) {
  return z
    .object({
      projectId: boundedString(policy.maxIdentifierBytes, "project identifier").optional(),
      status: z.enum(["open", "completed", "all"]).default("open"),
      cursor: cursor(policy),
      limit: pageLimit(policy),
    })
    .strict();
}

export function createGetTaskInputSchema(policy: SlicePolicy) {
  return z
    .object({
      taskId: boundedString(policy.maxIdentifierBytes, "task identifier"),
    })
    .strict();
}

export function createListProjectsInputSchema(policy: SlicePolicy) {
  return z
    .object({
      cursor: cursor(policy),
      limit: pageLimit(policy),
    })
    .strict();
}

export function createCreateProjectInputSchema(policy: SlicePolicy) {
  return z
    .object({
      name: createMutationText(policy, "project name"),
      clientRequestId,
    })
    .strict();
}

export function createCreateTaskInputSchema(policy: SlicePolicy) {
  return z
    .object({
      title: createMutationText(policy, "task title"),
      projectId: boundedString(policy.maxIdentifierBytes, "project identifier").nullable(),
      clientRequestId,
    })
    .strict();
}

export type ListTasksInput = z.infer<ReturnType<typeof createListTasksInputSchema>>;
export type GetTaskInput = z.infer<ReturnType<typeof createGetTaskInputSchema>>;
export type ListProjectsInput = z.infer<ReturnType<typeof createListProjectsInputSchema>>;
export type CreateProjectInput = z.infer<ReturnType<typeof createCreateProjectInputSchema>>;
export type CreateTaskInput = z.infer<ReturnType<typeof createCreateTaskInputSchema>>;
