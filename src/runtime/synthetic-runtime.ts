import { randomBytes } from 'node:crypto';

import { SyntheticPrometheeFacade } from '../adapters/synthetic/index.js';
import { CreateProjectUseCase, CreateTaskUseCase, GetTaskUseCase, ListProjectsUseCase, ListTasksUseCase } from '../application/index.js';
import { TOOL_SCOPE } from '../application/tool-registry.js';
import { createBearerAuthenticator } from '../auth/bearer-auth.js';
import { TokenVerificationError, type TokenVerifier } from '../auth/token-verifier.js';
import { createOAuthMetadataHandler, resourceMetadataUrl } from '../http/oauth-metadata.js';
import { createRequestSecurityGate } from '../http/request-security.js';
import { AesGcmCursorCodec } from '../pagination/cursor-codec.js';
import { SYNTHETIC_SLICE_POLICY } from '../policy/slice-policy.js';
import { systemClock } from '../ports/clock.js';
import { createPrometheeRuntime } from './resource-server.js';

export interface CreateSyntheticRuntimeOptions {
    authority: string;
    tokenVerifier?: TokenVerifier;
    cursorKey?: Uint8Array;
    onError?: (error: Error) => void;
}

function denyAllTokenVerifier(): TokenVerifier {
    return {
        async verify(): Promise<never> {
            throw new TokenVerificationError('invalid_signature');
        }
    };
}

/**
 * Synthetic-only composition root. It has no production adapter, performs no
 * remote discovery, and defaults to rejecting every bearer token. Tests or an
 * explicit local harness may inject an in-memory synthetic verifier.
 */
export function createSyntheticRuntime(options: CreateSyntheticRuntimeOptions) {
    const baseUrl = new URL(`http://${options.authority}`);
    const resourceServerUrl = new URL('/mcp', baseUrl);
    const issuer = baseUrl.href;
    const facade = new SyntheticPrometheeFacade();
    const cursorCodec = new AesGcmCursorCodec(
        options.cursorKey ?? randomBytes(32),
        systemClock,
        SYNTHETIC_SLICE_POLICY
    );
    const application = {
        createProject: new CreateProjectUseCase({ facade, clock: systemClock, policy: SYNTHETIC_SLICE_POLICY }),
        createTask: new CreateTaskUseCase({ facade, clock: systemClock, policy: SYNTHETIC_SLICE_POLICY }),
        listTasks: new ListTasksUseCase({ facade, cursorCodec, clock: systemClock, policy: SYNTHETIC_SLICE_POLICY }),
        getTask: new GetTaskUseCase({ facade, clock: systemClock, policy: SYNTHETIC_SLICE_POLICY }),
        listProjects: new ListProjectsUseCase({ facade, cursorCodec, clock: systemClock, policy: SYNTHETIC_SLICE_POLICY })
    };
    const supportedScopes = [...new Set(Object.values(TOOL_SCOPE))];
    const oauthMetadata = {
        issuer,
        authorization_endpoint: new URL('/authorize', baseUrl).href,
        token_endpoint: new URL('/token', baseUrl).href,
        jwks_uri: new URL('/.well-known/jwks.json', baseUrl).href,
        response_types_supported: ['code'],
        code_challenge_methods_supported: ['S256']
    };

    return createPrometheeRuntime({
        application,
        authenticate: createBearerAuthenticator({
            verifier: options.tokenVerifier ?? denyAllTokenVerifier(),
            resourceMetadataUrl: resourceMetadataUrl(resourceServerUrl)
        }),
        requestSecurityGate: createRequestSecurityGate({
            allowedHosts: [options.authority],
            allowedOrigins: [baseUrl.origin]
        }),
        oauthMetadata: createOAuthMetadataHandler({
            oauthMetadata,
            resourceServerUrl,
            scopesSupported: supportedScopes,
            resourceName: 'Promethee MCP synthetic development server'
        }),
        policy: SYNTHETIC_SLICE_POLICY,
        ...(options.onError === undefined ? {} : { onError: options.onError })
    });
}
