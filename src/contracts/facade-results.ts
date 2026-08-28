import { z } from "zod";

import type { SlicePolicy } from "../policy/slice-policy.js";
import { boundedString } from "./primitives.js";
import { createProjectSchema } from "./project.js";
import { createTaskSchema } from "./task.js";

function sourceVersion(policy: SlicePolicy) {
  return boundedString(policy.maxSourceVersionBytes, "source version").nullable();
}

function nextPageToken(policy: SlicePolicy) {
  return boundedString(policy.maxBackendPageTokenBytes, "backend page token").nullable();
}

export function createTaskPageSchema(policy: SlicePolicy) {
  return z
    .object({
      records: z.array(createTaskSchema(policy)).max(policy.maxPageSize),
      nextPageToken: nextPageToken(policy),
      sourceVersion: sourceVersion(policy),
    })
    .strict();
}

export function createTaskLookupSchema(policy: SlicePolicy) {
  return z
    .object({
      record: createTaskSchema(policy).nullable(),
      sourceVersion: sourceVersion(policy),
    })
    .strict();
}

export function createProjectPageSchema(policy: SlicePolicy) {
  return z
    .object({
      records: z.array(createProjectSchema(policy)).max(policy.maxPageSize),
      nextPageToken: nextPageToken(policy),
      sourceVersion: sourceVersion(policy),
    })
    .strict();
}

export function createProjectMutationSchema(policy: SlicePolicy) {
  const createdProject = createProjectSchema(policy).refine(
    (project) => project.status === "active",
    "A created project must be active",
  );
  return z.discriminatedUnion("outcome", [
    z.object({
      outcome: z.enum(["created", "replayed"]),
      record: createdProject,
      sourceVersion: sourceVersion(policy),
    }).strict(),
    z.object({ outcome: z.literal("idempotency_conflict") }).strict(),
  ]);
}

export function createTaskMutationSchema(policy: SlicePolicy) {
  const createdTask = createTaskSchema(policy).refine(
    (task) => task.status === "open",
    "A created task must be open",
  );
  return z.discriminatedUnion("outcome", [
    z.object({
      outcome: z.enum(["created", "replayed"]),
      record: createdTask,
      sourceVersion: sourceVersion(policy),
    }).strict(),
    z.object({ outcome: z.literal("idempotency_conflict") }).strict(),
    z.object({ outcome: z.literal("not_found") }).strict(),
  ]);
}
