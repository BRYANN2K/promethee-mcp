import type { Project } from "./project.js";
import type { Task } from "./task.js";

export interface ObservationMetadata {
  readonly observedAt: string;
  readonly freshness: "unknown";
  readonly sourceVersion: string | null;
}

export interface ListTasksResult extends ObservationMetadata {
  readonly tasks: readonly Task[];
  readonly nextCursor: string | null;
}

export interface GetTaskResult extends ObservationMetadata {
  readonly task: Task;
}

export interface ListProjectsResult extends ObservationMetadata {
  readonly projects: readonly Project[];
  readonly nextCursor: string | null;
}

export interface CreateProjectResult extends ObservationMetadata {
  readonly project: Project;
}

export interface CreateTaskResult extends ObservationMetadata {
  readonly task: Task;
}
