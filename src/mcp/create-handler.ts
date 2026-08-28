import type { AuthInfo, McpHttpHandler } from '@modelcontextprotocol/server';
import { createMcpHandler } from '@modelcontextprotocol/server';

import type { PrometheeMcpApplication } from './application.js';
import { createPrometheeMcpServer, type PrincipalResolver } from './create-server.js';
import type { SlicePolicy } from '../policy/slice-policy.js';

export interface CreatePrometheeMcpHandlerOptions {
    application: PrometheeMcpApplication;
    resolvePrincipal: PrincipalResolver;
    resolveApplication?: (authInfo: AuthInfo | undefined) => PrometheeMcpApplication | undefined;
    policy?: SlicePolicy;
    serverVersion?: string;
    onError?: (error: Error) => void;
}

/**
 * Stateless Streamable HTTP handler serving modern MCP and the SDK's
 * stateless 2025-era compatibility path from the same factory.
 */
export function createPrometheeMcpHandler(options: CreatePrometheeMcpHandlerOptions): McpHttpHandler {
    return createMcpHandler(
        ({ authInfo }: { authInfo?: AuthInfo }) => {
            const principal = options.resolvePrincipal(authInfo);
            return createPrometheeMcpServer({
                application: options.resolveApplication?.(authInfo) ?? options.application,
                ...(principal === undefined ? {} : { principal }),
                ...(options.policy === undefined ? {} : { policy: options.policy }),
                ...(options.serverVersion === undefined ? {} : { serverVersion: options.serverVersion })
            });
        },
        {
            legacy: 'stateless',
            ...(options.onError === undefined ? {} : { onerror: options.onError })
        }
    );
}
