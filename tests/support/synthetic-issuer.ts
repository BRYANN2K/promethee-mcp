import {
  SignJWT,
  exportJWK,
  generateKeyPair,
  type JSONWebKeySet,
  type JWSHeaderParameters,
  type JWTPayload,
} from "jose";

export interface SyntheticTokenOverrides {
  readonly claims?: JWTPayload;
  readonly protectedHeader?: Partial<JWSHeaderParameters>;
}

export interface SyntheticIssuer {
  readonly issuer: string;
  readonly resource: string;
  readonly clientId: string;
  readonly keyId: string;
  readonly jwks: JSONWebKeySet;
  issue(overrides?: SyntheticTokenOverrides): Promise<string>;
}

export interface SyntheticIssuerOptions {
  readonly now: number;
  readonly issuer?: string;
  readonly resource?: string;
  readonly clientId?: string;
  readonly keyId?: string;
}

export interface SyntheticSupabaseIssuerOptions {
  readonly now: number;
  readonly issuer?: string;
  readonly resource?: string;
  readonly clientId?: string;
  readonly keyId?: string;
}

export async function createSyntheticIssuer(
  options: SyntheticIssuerOptions,
): Promise<SyntheticIssuer> {
  const issuer = new URL(options.issuer ?? "http://127.0.0.1:4100").href;
  const resource = new URL(options.resource ?? "http://127.0.0.1:3000/mcp").href;
  const clientId = options.clientId ?? "synthetic-client";
  const keyId = options.keyId ?? "synthetic-rs256-key";
  const { privateKey, publicKey } = await generateKeyPair("RS256", {
    extractable: true,
  });
  const publicJwk = await exportJWK(publicKey);
  const jwks: JSONWebKeySet = {
    keys: [{ ...publicJwk, alg: "RS256", kid: keyId, use: "sig" }],
  };

  return {
    issuer,
    resource,
    clientId,
    keyId,
    jwks,
    async issue(overrides: SyntheticTokenOverrides = {}): Promise<string> {
      const payload: JWTPayload = {
        iss: issuer,
        sub: "synthetic-user-a",
        aud: resource,
        iat: options.now,
        exp: options.now + 300,
        client_id: clientId,
        scope: "tasks:read",
        ...overrides.claims,
      };
      return new SignJWT(payload)
        .setProtectedHeader({
          alg: "RS256",
          typ: "at+jwt",
          kid: keyId,
          ...overrides.protectedHeader,
        })
        .sign(privateKey);
    },
  };
}

/**
 * Produces an in-memory approximation of the asymmetric Supabase OAuth access
 * token documented for MCP integrations. It never contacts a Supabase origin.
 */
export async function createSyntheticSupabaseIssuer(
  options: SyntheticSupabaseIssuerOptions,
): Promise<SyntheticIssuer> {
  const issuer = new URL(options.issuer ?? "https://synthetic.supabase.invalid/auth/v1").href;
  const resource = new URL(options.resource ?? "https://mcp.synthetic.invalid/mcp").href;
  const clientId = options.clientId ?? "synthetic-mcp-client";
  const keyId = options.keyId ?? "synthetic-es256-key";
  const { privateKey, publicKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  const publicJwk = await exportJWK(publicKey);
  const jwks: JSONWebKeySet = {
    keys: [{ ...publicJwk, alg: "ES256", kid: keyId, use: "sig" }],
  };

  return {
    issuer,
    resource,
    clientId,
    keyId,
    jwks,
    async issue(overrides: SyntheticTokenOverrides = {}): Promise<string> {
      const subject = "synthetic-user-a";
      const payload: JWTPayload = {
        iss: issuer,
        sub: subject,
        user_id: subject,
        role: "authenticated",
        aud: resource,
        iat: options.now,
        exp: options.now + 300,
        client_id: clientId,
        scope: "openid email",
        ...overrides.claims,
      };
      return new SignJWT(payload)
        .setProtectedHeader({
          alg: "ES256",
          typ: "JWT",
          kid: keyId,
          ...overrides.protectedHeader,
        })
        .sign(privateKey);
    },
  };
}
