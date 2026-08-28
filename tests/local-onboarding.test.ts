import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { InMemoryTransport } from '@modelcontextprotocol/server';

import { createClientInstallPlan, DEFAULT_PACKAGE_SPEC } from '../src/cli/onboarding.js';
import { createStaticWebRoute } from '../src/http/static-web.js';
import type { PrometheeMcpApplication } from '../src/mcp/application.js';
import { createPrometheeMcpServer } from '../src/mcp/create-server.js';
import { startLocalPersonalOnboarding } from '../src/runtime/local-personal-onboarding.js';

const CLI_PATH = resolve(process.cwd(), 'dist/product/src/cli.js');

function unavailableApplication(): PrometheeMcpApplication {
  const unavailable = { async execute(): Promise<never> { throw new Error('unavailable'); } };
  return {
    createProject: unavailable,
    createTask: unavailable,
    listTasks: unavailable,
    getTask: unavailable,
    listProjects: unavailable,
  };
}

function childEnvironment(configDirectory: string): Record<string, string> {
  const environment: Record<string, string> = {
    PROMETHEE_MCP_CONFIG_DIR: configDirectory,
    PROMETHEE_MCP_PORT: '0',
  };
  for (const name of ['HOME', 'PATH', 'SystemRoot', 'TMPDIR', 'TEMP', 'TMP']) {
    const value = process.env[name];
    if (value !== undefined) environment[name] = value;
  }
  return environment;
}

test('client install plans use npx as the launcher and never put credentials in argv', () => {
  const packageSpec = DEFAULT_PACKAGE_SPEC;
  const codex = createClientInstallPlan('codex', packageSpec);
  assert.deepEqual(codex, {
    client: 'codex',
    executable: 'codex',
    args: [
      'mcp',
      'add',
      'promethee',
      '--',
      'npx',
      '-y',
      `--package=${packageSpec}`,
      '--',
      'prometheemcp',
      '--stdio',
    ],
  });

  const claude = createClientInstallPlan('claude', packageSpec);
  assert.deepEqual(claude, {
    client: 'claude',
    executable: 'claude',
    args: [
      'mcp',
      'add',
      '--scope',
      'user',
      'promethee',
      '--',
      'npx',
      '-y',
      `--package=${packageSpec}`,
      '--',
      'prometheemcp',
      '--stdio',
    ],
  });
  assert.doesNotMatch(JSON.stringify([codex, claude]), /token|password|secret/iu);

  assert.throws(
    () => createClientInstallPlan('codex', 'https://example.test/promethee-mcp.tgz'),
    /GitHub Release package URL is invalid/u,
  );
});

test('documented npx commands use an executable declared by the package', () => {
  const packageManifest = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
    bin?: Record<string, string>;
  };
  const readme = readFileSync(resolve(process.cwd(), 'README.md'), 'utf8');
  const documentedExecutables = readme.match(/\bpromethe+mcp\b/gu) ?? [];

  assert.ok(documentedExecutables.length > 0);
  for (const executable of documentedExecutables) {
    assert.ok(packageManifest.bin?.[executable], `${executable} is not declared in package.json#bin`);
  }
});

test('the static login route is bounded to approved files and sends browser security headers', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'prometheemcp-static-'));
  try {
    mkdirSync(join(directory, 'assets'));
    writeFileSync(join(directory, 'index.html'), '<!doctype html><title>Promethee MCP</title>');
    writeFileSync(join(directory, 'assets', 'app-123.js'), 'export {};');
    const route = createStaticWebRoute({ root: directory });

    const login = await route(new Request('http://127.0.0.1:3210/login'));
    assert.ok(login);
    assert.equal(login.status, 200);
    assert.equal(await login.text(), '<!doctype html><title>Promethee MCP</title>');
    assert.match(login.headers.get('content-security-policy') ?? '', /connect-src 'self' https:\/\/auth\.promethee\.io/u);
    assert.equal(login.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(login.headers.get('cache-control'), 'no-store');

    const asset = await route(new Request('http://127.0.0.1:3210/assets/app-123.js'));
    assert.ok(asset);
    assert.equal(asset.status, 200);
    assert.equal(asset.headers.get('content-type'), 'text/javascript; charset=utf-8');

    const traversal = await route(new Request('http://127.0.0.1:3210/assets/%2e%2e/index.html'));
    assert.equal(traversal, undefined);
    const mutation = await route(new Request('http://127.0.0.1:3210/login', { method: 'POST' }));
    assert.ok(mutation);
    assert.equal(mutation.status, 405);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('the packaged CLI serves stdio with a local login URL and keeps account tools auth-gated', async () => {
  const configDirectory = mkdtempSync(join(tmpdir(), 'prometheemcp-stdio-'));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [CLI_PATH, '--stdio'],
    env: childEnvironment(configDirectory),
    stderr: 'pipe',
  });
  const client = new Client({ name: 'prometheemcp-onboarding-test', version: '1.0.0' });

  try {
    await client.connect(transport);
    assert.match(client.getInstructions() ?? '', /promethee_connection_status/u);
    assert.match(client.getInstructions() ?? '', /Never ask.*email code/iu);

    const listed = await client.listTools();
    assert.deepEqual(
      listed.tools.map((tool) => tool.name),
      [
        'promethee_connection_status',
        'promethee_list_tasks',
        'promethee_get_task',
        'promethee_list_projects',
        'promethee_create_project',
        'promethee_create_task',
      ],
    );

    const status = await client.callTool({
      name: 'promethee_connection_status',
      arguments: {},
    });
    assert.equal(status.isError, undefined);
    const connection = status.structuredContent as { connected?: boolean; loginUrl?: string };
    assert.equal(connection.connected, false);
    assert.match(connection.loginUrl ?? '', /^http:\/\/127\.0\.0\.1:\d+\/login$/u);

    const login = await fetch(connection.loginUrl!);
    assert.equal(login.status, 200);
    const loginHtml = await login.text();
    assert.match(loginHtml, /Promethee MCP/u);
    assert.doesNotMatch(loginHtml, /Configuration required/iu);

    const denied = await client.callTool({ name: 'promethee_list_tasks', arguments: {} });
    assert.equal(denied.isError, true);
    const text = denied.content.find((block) => block.type === 'text');
    assert.match(text?.type === 'text' ? text.text : '', /^authentication_required:/u);
  } finally {
    await client.close();
    rmSync(configDirectory, { recursive: true, force: true });
  }
});

test('browser pairing unlocks the same running MCP server without exposing session material', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'prometheemcp-live-pairing-'));
  const webRoot = join(directory, 'web');
  mkdirSync(join(webRoot, 'assets'), { recursive: true });
  writeFileSync(join(webRoot, 'index.html'), '<!doctype html><title>Promethee MCP</title>');
  const accessToken = 'aaaaaaaa.bbbbbbbb.cccccccc';
  const refreshToken = 'synthetic-refresh-token';
  const onboarding = await startLocalPersonalOnboarding({
    configDirectory: join(directory, 'config'),
    webRoot,
    preferredPort: 0,
    now: () => 1_787_947_200_000,
    fetch: async (request) => {
      const url = new URL(request.url);
      if (url.pathname === '/auth/v1/user') {
        return Response.json({ id: '11111111-1111-4111-8111-111111111111' });
      }
      if (url.pathname === '/rest/v1/task_projects') return Response.json([]);
      throw new Error(`Unexpected synthetic request: ${url.pathname}`);
    },
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createPrometheeMcpServer({
    application: unavailableApplication(),
    resolveToolContext: onboarding.composition.resolveToolContext,
    connectionStatus: {
      loginUrl: onboarding.loginUrl,
      status: () => ({ connected: onboarding.composition.connections.status().connected }),
    },
  });
  const client = new Client({ name: 'prometheemcp-live-pairing-test', version: '1.0.0' });

  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const before = await client.callTool({ name: 'promethee_connection_status', arguments: {} });
    assert.deepEqual(before.structuredContent, { connected: false, loginUrl: onboarding.loginUrl });

    const settings = await fetch(`${onboarding.origin}/connect/settings`, {
      method: 'PUT',
      headers: { Origin: onboarding.origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'seven-days' }),
    });
    assert.equal(settings.status, 200);
    const paired = await fetch(`${onboarding.origin}/connect/session`, {
      method: 'POST',
      headers: { Origin: onboarding.origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supabaseUrl: 'https://auth.promethee.io',
        publishableKey: 'sb_publishable_synthetic_test_key',
        accessToken,
        refreshToken,
        expiresAt: 1_787_950_800_000,
      }),
    });
    assert.equal(paired.status, 200);

    const after = await client.callTool({ name: 'promethee_connection_status', arguments: {} });
    assert.deepEqual(after.structuredContent, { connected: true });
    const projects = await client.callTool({ name: 'promethee_list_projects', arguments: {} });
    assert.equal(projects.isError, undefined);
    assert.deepEqual((projects.structuredContent as { projects?: unknown[] }).projects, []);
    assert.doesNotMatch(JSON.stringify([before, after, projects]), new RegExp(`${accessToken}|${refreshToken}`, 'u'));
  } finally {
    await client.close();
    await server.close();
    await onboarding.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
