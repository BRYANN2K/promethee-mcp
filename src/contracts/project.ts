import { z } from "zod";

import type { SlicePolicy } from "../policy/slice-policy.js";
import { boundedString } from "./primitives.js";

export type ProjectStatus = "active" | "archived";

export interface Project {
  readonly id: string;
  readonly name: string;
  readonly status: ProjectStatus;
}

export function createProjectSchema(policy: SlicePolicy) {
  return z
    .object({
      id: boundedString(policy.maxIdentifierBytes, "identifier"),
      name: boundedString(policy.maxTextBytes, "project name"),
      status: z.enum(["active", "archived"]),
    })
    .strict();
}
