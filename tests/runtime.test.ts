import assert from 'node:assert/strict';
import { request as nodeRequest } from 'node:http';
import { describe, it } from 'node:test';

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { AuthInfo, McpHttpHandler } from '@modelcontextprotocol/server';

import type { AuthContext } from '../src/auth/auth-context.js';
import type { PrometheeMcpApplication } from '../src/mcp/index.js';
import {
    createPrometheeRuntime,
    startNodeServer,
    type PrometheeRuntime
} from '../src/runtime/index.js';

const principal: AuthContext = {
    subject: 'runtime-user',
    clientId: 'runtime-client',
    issuer: 'https://issuer.test/',
    resource: 'https://mcp.test/mcp',
    scopes: new Set(['tasks:read']),
    expiresAt: 4_102_444_800
};

const authInfo: AuthInfo = {
    token: 'synthetic-runtime-token',
    clientId: principal.clientId,
    scopes: [...principal.scopes],
    expiresAt: principal.expiresAt,
    resource: new URL(principal.resource)
};

const unusedApplication: PrometheeMcpApplication = {
    createProject: { async execute() { throw new Error('unexpected createProject call'); } },
    createTask: { async execute() { throw new Error('unexpected createTask call'); } },
    listTasks: { async execute() { throw new Error('unexpected listTasks call'); } },
    getTask: { async execute() { throw new Error('unexpected getTask call'); } },
    listProjects: { async execute() { throw new Error('unexpected listProjects call'); } }
};

describe('resource server runtime', () => {
    it('orders security and discovery before bearer authentication', async () => {
        const events: string[] = [];
        const runtime = createPrometheeRuntime({
            application: unusedApplication,
            requestSecurityGate(request) {
                events.push(`security:${new URL(request.url).pathname}`);
                return request.headers.get('host') === 'blocked.test' ? new Response(null, { status: 403 }) : undefined;
            },
            oauthMetadata(request) {
                events.push(`metadata:${new URL(request.url).pathname}`);
                return new URL(request.url).pathname.startsWith('/.well-known/')
                    ? Response.json({ resource: 'https://mcp.test/mcp' })
                    : undefined;
            },
            async authenticate() {
                events.push('authenticate');
                return { authInfo, principal };
            }
        });

        const blocked = await runtime.fetch(new Request('https://mcp.test/mcp', { headers: { host: 'blocked.test' } }));
        assert.equal(blocked.status, 403);
        assert.deepEqual(events, ['security:/mcp']);

        events.length = 0;
        const metadata = await runtime.fetch(new Request('https://mcp.test/.well-known/oauth-protected-resource/mcp'));
        assert.equal(metadata.status, 200);
        assert.deepEqual(events, [
            'security:/.well-known/oauth-protected-resource/mcp',
            'metadata:/.well-known/oauth-protected-resource/mcp'
        ]);

        await runtime.close();
    });

    it('keeps health and unknown routes outside the authentication boundary', async () => {
        let authCalls = 0;
        const runtime = createPrometheeRuntime({
            application: unusedApplication,
            requestSecurityGate: () => undefined,
            oauthMetadata: () => undefined,
            async authenticate() {
                authCalls += 1;
                return { authInfo, principal };
            }
        });

        const health = await runtime.fetch(new Request('https://mcp.test/healthz'));
        assert.equal(health.status, 200);
        assert.deepEqual(await health.json(), { status: 'ok' });
        assert.equal((await runtime.fetch(new Request('https://mcp.test/missing'))).status, 404);
        assert.equal(authCalls, 0);

        await runtime.close();
    });

    it('closes idempotently and refuses new work after shutdown', async () => {
        const runtime = createPrometheeRuntime({
            application: unusedApplication,
            requestSecurityGate: () => undefined,
            oauthMetadata: () => undefined,
            async authenticate() {
                return { authInfo, principal };
            }
        });

        const first = runtime.close();
        const second = runtime.close();
        assert.equal(first, second);
        await first;

        const response = await runtime.fetch(new Request('https://mcp.test/healthz'));
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), { error: 'service_unavailable' });
    });

    it('rejects an oversized Node request before authentication', async () => {
        let authCalls = 0;
        const runtime = createPrometheeRuntime({
            application: unusedApplication,
            requestSecurityGate: () => undefined,
            oauthMetadata: () => undefined,
            async authenticate() {
                authCalls += 1;
                return { authInfo, principal };
            }
        });
        const running = await startNodeServer({ runtime, host: '127.0.0.1', port: 0 });

        try {
            const response = await fetch(`http://127.0.0.1:${running.address.port}/mcp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oversized: 'x'.repeat(17 * 1024) })
            });
            assert.equal(response.status, 413);
            assert.equal(authCalls, 0);
        } finally {
            await running.close();
        }
    });

    it('rejects a hostile Origin before reading an oversized Node body', async () => {
        let authCalls = 0;
        const runtime = createPrometheeRuntime({
            application: unusedApplication,
            requestSecurityGate: request =>
                request.headers.get('origin') === 'https://attacker.invalid'
                    ? new Response(null, { status: 403 })
                    : undefined,
            oauthMetadata: () => undefined,
            async authenticate() {
                authCalls += 1;
                return { authInfo, principal };
            }
        });
        const running = await startNodeServer({ runtime, host: '127.0.0.1', port: 0 });

        try {
            const response = await fetch(`http://127.0.0.1:${running.address.port}/mcp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Origin: 'https://attacker.invalid' },
                body: JSON.stringify({ oversized: 'x'.repeat(17 * 1024) })
            });
            assert.equal(response.status, 403);
            assert.equal(authCalls, 0);
        } finally {
            await running.close();
        }
    });

    it('normalizes an absolute-form request target before security preflight', async () => {
        const runtime = createPrometheeRuntime({
            application: unusedApplication,
            requestSecurityGate: request =>
                new URL(request.url).pathname === '/mcp' &&
                request.headers.get('origin') === 'https://attacker.invalid'
                    ? new Response(null, { status: 403 })
                    : undefined,
            oauthMetadata: () => undefined,
            async authenticate() {
                return { authInfo, principal };
            }
        });
        const running = await startNodeServer({ runtime, host: '127.0.0.1', port: 0 });
        const body = JSON.stringify({ oversized: 'x'.repeat(17 * 1024) });

        try {
            const status = await new Promise<number>((resolve, reject) => {
                const request = nodeRequest({
                    host: '127.0.0.1',
                    port: running.address.port,
                    method: 'POST',
                    path: `http://127.0.0.1:${running.address.port}/mcp`,
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': String(Buffer.byteLength(body)),
                        Origin: 'https://attacker.invalid'
                    }
                }, response => {
                    response.resume();
                    response.once('end', () => resolve(response.statusCode ?? 0));
                });
                request.once('error', reject);
                request.end(body);
            });
            assert.equal(status, 403);
        } finally {
            await running.close();
        }
    });

    it('passes an allowed absolute-form target to the runtime as origin-form', async () => {
        const runtime = createPrometheeRuntime({
            application: unusedApplication,
            requestSecurityGate: () => undefined,
            oauthMetadata: () => undefined,
            async authenticate() {
                return { authInfo, principal };
            }
        });
        const running = await startNodeServer({ runtime, host: '127.0.0.1', port: 0 });

        try {
            const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
                const request = nodeRequest({
                    host: '127.0.0.1',
                    port: running.address.port,
                    method: 'GET',
                    path: `http://127.0.0.1:${running.address.port}/healthz`
                }, response => {
                    const chunks: Buffer[] = [];
                    response.on('data', chunk => chunks.push(Buffer.from(chunk as Uint8Array)));
                    response.once('end', () => resolve({
                        status: response.statusCode ?? 0,
                        body: Buffer.concat(chunks).toString('utf8')
                    }));
                });
                request.once('error', reject);
                request.end();
            });
            assert.equal(result.status, 200);
            assert.deepEqual(JSON.parse(result.body), { status: 'ok' });
        } finally {
            await running.close();
        }
    });

    it('rejects an absolute-form target whose authority differs from Host', async () => {
        const runtime = createPrometheeRuntime({
            application: unusedApplication,
            requestSecurityGate: () => undefined,
            oauthMetadata: () => undefined,
            async authenticate() {
                return { authInfo, principal };
            }
        });
        const running = await startNodeServer({ runtime, host: '127.0.0.1', port: 0 });

        try {
            const status = await new Promise<number>((resolve, reject) => {
                const request = nodeRequest({
                    host: '127.0.0.1',
                    port: running.address.port,
                    method: 'GET',
                    path: 'http://different-authority.invalid/healthz'
                }, response => {
                    response.resume();
                    response.once('end', () => resolve(response.statusCode ?? 0));
                });
                request.once('error', reject);
                request.end();
            });
            assert.equal(status, 400);
        } finally {
            await running.close();
        }
    });

    it('keeps principals isolated when an authenticator reuses AuthInfo concurrently', async () => {
        const sharedAuthInfo: AuthInfo = {
            token: 'shared-synthetic-token',
            clientId: 'shared-client',
            scopes: ['tasks:read'],
            expiresAt: 4_102_444_800,
            resource: new URL('https://mcp.test/mcp')
        };
        let racing = false;
        let arrivals = 0;
        let releaseRace: (() => void) | undefined;
        const race = new Promise<void>(resolve => { releaseRace = resolve; });
        const application: PrometheeMcpApplication = {
            createProject: unusedApplication.createProject,
            createTask: unusedApplication.createTask,
            listTasks: {
                async execute(caller) {
                    return {
                        tasks: [{ id: caller.subject, title: 'Synthetic task', status: 'open', projectId: null }],
                        observedAt: '2026-08-27T10:00:00Z',
                        freshness: 'unknown',
                        sourceVersion: null,
                        nextCursor: null
                    };
                }
            },
            getTask: unusedApplication.getTask,
            listProjects: unusedApplication.listProjects
        };
        const runtime = createPrometheeRuntime({
            application,
            requestSecurityGate: () => undefined,
            oauthMetadata: () => undefined,
            async authenticate(request) {
                if (racing) {
                    arrivals += 1;
                    if (arrivals === 2) releaseRace?.();
                    await race;
                }
                const subject = request.headers.get('x-test-subject') ?? 'setup-user';
                return { authInfo: sharedAuthInfo, principal: { ...principal, subject } };
            }
        });

        const clients = ['user-a', 'user-b'].map(subject => {
            return new Client(
                { name: `race-${subject}`, version: '1.0.0' },
                { versionNegotiation: { mode: 'auto' } }
            );
        });

        try {
            await Promise.all(clients.map((client, index) =>
                client.connect(new StreamableHTTPClientTransport(new URL('https://mcp.test/mcp'), {
                    fetch: (url, init) => {
                        const headers = new Headers(init?.headers);
                        headers.set('x-test-subject', index === 0 ? 'user-a' : 'user-b');
                        return runtime.fetch(new Request(url, { ...init, headers }));
                    }
                }))
            ));
            racing = true;
            const results = await Promise.all(clients.map(client =>
                client.callTool({ name: 'promethee_list_tasks', arguments: {} })
            ));
            assert.deepEqual(
                results.map(result =>
                    (result.structuredContent as { tasks: Array<{ id: string }> }).tasks[0]?.id
                ),
                ['user-a', 'user-b']
            );
        } finally {
            await Promise.all(clients.map(client => client.close()));
            await runtime.close();
        }
    });

    it('creates a caller-bound application while keeping the bearer token out of use-case inputs', async () => {
        const factoryTokens: string[] = [];
        const useCasePrincipals: AuthContext[] = [];
        const callerBoundApplication: PrometheeMcpApplication = {
            createProject: unusedApplication.createProject,
            createTask: unusedApplication.createTask,
            listTasks: {
                async execute(caller) {
                    useCasePrincipals.push(caller);
                    return {
                        tasks: [],
                        observedAt: '2026-08-27T10:00:00Z',
                        freshness: 'unknown',
                        sourceVersion: null,
                        nextCursor: null
                    };
                }
            },
            getTask: unusedApplication.getTask,
            listProjects: unusedApplication.listProjects
        };
        const runtime = createPrometheeRuntime({
            application: unusedApplication,
            createApplication({ principal: caller, accessToken }) {
                assert.equal(caller, principal);
                factoryTokens.push(accessToken);
                return callerBoundApplication;
            },
            requestSecurityGate: () => undefined,
            oauthMetadata: () => undefined,
            async authenticate() {
                return { authInfo, principal };
            }
        });
        const client = new Client(
            { name: 'caller-bound-runtime', version: '1.0.0' },
            { versionNegotiation: { mode: 'auto' } }
        );

        try {
            await client.connect(new StreamableHTTPClientTransport(new URL('https://mcp.test/mcp'), {
                fetch: (url, init) => runtime.fetch(new Request(url, init))
            }));
            await client.callTool({ name: 'promethee_list_tasks', arguments: {} });

            assert.ok(factoryTokens.length >= 2);
            assert.ok(factoryTokens.every(token => token === authInfo.token));
            assert.equal(useCasePrincipals.length, 1);
            assert.equal(useCasePrincipals[0], principal);
            assert.equal('token' in useCasePrincipals[0]!, false);
        } finally {
            await client.close();
            await runtime.close();
        }
    });

    it('closes the runtime before waiting for an open streamed response to drain', async () => {
        let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
        let runtimeClosed = false;
        const streamingRuntime: PrometheeRuntime = {
            mcpHandler: {} as McpHttpHandler,
            preflight: () => undefined,
            async fetch() {
                return new Response(new ReadableStream<Uint8Array>({
                    start(controller) {
                        stream = controller;
                        controller.enqueue(new TextEncoder().encode('open'));
                    }
                }));
            },
            async close() {
                runtimeClosed = true;
                stream?.close();
            }
        };
        const running = await startNodeServer({ runtime: streamingRuntime, host: '127.0.0.1', port: 0 });
        const response = await fetch(`http://127.0.0.1:${running.address.port}/stream`);

        await Promise.race([
            running.close(),
            new Promise<never>((_resolve, reject) =>
                setTimeout(() => reject(new Error('shutdown timed out')), 1_000)
            )
        ]);
        assert.equal(runtimeClosed, true);
        await response.body?.cancel();
    });
});
