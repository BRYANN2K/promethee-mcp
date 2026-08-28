import { Buffer } from "node:buffer";
import { isAbsolute } from "node:path";

const DEPLOYMENT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,128}$/u;
const KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const PRODUCTION_VARIABLES = [
  "PROMETHEE_MCP_PUBLIC_URL",
  "PROMETHEE_MCP_PERSONAL_ACCESS_TOKEN",
  "PROMETHEE_MCP_EDGE_TOKEN",
  "PROMETHEE_MCP_CURSOR_KEY_BASE64URL",
  "PROMETHEE_MCP_SESSION_KEY_BASE64URL",
  "PROMETHEE_MCP_SESSION_FILE",
] as const;

export class PersonalCliConfigurationError extends Error {}

export interface PersonalProductionConfiguration {
  readonly bindHost: "127.0.0.1" | "0.0.0.0";
  readonly publicMcpUrl: string;
  readonly uiOrigins: readonly string[];
  readonly allowedHosts: readonly string[];
  readonly mcpAccessToken: string;
  readonly edgeToken: string;
  readonly cursorKey: Uint8Array;
  readonly sessionKey: Uint8Array;
  readonly sessionFile: string;
}

function required(environment: NodeJS.ProcessEnv, name: typeof PRODUCTION_VARIABLES[number]): string {
  const value = environment[name];
  if (value === undefined || value.length === 0) {
    throw new PersonalCliConfigurationError(`${name} is required in production personal mode.`);
  }
  return value;
}

function parsePublicMcpUrl(value: string): URL {
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
    throw new PersonalCliConfigurationError(
      "PROMETHEE_MCP_PUBLIC_URL must be an absolute HTTPS URL ending in /mcp.",
    );
  }
}

function parseDeploymentToken(value: string, name: string): string {
  if (!DEPLOYMENT_TOKEN_PATTERN.test(value)) {
    throw new PersonalCliConfigurationError(`${name} must be 43 to 128 Base64URL characters.`);
  }
  return value;
}

function parseKey(value: string, name: string): Uint8Array {
  if (!KEY_PATTERN.test(value)) {
    throw new PersonalCliConfigurationError(`${name} must encode exactly 32 bytes.`);
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.byteLength !== 32 || decoded.toString("base64url") !== value) {
    throw new PersonalCliConfigurationError(`${name} must encode exactly 32 bytes.`);
  }
  return new Uint8Array(decoded);
}

function parseSessionFile(value: string): string {
  if (!isAbsolute(value) || value.length > 4_096 || value.includes("\0")) {
    throw new PersonalCliConfigurationError("PROMETHEE_MCP_SESSION_FILE must be an absolute path.");
  }
  return value;
}

function parseBindHost(value: string | undefined): "127.0.0.1" | "0.0.0.0" {
  if (value === undefined || value === "127.0.0.1") return "127.0.0.1";
  if (value === "0.0.0.0") return value;
  throw new PersonalCliConfigurationError(
    "PROMETHEE_MCP_BIND_HOST must be 127.0.0.1 or 0.0.0.0 in production personal mode.",
  );
}

export function createPersonalProductionConfiguration(
  environment: NodeJS.ProcessEnv,
  loopbackAuthority: string,
): PersonalProductionConfiguration | null {
  const configured = PRODUCTION_VARIABLES.filter((name) => {
    const value = environment[name];
    return value !== undefined && value.length > 0;
  });
  if (configured.length === 0) {
    if (environment["PROMETHEE_MCP_BIND_HOST"] !== undefined) {
      throw new PersonalCliConfigurationError(
        "PROMETHEE_MCP_BIND_HOST requires complete production personal configuration.",
      );
    }
    return null;
  }

  const publicUrl = parsePublicMcpUrl(required(environment, "PROMETHEE_MCP_PUBLIC_URL"));
  return Object.freeze({
    bindHost: parseBindHost(environment["PROMETHEE_MCP_BIND_HOST"]),
    publicMcpUrl: publicUrl.href,
    uiOrigins: [publicUrl.origin],
    allowedHosts: [publicUrl.host.toLowerCase(), loopbackAuthority],
    mcpAccessToken: parseDeploymentToken(
      required(environment, "PROMETHEE_MCP_PERSONAL_ACCESS_TOKEN"),
      "PROMETHEE_MCP_PERSONAL_ACCESS_TOKEN",
    ),
    edgeToken: parseDeploymentToken(
      required(environment, "PROMETHEE_MCP_EDGE_TOKEN"),
      "PROMETHEE_MCP_EDGE_TOKEN",
    ),
    cursorKey: parseKey(
      required(environment, "PROMETHEE_MCP_CURSOR_KEY_BASE64URL"),
      "PROMETHEE_MCP_CURSOR_KEY_BASE64URL",
    ),
    sessionKey: parseKey(
      required(environment, "PROMETHEE_MCP_SESSION_KEY_BASE64URL"),
      "PROMETHEE_MCP_SESSION_KEY_BASE64URL",
    ),
    sessionFile: parseSessionFile(required(environment, "PROMETHEE_MCP_SESSION_FILE")),
  });
}
