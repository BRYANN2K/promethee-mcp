import {
  OAuthError,
  OAuthErrorCode,
  bearerAuthChallengeResponse,
  requireBearerAuth,
  type AuthInfo,
} from "@modelcontextprotocol/server";

import type { AuthContext } from "./auth-context.js";
import {
  authContextFromAuthInfo,
  toMcpOAuthTokenVerifier,
  type TokenVerifier,
} from "./token-verifier.js";

const MAX_AUTHORIZATION_HEADER_LENGTH = 8_192;
const COMPACT_JWT_PATTERN = /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/iu;

export interface AuthenticatedRequest {
  readonly authInfo: AuthInfo;
  readonly principal: AuthContext;
}

export interface BearerAuthenticatorOptions {
  readonly verifier: TokenVerifier;
  readonly resourceMetadataUrl: string;
  readonly requiredScopes?: readonly string[];
}

function invalidTokenResponse(options: BearerAuthenticatorOptions): Response {
  return bearerAuthChallengeResponse(
    new OAuthError(OAuthErrorCode.InvalidToken, "Invalid access token"),
    {
      requiredScopes: options.requiredScopes === undefined ? [] : [...options.requiredScopes],
      resourceMetadataUrl: options.resourceMetadataUrl,
    },
  );
}

function isStrictBearerHeader(value: string): boolean {
  return (
    value.length <= MAX_AUTHORIZATION_HEADER_LENGTH &&
    !value.includes(",") &&
    COMPACT_JWT_PATTERN.test(value)
  );
}

export function createBearerAuthenticator(
  options: BearerAuthenticatorOptions,
): (request: Request) => Promise<AuthenticatedRequest | Response> {
  const requiredScopes = options.requiredScopes === undefined ? [] : [...options.requiredScopes];
  const sdkGate = requireBearerAuth({
    verifier: toMcpOAuthTokenVerifier(options.verifier),
    requiredScopes,
    resourceMetadataUrl: options.resourceMetadataUrl,
  });

  return async (request: Request): Promise<AuthenticatedRequest | Response> => {
    const authorization = request.headers.get("authorization");
    if (authorization !== null && !isStrictBearerHeader(authorization)) {
      return invalidTokenResponse(options);
    }

    const authInfo = await sdkGate(request);
    if (authInfo instanceof Response) {
      return authInfo;
    }

    try {
      return {
        authInfo,
        principal: authContextFromAuthInfo(authInfo),
      };
    } catch {
      return Response.json(
        { error: "server_error", error_description: "Internal Server Error" },
        { status: 500 },
      );
    }
  };
}
