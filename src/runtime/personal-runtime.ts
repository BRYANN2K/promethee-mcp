import { randomBytes, timingSafeEqual } from "node:crypto";

import type { AuthInfo } from "@modelcontextprotocol/server";
import { z } from "zod";

import { DirectSupabasePrometheeFacade, type SupabaseFetch } from "../adapters/supabase/index.js";
import { CreateProjectUseCase, CreateTaskUseCase, GetTaskUseCase, ListProjectsUseCase, ListTasksUseCase } from "../application/index.js";
import { TOOL_SCOPE } from "../application/tool-registry.js";
import type { AuthContext } from "../auth/auth-context.js";
import { createStaticWebRoute } from "../http/static-web.js";
import { createRequestSecurityGate } from "../http/request-security.js";
import type { PrometheeMcpApplication, ResolvedToolContext, ToolContextResolver } from "../mcp/index.js";
import { AesGcmCursorCodec } from "../pagination/cursor-codec.js";
import { defineSlicePolicy, type SlicePolicy } from "../policy/slice-policy.js";
import type { Clock } from "../ports/clock.js";
import { systemClock } from "../ports/clock.js";
import { createPrometheeRuntime } from "./resource-server.js";
import {
  PersonalConnectionStore,
  type PersonalConnection,
  type PersonalConnectionStoreOptions,
} from "./personal-connection.js";

const ALL_SCOPES = [...new Set(Object.values(TOOL_SCOPE))];
const JSON_CONTENT_TYPE = "application/json";
const DEPLOYMENT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,128}$/u;
const EDGE_TOKEN_HEADER = "x-promethee-edge-token";
const retentionInputSchema = z.object({
  mode: z.enum(["memory", "seven-days"]),
}).strict();
const PERSONAL_SLICE_POLICY = defineSlicePolicy({
  defaultPageSize: 25,
  maxPageSize: 100,
  maxIdentifierBytes: 256,
  maxTextBytes: 1_024,
  maxCursorBytes: 1_024,
  maxBackendPageTokenBytes: 256,
  maxSourceVersionBytes: 128,
  maxResponseBytes: 64 * 1_024,
  upstreamTimeoutMs: 5_000,
  cursorTtlMs: 15 * 60_000,
  orderingVersion: "id-asc-v1",
});

export interface CreatePersonalRuntimeOptions extends PersonalConnectionStoreOptions {
  readonly authority: string;
  readonly uiOrigins?: readonly string[];
  readonly publicMcpUrl?: string;
  readonly allowedHosts?: readonly string[];
  readonly mcpAccessToken?: string;
  readonly edgeToken?: string;
  readonly cursorKey?: Uint8Array;
  readonly policy?: SlicePolicy;
  readonly clock?: Clock;
  readonly fetch?: SupabaseFetch;
  readonly onError?: (error: Error) => void;
  readonly webRoot?: string;
}

export interface PersonalRuntimeComposition {
  readonly runtime: ReturnType<typeof createPrometheeRuntime>;
  readonly connections: PersonalConnectionStore;
  readonly resolveToolContext: ToolContextResolver;
}

function unavailableApplication(): PrometheeMcpApplication {
  const unavailable = { async execute(): Promise<never> { throw new Error("Personal connection is unavailable"); } };
  return {
    createProject: unavailable,
    createTask: unavailable,
    listTasks: unavailable,
    getTask: unavailable,
    listProjects: unavailable,
  };
}

function createApplication(
  connection: PersonalConnection,
  principal: AuthContext,
  cursorCodec: AesGcmCursorCodec,
  clock: Clock,
  policy: SlicePolicy,
  fetch: SupabaseFetch | undefined,
): PrometheeMcpApplication {
  const facade = new DirectSupabasePrometheeFacade({
    baseUrl: connection.supabaseUrl,
    publishableKey: connection.publishableKey,
    principal,
    accessToken: connection.accessToken,
    policy,
    ...(fetch === undefined ? {} : { fetch }),
  });
  return {
    createProject: new CreateProjectUseCase({ facade, clock, policy }),
    createTask: new CreateTaskUseCase({ facade, clock, policy }),
    listTasks: new ListTasksUseCase({ facade, cursorCodec, clock, policy }),
    getTask: new GetTaskUseCase({ facade, clock, policy }),
    listProjects: new ListProjectsUseCase({ facade, cursorCodec, clock, policy }),
  };
}

function corsHeaders(origin: string): Headers {
  return new Headers({
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Origin": origin,
    "Cache-Control": "no-store",
    Vary: "Origin",
  });
}

function createConnectionRoutes(
  store: PersonalConnectionStore,
  allowedOrigins: ReadonlySet<string>,
  edgeToken: string | undefined,
) {
  return async (request: Request): Promise<Response | undefined> => {
    const url = new URL(request.url);
    if (
      url.pathname !== "/connect/session" &&
      url.pathname !== "/connect/status" &&
      url.pathname !== "/connect/settings"
    ) return undefined;
    const origin = request.headers.get("origin") ?? url.origin;
    if (!allowedOrigins.has(origin)) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
    const headers = corsHeaders(origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (edgeToken !== undefined && !secretMatches(edgeToken, request.headers.get(EDGE_TOKEN_HEADER))) {
      return Response.json({ error: "forbidden" }, { status: 403, headers });
    }
    if (url.pathname === "/connect/status") {
      if (request.method !== "GET") return Response.json({ error: "method_not_allowed" }, { status: 405, headers });
      return Response.json(store.status(), { headers });
    }
    if (url.pathname === "/connect/settings") {
      if (request.method === "GET") return Response.json(store.retention(), { headers });
      if (request.method !== "PUT") {
        return Response.json({ error: "method_not_allowed" }, { status: 405, headers });
      }
      if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== JSON_CONTENT_TYPE) {
        return Response.json({ error: "invalid_request" }, { status: 415, headers });
      }
      const parsed = retentionInputSchema.safeParse(await request.json());
      if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400, headers });
      try {
        return Response.json(store.setRetention(parsed.data.mode), { headers });
      } catch {
        return Response.json({ error: "persistence_unavailable" }, { status: 409, headers });
      }
    }
    if (request.method === "DELETE") {
      store.disconnect();
      return Response.json({ connected: false }, { headers });
    }
    if (request.method !== "POST") {
      return Response.json({ error: "method_not_allowed" }, { status: 405, headers });
    }
    if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== JSON_CONTENT_TYPE) {
      return Response.json({ error: "invalid_request" }, { status: 415, headers });
    }
    try {
      await store.connect(await request.json(), request.signal);
      return Response.json({ connected: true }, { headers });
    } catch {
      return Response.json({ error: "connection_rejected" }, { status: 401, headers });
    }
  };
}

function secretMatches(expected: string, actual: string | null): boolean {
  if (actual === null || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(actual, "utf8"));
}

function validateDeploymentToken(value: string | undefined, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (!DEPLOYMENT_TOKEN_PATTERN.test(value)) throw new TypeError(`${label} is invalid`);
  return value;
}

function parsePublicMcpUrl(value: string | undefined): URL | undefined {
  if (value === undefined) return undefined;
  const parsed = new URL(value);
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.pathname !== "/mcp" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new TypeError("Personal public MCP URL is invalid");
  }
  return parsed;
}

function invalidPersonalBearer(): Response {
  return Response.json(
    { error: "invalid_token" },
    { status: 401, headers: { "WWW-Authenticate": 'Bearer error="invalid_token"' } },
  );
}

export function createPersonalRuntime(options: CreatePersonalRuntimeOptions): PersonalRuntimeComposition {
  const publicMcpUrl = parsePublicMcpUrl(options.publicMcpUrl);
  const mcpAccessToken = validateDeploymentToken(options.mcpAccessToken, "Personal MCP access token");
  const edgeToken = validateDeploymentToken(options.edgeToken, "Personal edge token");
  const productionOptions = [publicMcpUrl, mcpAccessToken, edgeToken];
  const productionOptionCount = productionOptions.filter((value) => value !== undefined).length;
  if (productionOptionCount !== 0 && productionOptionCount !== productionOptions.length) {
    throw new TypeError("Personal production configuration is incomplete");
  }
  const resource = publicMcpUrl?.href ?? `http://${options.authority}/mcp`;
  const uiOrigins = options.uiOrigins ?? ["http://127.0.0.1:4175", "http://localhost:4175"];
  const allowedOrigins = new Set(uiOrigins);
  const connections = new PersonalConnectionStore({
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.persistence === undefined ? {} : { persistence: options.persistence }),
    ...(options.defaultRetention === undefined ? {} : { defaultRetention: options.defaultRetention }),
  });
  const clock = options.clock ?? systemClock;
  const policy = defineSlicePolicy(options.policy ?? PERSONAL_SLICE_POLICY);
  const cursorCodec = new AesGcmCursorCodec(options.cursorKey ?? randomBytes(32), clock, policy);
  const clientId = mcpAccessToken === undefined ? "personal-loopback" : "personal-single-user";
  const resolveToolContext: ToolContextResolver = async (signal): Promise<ResolvedToolContext | undefined> => {
    let connection: PersonalConnection | null;
    try {
      connection = await connections.current(signal);
    } catch {
      return undefined;
    }
    if (connection === null) return undefined;
    const expiresAt = Math.floor(connection.expiresAt / 1_000);
    const principal: AuthContext = {
      subject: connection.subject,
      clientId,
      issuer: `${connection.supabaseUrl}/auth/v1`,
      resource,
      scopes: new Set(ALL_SCOPES),
      expiresAt,
    };
    return {
      principal,
      application: createApplication(connection, principal, cursorCodec, clock, policy, options.fetch),
    };
  };
  const connectionRoutes = createConnectionRoutes(connections, allowedOrigins, edgeToken);
  const staticRoutes = options.webRoot === undefined
    ? undefined
    : createStaticWebRoute({ root: options.webRoot });

  const runtime = createPrometheeRuntime({
    application: unavailableApplication(),
    async authenticate(request) {
      if (mcpAccessToken === undefined) {
        if (request.headers.has("authorization")) {
          return Response.json({ error: "unsupported_authorization" }, { status: 400 });
        }
      } else {
        const authorization = request.headers.get("authorization");
        if (
          authorization === null ||
          !authorization.startsWith("Bearer ") ||
          !secretMatches(mcpAccessToken, authorization.slice("Bearer ".length))
        ) {
          return invalidPersonalBearer();
        }
      }
      const context = await resolveToolContext(request.signal);
      if (context === undefined) {
        return Response.json({ error: "not_connected" }, { status: 401 });
      }
      const expiresAt = context.principal.expiresAt;
      const authInfo: AuthInfo = {
        token: mcpAccessToken ?? "personal-loopback-session",
        clientId,
        scopes: ALL_SCOPES,
        expiresAt,
      };
      return { authInfo, principal: context.principal, application: context.application };
    },
    requestSecurityGate: createRequestSecurityGate({
      allowedHosts: options.allowedHosts ?? [options.authority],
      allowedOrigins: [...allowedOrigins],
      mcpPath: "/mcp",
    }),
    oauthMetadata: () => undefined,
    additionalRoutes: async (request) =>
      (await connectionRoutes(request)) ?? (await staticRoutes?.(request)),
    policy,
    ...(options.onError === undefined ? {} : { onError: options.onError }),
  });
  return { runtime, connections, resolveToolContext };
}
