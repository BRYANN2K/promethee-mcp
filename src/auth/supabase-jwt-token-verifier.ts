import {
  createLocalJWKSet,
  createRemoteJWKSet,
  errors as joseErrors,
  jwtVerify,
  type JSONWebKeySet,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";

import type { AuthContext } from "./auth-context.js";
import {
  TokenVerificationError,
  type TokenVerificationFailure,
  type TokenVerifier,
} from "./token-verifier.js";

const SUPABASE_ACCESS_TOKEN_TYPE = "JWT";
const SUPABASE_ROLE = "authenticated";
const ALLOWED_ALGORITHMS = ["ES256", "RS256"] as const;
const MAX_IDENTIFIER_LENGTH = 256;
const MAX_KEY_ID_LENGTH = 128;
const PERMISSION_PATTERN = /^[A-Za-z0-9._:-]+$/u;
const SCOPE_PATTERN = /^[A-Za-z0-9._:-]+(?: [A-Za-z0-9._:-]+)*$/u;
const DEFAULT_JWKS_TIMEOUT_MS = 5_000;
const DEFAULT_JWKS_COOLDOWN_MS = 30_000;
const DEFAULT_JWKS_CACHE_MS = 600_000;

interface SupabaseJwtPolicyOptions {
  readonly issuer: string;
  readonly resource: string;
  readonly permissionsByClientId: ReadonlyMap<string, ReadonlySet<string>>;
  readonly clock?: () => number;
  readonly clockToleranceSeconds?: number;
}

export interface SupabaseJwtTokenVerifierOptions extends SupabaseJwtPolicyOptions {
  readonly jwksTimeoutMs?: number;
  readonly jwksCooldownMs?: number;
  readonly jwksCacheMs?: number;
}

export interface SupabaseJwtTokenVerifierFromJwksOptions extends SupabaseJwtPolicyOptions {
  readonly jwks: JSONWebKeySet;
}

interface ValidatedPolicy {
  readonly issuer: string;
  readonly resource: string;
  readonly permissionsByClientId: ReadonlyMap<string, ReadonlySet<string>>;
  readonly clock: () => number;
  readonly clockToleranceSeconds: number;
}

function validateHttpsUrl(value: string, label: "issuer" | "resource"): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError(`Supabase ${label} must be an absolute HTTPS URL`);
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    value.includes("\\")
  ) {
    throw new TypeError(`Supabase ${label} must be an absolute HTTPS URL`);
  }
  if (label === "issuer" && !parsed.pathname.endsWith("/auth/v1")) {
    throw new TypeError("Supabase issuer must end with /auth/v1");
  }
  return parsed;
}

function validateBoundedInteger(
  value: number | undefined,
  fallback: number,
  label: string,
  maximum: number,
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 0 || resolved > maximum) {
    throw new TypeError(`${label} is outside the supported range`);
  }
  return resolved;
}

function validatePolicy(options: SupabaseJwtPolicyOptions): ValidatedPolicy {
  const issuerUrl = validateHttpsUrl(options.issuer, "issuer");
  const resourceUrl = validateHttpsUrl(options.resource, "resource");
  if (options.permissionsByClientId.size === 0) {
    throw new TypeError("At least one approved Supabase OAuth client is required");
  }

  const permissionsByClientId = new Map<string, ReadonlySet<string>>();
  for (const [clientId, configuredPermissions] of options.permissionsByClientId) {
    if (
      clientId.length === 0 ||
      clientId.length > MAX_IDENTIFIER_LENGTH ||
      clientId.trim() !== clientId ||
      configuredPermissions.size === 0
    ) {
      throw new TypeError("Supabase OAuth client policy is invalid");
    }
    const permissions = new Set(configuredPermissions);
    if ([...permissions].some((permission) => !PERMISSION_PATTERN.test(permission))) {
      throw new TypeError("Supabase OAuth client permission is invalid");
    }
    permissionsByClientId.set(clientId, permissions);
  }

  const clockToleranceSeconds = validateBoundedInteger(
    options.clockToleranceSeconds,
    5,
    "Supabase token clock tolerance",
    60,
  );

  return {
    issuer: issuerUrl.href,
    resource: resourceUrl.href,
    permissionsByClientId,
    clock: options.clock ?? (() => Date.now() / 1_000),
    clockToleranceSeconds,
  };
}

function requireBoundedIdentifier(value: unknown, failure: TokenVerificationFailure): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_IDENTIFIER_LENGTH ||
    value.trim() !== value
  ) {
    throw new TokenVerificationError(failure);
  }
  return value;
}

function requireIntegerTimestamp(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TokenVerificationError("invalid_claims");
  }
  return value;
}

function grantedPermissions(
  rawScope: unknown,
  allowedPermissions: ReadonlySet<string>,
): ReadonlySet<string> {
  if (typeof rawScope !== "string" || !SCOPE_PATTERN.test(rawScope)) {
    throw new TokenVerificationError("invalid_scope");
  }
  const values = rawScope.split(" ");
  const unique = new Set(values);
  if (unique.size !== values.length) throw new TokenVerificationError("invalid_scope");
  return new Set([...allowedPermissions].filter((permission) => unique.has(permission)));
}

function rejectAttackerSelectedKeys(header: Record<string, unknown>): void {
  for (const field of ["jku", "jwk", "x5u", "x5c"] as const) {
    if (header[field] !== undefined) {
      throw new TokenVerificationError("invalid_header");
    }
  }
}

function classifyJoseError(error: unknown): TokenVerificationFailure {
  if (error instanceof joseErrors.JWTExpired) {
    return "expired";
  }
  if (
    error instanceof joseErrors.JWSSignatureVerificationFailed ||
    error instanceof joseErrors.JWKSNoMatchingKey ||
    error instanceof joseErrors.JWKSMultipleMatchingKeys
  ) {
    return "invalid_signature";
  }
  return "invalid_claims";
}

function validatePayload(
  payload: JWTPayload,
  policy: ValidatedPolicy,
  now: number,
): AuthContext {
  if (payload.iss !== policy.issuer) {
    throw new TokenVerificationError("invalid_issuer");
  }
  if (typeof payload.aud !== "string" || payload.aud !== policy.resource) {
    throw new TokenVerificationError("invalid_resource");
  }

  const subject = requireBoundedIdentifier(payload.sub, "invalid_claims");
  if (payload["user_id"] !== subject || payload["role"] !== SUPABASE_ROLE) {
    throw new TokenVerificationError("invalid_claims");
  }

  const clientId = requireBoundedIdentifier(payload["client_id"], "invalid_client");
  const permissions = policy.permissionsByClientId.get(clientId);
  if (permissions === undefined) {
    throw new TokenVerificationError("invalid_client");
  }

  const expiresAt = requireIntegerTimestamp(payload.exp);
  const issuedAt = requireIntegerTimestamp(payload.iat);
  if (expiresAt <= now - policy.clockToleranceSeconds) {
    throw new TokenVerificationError("expired");
  }
  if (issuedAt > now + policy.clockToleranceSeconds || issuedAt >= expiresAt) {
    throw new TokenVerificationError("invalid_claims");
  }

  return {
    subject,
    clientId,
    issuer: policy.issuer,
    resource: policy.resource,
    scopes: grantedPermissions(payload["scope"], permissions),
    expiresAt,
  };
}

function createVerifier(policy: ValidatedPolicy, keySet: JWTVerifyGetKey): TokenVerifier {
  return {
    async verify(token: string): Promise<AuthContext> {
      try {
        const now = policy.clock();
        if (!Number.isFinite(now) || now < 0) {
          throw new Error("Supabase verifier clock is invalid");
        }

        const { payload, protectedHeader } = await jwtVerify(token, keySet, {
          algorithms: [...ALLOWED_ALGORITHMS],
          audience: policy.resource,
          issuer: policy.issuer,
          typ: SUPABASE_ACCESS_TOKEN_TYPE,
          currentDate: new Date(now * 1_000),
          clockTolerance: policy.clockToleranceSeconds,
          requiredClaims: ["sub", "user_id", "role", "client_id", "iat", "exp"],
        });

        if (
          !ALLOWED_ALGORITHMS.includes(
            protectedHeader.alg as (typeof ALLOWED_ALGORITHMS)[number],
          ) ||
          protectedHeader.typ !== SUPABASE_ACCESS_TOKEN_TYPE ||
          typeof protectedHeader.kid !== "string" ||
          protectedHeader.kid.length === 0 ||
          protectedHeader.kid.length > MAX_KEY_ID_LENGTH ||
          protectedHeader.crit !== undefined
        ) {
          throw new TokenVerificationError("invalid_header");
        }
        rejectAttackerSelectedKeys(protectedHeader);

        return validatePayload(payload, policy, now);
      } catch (error) {
        if (error instanceof TokenVerificationError) {
          throw error;
        }
        throw new TokenVerificationError(classifyJoseError(error));
      }
    },
  };
}

function validateLocalJwks(jwks: JSONWebKeySet): void {
  if (jwks.keys.length === 0) {
    throw new TypeError("Supabase JWKS must contain at least one public signing key");
  }
  const keyIds = new Set<string>();
  for (const key of jwks.keys) {
    const isAllowedKey =
      (key.kty === "EC" && key.alg === "ES256" && key.crv === "P-256") ||
      (key.kty === "RSA" && key.alg === "RS256");
    if (
      !isAllowedKey ||
      key.use !== "sig" ||
      typeof key.kid !== "string" ||
      key.kid.length === 0 ||
      key.kid.length > MAX_KEY_ID_LENGTH ||
      keyIds.has(key.kid) ||
      key.d !== undefined
    ) {
      throw new TypeError("Supabase JWKS must contain unique public ES256 or RS256 signing keys");
    }
    keyIds.add(key.kid);
  }
}

/**
 * Creates a verifier that discovers only the fixed Supabase issuer's public
 * asymmetric signing keys. The issuer, JWKS origin, MCP audience, OAuth client
 * IDs, and MCP permissions are operator configuration, never request input.
 */
export function createSupabaseJwtTokenVerifier(
  options: SupabaseJwtTokenVerifierOptions,
): TokenVerifier {
  const policy = validatePolicy(options);
  const issuerUrl = new URL(policy.issuer);
  const jwksUrl = new URL(`${issuerUrl.pathname.replace(/\/$/u, "")}/.well-known/jwks.json`, issuerUrl);
  const keySet = createRemoteJWKSet(jwksUrl, {
    timeoutDuration: validateBoundedInteger(
      options.jwksTimeoutMs,
      DEFAULT_JWKS_TIMEOUT_MS,
      "Supabase JWKS timeout",
      30_000,
    ),
    cooldownDuration: validateBoundedInteger(
      options.jwksCooldownMs,
      DEFAULT_JWKS_COOLDOWN_MS,
      "Supabase JWKS cooldown",
      3_600_000,
    ),
    cacheMaxAge: validateBoundedInteger(
      options.jwksCacheMs,
      DEFAULT_JWKS_CACHE_MS,
      "Supabase JWKS cache lifetime",
      3_600_000,
    ),
  });
  return createVerifier(policy, keySet);
}

/** In-memory-key variant for synthetic tests. It performs no discovery. */
export function createSupabaseJwtTokenVerifierFromJwks(
  options: SupabaseJwtTokenVerifierFromJwksOptions,
): TokenVerifier {
  validateLocalJwks(options.jwks);
  return createVerifier(validatePolicy(options), createLocalJWKSet(options.jwks));
}
