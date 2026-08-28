import type { AuthContext } from "../auth/auth-context.js";
import { ApplicationError } from "../contracts/errors.js";

export const TOOL_SCOPE = Object.freeze({
  promethee_create_project: "projects:write",
  promethee_create_task: "tasks:write",
  promethee_get_task: "tasks:read",
  promethee_list_projects: "tasks:read",
  promethee_list_tasks: "tasks:read",
} as const);

export type PrometheeToolName = keyof typeof TOOL_SCOPE;

export function requireScope(principal: AuthContext, scope: string): void {
  if (!principal.scopes.has(scope)) {
    throw new ApplicationError("insufficient_scope", "The grant does not include the required scope.");
  }
}
