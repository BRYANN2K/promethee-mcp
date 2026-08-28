import {
  hostHeaderValidationResponse,
  originValidationResponse,
} from "@modelcontextprotocol/server";

export interface RequestSecurityOptions {
  /** Exact authorities, including the port when one is expected. */
  readonly allowedHosts: readonly string[];
  /** Exact serialized origins, for example `http://127.0.0.1:3000`. */
  readonly allowedOrigins: readonly string[];
  /** The only route on which Streamable HTTP Origin checks apply. */
  readonly mcpPath?: string;
}

interface CompiledRequestSecurityOptions {
  readonly allowedHosts: ReadonlySet<string>;
  readonly allowedOrigins: ReadonlySet<string>;
  readonly sdkHostnames: string[];
  readonly sdkOriginHostnames: string[];
  readonly mcpPath: string;
}

function forbidden(): Response {
  return Response.json(
    {
      jsonrpc: "2.0",
      error: { code: -32_000, message: "Forbidden" },
      id: null,
    },
    { status: 403, headers: { "Content-Type": "application/json" } },
  );
}

function parseStrictHost(value: string): { readonly authority: string; readonly hostname: string } {
  if (
    value.length === 0 ||
    value !== value.trim() ||
    /[,\\/@?#]/u.test(value) ||
    /\s/u.test(value)
  ) {
    throw new TypeError("Host allowlist contains an invalid authority");
  }

  let parsed: URL;
  try {
    parsed = new URL(`http://${value}`);
  } catch {
    throw new TypeError("Host allowlist contains an invalid authority");
  }

  if (
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    parsed.host !== value.toLowerCase()
  ) {
    throw new TypeError("Host allowlist contains a non-canonical authority");
  }
  return { authority: parsed.host, hostname: parsed.hostname };
}

function parseStrictOrigin(value: string): { readonly origin: string; readonly hostname: string } {
  if (
    value.length === 0 ||
    value === "null" ||
    value !== value.trim() ||
    /[,\\]/u.test(value) ||
    /\s/u.test(value)
  ) {
    throw new TypeError("Origin allowlist contains an invalid origin");
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError("Origin allowlist contains an invalid origin");
  }

  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    parsed.origin !== value.toLowerCase()
  ) {
    throw new TypeError("Origin allowlist contains a non-canonical origin");
  }
  return { origin: parsed.origin, hostname: parsed.hostname };
}

function compileOptions(options: RequestSecurityOptions): CompiledRequestSecurityOptions {
  if (options.allowedHosts.length === 0 || options.allowedOrigins.length === 0) {
    throw new TypeError("Host and Origin allowlists must not be empty");
  }

  const hosts = options.allowedHosts.map(parseStrictHost);
  const origins = options.allowedOrigins.map(parseStrictOrigin);
  const mcpPath = options.mcpPath ?? "/mcp";
  if (!mcpPath.startsWith("/") || mcpPath.includes("\\") || mcpPath.includes("?")) {
    throw new TypeError("MCP path must be an absolute URL path");
  }
  return {
    allowedHosts: new Set(hosts.map(({ authority }) => authority)),
    allowedOrigins: new Set(origins.map(({ origin }) => origin)),
    sdkHostnames: [...new Set(hosts.map(({ hostname }) => hostname))],
    sdkOriginHostnames: [...new Set(origins.map(({ hostname }) => hostname))],
    mcpPath,
  };
}

function strictRequestHeadersPass(
  request: Request,
  options: CompiledRequestSecurityOptions,
): boolean {
  const host = request.headers.get("host");
  if (host === null) {
    return false;
  }

  let parsedHost: ReturnType<typeof parseStrictHost>;
  try {
    parsedHost = parseStrictHost(host.toLowerCase());
  } catch {
    return false;
  }
  if (!options.allowedHosts.has(parsedHost.authority)) {
    return false;
  }

  if (new URL(request.url).pathname !== options.mcpPath || !request.headers.has("origin")) {
    return true;
  }
  const origin = request.headers.get("origin");
  if (origin === null) {
    return false;
  }

  let parsedOrigin: ReturnType<typeof parseStrictOrigin>;
  try {
    parsedOrigin = parseStrictOrigin(origin.toLowerCase());
  } catch {
    return false;
  }
  return options.allowedOrigins.has(parsedOrigin.origin);
}

/**
 * Rejects ambiguous Host/Origin serializations before invoking SDK helpers.
 * The SDK then supplies its own DNS-rebinding checks as defense in depth.
 */
export function createRequestSecurityGate(
  rawOptions: RequestSecurityOptions,
): (request: Request) => Response | undefined {
  const options = compileOptions(rawOptions);

  return (request: Request): Response | undefined => {
    if (!strictRequestHeadersPass(request, options)) {
      return forbidden();
    }

    return (
      hostHeaderValidationResponse(request, options.sdkHostnames) ??
      (new URL(request.url).pathname === options.mcpPath
        ? originValidationResponse(request, options.sdkOriginHostnames)
        : undefined)
    );
  };
}
