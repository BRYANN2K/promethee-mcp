import type { AuthContext } from "../auth/auth-context.js";
import type { TaskStatus } from "../contracts/task.js";

export interface FacadePageRequest {
  readonly limit: number;
  readonly pageToken: string | null;
}

export interface FacadeListTasksRequest extends FacadePageRequest {
  readonly projectId: string | null;
  readonly status: TaskStatus | "all";
}

export interface FacadeGetTaskRequest {
  readonly taskId: string;
}

export interface FacadeCreateProjectRequest {
  readonly name: string;
  readonly clientRequestId: string;
}

export interface FacadeCreateTaskRequest {
  readonly title: string;
  readonly projectId: string | null;
  readonly clientRequestId: string;
}

export interface PrometheeFacade {
  listTasks(
    principal: AuthContext,
    request: FacadeListTasksRequest,
    signal: AbortSignal,
  ): Promise<unknown>;
  getTask(
    principal: AuthContext,
    request: FacadeGetTaskRequest,
    signal: AbortSignal,
  ): Promise<unknown>;
  listProjects(
    principal: AuthContext,
    request: FacadePageRequest,
    signal: AbortSignal,
  ): Promise<unknown>;
  createProject(
    principal: AuthContext,
    request: FacadeCreateProjectRequest,
    signal: AbortSignal,
  ): Promise<unknown>;
  createTask(
    principal: AuthContext,
    request: FacadeCreateTaskRequest,
    signal: AbortSignal,
  ): Promise<unknown>;
}
