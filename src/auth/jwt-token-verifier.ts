import {
  createLocalJWKSet,
  errors as joseErrors,
  jwtVerify,
  type JSONWebKeySet,
  type JWTPayload,
} from "jose";

import type { AuthContext } from "./auth-context.js";
import {
  TokenVerificationError,
  type TokenVerificationFailure,
  type TokenVerifier,
} from "./token-verifier.js";

const ACCESS_TOKEN_TYPE = "at+jwt";
const SIGNING_ALGORITHM = "RS256";
const MAX_IDENTIFIER_LENGTH = 256;
const MAX_KEY_ID_LENGTH = 128;
const SCOPE_PATTERN = /^[A-Za-z0-9._:-]+(?: [A-Za-z0-9._:-]+)*$/u;
const SINGLE_SCOPE_PATTERN = /^[A-Za-z0-9._:-]+$/u;

export interface SyntheticJwtTokenVerifierOptions {
  readonly issuer: string;
  readonly resource: string;
  readonly jwks: JSONWebKeySet;
  readonly allowedClientIds: ReadonlySet<string>;
  readonly allowedScopes: ReadonlySet<string>;
  readonly clock?: () => number;
  readonly clockToleranceSeconds?: number;
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

function parseScopes(value: unknown, allowedScopes: ReadonlySet<string>): ReadonlySet<string> {
  if (typeof value !== "string" || !SCOPE_PATTERN.test(value)) {
    throw new TokenVerificationError("invalid_scope");
  }

  const values = value.split(" ");
  const scopes = new Set(values);
  if (scopes.size !== values.length || values.some((scope) => !allowedScopes.has(scope))) {
    throw new TokenVerificationError("invalid_scope");
  }
  return scopes;
}

function validateConfiguredUrl(value: string, label: "issuer" | "resource"): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError(`Synthetic ${label} must be an absolute URL`);
  }

  if (
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.hash !== "" ||
    parsed.search !== "" ||
    value.includes("\\")
  ) {
    throw new TypeError(`Synthetic ${label} URL contains a forbidden component`);
  }
  return parsed.href;
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

function rejectAttackerSelectedKeys(header: Record<string, unknown>): void {
  for (const field of ["jku", "jwk", "x5u", "x5c"] as const) {
    if (header[field] !== undefined) {
      throw new TokenVerificationError("invalid_header");
    }
  }
}

function validatePayload(
  payload: JWTPayload,
  options: {
    readonly issuer: string;
    readonly resource: string;
    readonly allowedClientIds: ReadonlySet<string>;
    readonly allowedScopes: ReadonlySet<string>;
    readonly now: number;
    readonly tolerance: number;
  },
): AuthContext {
  if (payload.iss !== options.issuer) {
    throw new TokenVerificationError("invalid_issuer");
  }
  if (typeof payload.aud !== "string" || payload.aud !== options.resource) {
    throw new TokenVerificationError("invalid_resource");
  }

  const subject = requireBoundedIdentifier(payload.sub, "invalid_claims");
  const clientId = requireBoundedIdentifier(payload["client_id"], "invalid_client");
  if (!options.allowedClientIds.has(clientId)) {
    throw new TokenVerificationError("invalid_client");
  }

  const expiresAt = requireIntegerTimestamp(payload.exp);
  const issuedAt = requireIntegerTimestamp(payload.iat);
  if (expiresAt <= options.now - options.tolerance) {
    throw new TokenVerificationError("expired");
  }
  if (issuedAt > options.now + options.tolerance || issuedAt >= expiresAt) {
    throw new TokenVerificationError("invalid_claims");
  }
  if (payload.nbf !== undefined) {
    requireIntegerTimestamp(payload.nbf);
  }

  return {
    subject,
    clientId,
    issuer: options.issuer,
    resource: options.resource,
    scopes: parseScopes(payload["scope"], options.allowedScopes),
    expiresAt,
  };
}

/**
 * Creates a strictly local verifier for synthetic development fixtures.
 *
 * A caller supplies an in-memory JWKS. This module performs no metadata or
 * network discovery and therefore cannot be pointed at Promethee by accident.
 */
export function createSyntheticJwtTokenVerifier(
  options: SyntheticJwtTokenVerifierOptions,
): TokenVerifier {
  if (options.allowedClientIds.size === 0 || options.allowedScopes.size === 0) {
    throw new TypeError("Synthetic verifier allowlists must not be empty");
  }
  for (const clientId of options.allowedClientIds) {
    if (
      clientId.length === 0 ||
      clientId.length > MAX_IDENTIFIER_LENGTH ||
      clientId.trim() !== clientId
    ) {
      throw new TypeError("Synthetic verifier contains an invalid client identifier");
    }
  }
  for (const scope of options.allowedScopes) {
    if (!SINGLE_SCOPE_PATTERN.test(scope)) {
      throw new TypeError("Synthetic verifier contains an invalid allowed scope");
    }
  }
  if (options.jwks.keys.length === 0) {
    throw new TypeError("Synthetic JWKS must contain at least one public signing key");
  }
  const keyIds = new Set<string>();
  for (const key of options.jwks.keys) {
    if (
      key.kty !== "RSA" ||
      key.alg !== SIGNING_ALGORITHM ||
      key.use !== "sig" ||
      typeof key.kid !== "string" ||
      key.kid.length === 0 ||
      key.kid.length > MAX_KEY_ID_LENGTH ||
      keyIds.has(key.kid) ||
      key.d !== undefined
    ) {
      throw new TypeError("Synthetic JWKS must contain public RS256 signing keys");
    }
    keyIds.add(key.kid);
  }

  const issuer = validateConfiguredUrl(options.issuer, "issuer");
  const resource = validateConfiguredUrl(options.resource, "resource");
  const allowedClientIds = new Set(options.allowedClientIds);
  const allowedScopes = new Set(options.allowedScopes);
  const clock = options.clock ?? (() => Date.now() / 1_000);
  const tolerance = options.clockToleranceSeconds ?? 5;
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 60) {
    throw new TypeError("Clock tolerance must be between 0 and 60 seconds");
  }
  const keySet = createLocalJWKSet(options.jwks);

  return {
    async verify(token: string): Promise<AuthContext> {
      try {
        const now = clock();
        if (!Number.isFinite(now) || now < 0) {
          throw new Error("Synthetic verifier clock is invalid");
        }

        const { payload, protectedHeader } = await jwtVerify(token, keySet, {
          algorithms: [SIGNING_ALGORITHM],
          audience: resource,
          issuer,
          typ: ACCESS_TOKEN_TYPE,
          currentDate: new Date(now * 1_000),
          clockTolerance: tolerance,
        });

        if (
          protectedHeader.alg !== SIGNING_ALGORITHM ||
          protectedHeader.typ !== ACCESS_TOKEN_TYPE ||
          typeof protectedHeader.kid !== "string" ||
          protectedHeader.kid.length === 0 ||
          protectedHeader.kid.length > MAX_KEY_ID_LENGTH
        ) {
          throw new TokenVerificationError("invalid_header");
        }
        rejectAttackerSelectedKeys(protectedHeader);

        return validatePayload(payload, {
          issuer,
          resource,
          allowedClientIds,
          allowedScopes,
          now,
          tolerance,
        });
      } catch (error) {
        if (error instanceof TokenVerificationError) {
          throw error;
        }
        throw new TokenVerificationError(classifyJoseError(error));
      }
    },
  };
}
