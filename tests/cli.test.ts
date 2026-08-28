import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { statSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';

const CLI_PATH = resolve(process.cwd(), 'dist/product/src/cli.js');

test('the built CLI is executable on POSIX package installations', {
    skip: process.platform === 'win32'
}, () => {
    assert.notEqual(statSync(CLI_PATH).mode & 0o111, 0);
});

function runCli(args: readonly string[], environment: NodeJS.ProcessEnv = process.env) {
    return spawnSync(process.execPath, [CLI_PATH, ...args], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: environment,
        shell: false,
        timeout: 5_000
    });
}

function supabaseEnvironment(port?: number): NodeJS.ProcessEnv {
    const environment = { ...process.env };
    environment['PROMETHEE_MCP_MODE'] = 'supabase';
    environment['PROMETHEE_MCP_PUBLIC_URL'] = 'https://mcp.example.test/mcp';
    environment['PROMETHEE_SUPABASE_PUBLISHABLE_KEY'] = 'sb_publishable_testvalue';
    environment['PROMETHEE_MCP_CURSOR_KEY_BASE64URL'] = Buffer.alloc(32, 7).toString('base64url');
    environment['PROMETHEE_MCP_CLIENT_POLICY_JSON'] = JSON.stringify({
        'approved-client': ['tasks:read', 'tasks:write', 'projects:write']
    });
    environment['PROMETHEE_MCP_SLICE_POLICY_JSON'] = JSON.stringify({
        defaultPageSize: 25,
        maxPageSize: 100,
        maxIdentifierBytes: 256,
        maxTextBytes: 1024,
        maxCursorBytes: 1024,
        maxBackendPageTokenBytes: 256,
        maxSourceVersionBytes: 128,
        maxResponseBytes: 65536,
        upstreamTimeoutMs: 5000,
        cursorTtlMs: 900000,
        orderingVersion: 'id-asc-v1'
    });
    if (port !== undefined) environment['PROMETHEE_MCP_PORT'] = String(port);
    return environment;
}

function personalProductionEnvironment(port?: number): NodeJS.ProcessEnv {
    const environment = { ...process.env };
    environment['PROMETHEE_MCP_MODE'] = 'personal';
    environment['PROMETHEE_MCP_PUBLIC_URL'] = 'https://mcp.example.test/mcp';
    environment['PROMETHEE_MCP_PERSONAL_ACCESS_TOKEN'] = 'M'.repeat(43);
    environment['PROMETHEE_MCP_EDGE_TOKEN'] = 'E'.repeat(43);
    environment['PROMETHEE_MCP_CURSOR_KEY_BASE64URL'] = Buffer.alloc(32, 7).toString('base64url');
    environment['PROMETHEE_MCP_SESSION_KEY_BASE64URL'] = Buffer.alloc(32, 8).toString('base64url');
    environment['PROMETHEE_MCP_SESSION_FILE'] = resolve(tmpdir(), 'promethee-mcp-test-session.enc');
    if (port !== undefined) environment['PROMETHEE_MCP_PORT'] = String(port);
    return environment;
}

async function availablePort(): Promise<number> {
    const server = createServer();
    await new Promise<void>((resolveListen, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolveListen);
    });
    const address = server.address();
    if (address === null || typeof address === 'string') {
        throw new Error('Temporary server did not expose an IP address');
    }
    const port = address.port;
    await new Promise<void>((resolveClose, reject) => {
        server.close(error => error === undefined ? resolveClose() : reject(error));
    });
    return port;
}

function waitForListening(child: ReturnType<typeof spawn>): Promise<string> {
    return new Promise((resolveListening, reject) => {
        let stderr = '';
        const stderrStream = child.stderr;
        if (stderrStream === null) {
            reject(new Error('CLI server stderr is unavailable'));
            return;
        }
        const timeout = setTimeout(() => {
            reject(new Error('CLI server did not announce readiness'));
        }, 5_000);
        stderrStream.setEncoding('utf8');
        stderrStream.on('data', chunk => {
            stderr += chunk;
            if (stderr.includes('listening on')) {
                clearTimeout(timeout);
                resolveListening(stderr);
            }
        });
        child.once('error', error => {
            clearTimeout(timeout);
            reject(error);
        });
        child.once('exit', (code, signal) => {
            if (!stderr.includes('listening on')) {
                clearTimeout(timeout);
                reject(new Error(`CLI exited before readiness (${String(code)}, ${String(signal)})`));
            }
        });
    });
}

function waitForExit(child: ReturnType<typeof spawn>): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
    return new Promise((resolveExit, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('CLI server did not stop after SIGTERM'));
        }, 5_000);
        child.once('exit', (code, signal) => {
            clearTimeout(timeout);
            resolveExit({ code, signal });
        });
        child.once('error', error => {
            clearTimeout(timeout);
            reject(error);
        });
    });
}

test('CLI exposes stable help, version and usage diagnostics without prompts', () => {
    const help = runCli(['--help']);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /^Usage: prometheeemcp/u);
    assert.equal(help.stderr, '');

    const version = runCli(['--version']);
    assert.equal(version.status, 0);
    assert.equal(version.stdout, 'prometheemcp 0.1.0\n');
    assert.equal(version.stderr, '');

    const invalid = runCli(['--unknown']);
    assert.equal(invalid.status, 2);
    assert.equal(invalid.stdout, '');
    assert.equal(invalid.stderr, 'Unknown option.\nRun prometheeemcp --help for usage.\n');
});

test('doctor emits stable JSON and applies flag over environment over default precedence', () => {
    const environment = { ...process.env, PROMETHEE_MCP_PORT: '4322' };
    const result = runCli(['doctor', '--json', '--port', '4321'], environment);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout), {
        schemaVersion: 1,
        status: 'synthetic-only',
        mode: 'synthetic-deny-all',
        transport: 'streamable-http',
        bind: { host: '127.0.0.1', port: 4321 },
        livePromethee: false,
        browserAuth: false
    });

    const fromEnvironment = runCli(['doctor', '--json'], environment);
    assert.equal(fromEnvironment.status, 0);
    assert.equal(JSON.parse(fromEnvironment.stdout).bind.port, 4322);

    const defaultEnvironment = { ...process.env };
    delete defaultEnvironment['PROMETHEE_MCP_PORT'];
    const fromDefault = runCli(['doctor', '--json'], defaultEnvironment);
    assert.equal(fromDefault.status, 0);
    assert.equal(JSON.parse(fromDefault.stdout).bind.port, 3210);

    const invalid = runCli(['doctor'], { ...process.env, PROMETHEE_MCP_PORT: 'not-a-port' });
    assert.equal(invalid.status, 2);
    assert.equal(invalid.stdout, '');
    assert.match(invalid.stderr, /PROMETHEE_MCP_PORT must be an integer between 1 and 65535/u);
});

test('doctor validates Supabase mode without making a network request or exposing configuration secrets', () => {
    const result = runCli(['doctor', '--json'], supabaseEnvironment(4323));
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout), {
        schemaVersion: 1,
        status: 'configured-unverified',
        mode: 'supabase',
        transport: 'streamable-http',
        bind: { host: '127.0.0.1', port: 4323 },
        publicMcpUrl: 'https://mcp.example.test/mcp',
        livePromethee: true,
        browserAuth: true,
        connectionVerified: false
    });
    assert.doesNotMatch(result.stdout, /sb_publishable|approved-client|BwcHBw/u);

    const missing = supabaseEnvironment();
    delete missing['PROMETHEE_MCP_CURSOR_KEY_BASE64URL'];
    const invalid = runCli(['doctor', '--mode', 'supabase'], missing);
    assert.equal(invalid.status, 2);
    assert.equal(invalid.stdout, '');
    assert.equal(
        invalid.stderr,
        'PROMETHEE_MCP_CURSOR_KEY_BASE64URL is required in supabase mode.\nRun prometheeemcp --help for usage.\n'
    );
});

test('doctor exposes the zero-config personal connection mode without contacting Promethee', () => {
    const result = runCli(['doctor', '--mode', 'personal', '--json', '--port', '4324']);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout), {
        schemaVersion: 1,
        status: 'waiting-for-browser-connection',
        mode: 'personal',
        transport: 'streamable-http',
        bind: { host: '127.0.0.1', port: 4324 },
        mcpUrl: 'http://127.0.0.1:4324/mcp',
        connectionUrl: 'http://127.0.0.1:4324/connect/session',
        livePromethee: true,
        browserAuth: true,
        mcpAuthentication: 'loopback-process',
        sessionPersistence: 'memory-only'
    });
});

test('doctor validates production personal mode without exposing deployment secrets', () => {
    const result = runCli(['doctor', '--json'], personalProductionEnvironment(4325));
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout), {
        schemaVersion: 1,
        status: 'production-configured-unverified',
        mode: 'personal-single-user',
        transport: 'streamable-http',
        bind: { host: '127.0.0.1', port: 4325 },
        mcpUrl: 'https://mcp.example.test/mcp',
        connectionUrl: 'https://mcp.example.test/connect/session',
        livePromethee: true,
        browserAuth: true,
        mcpAuthentication: 'static-bearer',
        sessionPersistence: 'encrypted-seven-days'
    });
    assert.doesNotMatch(result.stdout, /MMMM|EEEE|BwcHBw|CAgICA/u);

    const incomplete = personalProductionEnvironment();
    delete incomplete['PROMETHEE_MCP_SESSION_KEY_BASE64URL'];
    const invalid = runCli(['doctor', '--mode', 'personal'], incomplete);
    assert.equal(invalid.status, 2);
    assert.equal(
        invalid.stderr,
        'PROMETHEE_MCP_SESSION_KEY_BASE64URL is required in production personal mode.\nRun prometheeemcp --help for usage.\n'
    );
});

test('serve starts configured Supabase mode without contacting the upstream', async () => {
    const port = await availablePort();
    const child = spawn(process.execPath, [CLI_PATH, 'serve', '--mode=supabase', '--port', String(port)], {
        cwd: process.cwd(),
        env: supabaseEnvironment(),
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    try {
        const stderr = await waitForListening(child);
        assert.match(stderr, /Supabase resource server listening/u);
        assert.doesNotMatch(stderr, /sb_publishable|approved-client|BwcHBw/u);
        const response = await fetch(`http://127.0.0.1:${String(port)}/healthz`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });

        const exitPromise = waitForExit(child);
        assert.equal(child.kill('SIGTERM'), true);
        const exited = await exitPromise;
        assert.equal(exited.code, 0);
        assert.equal(exited.signal, null);
    } finally {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
});

test('serve starts the real loopback runtime, exposes health and stops on SIGTERM', async () => {
    const port = await availablePort();
    const child = spawn(process.execPath, [CLI_PATH, 'serve', '--port', String(port)], {
        cwd: process.cwd(),
        env: process.env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    try {
        const stderr = await waitForListening(child);
        assert.match(stderr, new RegExp(`http://127\\.0\\.0\\.1:${String(port)}/mcp`, 'u'));
        const response = await fetch(`http://127.0.0.1:${String(port)}/healthz`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });

        const exitPromise = waitForExit(child);
        assert.equal(child.kill('SIGTERM'), true);
        const exited = await exitPromise;
        assert.equal(exited.code, 0);
        assert.equal(exited.signal, null);
    } finally {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
});

test('serve maps an occupied loopback port to a retryable generic failure', async () => {
    const occupied = createServer();
    await new Promise<void>((resolveListen, reject) => {
        occupied.once('error', reject);
        occupied.listen(0, '127.0.0.1', resolveListen);
    });
    const address = occupied.address();
    if (address === null || typeof address === 'string') {
        throw new Error('Occupied server did not expose an IP address');
    }

    try {
        const result = runCli(['serve', '--port', String(address.port)]);
        assert.equal(result.status, 10);
        assert.equal(result.stdout, '');
        assert.equal(result.stderr, 'The loopback server could not bind to the requested port.\n');
    } finally {
        await new Promise<void>((resolveClose, reject) => {
            occupied.close(error => error === undefined ? resolveClose() : reject(error));
        });
    }
});
