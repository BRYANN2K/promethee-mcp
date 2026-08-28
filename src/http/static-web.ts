import { lstatSync, readFileSync } from 'node:fs';
import { extname, isAbsolute, join } from 'node:path';

import type { AdditionalRouteHandler } from '../runtime/resource-server.js';

const MAX_STATIC_FILE_BYTES = 2 * 1024 * 1024;
const ASSET_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/u;
const CONTENT_TYPES: Readonly<Record<string, string>> = Object.freeze({
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml'
});

const CONTENT_SECURITY_POLICY = [
    "default-src 'self'",
    "base-uri 'none'",
    "connect-src 'self' https://auth.promethee.io",
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self'"
].join('; ');

export interface CreateStaticWebRouteOptions {
    readonly root: string;
}

function safeFile(path: string): Buffer | undefined {
    let stat;
    try {
        stat = lstatSync(path);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw error;
    }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > MAX_STATIC_FILE_BYTES) {
        return undefined;
    }
    return readFileSync(path);
}

function securityHeaders(cacheControl: string): Headers {
    return new Headers({
        'Cache-Control': cacheControl,
        'Content-Security-Policy': CONTENT_SECURITY_POLICY,
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY'
    });
}

function methodNotAllowed(): Response {
    return new Response(null, {
        status: 405,
        headers: { Allow: 'GET, HEAD' }
    });
}

/** Serve only the compiled login shell and single-segment Vite assets. */
export function createStaticWebRoute(options: CreateStaticWebRouteOptions): AdditionalRouteHandler {
    if (!isAbsolute(options.root) || options.root.length > 4_096 || options.root.includes('\0')) {
        throw new TypeError('Static web root must be an absolute path');
    }
    const indexPath = join(options.root, 'index.html');
    if (safeFile(indexPath) === undefined) {
        throw new TypeError('Static web root does not contain a bounded index.html');
    }

    return (request: Request): Promise<Response | undefined> => {
        const url = new URL(request.url);
        let file: string | undefined;
        let cacheControl = 'no-store';
        if (url.pathname === '/' || url.pathname === '/login') {
            file = indexPath;
        } else {
            const match = /^\/assets\/([^/]+)$/u.exec(url.pathname);
            const assetName = match?.[1];
            if (assetName === undefined || !ASSET_NAME.test(assetName)) {
                return Promise.resolve(undefined);
            }
            file = join(options.root, 'assets', assetName);
            cacheControl = 'public, max-age=31536000, immutable';
        }

        if (request.method !== 'GET' && request.method !== 'HEAD') {
            return Promise.resolve(methodNotAllowed());
        }
        const body = safeFile(file);
        if (body === undefined) return Promise.resolve(undefined);
        const headers = securityHeaders(cacheControl);
        headers.set('Content-Type', CONTENT_TYPES[extname(file)] ?? 'application/octet-stream');
        headers.set('Content-Length', String(body.byteLength));
        const responseBody = request.method === 'HEAD' ? null : Uint8Array.from(body).buffer;
        return Promise.resolve(new Response(responseBody, { status: 200, headers }));
    };
}
