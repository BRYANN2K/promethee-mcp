/**
 * The authorization facts application code is allowed to observe.
 *
 * The raw bearer token is deliberately absent. It remains confined to the
 * HTTP/MCP authentication boundary and must never reach product adapters.
 */
export interface AuthContext {
  readonly subject: string;
  readonly clientId: string;
  readonly issuer: string;
  readonly resource: string;
  readonly scopes: ReadonlySet<string>;
  readonly expiresAt: number;
}

export interface SerializableAuthContext {
  readonly subject: string;
  readonly clientId: string;
  readonly issuer: string;
  readonly resource: string;
  readonly scopes: readonly string[];
  readonly expiresAt: number;
}

export function serializeAuthContext(context: AuthContext): SerializableAuthContext {
  return {
    subject: context.subject,
    clientId: context.clientId,
    issuer: context.issuer,
    resource: context.resource,
    scopes: [...context.scopes],
    expiresAt: context.expiresAt,
  };
}
