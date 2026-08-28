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

const SOURCE_VERSION = "promethee-supabase-rpc-v1";
const MAX_ACCESS_TOKEN_BYTES = 8_192;
const MAX_PUBLISHABLE_KEY_BYTES = 1_024;
const MAX_UPSTREAM_RESPONSE_BYTES = 64 * 1024;
const MAX_ADAPTER_PAGE_SIZE = 100;
const MAX_PAGE_TOKEN_BYTES = 256;
const COMPACT_JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;
const PUBLISHABLE_KEY_PATTERN = /^sb_publishable_[A-Za-z0-9_-]{8,}$/u;

const taskRowSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  status: z.enum(["open", "completed"]),
  project_id: z.string().min(1).nullable(),
  scheduled_date: z.string().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
}).strict();

const projectRowSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  status: z.enum(["active", "archived"]),
}).strict();

type TaskRow = z.infer<typeof taskRowSchema>;
type ProjectRow = z.infer<typeof projectRowSchema>;

export type SupabaseFetch = (request: Request) => Promise<Response>;

export interface SupabasePrometheeFacadeOptions {
  readonly baseUrl: string;
  readonly publishableKey: string;
  readonly principal: AuthContext;
  readonly accessToken: string;
  readonly policy: SlicePolicy;
  readonly fetch?: SupabaseFetch;
}

export interface SupabasePrometheeFacadeConfiguration {
  readonly baseUrl: string;
  readonly publishableKey: string;
}

type RpcName =
  | "mcp_create_project_v1"
  | "mcp_create_task_v1"
  | "mcp_get_task_v1"
  | "mcp_list_projects_v1"
  | "mcp_list_tasks_v1";

const createdProjectRowSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  status: z.literal("active"),
}).strict();

const createdTaskRowSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  status: z.literal("open"),
  project_id: z.string().min(1).nullable(),
  scheduled_date: z.string().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
}).strict();

const createProjectRpcSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.enum(["created", "replayed"]), record: createdProjectRowSchema }).strict(),
  z.object({ outcome: z.literal("idempotency_conflict") }).strict(),
]);

const createTaskRpcSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.enum(["created", "replayed"]), record: createdTaskRowSchema }).strict(),
  z.object({ outcome: z.literal("idempotency_conflict") }).strict(),
  z.object({ outcome: z.literal("not_found") }).strict(),
]);

function validateBaseUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError("Supabase base URL must be an absolute HTTPS origin");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    value.includes("\\")
  ) {
    throw new TypeError("Supabase base URL must be an absolute HTTPS origin");
  }
  return parsed;
}

function validateCredential(value: string, kind: "access token" | "publishable key"): string {
  const maximum = kind === "access token" ? MAX_ACCESS_TOKEN_BYTES : MAX_PUBLISHABLE_KEY_BYTES;
  if (
    value.length === 0 ||
    Buffer.byteLength(value, "utf8") > maximum ||
    (kind === "access token" ? !COMPACT_JWT_PATTERN.test(value) : !isPublicSupabaseKey(value))
  ) {
    throw new TypeError(`Supabase ${kind} is invalid`);
  }
  return value;
}

function isPublicSupabaseKey(value: string): boolean {
  if (PUBLISHABLE_KEY_PATTERN.test(value)) return true;
  if (!COMPACT_JWT_PATTERN.test(value)) return false;
  try {
    const segment = value.split(".")[1];
    if (segment === undefined) return false;
    const payload: unknown = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
    return typeof payload === "object" && payload !== null &&
      Reflect.get(payload, "iss") === "supabase" && Reflect.get(payload, "role") === "anon";
  } catch {
    return false;
  }
}

/** Validates all non-user Supabase adapter configuration at startup. */
export function validateSupabasePrometheeFacadeConfiguration(
  options: SupabasePrometheeFacadeConfiguration,
): void {
  validateBaseUrl(options.baseUrl);
  validateCredential(options.publishableKey, "publishable key");
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

function assertStrictAscending(records: readonly { readonly id: string }[], afterId: string | null): void {
  let previous = afterId;
  for (const record of records) {
    if (previous !== null && record.id <= previous) {
      throw incompatibleSource();
    }
    previous = record.id;
  }
}

function publicTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    projectId: row.project_id,
    scheduledDate: row.scheduled_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function publicProject(row: ProjectRow): Project {
  return { id: row.id, name: row.name, status: row.status };
}

async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Error responses are deliberately not parsed or logged.
  }
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    await discardBody(response);
    throw incompatibleSource();
  }
  const announcedLength = response.headers.get("content-length");
  if (
    announcedLength !== null &&
    (/^\d+$/u.test(announcedLength) === false || Number(announcedLength) > MAX_UPSTREAM_RESPONSE_BYTES)
  ) {
    await discardBody(response);
    throw incompatibleSource();
  }
  if (response.body === null) {
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

/**
 * Request-scoped Supabase adapter. The only network paths it can construct are
 * the five fixed, publisher-owned read/create RPCs below. RLS derives the user from
 * the bearer token; no user identifier is sent in an RPC body.
 */
export class SupabasePrometheeFacade implements PrometheeFacade {
  readonly #baseUrl: URL;
  readonly #publishableKey: string;
  readonly #principal: AuthContext;
  readonly #accessToken: string;
  readonly #policy: SlicePolicy;
  readonly #fetch: SupabaseFetch;

  public constructor(options: SupabasePrometheeFacadeOptions) {
    validateSupabasePrometheeFacadeConfiguration(options);
    this.#baseUrl = validateBaseUrl(options.baseUrl);
    this.#publishableKey = validateCredential(options.publishableKey, "publishable key");
    this.#accessToken = validateCredential(options.accessToken, "access token");
    this.#principal = { ...options.principal, scopes: new Set(options.principal.scopes) };
    this.#policy = options.policy;
    this.#fetch = options.fetch ?? ((request) => globalThis.fetch(request));
  }

  async #call(rpc: RpcName, body: Readonly<Record<string, unknown>>, signal: AbortSignal): Promise<unknown> {
    const url = new URL(`/rest/v1/rpc/${rpc}`, this.#baseUrl);
    const response = await this.#fetch(new Request(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.#accessToken}`,
        "Content-Type": "application/json",
        apikey: this.#publishableKey,
      },
      body: JSON.stringify(body),
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
    if (!response.ok) {
      await discardBody(response);
      throw new ApplicationError(
        response.status >= 500 ? "dependency_unavailable" : "incompatible_source",
        "The data source is unavailable.",
        response.status >= 500,
      );
    }
    return readBoundedJson(response);
  }

  #assertCaller(principal: AuthContext): void {
    if (!samePrincipal(this.#principal, principal)) {
      throw new ApplicationError("access_denied", "The request identity is not authorized.");
    }
  }

  public async listTasks(
    principal: AuthContext,
    request: FacadeListTasksRequest,
    signal: AbortSignal,
  ): Promise<unknown> {
    this.#assertCaller(principal);
    validatePageRequest(request);
    const raw = await this.#call("mcp_list_tasks_v1", {
      p_after_id: request.pageToken,
      p_limit: request.limit + 1,
      p_project_id: request.projectId,
      p_status: request.status,
    }, signal);
    const parsed = z.array(taskRowSchema).max(request.limit + 1).safeParse(raw);
    if (!parsed.success) throw incompatibleSource();
    assertStrictAscending(parsed.data, request.pageToken);
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
    const raw = await this.#call("mcp_get_task_v1", { p_task_id: request.taskId }, signal);
    const parsed = z.array(taskRowSchema).max(1).safeParse(raw);
    if (!parsed.success) throw incompatibleSource();
    return {
      record: parsed.data[0] === undefined ? null : publicTask(parsed.data[0]),
      sourceVersion: SOURCE_VERSION,
    };
  }

  public async listProjects(
    principal: AuthContext,
    request: FacadePageRequest,
    signal: AbortSignal,
  ): Promise<unknown> {
    this.#assertCaller(principal);
    validatePageRequest(request);
    const raw = await this.#call("mcp_list_projects_v1", {
      p_after_id: request.pageToken,
      p_limit: request.limit + 1,
    }, signal);
    const parsed = z.array(projectRowSchema).max(request.limit + 1).safeParse(raw);
    if (!parsed.success) throw incompatibleSource();
    assertStrictAscending(parsed.data, request.pageToken);
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
    const raw = await this.#call("mcp_create_project_v1", {
      p_name: parsedInput.data.name,
      p_client_request_id: parsedInput.data.clientRequestId,
    }, signal);
    const parsed = createProjectRpcSchema.safeParse(raw);
    if (!parsed.success) throw incompatibleSource();
    if (parsed.data.outcome === "idempotency_conflict") return parsed.data;
    return {
      outcome: parsed.data.outcome,
      record: publicProject(parsed.data.record),
      sourceVersion: SOURCE_VERSION,
    };
  }

  public async createTask(
    principal: AuthContext,
    request: FacadeCreateTaskRequest,
    signal: AbortSignal,
  ): Promise<unknown> {
    this.#assertCaller(principal);
    const parsedInput = createCreateTaskInputSchema(this.#policy).safeParse(request);
    if (!parsedInput.success) throw new ApplicationError("invalid_input", "The request is invalid.");
    const raw = await this.#call("mcp_create_task_v1", {
      p_title: parsedInput.data.title,
      p_project_id: parsedInput.data.projectId,
      p_client_request_id: parsedInput.data.clientRequestId,
    }, signal);
    const parsed = createTaskRpcSchema.safeParse(raw);
    if (!parsed.success) throw incompatibleSource();
    if (parsed.data.outcome === "idempotency_conflict" || parsed.data.outcome === "not_found") {
      return parsed.data;
    }
    return {
      outcome: parsed.data.outcome,
      record: publicTask(parsed.data.record),
      sourceVersion: SOURCE_VERSION,
    };
  }
}
