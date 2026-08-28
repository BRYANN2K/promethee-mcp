import { Buffer } from "node:buffer";

import { validateSupabasePrometheeFacadeConfiguration } from "../adapters/supabase/index.js";
import { TOOL_SCOPE } from "../application/tool-registry.js";
import { defineSlicePolicy, type SlicePolicy } from "../policy/slice-policy.js";

export const PROMETHEE_SUPABASE_URL = "https://auth.promethee.io/";
const MAX_JSON_BYTES = 16 * 1024;
const MAX_URL_BYTES = 2 * 1024;
const MAX_ORIGINS = 16;
const MAX_CLIENTS = 64;
const CLIENT_ID_PATTERN = /^[A-Za-z0-9._:-]{1,256}$/u;
const ALLOWED_TOOL_SCOPES = new Set<string>(Object.values(TOOL_SCOPE));

export class SupabaseCliConfigurationError extends Error {}

export interface SupabaseCliConfiguration {
  readonly publicMcpUrl: string;
  readonly supabaseUrl: string;
  readonly publishableKey: string;
  readonly permissionsByClientId: ReadonlyMap<string, ReadonlySet<string>>;
  readonly allowedHosts: readonly string[];
  readonly allowedOrigins: readonly string[];
  readonly cursorKey: Uint8Array;
  readonly policy: SlicePolicy;
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (value === undefined || value.length === 0) {
    throw new SupabaseCliConfigurationError(`${name} is required in supabase mode.`);
  }
  return value;
}

function parsePublicMcpUrl(value: string): URL {
  if (Buffer.byteLength(value, "utf8") > MAX_URL_BYTES || value.includes("\\")) {
    throw new SupabaseCliConfigurationError("PROMETHEE_MCP_PUBLIC_URL is invalid.");
  }
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.pathname !== "/mcp" ||
      parsed.search !== "" ||
      parsed.hash !== ""
    ) {
      throw new Error("invalid");
    }
    return parsed;
  } catch {
    throw new SupabaseCliConfigurationError(
      "PROMETHEE_MCP_PUBLIC_URL must be an absolute HTTPS URL ending in /mcp.",
    );
  }
}

function parseCursorKey(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(value)) {
    throw new SupabaseCliConfigurationError(
      "PROMETHEE_MCP_CURSOR_KEY_BASE64URL must encode exactly 32 bytes.",
    );
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.byteLength !== 32 || decoded.toString("base64url") !== value) {
    throw new SupabaseCliConfigurationError(
      "PROMETHEE_MCP_CURSOR_KEY_BASE64URL must encode exactly 32 bytes.",
    );
  }
  return new Uint8Array(decoded);
}

function parseJson(value: string, name: string): unknown {
  if (Buffer.byteLength(value, "utf8") > MAX_JSON_BYTES) {
    throw new SupabaseCliConfigurationError(`${name} is too large.`);
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new SupabaseCliConfigurationError(`${name} must be valid JSON.`);
  }
}

function parseClientPolicy(value: string): ReadonlyMap<string, ReadonlySet<string>> {
  const parsed = parseJson(value, "PROMETHEE_MCP_CLIENT_POLICY_JSON");
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new SupabaseCliConfigurationError("PROMETHEE_MCP_CLIENT_POLICY_JSON is invalid.");
  }
  const entries = Object.entries(parsed);
  if (entries.length === 0 || entries.length > MAX_CLIENTS) {
    throw new SupabaseCliConfigurationError("PROMETHEE_MCP_CLIENT_POLICY_JSON is invalid.");
  }

  const policy = new Map<string, ReadonlySet<string>>();
  for (const [clientId, rawScopes] of entries) {
    if (!CLIENT_ID_PATTERN.test(clientId) || !Array.isArray(rawScopes) || rawScopes.length === 0) {
      throw new SupabaseCliConfigurationError("PROMETHEE_MCP_CLIENT_POLICY_JSON is invalid.");
    }
    if (rawScopes.some((scope) => typeof scope !== "string" || !ALLOWED_TOOL_SCOPES.has(scope))) {
      throw new SupabaseCliConfigurationError("PROMETHEE_MCP_CLIENT_POLICY_JSON is invalid.");
    }
    const scopes = new Set(rawScopes as string[]);
    if (scopes.size !== rawScopes.length) {
      throw new SupabaseCliConfigurationError("PROMETHEE_MCP_CLIENT_POLICY_JSON is invalid.");
    }
    policy.set(clientId, scopes);
  }
  return policy;
}

function parseSlicePolicy(value: string): SlicePolicy {
  const parsed = parseJson(value, "PROMETHEE_MCP_SLICE_POLICY_JSON");
  try {
    return defineSlicePolicy(parsed);
  } catch {
    throw new SupabaseCliConfigurationError("PROMETHEE_MCP_SLICE_POLICY_JSON is invalid.");
  }
}

function parseAllowedOrigins(value: string | undefined, publicOrigin: string): readonly string[] {
  const rawOrigins = value === undefined || value.length === 0 ? [] : value.split(",");
  if (rawOrigins.length > MAX_ORIGINS) {
    throw new SupabaseCliConfigurationError("PROMETHEE_MCP_ALLOWED_ORIGINS is invalid.");
  }
  const origins = new Set<string>([publicOrigin]);
  for (const rawOrigin of rawOrigins) {
    if (Buffer.byteLength(rawOrigin, "utf8") > MAX_URL_BYTES || rawOrigin !== rawOrigin.trim()) {
      throw new SupabaseCliConfigurationError("PROMETHEE_MCP_ALLOWED_ORIGINS is invalid.");
    }
    try {
      const parsed = new URL(rawOrigin);
      if (
        parsed.protocol !== "https:" ||
        parsed.username !== "" ||
        parsed.password !== "" ||
        parsed.pathname !== "/" ||
        parsed.search !== "" ||
        parsed.hash !== "" ||
        parsed.origin !== rawOrigin.toLowerCase()
      ) {
        throw new Error("invalid");
      }
      origins.add(parsed.origin);
    } catch {
      throw new SupabaseCliConfigurationError("PROMETHEE_MCP_ALLOWED_ORIGINS is invalid.");
    }
  }
  return [...origins];
}

export function createSupabaseCliConfiguration(
  environment: NodeJS.ProcessEnv,
  loopbackAuthority: string,
): SupabaseCliConfiguration {
  const publicUrl = parsePublicMcpUrl(required(environment, "PROMETHEE_MCP_PUBLIC_URL"));
  const publishableKey = required(environment, "PROMETHEE_SUPABASE_PUBLISHABLE_KEY");
  try {
    validateSupabasePrometheeFacadeConfiguration({
      baseUrl: PROMETHEE_SUPABASE_URL,
      publishableKey,
    });
  } catch {
    throw new SupabaseCliConfigurationError("PROMETHEE_SUPABASE_PUBLISHABLE_KEY is invalid.");
  }

  return Object.freeze({
    publicMcpUrl: publicUrl.href,
    supabaseUrl: PROMETHEE_SUPABASE_URL,
    publishableKey,
    permissionsByClientId: parseClientPolicy(
      required(environment, "PROMETHEE_MCP_CLIENT_POLICY_JSON"),
    ),
    allowedHosts: [...new Set([publicUrl.host.toLowerCase(), loopbackAuthority])],
    allowedOrigins: parseAllowedOrigins(
      environment["PROMETHEE_MCP_ALLOWED_ORIGINS"],
      publicUrl.origin,
    ),
    cursorKey: parseCursorKey(required(environment, "PROMETHEE_MCP_CURSOR_KEY_BASE64URL")),
    policy: parseSlicePolicy(required(environment, "PROMETHEE_MCP_SLICE_POLICY_JSON")),
  });
}
