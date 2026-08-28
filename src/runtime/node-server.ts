import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
    toNodeHandler,
    type NodeIncomingMessageLike,
    type NodeServerResponseLike
} from '@modelcontextprotocol/node';

import type { PrometheeRuntime } from './resource-server.js';

const MAX_MCP_REQUEST_BYTES = 16 * 1024;

class RequestBodyTooLargeError extends Error {}

async function readParsedBody(request: import('node:http').IncomingMessage): Promise<unknown | undefined> {
    if (request.method === 'GET' || request.method === 'HEAD') return undefined;

    const declaredLength = Number(request.headers['content-length']);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_MCP_REQUEST_BYTES) {
        request.resume();
        throw new RequestBodyTooLargeError();
    }

    const chunks: Buffer[] = [];
    let received = 0;
    for await (const rawChunk of request) {
        const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk as Uint8Array);
        received += chunk.byteLength;
        if (received > MAX_MCP_REQUEST_BYTES) {
            request.resume();
            throw new RequestBodyTooLargeError();
        }
        chunks.push(chunk);
    }

    if (received === 0) return undefined;
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

function jsonRpcError(response: import('node:http').ServerResponse, status: number, code: number, message: string): void {
    const body = JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null });
    response.writeHead(status, {
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(body)),
        Connection: 'close'
    });
    response.end(body);
}

function normalizedRequestTarget(request: import('node:http').IncomingMessage): string {
    const rawTarget = request.url;
    if (rawTarget === undefined || rawTarget === '*') return '/';
    if (rawTarget?.startsWith('/') === true) {
        return rawTarget;
    }

    let absoluteTarget: URL;
    try {
        absoluteTarget = new URL(rawTarget);
    } catch {
        throw new SyntaxError('Invalid HTTP request target');
    }
    if (
        (absoluteTarget.protocol !== 'http:' && absoluteTarget.protocol !== 'https:') ||
        absoluteTarget.username !== '' ||
        absoluteTarget.password !== '' ||
        absoluteTarget.hash !== ''
    ) {
        throw new SyntaxError('Invalid HTTP request target');
    }

    const host = request.headers.host;
    let headerAuthority: URL;
    try {
        if (host === undefined || host !== host.trim()) throw new Error('Invalid Host');
        headerAuthority = new URL(`${absoluteTarget.protocol}//${host}`);
    } catch {
        throw new SyntaxError('Absolute request target does not match Host');
    }
    if (
        headerAuthority.username !== '' ||
        headerAuthority.password !== '' ||
        headerAuthority.pathname !== '/' ||
        headerAuthority.search !== '' ||
        headerAuthority.hash !== '' ||
        headerAuthority.host !== absoluteTarget.host
    ) {
        throw new SyntaxError('Absolute request target does not match Host');
    }
    return `${absoluteTarget.pathname}${absoluteTarget.search}`;
}

function preflightRequest(request: import('node:http').IncomingMessage, path: string): Request {
    const headers = new Headers();
    for (const [name, rawValue] of Object.entries(request.headers)) {
        if (rawValue === undefined) continue;
        headers.set(name, Array.isArray(rawValue) ? rawValue.join(',') : rawValue);
    }
    return new Request(new URL(path, 'http://node-preflight.invalid'), {
        method: request.method === 'HEAD' ? 'HEAD' : 'GET',
        headers
    });
}

async function writeWebResponse(
    source: Response,
    target: import('node:http').ServerResponse
): Promise<void> {
    const headers: Record<string, string> = {};
    for (const [name, value] of source.headers) headers[name] = value;
    const body = source.body === null ? undefined : Buffer.from(await source.arrayBuffer());
    if (body !== undefined && headers['content-length'] === undefined) {
        headers['content-length'] = String(body.byteLength);
    }
    target.writeHead(source.status, headers);
    target.end(body);
}

export interface StartNodeServerOptions {
    runtime: PrometheeRuntime;
    host: string;
    port: number;
    onError?: (error: Error) => void;
}

export interface RunningNodeServer {
    readonly address: AddressInfo;
    readonly server: Server;
    close(): Promise<void>;
}

function listen(server: Server, host: string, port: number): Promise<AddressInfo> {
    return new Promise((resolve, reject) => {
        const onError = (error: Error) => {
            server.off('listening', onListening);
            reject(error);
        };
        const onListening = () => {
            server.off('error', onError);
            const address = server.address();
            if (address === null || typeof address === 'string') {
                reject(new Error('Node HTTP server did not expose a TCP address'));
                return;
            }
            resolve(address);
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, host);
    });
}

function closeServer(server: Server): Promise<void> {
    if (!server.listening) return Promise.resolve();
    return new Promise((resolve, reject) => {
        server.close(error => (error === undefined ? resolve() : reject(error)));
    });
}

export async function startNodeServer(options: StartNodeServerOptions): Promise<RunningNodeServer> {
    const nodeHandler = toNodeHandler(
        { fetch: request => options.runtime.fetch(request) },
        options.onError === undefined ? undefined : { onerror: options.onError }
    );
    const server = createServer((request, response) => {
        void (async () => {
            try {
                const requestTarget = normalizedRequestTarget(request);
                const rejected = options.runtime.preflight(preflightRequest(request, requestTarget));
                if (rejected !== undefined) {
                    request.resume();
                    await writeWebResponse(rejected, response);
                    return;
                }
                request.url = requestTarget;
                const parsedBody = await readParsedBody(request);
                await nodeHandler(
                    request as unknown as NodeIncomingMessageLike,
                    response as unknown as NodeServerResponseLike,
                    parsedBody
                );
            } catch (error) {
                if (error instanceof RequestBodyTooLargeError) {
                    jsonRpcError(response, 413, -32_000, 'Payload Too Large');
                    return;
                }
                if (error instanceof SyntaxError) {
                    jsonRpcError(response, 400, -32_700, 'Parse error');
                    return;
                }
                try {
                    options.onError?.(error instanceof Error ? error : new Error('Unknown Node request error'));
                } catch {
                    // Reporting must not alter the public response.
                }
                jsonRpcError(response, 500, -32_603, 'Internal server error');
            }
        })();
    });
    server.on('error', error => {
        try {
            options.onError?.(error);
        } catch {
            // Reporting must not turn a handled server error into an uncaught one.
        }
    });

    let address: AddressInfo;
    try {
        address = await listen(server, options.host, options.port);
    } catch (error) {
        await options.runtime.close();
        throw error;
    }
    let closing: Promise<void> | undefined;

    return {
        address,
        server,
        close(): Promise<void> {
            if (closing !== undefined) return closing;
            closing = (async () => {
                const draining = closeServer(server);
                try {
                    await options.runtime.close();
                } finally {
                    // A graceful Node close waits for long-lived MCP/SSE responses.
                    // Once the runtime has released its transports, terminate any
                    // remaining HTTP connections so shutdown cannot deadlock.
                    server.closeAllConnections();
                    await draining;
                }
            })();
            return closing;
        }
    };
}
