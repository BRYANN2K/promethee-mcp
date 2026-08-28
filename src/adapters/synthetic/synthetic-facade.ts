import type { AuthContext } from "../../auth/auth-context.js";
import type { Project } from "../../contracts/project.js";
import type { Task } from "../../contracts/task.js";
import type {
  FacadeCreateProjectRequest,
  FacadeCreateTaskRequest,
  FacadeGetTaskRequest,
  FacadeListTasksRequest,
  FacadePageRequest,
  PrometheeFacade,
} from "../../ports/promethee-facade.js";
import {
  DEFAULT_SYNTHETIC_FIXTURES,
  type SyntheticProjectRecord,
  type SyntheticTaskRecord,
  type SyntheticFixtureSet,
} from "./fixtures.js";

export type SyntheticOperation =
  | "createProject"
  | "createTask"
  | "getTask"
  | "listProjects"
  | "listTasks";

export interface SyntheticCall {
  readonly operation: SyntheticOperation;
  readonly subject: string;
}

export interface SyntheticFacadeOptions {
  readonly fixtures?: SyntheticFixtureSet;
  readonly latencyMs?: number;
  readonly now?: () => Date;
  readonly transformResponse?: (operation: SyntheticOperation, response: unknown) => unknown;
}

interface SyntheticIdempotencyEntry {
  readonly fingerprint: string;
  readonly record: Project | Task;
}

function publicTask(record: Task): Task {
  return {
    id: record.id,
    title: record.title,
    status: record.status,
    projectId: record.projectId,
    ...(record.scheduledDate === undefined ? {} : { scheduledDate: record.scheduledDate }),
    ...(record.createdAt === undefined ? {} : { createdAt: record.createdAt }),
    ...(record.updatedAt === undefined ? {} : { updatedAt: record.updatedAt }),
  };
}

function publicProject(record: Project): Project {
  return { id: record.id, name: record.name, status: record.status };
}

function offsetFromToken(pageToken: string | null): number {
  if (pageToken === null) return 0;
  const match = /^offset:(\d+)$/.exec(pageToken);
  if (match === null) throw new Error("Invalid synthetic page token.");
  return Number.parseInt(match[1] ?? "0", 10);
}

function compareIdentifiers(left: { readonly id: string }, right: { readonly id: string }): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

async function boundedDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  if (milliseconds === 0) return;

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

export class SyntheticPrometheeFacade implements PrometheeFacade {
  readonly calls: SyntheticCall[] = [];
  readonly #projects: SyntheticProjectRecord[];
  readonly #tasks: SyntheticTaskRecord[];
  readonly #idempotency = new Map<string, SyntheticIdempotencyEntry>();
  readonly #latencyMs: number;
  readonly #now: () => Date;
  readonly #transformResponse: NonNullable<SyntheticFacadeOptions["transformResponse"]>;
  #projectSequence = 0;
  #taskSequence = 0;

  constructor(options: SyntheticFacadeOptions = {}) {
    const fixtures = options.fixtures ?? DEFAULT_SYNTHETIC_FIXTURES;
    this.#projects = fixtures.projects.map((project) => ({ ...project }));
    this.#tasks = fixtures.tasks.map((task) => ({ ...task }));
    this.#latencyMs = options.latencyMs ?? 0;
    this.#now = options.now ?? (() => new Date());
    this.#transformResponse = options.transformResponse ?? ((_operation, response) => response);
  }

  #idempotencyKey(
    principal: AuthContext,
    operation: "createProject" | "createTask",
    clientRequestId: string,
  ): string {
    return JSON.stringify([principal.subject, principal.clientId, operation, clientRequestId]);
  }

  #nextIdentifier(kind: "project" | "task"): string {
    const records = kind === "project" ? this.#projects : this.#tasks;
    while (true) {
      const sequence = kind === "project" ? ++this.#projectSequence : ++this.#taskSequence;
      const identifier = `created-${kind}-${String(sequence).padStart(6, "0")}`;
      if (!records.some((record) => record.id === identifier)) return identifier;
    }
  }

  async listTasks(
    principal: AuthContext,
    request: FacadeListTasksRequest,
    signal: AbortSignal,
  ): Promise<unknown> {
    this.calls.push({ operation: "listTasks", subject: principal.subject });
    await boundedDelay(this.#latencyMs, signal);
    const offset = offsetFromToken(request.pageToken);
    const matching = this.#tasks
      .filter((task) => task.ownerSubject === principal.subject && task.deleted !== true)
      .filter((task) => request.projectId === null || task.projectId === request.projectId)
      .filter((task) => request.status === "all" || task.status === request.status)
      .sort(compareIdentifiers);
    const records = matching.slice(offset, offset + request.limit).map(publicTask);
    const nextOffset = offset + records.length;
    return this.#transformResponse("listTasks", {
      records,
      nextPageToken: nextOffset < matching.length ? `offset:${nextOffset}` : null,
      sourceVersion: null,
    });
  }

  async getTask(
    principal: AuthContext,
    request: FacadeGetTaskRequest,
    signal: AbortSignal,
  ): Promise<unknown> {
    this.calls.push({ operation: "getTask", subject: principal.subject });
    await boundedDelay(this.#latencyMs, signal);
    const record = this.#tasks.find(
      (task) => task.ownerSubject === principal.subject && task.id === request.taskId && task.deleted !== true,
    );
    return this.#transformResponse("getTask", {
      record: record === undefined ? null : publicTask(record),
      sourceVersion: null,
    });
  }

  async listProjects(
    principal: AuthContext,
    request: FacadePageRequest,
    signal: AbortSignal,
  ): Promise<unknown> {
    this.calls.push({ operation: "listProjects", subject: principal.subject });
    await boundedDelay(this.#latencyMs, signal);
    const offset = offsetFromToken(request.pageToken);
    const matching = this.#projects
      .filter((project) => project.ownerSubject === principal.subject && project.deleted !== true)
      .sort(compareIdentifiers);
    const records = matching.slice(offset, offset + request.limit).map(publicProject);
    const nextOffset = offset + records.length;
    return this.#transformResponse("listProjects", {
      records,
      nextPageToken: nextOffset < matching.length ? `offset:${nextOffset}` : null,
      sourceVersion: null,
    });
  }

  async createProject(
    principal: AuthContext,
    request: FacadeCreateProjectRequest,
    signal: AbortSignal,
  ): Promise<unknown> {
    this.calls.push({ operation: "createProject", subject: principal.subject });
    await boundedDelay(this.#latencyMs, signal);
    const key = this.#idempotencyKey(principal, "createProject", request.clientRequestId);
    const fingerprint = JSON.stringify([request.name]);
    const previous = this.#idempotency.get(key);
    if (previous !== undefined) {
      return this.#transformResponse(
        "createProject",
        previous.fingerprint === fingerprint
          ? { outcome: "replayed", record: publicProject(previous.record as Project), sourceVersion: null }
          : { outcome: "idempotency_conflict" },
      );
    }

    const record: SyntheticProjectRecord = {
      id: this.#nextIdentifier("project"),
      name: request.name,
      status: "active",
      ownerSubject: principal.subject,
    };
    this.#projects.push(record);
    this.#idempotency.set(key, { fingerprint, record });
    return this.#transformResponse("createProject", {
      outcome: "created",
      record: publicProject(record),
      sourceVersion: null,
    });
  }

  async createTask(
    principal: AuthContext,
    request: FacadeCreateTaskRequest,
    signal: AbortSignal,
  ): Promise<unknown> {
    this.calls.push({ operation: "createTask", subject: principal.subject });
    await boundedDelay(this.#latencyMs, signal);
    const key = this.#idempotencyKey(principal, "createTask", request.clientRequestId);
    const fingerprint = JSON.stringify([request.title, request.projectId]);
    const previous = this.#idempotency.get(key);
    if (previous !== undefined) {
      return this.#transformResponse(
        "createTask",
        previous.fingerprint === fingerprint
          ? { outcome: "replayed", record: publicTask(previous.record as Task), sourceVersion: null }
          : { outcome: "idempotency_conflict" },
      );
    }

    if (request.projectId !== null) {
      const project = this.#projects.find(
        (candidate) =>
          candidate.id === request.projectId &&
          candidate.ownerSubject === principal.subject &&
          candidate.deleted !== true &&
          candidate.status === "active",
      );
      if (project === undefined) {
        return this.#transformResponse("createTask", { outcome: "not_found" });
      }
    }

    const record: SyntheticTaskRecord = {
      id: this.#nextIdentifier("task"),
      title: request.title,
      status: "open",
      projectId: request.projectId,
      createdAt: this.#now().toISOString(),
      ownerSubject: principal.subject,
    };
    this.#tasks.push(record);
    this.#idempotency.set(key, { fingerprint, record });
    return this.#transformResponse("createTask", {
      outcome: "created",
      record: publicTask(record),
      sourceVersion: null,
    });
  }
}
