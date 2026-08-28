import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import type { McpHttpHandler } from "@modelcontextprotocol/server";

import { createPersonalRuntime } from "../src/runtime/personal-runtime.js";
import {
  EncryptedFilePersonalSessionPersistence,
  startNodeServer,
  type PrometheeRuntime,
} from "../src/runtime/index.js";

const SUBJECT = "2c5c93cc-1431-4c0f-98ed-65b5792e7d5a";
const ACCESS_TOKEN = "synthetic.user.access-token";
const REFRESH_TOKEN = "synthetic-refresh-token-value";
const PUBLISHABLE_KEY = "sb_publishable_synthetic_test_key";
const UI_ORIGIN = "http://127.0.0.1:4175";
const MCP_ACCESS_TOKEN = "M".repeat(43);
const EDGE_TOKEN = "E".repeat(43);

test("production personal runtime executes all five MCP tools through the authenticated HTTP boundary", async () => {
  let delegate: PrometheeRuntime | undefined;
  const requests: Request[] = [];
  const proxy: PrometheeRuntime = {
    get mcpHandler(): McpHttpHandler {
      if (delegate === undefined) throw new Error("Personal runtime is not initialized");
      return delegate.mcpHandler;
    },
    preflight(request): Response | undefined {
      if (delegate === undefined) throw new Error("Personal runtime is not initialized");
      return delegate.preflight(request);
    },
    fetch(request): Promise<Response> {
      if (delegate === undefined) throw new Error("Personal runtime is not initialized");
      return delegate.fetch(request);
    },
    close(): Promise<void> {
      return delegate?.close() ?? Promise.resolve();
    },
  };
  const running = await startNodeServer({ runtime: proxy, host: "127.0.0.1", port: 0 });
  const authority = `127.0.0.1:${String(running.address.port)}`;
  const projects: Array<Record<string, unknown>> = [{
    id: "project-a",
    name: "Client Alpha",
    deleted: false,
  }];
  const tasks: Array<Record<string, unknown>> = [{
    id: "task-a",
    text: "Prepare production check",
    completed: false,
    project_id: "project-a",
    scheduled_date: null,
    created_at: 1_787_943_600_000,
    updated_at: null,
  }];
  const composition = createPersonalRuntime({
    authority,
    uiOrigins: [UI_ORIGIN],
    publicMcpUrl: "https://mcp.example.test/mcp",
    allowedHosts: [authority, "mcp.example.test"],
    mcpAccessToken: MCP_ACCESS_TOKEN,
    edgeToken: EDGE_TOKEN,
    cursorKey: new Uint8Array(32).fill(23),
    now: () => 1_787_947_200_000,
    async fetch(request) {
      requests.push(request.clone());
      const url = new URL(request.url);
      if (url.pathname === "/auth/v1/user") return Response.json({ id: SUBJECT });
      if (request.method === "POST" && url.pathname === "/rest/v1/task_projects") {
        const body = await request.clone().json() as Record<string, unknown>;
        const row = { id: body["id"], name: body["name"], deleted: false };
        projects.push(row);
        return Response.json([row]);
      }
      if (request.method === "POST" && url.pathname === "/rest/v1/tasks") {
        const body = await request.clone().json() as Record<string, unknown>;
        const row = {
          id: body["id"],
          text: body["text"],
          completed: false,
          project_id: body["project_id"],
          scheduled_date: null,
          created_at: body["created_at"],
          updated_at: body["updated_at"],
        };
        tasks.push(row);
        return Response.json([row]);
      }
      if (url.pathname === "/rest/v1/tasks" && url.searchParams.get("select") === "position") {
        return Response.json([{ position: 2 }]);
      }
      if (url.pathname === "/rest/v1/task_projects" && url.searchParams.get("select") === "position") {
        return Response.json([{ position: 1 }]);
      }
      if (url.pathname === "/rest/v1/task_projects") {
        const id = url.searchParams.get("id")?.replace(/^eq\./u, "");
        return Response.json(id === undefined ? projects : projects.filter((row) => row["id"] === id));
      }
      if (url.pathname === "/rest/v1/tasks") {
        const id = url.searchParams.get("id")?.replace(/^eq\./u, "");
        return Response.json(id === undefined ? tasks : tasks.filter((row) => row["id"] === id));
      }
      throw new Error(`Unexpected upstream request: ${request.method} ${url.pathname}`);
    },
  });
  delegate = composition.runtime;
  const base = `http://${authority}`;

  try {
    const before = await fetch(`${base}/connect/status`, {
      headers: { Origin: UI_ORIGIN, "X-Promethee-Edge-Token": EDGE_TOKEN },
    });
    assert.equal(before.status, 200);
    assert.deepEqual(await before.json(), { connected: false });

    const paired = await fetch(`${base}/connect/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: UI_ORIGIN,
        "X-Promethee-Edge-Token": EDGE_TOKEN,
      },
      body: JSON.stringify({
        supabaseUrl: "https://auth.promethee.io",
        publishableKey: PUBLISHABLE_KEY,
        accessToken: ACCESS_TOKEN,
        refreshToken: REFRESH_TOKEN,
        expiresAt: 1_787_950_800_000,
      }),
    });
    assert.equal(paired.status, 200);
    assert.deepEqual(await paired.json(), { connected: true });

    const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${MCP_ACCESS_TOKEN}` } },
    });
    const client = new Client(
      { name: "personal-runtime-test", version: "1.0.0" },
      { versionNegotiation: { mode: "auto" } },
    );
    try {
      await client.connect(transport);
      const listedProjects = await client.callTool({
        name: "promethee_list_projects",
        arguments: {},
      });
      const listedTasks = await client.callTool({
        name: "promethee_list_tasks",
        arguments: {},
      });
      const task = await client.callTool({
        name: "promethee_get_task",
        arguments: { taskId: "task-a" },
      });
      const project = await client.callTool({
        name: "promethee_create_project",
        arguments: { name: "Client Beta", clientRequestId: "personal_test_project_01" },
      });
      const createdTask = await client.callTool({
        name: "promethee_create_task",
        arguments: { title: "hello", projectId: "project-a", clientRequestId: "personal_test_hello_01" },
      });
      for (const result of [listedProjects, listedTasks, task, project, createdTask]) {
        assert.equal(result.isError, undefined);
      }
      assert.equal((listedProjects.structuredContent as { projects?: unknown[] }).projects?.length, 1);
      assert.equal((listedTasks.structuredContent as { tasks?: unknown[] }).tasks?.length, 1);
      assert.equal((task.structuredContent as { task?: { id?: string } }).task?.id, "task-a");
      assert.equal((project.structuredContent as { project?: { name?: string } }).project?.name, "Client Beta");
      assert.equal((createdTask.structuredContent as { task?: { title?: string } }).task?.title, "hello");
    } finally {
      await client.close();
    }

    const taskInsert = requests.find((request) => request.method === "POST" && new URL(request.url).pathname === "/rest/v1/tasks");
    assert.ok(taskInsert);
    const body = await taskInsert.clone().json() as Record<string, unknown>;
    assert.equal(body["user_id"], SUBJECT);
    assert.equal(body["text"], "hello");
    assert.equal(body["project_id"], "project-a");
    assert.equal(JSON.stringify(resultSafe(composition.connections.status())).includes(ACCESS_TOKEN), false);
  } finally {
    await running.close();
  }
});

test("production personal runtime requires the trusted edge and MCP bearer", async () => {
  const authority = "127.0.0.1:4329";
  const composition = createPersonalRuntime({
    authority,
    publicMcpUrl: "https://mcp.example.test/mcp",
    allowedHosts: [authority, "mcp.example.test"],
    uiOrigins: ["https://mcp.example.test"],
    mcpAccessToken: MCP_ACCESS_TOKEN,
    edgeToken: EDGE_TOKEN,
    now: () => 1_787_947_200_000,
    fetch(request) {
      if (new URL(request.url).pathname === "/auth/v1/user") {
        return Promise.resolve(Response.json({ id: SUBJECT }));
      }
      throw new Error("Unexpected upstream request");
    },
  });

  try {
    const rejectedPairing = await composition.runtime.fetch(new Request(
      "https://mcp.example.test/connect/session",
      {
        method: "POST",
        headers: { Host: "mcp.example.test", Origin: "https://mcp.example.test", "Content-Type": "application/json" },
        body: JSON.stringify({
          supabaseUrl: "https://auth.promethee.io",
          publishableKey: PUBLISHABLE_KEY,
          accessToken: ACCESS_TOKEN,
          refreshToken: REFRESH_TOKEN,
          expiresAt: 1_787_950_800_000,
        }),
      },
    ));
    assert.equal(rejectedPairing.status, 403);

    const acceptedPairing = await composition.runtime.fetch(new Request(
      "https://mcp.example.test/connect/session",
      {
        method: "POST",
        headers: {
          Host: "mcp.example.test",
          Origin: "https://mcp.example.test",
          "Content-Type": "application/json",
          "X-Promethee-Edge-Token": EDGE_TOKEN,
        },
        body: JSON.stringify({
          supabaseUrl: "https://auth.promethee.io",
          publishableKey: PUBLISHABLE_KEY,
          accessToken: ACCESS_TOKEN,
          refreshToken: REFRESH_TOKEN,
          expiresAt: 1_787_950_800_000,
        }),
      },
    ));
    assert.equal(acceptedPairing.status, 200);

    const unauthorized = await composition.runtime.fetch(new Request(
      "https://mcp.example.test/mcp",
      { method: "POST", headers: { Host: "mcp.example.test" } },
    ));
    assert.equal(unauthorized.status, 401);

    const settings = await composition.runtime.fetch(new Request(
      "https://mcp.example.test/connect/settings",
      {
        headers: {
          Host: "mcp.example.test",
          Origin: "https://mcp.example.test",
          "X-Promethee-Edge-Token": EDGE_TOKEN,
        },
      },
    ));
    assert.equal(settings.status, 200);
    assert.deepEqual(await settings.json(), { mode: "memory" });
  } finally {
    await composition.runtime.close();
  }
});

test("production personal runtime restores its encrypted session and retention choice after restart", async () => {
  const authority = "127.0.0.1:4330";
  const directory = mkdtempSync(join(tmpdir(), "promethee-mcp-runtime-session-"));
  const file = join(directory, "session.enc");
  const key = new Uint8Array(32).fill(31);
  const now = 1_787_947_200_000;
  const create = () => createPersonalRuntime({
    authority,
    publicMcpUrl: "https://mcp.example.test/mcp",
    allowedHosts: [authority, "mcp.example.test"],
    uiOrigins: ["https://mcp.example.test"],
    mcpAccessToken: MCP_ACCESS_TOKEN,
    edgeToken: EDGE_TOKEN,
    persistence: new EncryptedFilePersonalSessionPersistence({ file, key }),
    defaultRetention: "seven-days",
    now: () => now,
    fetch(request) {
      if (new URL(request.url).pathname === "/auth/v1/user") {
        return Promise.resolve(Response.json({ id: SUBJECT }));
      }
      throw new Error("Unexpected upstream request");
    },
  });

  try {
    const first = create();
    const paired = await first.runtime.fetch(new Request(
      "https://mcp.example.test/connect/session",
      {
        method: "POST",
        headers: {
          Host: "mcp.example.test",
          Origin: "https://mcp.example.test",
          "Content-Type": "application/json",
          "X-Promethee-Edge-Token": EDGE_TOKEN,
        },
        body: JSON.stringify({
          supabaseUrl: "https://auth.promethee.io",
          publishableKey: PUBLISHABLE_KEY,
          accessToken: ACCESS_TOKEN,
          refreshToken: REFRESH_TOKEN,
          expiresAt: now + 3_600_000,
        }),
      },
    ));
    assert.equal(paired.status, 200);
    await first.runtime.close();

    const restarted = create();
    assert.deepEqual(restarted.connections.status(), {
      connected: true,
      expiresAt: now + 3_600_000,
    });
    assert.equal(restarted.connections.retention().mode, "seven-days");

    const noRenewal = await restarted.runtime.fetch(new Request(
      "https://mcp.example.test/connect/settings",
      {
        method: "PUT",
        headers: {
          Host: "mcp.example.test",
          Origin: "https://mcp.example.test",
          "Content-Type": "application/json",
          "X-Promethee-Edge-Token": EDGE_TOKEN,
        },
        body: JSON.stringify({ mode: "memory" }),
      },
    ));
    assert.equal(noRenewal.status, 200);
    assert.deepEqual(await noRenewal.json(), { mode: "memory" });
    await restarted.runtime.close();

    const memoryRestart = create();
    assert.deepEqual(memoryRestart.connections.retention(), { mode: "memory" });
    assert.deepEqual(memoryRestart.connections.status(), { connected: false });
    await memoryRestart.runtime.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function resultSafe(value: unknown): unknown {
  return value;
}
