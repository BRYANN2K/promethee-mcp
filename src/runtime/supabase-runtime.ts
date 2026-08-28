import type { OAuthMetadata } from "@modelcontextprotocol/server";

import {
  SupabasePrometheeFacade,
  type SupabaseFetch,
  validateSupabasePrometheeFacadeConfiguration,
} from "../adapters/supabase/index.js";
import { CreateProjectUseCase, CreateTaskUseCase, GetTaskUseCase, ListProjectsUseCase, ListTasksUseCase } from "../application/index.js";
import { TOOL_SCOPE } from "../application/tool-registry.js";
import { createBearerAuthenticator } from "../auth/bearer-auth.js";
import { createSupabaseJwtTokenVerifier } from "../auth/supabase-jwt-token-verifier.js";
import type { TokenVerifier } from "../auth/token-verifier.js";
import { createOAuthMetadataHandler, resourceMetadataUrl } from "../http/oauth-metadata.js";
import { createRequestSecurityGate } from "../http/request-security.js";
import type { PrometheeMcpApplication } from "../mcp/index.js";
import { AesGcmCursorCodec } from "../pagination/cursor-codec.js";
import { defineSlicePolicy, type SlicePolicy } from "../policy/slice-policy.js";
import type { Clock } from "../ports/clock.js";
import { systemClock } from "../ports/clock.js";
import { createPrometheeRuntime } from "./resource-server.js";

const OAUTH_SCOPES = [...new Set(["openid", "email", ...Object.values(TOOL_SCOPE)])];

export interface CreateSupabaseRuntimeOptions {
  readonly publicMcpUrl: string;
  readonly supabaseUrl: string;
  readonly publishableKey: string;
  readonly permissionsByClientId: ReadonlyMap<string, ReadonlySet<string>>;
  readonly allowedHosts: readonly string[];
  readonly allowedOrigins: readonly string[];
  readonly cursorKey: Uint8Array;
  readonly policy: SlicePolicy;
  readonly clock?: Clock;
  readonly fetch?: SupabaseFetch;
  /** Test seam. Production callers should use fixed remote JWKS discovery. */
  readonly tokenVerifier?: TokenVerifier;
  readonly onError?: (error: Error) => void;
}

function validatePublicMcpUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError("Public MCP URL must be an absolute HTTPS URL");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.pathname !== "/mcp" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    value.includes("\\")
  ) {
    throw new TypeError("Public MCP URL must be an absolute HTTPS URL ending in /mcp");
  }
  return parsed;
}

function validateSupabaseUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError("Supabase URL must be an absolute HTTPS origin");
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
    throw new TypeError("Supabase URL must be an absolute HTTPS origin");
  }
  return parsed;
}

function createApplication(
  facade: SupabasePrometheeFacade,
  cursorCodec: AesGcmCursorCodec,
  clock: Clock,
  policy: SlicePolicy,
): PrometheeMcpApplication {
  return {
    createProject: new CreateProjectUseCase({ facade, clock, policy }),
    createTask: new CreateTaskUseCase({ facade, clock, policy }),
    listTasks: new ListTasksUseCase({ facade, cursorCodec, clock, policy }),
    getTask: new GetTaskUseCase({ facade, clock, policy }),
    listProjects: new ListProjectsUseCase({ facade, cursorCodec, clock, policy }),
  };
}

function unavailableApplication(): PrometheeMcpApplication {
  const unavailable = {
    async execute(): Promise<never> {
      throw new Error("Caller-bound application is unavailable");
    },
  };
  return {
    createProject: unavailable,
    createTask: unavailable,
    listTasks: unavailable,
    getTask: unavailable,
    listProjects: unavailable,
  };
}

/**
 * Creates a public-url-aware Supabase composition without binding a socket or
 * reading environment variables. Network access occurs only when a verified
 * request triggers JWKS discovery or one of the five fixed data RPCs.
 */
export function createSupabaseRuntime(options: CreateSupabaseRuntimeOptions) {
  const publicMcpUrl = validatePublicMcpUrl(options.publicMcpUrl);
  const supabaseUrl = validateSupabaseUrl(options.supabaseUrl);
  validateSupabasePrometheeFacadeConfiguration({
    baseUrl: supabaseUrl.href,
    publishableKey: options.publishableKey,
  });
  if (!options.allowedHosts.includes(publicMcpUrl.host.toLowerCase())) {
    throw new TypeError("Host allowlist must contain the public MCP authority");
  }

  const issuer = new URL("/auth/v1", supabaseUrl).href;
  const clock = options.clock ?? systemClock;
  const policy = defineSlicePolicy(options.policy);
  const cursorCodec = new AesGcmCursorCodec(options.cursorKey, clock, policy);
  const tokenVerifier = options.tokenVerifier ?? createSupabaseJwtTokenVerifier({
    issuer,
    resource: publicMcpUrl.href,
    permissionsByClientId: options.permissionsByClientId,
  });
  const oauthMetadata: OAuthMetadata = {
    issuer,
    authorization_endpoint: new URL("/auth/v1/oauth/authorize", supabaseUrl).href,
    token_endpoint: new URL("/auth/v1/oauth/token", supabaseUrl).href,
    jwks_uri: new URL("/auth/v1/.well-known/jwks.json", supabaseUrl).href,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: OAUTH_SCOPES,
  };

  return createPrometheeRuntime({
    application: unavailableApplication(),
    createApplication({ principal, accessToken }) {
      return createApplication(new SupabasePrometheeFacade({
        baseUrl: supabaseUrl.href,
        publishableKey: options.publishableKey,
        principal,
        accessToken,
        policy,
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      }), cursorCodec, clock, policy);
    },
    authenticate: createBearerAuthenticator({
      verifier: tokenVerifier,
      resourceMetadataUrl: resourceMetadataUrl(publicMcpUrl),
    }),
    requestSecurityGate: createRequestSecurityGate({
      allowedHosts: options.allowedHosts,
      allowedOrigins: options.allowedOrigins,
      mcpPath: publicMcpUrl.pathname,
    }),
    oauthMetadata: createOAuthMetadataHandler({
      oauthMetadata,
      resourceServerUrl: publicMcpUrl,
      scopesSupported: OAUTH_SCOPES,
      resourceName: "Promethee MCP resource server",
    }),
    policy,
    ...(options.onError === undefined ? {} : { onError: options.onError }),
  });
}
