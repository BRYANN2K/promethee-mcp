import { createHash } from "node:crypto";

import { z } from "zod";

import type { AuthContext } from "../../auth/auth-context.js";
import { ApplicationError, incompatibleSource } from "../../contracts/errors.js";
import type { Project } from "../../contracts/project.js";
import type { Task } from "../../contracts/task.js";
import { createCreateProjectInputSchema, createCreateTaskInputSchema } from "../../contracts/tool-inputs.js";
import type { SlicePolicy } from "../../policy/slice-policy.js";
import type {
  FacadeCreateProjectRequest,
  FacadeCreateTaskRequest,
  FacadeGetTaskRequest,
  FacadeListTasksRequest,
  FacadePageRequest,
  PrometheeFacade,
} from "../../ports/promethee-facade.js";
import {
  validateSupabasePrometheeFacadeConfiguration,
  type SupabaseFetch,
} from "./supabase-facade.js";

const SOURCE_VERSION = "promethee-postgrest-user-v1";
const MAX_UPSTREAM_RESPONSE_BYTES = 64 * 1024;
const MAX_ADAPTER_PAGE_SIZE = 100;
const MAX_PAGE_TOKEN_BYTES = 256;
const MAX_ACCESS_TOKEN_BYTES = 8_192;
const COMPACT_JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;

const timestampSchema = z.union([z.number().int().nonnegative(), z.string().min(1)]).nullable();

const taskRowSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  completed: z.boolean(),
  project_id: z.string().min(1).nullable(),
  scheduled_date: z.string().nullable(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
}).strict();

const projectRowSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  deleted: z.boolean(),
}).strict();

const positionRowSchema = z.object({ position: z.number().int().nonnegative() }).strict();

type TaskRow = z.infer<typeof taskRowSchema>;
type ProjectRow = z.infer<typeof projectRowSchema>;

export interface DirectSupabasePrometheeFacadeOptions {
  readonly baseUrl: string;
  readonly publishableKey: string;
  readonly principal: AuthContext;
  readonly accessToken: string;
  readonly policy: SlicePolicy;
  readonly fetch?: SupabaseFetch;
  readonly now?: () => number;
}

function validateAccessToken(value: string): string {
  if (
    value.length === 0 ||
    Buffer.byteLength(value, "utf8") > MAX_ACCESS_TOKEN_BYTES ||
    !COMPACT_JWT_PATTERN.test(value)
  ) {
    throw new TypeError("Supabase access token is invalid");
  }
  return value;
}

function validatePageRequest(request: FacadePageRequest): void {
  if (!Number.isSafeInteger(request.limit) || request.limit < 1 || request.limit > MAX_ADAPTER_PAGE_SIZE) {
    throw new ApplicationError("invalid_input", "The request is invalid.");
  }
  if (
    request.pageToken !== null &&
    (request.pageToken.length === 0 || Buffer.byteLength(request.pageToken, "utf8") > MAX_PAGE_TOKEN_BYTES)
  ) {
    throw new ApplicationError("invalid_cursor", "The cursor is invalid or expired.");
  }
}

function samePrincipal(left: AuthContext, right: AuthContext): boolean {
  const sameScopes = left.scopes.size === right.scopes.size &&
    [...left.scopes].every((scope) => right.scopes.has(scope));
  return left.subject === right.subject &&
    left.clientId === right.clientId &&
    left.issuer === right.issuer &&
    left.resource === right.resource &&
    left.expiresAt === right.expiresAt &&
    sameScopes;
}

function timestamp(value: number | string | null): string | null {
  if (value === null) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function publicTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.text,
    status: row.completed ? "completed" : "open",
    projectId: row.project_id,
    scheduledDate: row.scheduled_date,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function publicProject(row: ProjectRow): Project {
  return { id: row.id, name: row.name, status: row.deleted ? "archived" : "active" };
}

function deterministicUuid(kind: "project" | "task", subject: string, clientRequestId: string): string {
  const bytes = createHash("sha256")
    .update("promethee-mcp-direct-v1\0")
    .update(kind)
    .update("\0")
    .update(subject)
    .update("\0")
    .update(clientRequestId)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Upstream error details are deliberately not consumed or logged.
  }
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json" || response.body === null) {
    await discardBody(response);
    throw incompatibleSource();
  }
  const announcedLength = response.headers.get("content-length");
  if (
    announcedLength !== null &&
    (!/^\d+$/u.test(announcedLength) || Number(announcedLength) > MAX_UPSTREAM_RESPONSE_BYTES)
  ) {
    await discardBody(response);
    throw incompatibleSource();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_UPSTREAM_RESPONSE_BYTES) {
        await reader.cancel();
        throw incompatibleSource();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)) as unknown;
  } catch {
    throw incompatibleSource();
  }
}

export class DirectSupabasePrometheeFacade implements PrometheeFacade {
  readonly #baseUrl: URL;
  readonly #publishableKey: string;
  readonly #principal: AuthContext;
  readonly #accessToken: string;
  readonly #policy: SlicePolicy;
  readonly #fetch: SupabaseFetch;
  readonly #now: () => number;

  public constructor(options: DirectSupabasePrometheeFacadeOptions) {
    validateSupabasePrometheeFacadeConfiguration({
      baseUrl: options.baseUrl,
      publishableKey: options.publishableKey,
    });
    this.#baseUrl = new URL(options.baseUrl);
    this.#publishableKey = options.publishableKey;
    this.#accessToken = validateAccessToken(options.accessToken);
    this.#principal = { ...options.principal, scopes: new Set(options.principal.scopes) };
    this.#policy = options.policy;
    this.#fetch = options.fetch ?? ((request) => globalThis.fetch(request));
    this.#now = options.now ?? Date.now;
  }

  #assertCaller(principal: AuthContext): void {
    if (!samePrincipal(this.#principal, principal)) {
      throw new ApplicationError("access_denied", "The request identity is not authorized.");
    }
  }

  async #request(
    path: "/rest/v1/tasks" | "/rest/v1/task_projects",
    options: {
      readonly method?: "GET" | "POST";
      readonly query?: Readonly<Record<string, string>>;
      readonly body?: Readonly<Record<string, unknown>>;
      readonly prefer?: string;
    },
    signal: AbortSignal,
  ): Promise<{ readonly status: number; readonly data: unknown }> {
    const url = new URL(path, this.#baseUrl);
    for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);
    const response = await this.#fetch(new Request(url, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.#accessToken}`,
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(options.prefer === undefined ? {} : { Prefer: options.prefer }),
        apikey: this.#publishableKey,
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal,
    }));

    if (response.status === 401 || response.status === 403) {
      await discardBody(response);
      throw new ApplicationError("access_denied", "The data source denied access.");
    }
    if (response.status === 429) {
      await discardBody(response);
      throw new ApplicationError("rate_limited", "The data source rate limit was reached.", true);
    }
    if (!response.ok && response.status !== 409) {
      await discardBody(response);
      throw new ApplicationError(
        response.status >= 500 ? "dependency_unavailable" : "incompatible_source",
        "The data source is unavailable.",
        response.status >= 500,
      );
    }
    if (response.status === 204 || response.body === null) return { status: response.status, data: null };
    return { status: response.status, data: await readBoundedJson(response) };
  }

  async #taskById(id: string, signal: AbortSignal): Promise<TaskRow | null> {
    const result = await this.#request("/rest/v1/tasks", {
      query: {
        select: "id,text,completed,project_id,scheduled_date,created_at,updated_at",
        user_id: `eq.${this.#principal.subject}`,
        id: `eq.${id}`,
        limit: "1",
      },
    }, signal);
    const rows = z.array(taskRowSchema).max(1).safeParse(result.data);
    if (!rows.success) throw incompatibleSource();
    return rows.data[0] ?? null;
  }

  async #projectById(id: string, signal: AbortSignal): Promise<ProjectRow | null> {
    const result = await this.#request("/rest/v1/task_projects", {
      query: {
        select: "id,name,deleted",
        user_id: `eq.${this.#principal.subject}`,
        id: `eq.${id}`,
        limit: "1",
      },
    }, signal);
    const rows = z.array(projectRowSchema).max(1).safeParse(result.data);
    if (!rows.success) throw incompatibleSource();
    return rows.data[0] ?? null;
  }

  async #nextPosition(
    path: "/rest/v1/tasks" | "/rest/v1/task_projects",
    signal: AbortSignal,
  ): Promise<number> {
    const query: Record<string, string> = {
        select: "position",
        user_id: `eq.${this.#principal.subject}`,
        deleted: "eq.false",
        order: "position.desc",
        limit: "1",
    };
    if (path === "/rest/v1/tasks") query["session_id"] = "is.null";
    const result = await this.#request(path, { query }, signal);
    const rows = z.array(positionRowSchema).max(1).safeParse(result.data);
    if (!rows.success) throw incompatibleSource();
    return (rows.data[0]?.position ?? -1) + 1;
  }

  public async listTasks(
    principal: AuthContext,
    request: FacadeListTasksRequest,
    signal: AbortSignal,
  ): Promise<unknown> {
    this.#assertCaller(principal);
    validatePageRequest(request);
    const query: Record<string, string> = {
      select: "id,text,completed,project_id,scheduled_date,created_at,updated_at",
      user_id: `eq.${principal.subject}`,
      deleted: "eq.false",
      order: "id.asc",
      limit: String(request.limit + 1),
    };
    if (request.pageToken !== null) query["id"] = `gt.${request.pageToken}`;
    if (request.projectId !== null) query["project_id"] = `eq.${request.projectId}`;
    if (request.status !== "all") query["completed"] = `eq.${String(request.status === "completed")}`;

    const result = await this.#request("/rest/v1/tasks", { query }, signal);
    const parsed = z.array(taskRowSchema).max(request.limit + 1).safeParse(result.data);
    if (!parsed.success) throw incompatibleSource();
    const hasNext = parsed.data.length > request.limit;
    const visible = parsed.data.slice(0, request.limit);
    return {
      records: visible.map(publicTask),
      nextPageToken: hasNext ? (visible.at(-1)?.id ?? null) : null,
      sourceVersion: SOURCE_VERSION,
    };
  }

  public async getTask(
    principal: AuthContext,
    request: FacadeGetTaskRequest,
    signal: AbortSignal,
  ): Promise<unknown> {
    this.#assertCaller(principal);
    const row = await this.#taskById(request.taskId, signal);
    return { record: row === null ? null : publicTask(row), sourceVersion: SOURCE_VERSION };
  }

  public async listProjects(
    principal: AuthContext,
    request: FacadePageRequest,
    signal: AbortSignal,
  ): Promise<unknown> {
    this.#assertCaller(principal);
    validatePageRequest(request);
    const query: Record<string, string> = {
      select: "id,name,deleted",
      user_id: `eq.${principal.subject}`,
      deleted: "eq.false",
      order: "id.asc",
      limit: String(request.limit + 1),
    };
    if (request.pageToken !== null) query["id"] = `gt.${request.pageToken}`;
    const result = await this.#request("/rest/v1/task_projects", { query }, signal);
    const parsed = z.array(projectRowSchema).max(request.limit + 1).safeParse(result.data);
    if (!parsed.success) throw incompatibleSource();
    const hasNext = parsed.data.length > request.limit;
    const visible = parsed.data.slice(0, request.limit);
    return {
      records: visible.map(publicProject),
      nextPageToken: hasNext ? (visible.at(-1)?.id ?? null) : null,
      sourceVersion: SOURCE_VERSION,
    };
  }

  public async createProject(
    principal: AuthContext,
    request: FacadeCreateProjectRequest,
    signal: AbortSignal,
  ): Promise<unknown> {
    this.#assertCaller(principal);
    const parsedInput = createCreateProjectInputSchema(this.#policy).safeParse(request);
    if (!parsedInput.success) throw new ApplicationError("invalid_input", "The request is invalid.");
    const id = deterministicUuid("project", principal.subject, parsedInput.data.clientRequestId);
    const existing = await this.#projectById(id, signal);
    if (existing !== null) {
      if (existing.name !== parsedInput.data.name) return { outcome: "idempotency_conflict" };
      return { outcome: "replayed", record: publicProject(existing), sourceVersion: SOURCE_VERSION };
    }
    const now = this.#now();
    const position = await this.#nextPosition("/rest/v1/task_projects", signal);
    const result = await this.#request("/rest/v1/task_projects", {
      method: "POST",
      query: { select: "id,name,deleted" },
      body: {
        id,
        user_id: principal.subject,
        name: parsedInput.data.name,
        position,
        created_at: now,
        updated_at: now,
        deleted: false,
      },
      prefer: "return=representation",
    }, signal);
    if (result.status === 409) {
      const replay = await this.#projectById(id, signal);
      if (replay === null || replay.name !== parsedInput.data.name) return { outcome: "idempotency_conflict" };
      return { outcome: "replayed", record: publicProject(replay), sourceVersion: SOURCE_VERSION };
    }
    const parsed = z.array(projectRowSchema).length(1).safeParse(result.data);
    if (!parsed.success) throw incompatibleSource();
    return { outcome: "created", record: publicProject(parsed.data[0]!), sourceVersion: SOURCE_VERSION };
  }

  public async createTask(
    principal: AuthContext,
    request: FacadeCreateTaskRequest,
    signal: AbortSignal,
  ): Promise<unknown> {
    this.#assertCaller(principal);
    const parsedInput = createCreateTaskInputSchema(this.#policy).safeParse(request);
    if (!parsedInput.success) throw new ApplicationError("invalid_input", "The request is invalid.");
    if (parsedInput.data.projectId !== null) {
      const project = await this.#projectById(parsedInput.data.projectId, signal);
      if (project === null || project.deleted) return { outcome: "not_found" };
    }
    const id = deterministicUuid("task", principal.subject, parsedInput.data.clientRequestId);
    const existing = await this.#taskById(id, signal);
    if (existing !== null) {
      if (existing.text !== parsedInput.data.title || existing.project_id !== parsedInput.data.projectId) {
        return { outcome: "idempotency_conflict" };
      }
      return { outcome: "replayed", record: publicTask(existing), sourceVersion: SOURCE_VERSION };
    }
    const now = this.#now();
    const position = await this.#nextPosition("/rest/v1/tasks", signal);
    const result = await this.#request("/rest/v1/tasks", {
      method: "POST",
      query: { select: "id,text,completed,project_id,scheduled_date,created_at,updated_at" },
      body: {
        id,
        user_id: principal.subject,
        session_id: null,
        text: parsedInput.data.title,
        completed: false,
        position,
        project_id: parsedInput.data.projectId,
        xp_reward: null,
        scheduled_date: null,
        parent_id: null,
        recurrence: null,
        current_streak: 0,
        last_completed_date: null,
        completed_at: null,
        completed_session_id: null,
        source: "manual",
        created_at: now,
        updated_at: now,
        deleted: false,
      },
      prefer: "return=representation",
    }, signal);
    if (result.status === 409) {
      const replay = await this.#taskById(id, signal);
      if (
        replay === null ||
        replay.text !== parsedInput.data.title ||
        replay.project_id !== parsedInput.data.projectId
      ) {
        return { outcome: "idempotency_conflict" };
      }
      return { outcome: "replayed", record: publicTask(replay), sourceVersion: SOURCE_VERSION };
    }
    const parsed = z.array(taskRowSchema).length(1).safeParse(result.data);
    if (!parsed.success) throw incompatibleSource();
    return { outcome: "created", record: publicTask(parsed.data[0]!), sourceVersion: SOURCE_VERSION };
  }
}
