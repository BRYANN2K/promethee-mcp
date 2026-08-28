import type { AuthInfo, McpHttpHandler } from '@modelcontextprotocol/server';

import type { AuthContext } from '../auth/auth-context.js';
import { createPrometheeMcpHandler, type PrometheeMcpApplication } from '../mcp/index.js';
import type { SlicePolicy } from '../policy/slice-policy.js';

export interface AuthenticatedRequest {
    authInfo: AuthInfo;
    principal: AuthContext;
    application?: PrometheeMcpApplication;
}

export type RequestSecurityGate = (request: Request) => Response | undefined;
export type OAuthMetadataHandler = (request: Request) => Response | undefined;
export type BearerAuthenticator = (request: Request) => Promise<AuthenticatedRequest | Response>;
export type AdditionalRouteHandler = (request: Request) => Promise<Response | undefined>;

export interface CallerBoundApplicationContext {
    /** Verified token-free authorization facts available to use cases. */
    readonly principal: AuthContext;
    /**
     * Raw user access token. A production factory may capture it only inside a
     * request-scoped upstream adapter; it must not add it to the principal or
     * pass it as a use-case argument.
     */
    readonly accessToken: string;
}

export interface PrometheeRuntimeOptions {
    application: PrometheeMcpApplication;
    createApplication?: (context: CallerBoundApplicationContext) => PrometheeMcpApplication;
    authenticate: BearerAuthenticator;
    requestSecurityGate: RequestSecurityGate;
    oauthMetadata: OAuthMetadataHandler;
    additionalRoutes?: AdditionalRouteHandler;
    policy?: SlicePolicy;
    serverVersion?: string;
    onError?: (error: Error) => void;
}

export interface PrometheeRuntime {
    readonly mcpHandler: McpHttpHandler;
    preflight(request: Request): Response | undefined;
    fetch(request: Request): Promise<Response>;
    close(): Promise<void>;
}

function jsonError(status: number, code: string): Response {
    return Response.json({ error: code }, { status });
}

function healthResponse(request: Request): Response {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    if (request.method === 'HEAD') return new Response(null, { status: 200 });
    return Response.json({ status: 'ok' });
}

/**
 * Compose request security, OAuth discovery, bearer authentication, and the
 * stateless MCP handler without ever forwarding the bearer token to an
 * application use case.
 */
export function createPrometheeRuntime(options: PrometheeRuntimeOptions): PrometheeRuntime {
    const principals = new WeakMap<AuthInfo, AuthContext>();
    const applications = new WeakMap<AuthInfo, PrometheeMcpApplication>();
    const mcpHandler = createPrometheeMcpHandler({
        application: options.application,
        resolvePrincipal: authInfo => (authInfo === undefined ? undefined : principals.get(authInfo)),
        resolveApplication: authInfo => (authInfo === undefined ? undefined : applications.get(authInfo)),
        ...(options.policy === undefined ? {} : { policy: options.policy }),
        ...(options.serverVersion === undefined ? {} : { serverVersion: options.serverVersion }),
        ...(options.onError === undefined ? {} : { onError: options.onError })
    });

    let closed = false;
    let closing: Promise<void> | undefined;

    return {
        mcpHandler,
        preflight(request: Request): Response | undefined {
            return options.requestSecurityGate(request);
        },
        async fetch(request: Request): Promise<Response> {
            if (closed) return jsonError(503, 'service_unavailable');

            try {
                const rejected = options.requestSecurityGate(request);
                if (rejected !== undefined) return rejected;

                const metadata = options.oauthMetadata(request);
                if (metadata !== undefined) return metadata;

                const additional = await options.additionalRoutes?.(request);
                if (additional !== undefined) return additional;

                const { pathname } = new URL(request.url);
                if (pathname === '/healthz') return healthResponse(request);
                if (pathname !== '/mcp') return jsonError(404, 'not_found');

                const authenticated = await options.authenticate(request);
                if (authenticated instanceof Response) return authenticated;

                const requestAuthInfo: AuthInfo = {
                    ...authenticated.authInfo,
                    scopes: [...authenticated.authInfo.scopes],
                    ...(authenticated.authInfo.extra === undefined
                        ? {}
                        : { extra: { ...authenticated.authInfo.extra } })
                };
                principals.set(requestAuthInfo, authenticated.principal);
                if (authenticated.application !== undefined) {
                    applications.set(requestAuthInfo, authenticated.application);
                } else if (options.createApplication !== undefined) {
                    applications.set(requestAuthInfo, options.createApplication({
                        principal: authenticated.principal,
                        accessToken: authenticated.authInfo.token
                    }));
                }
                return await mcpHandler.fetch(request, { authInfo: requestAuthInfo });
            } catch (error) {
                try {
                    options.onError?.(error instanceof Error ? error : new Error('Unknown runtime error'));
                } catch {
                    // Observability must never alter the public response.
                }
                return jsonError(500, 'internal_error');
            }
        },
        close(): Promise<void> {
            if (closing !== undefined) return closing;
            closed = true;
            closing = mcpHandler.close();
            return closing;
        }
    };
}
