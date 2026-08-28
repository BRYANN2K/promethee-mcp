import {
  OAuthError,
  OAuthErrorCode,
  type AuthInfo,
  type OAuthTokenVerifier,
} from "@modelcontextprotocol/server";

import {
  serializeAuthContext,
  type AuthContext,
  type SerializableAuthContext,
} from "./auth-context.js";

const PRINCIPAL_EXTRA_KEY = "prometheePrincipal";

export type TokenVerificationFailure =
  | "invalid_signature"
  | "invalid_header"
  | "invalid_claims"
  | "invalid_issuer"
  | "invalid_resource"
  | "invalid_client"
  | "invalid_scope"
  | "expired";

export class TokenVerificationError extends Error {
  public readonly failure: TokenVerificationFailure;

  public constructor(failure: TokenVerificationFailure) {
    super("Invalid access token");
    this.name = "TokenVerificationError";
    this.failure = failure;
  }
}

export interface TokenVerifier {
  verify(token: string): Promise<AuthContext>;
}

function isSerializableAuthContext(value: unknown): value is SerializableAuthContext {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate["subject"] === "string" &&
    typeof candidate["clientId"] === "string" &&
    typeof candidate["issuer"] === "string" &&
    typeof candidate["resource"] === "string" &&
    Array.isArray(candidate["scopes"]) &&
    candidate["scopes"].every((scope) => typeof scope === "string") &&
    typeof candidate["expiresAt"] === "number"
  );
}

export function authContextFromAuthInfo(authInfo: AuthInfo): AuthContext {
  const serialized = authInfo.extra?.[PRINCIPAL_EXTRA_KEY];
  if (!isSerializableAuthContext(serialized)) {
    throw new Error("Validated principal is unavailable");
  }

  return {
    subject: serialized.subject,
    clientId: serialized.clientId,
    issuer: serialized.issuer,
    resource: serialized.resource,
    scopes: new Set(serialized.scopes),
    expiresAt: serialized.expiresAt,
  };
}

export function toMcpOAuthTokenVerifier(verifier: TokenVerifier): OAuthTokenVerifier {
  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      try {
        const context = await verifier.verify(token);
        return {
          token,
          clientId: context.clientId,
          scopes: [...context.scopes],
          expiresAt: context.expiresAt,
          resource: new URL(context.resource),
          extra: {
            [PRINCIPAL_EXTRA_KEY]: serializeAuthContext(context),
          },
        };
      } catch (error) {
        if (error instanceof TokenVerificationError) {
          throw new OAuthError(OAuthErrorCode.InvalidToken, "Invalid access token");
        }
        throw new OAuthError(OAuthErrorCode.ServerError, "Token verification failed");
      }
    },
  };
}
