import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const workspace = mkdtempSync(join(tmpdir(), 'prometheemcp-package-smoke-'));
const configDirectory = join(workspace, 'config');
const expectedTools = [
  'promethee_connection_status',
  'promethee_create_project',
  'promethee_create_task',
  'promethee_get_task',
  'promethee_list_projects',
  'promethee_list_tasks',
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    ...options,
  });
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result.stdout.trim();
}

async function smokeStdio(tarball) {
  const child = spawn('npx', ['-y', `--package=${tarball}`, '--', 'prometheemcp', '--stdio'], {
    cwd: workspace,
    env: { ...process.env, PROMETHEE_MCP_CONFIG_DIR: configDirectory },
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const stderr = [];
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => stderr.push(chunk));
  const pending = new Map();
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      for (const { reject } of pending.values()) reject(new Error(`Non-JSON stdout from MCP server: ${line}`));
      pending.clear();
      return;
    }
    if (typeof message?.id !== 'number') return;
    const request = pending.get(message.id);
    if (request === undefined) return;
    pending.delete(message.id);
    if (message.error !== undefined) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });

  let nextId = 0;
  function request(method, params) {
    const id = ++nextId;
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  }
  function notify(method, params = {}) {
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }

  const timeout = setTimeout(() => {
    for (const { reject } of pending.values()) reject(new Error(`MCP smoke test timed out. stderr:\n${stderr.join('')}`));
    pending.clear();
    child.kill('SIGTERM');
  }, 30_000);

  try {
    const initialized = await request('initialize', {
      protocolVersion: '2026-07-28',
      capabilities: {},
      clientInfo: { name: 'prometheemcp-package-smoke', version: '1.0.0' },
    });
    assert.equal(initialized?.serverInfo?.name, 'promethee-mcp');
    notify('notifications/initialized');

    const listed = await request('tools/list', {});
    const toolNames = listed.tools.map((tool) => tool.name).sort();
    assert.deepEqual(toolNames, expectedTools);

    const status = await request('tools/call', {
      name: 'promethee_connection_status',
      arguments: {},
    });
    assert.equal(status.structuredContent.connected, false);
    const loginUrl = status.structuredContent.loginUrl;
    assert.match(loginUrl, /^http:\/\/127\.0\.0\.1:\d+\/login$/u);
    const login = await fetch(loginUrl, { redirect: 'error' });
    assert.equal(login.status, 200);
    assert.match(await login.text(), /<html[\s>]/iu);
  } finally {
    clearTimeout(timeout);
    lines.close();
    child.stdin.end();
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) resolve();
      else child.once('exit', resolve);
    });
  }
}

try {
  const packed = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', workspace]));
  assert.equal(packed.length, 1);
  const tarball = join(workspace, packed[0].filename);
  const packageSpec = pathToFileURL(tarball).href;
  const version = run('npx', ['-y', `--package=${packageSpec}`, '--', 'prometheemcp', '--version']);
  assert.equal(version, `prometheemcp ${packageJson.version}`);
  await smokeStdio(packageSpec);
  process.stdout.write(`Packed npx smoke passed for promethee-mcp@${packageJson.version}.\n`);
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
