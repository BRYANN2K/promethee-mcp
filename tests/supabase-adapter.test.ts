import assert from "node:assert/strict";
import test from "node:test";

import type { AuthContext } from "../src/auth/auth-context.js";
import { ApplicationError } from "../src/contracts/errors.js";
import { SupabasePrometheeFacade } from "../src/adapters/supabase/supabase-facade.js";
import { SYNTHETIC_SLICE_POLICY } from "../src/policy/slice-policy.js";

const principal: AuthContext = {
  subject: "2c5c93cc-1431-4c0f-98ed-65b5792e7d5a",
  clientId: "approved-mcp-client",
  issuer: "https://project.supabase.co/auth/v1",
  resource: "https://mcp.example.test/mcp",
  scopes: new Set(["tasks:read"]),
  expiresAt: 4_102_444_800,
};

const ACCESS_TOKEN = "synthetic.user.access-token";
const PUBLISHABLE_KEY = "sb_publishable_synthetic_test_key";

function expectApplicationError(code: ApplicationError["code"]) {
  return (error: unknown) => error instanceof ApplicationError && error.code === code;
}

test("Supabase facade calls only the fixed task RPC with a user token and no user id", async () => {
  const requests: Request[] = [];
  const facade = new SupabasePrometheeFacade({
    baseUrl: "https://project.supabase.co",
    publishableKey: PUBLISHABLE_KEY,
    principal,
    accessToken: ACCESS_TOKEN,
    policy: SYNTHETIC_SLICE_POLICY,
    async fetch(request) {
      requests.push(request.clone());
      return Response.json([
        {
          id: "task-1",
          title: "Prepare client report",
          status: "open",
          project_id: "project-1",
          scheduled_date: "2026-08-28",
          created_at: "2026-08-27T10:00:00.000Z",
          updated_at: null,
        },
        {
          id: "task-2",
          title: "Hidden look-ahead row",
          status: "open",
          project_id: null,
          scheduled_date: null,
          created_at: null,
          updated_at: null,
        },
      ]);
    },
  });

  const page = await facade.listTasks(
    principal,
    { projectId: "project-1", status: "open", pageToken: null, limit: 1 },
    new AbortController().signal,
  ) as {
    records: unknown[];
    nextPageToken: string | null;
    sourceVersion: string;
  };

  assert.equal(requests.length, 1);
  const request = requests[0]!;
  assert.equal(request.method, "POST");
  assert.equal(request.url, "https://project.supabase.co/rest/v1/rpc/mcp_list_tasks_v1");
  assert.equal(request.headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
  assert.equal(request.headers.get("apikey"), PUBLISHABLE_KEY);
  const requestBody = await request.json();
  assert.deepEqual(requestBody, {
    p_after_id: null,
    p_limit: 2,
    p_project_id: "project-1",
    p_status: "open",
  });
  assert.equal(JSON.stringify(requestBody).includes(principal.subject), false);
  assert.deepEqual(page, {
    records: [
      {
        id: "task-1",
        title: "Prepare client report",
        status: "open",
        projectId: "project-1",
        scheduledDate: "2026-08-28",
        createdAt: "2026-08-27T10:00:00.000Z",
        updatedAt: null,
      },
    ],
    nextPageToken: "task-1",
    sourceVersion: "promethee-supabase-rpc-v1",
  });
});

test("Supabase facade maps fixed project and task lookup RPC results", async () => {
  const calledPaths: string[] = [];
  const facade = new SupabasePrometheeFacade({
    baseUrl: "https://project.supabase.co",
    publishableKey: PUBLISHABLE_KEY,
    principal,
    accessToken: ACCESS_TOKEN,
    policy: SYNTHETIC_SLICE_POLICY,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      calledPaths.push(path);
      if (path.endsWith("mcp_get_task_v1")) {
        return Response.json([{
          id: "task-1",
          title: "Prepare client report",
          status: "completed",
          project_id: null,
          scheduled_date: null,
          created_at: null,
          updated_at: "2026-08-27T12:00:00.000Z",
        }]);
      }
      return Response.json([
        { id: "project-1", name: "Client A", status: "active" },
      ]);
    },
  });

  assert.deepEqual(
    await facade.getTask(principal, { taskId: "task-1" }, new AbortController().signal),
    {
      record: {
        id: "task-1",
        title: "Prepare client report",
        status: "completed",
        projectId: null,
        scheduledDate: null,
        createdAt: null,
        updatedAt: "2026-08-27T12:00:00.000Z",
      },
      sourceVersion: "promethee-supabase-rpc-v1",
    },
  );
  assert.deepEqual(
    await facade.listProjects(
      principal,
      { pageToken: null, limit: 2 },
      new AbortController().signal,
    ),
    {
      records: [{ id: "project-1", name: "Client A", status: "active" }],
      nextPageToken: null,
      sourceVersion: "promethee-supabase-rpc-v1",
    },
  );
  assert.deepEqual(calledPaths, [
    "/rest/v1/rpc/mcp_get_task_v1",
    "/rest/v1/rpc/mcp_list_projects_v1",
  ]);
});

test("Supabase facade fails closed for RLS denial, identity mismatch and malformed rows", async () => {
  const denied = new SupabasePrometheeFacade({
    baseUrl: "https://project.supabase.co",
    publishableKey: PUBLISHABLE_KEY,
    principal,
    accessToken: ACCESS_TOKEN,
    policy: SYNTHETIC_SLICE_POLICY,
    fetch: async () => Response.json(
      { message: "private policy detail" },
      { status: 403 },
    ),
  });
  await assert.rejects(
    denied.listProjects(principal, { pageToken: null, limit: 1 }, new AbortController().signal),
    expectApplicationError("access_denied"),
  );

  await assert.rejects(
    denied.listProjects(
      { ...principal, subject: "another-user" },
      { pageToken: null, limit: 1 },
      new AbortController().signal,
    ),
    expectApplicationError("access_denied"),
  );

  const malformed = new SupabasePrometheeFacade({
    baseUrl: "https://project.supabase.co",
    publishableKey: PUBLISHABLE_KEY,
    principal,
    accessToken: ACCESS_TOKEN,
    policy: SYNTHETIC_SLICE_POLICY,
    fetch: async () => Response.json([{ id: "task-1", unexpected: ACCESS_TOKEN }]),
  });
  await assert.rejects(
    malformed.listTasks(
      principal,
      { projectId: null, status: "all", pageToken: null, limit: 1 },
      new AbortController().signal,
    ),
    expectApplicationError("incompatible_source"),
  );
});

test("Supabase facade sends only fixed create RPC bodies and validates closed outcomes", async () => {
  const requests: Request[] = [];
  const writer = {
    ...principal,
    scopes: new Set(["tasks:read", "projects:write", "tasks:write"]),
  };
  const facade = new SupabasePrometheeFacade({
    baseUrl: "https://project.supabase.co",
    publishableKey: PUBLISHABLE_KEY,
    principal: writer,
    accessToken: ACCESS_TOKEN,
    policy: SYNTHETIC_SLICE_POLICY,
    async fetch(request) {
      requests.push(request.clone());
      const path = new URL(request.url).pathname;
      if (path.endsWith("mcp_create_project_v1")) {
        return Response.json({
          outcome: "created",
          record: { id: "project-created", name: "Client A", status: "active" },
        });
      }
      return Response.json({
        outcome: "replayed",
        record: {
          id: "task-created",
          title: "Prepare report",
          status: "open",
          project_id: "project-created",
          scheduled_date: null,
          created_at: "2026-08-28T10:00:00Z",
          updated_at: null,
        },
      });
    },
  });

  assert.deepEqual(
    await facade.createProject(
      writer,
      { name: "Client A", clientRequestId: "request_project_rpc_01" },
      new AbortController().signal,
    ),
    {
      outcome: "created",
      record: { id: "project-created", name: "Client A", status: "active" },
      sourceVersion: "promethee-supabase-rpc-v1",
    },
  );
  assert.deepEqual(
    await facade.createTask(
      writer,
      {
        title: "Prepare report",
        projectId: "project-created",
        clientRequestId: "request_task_rpc_0001",
      },
      new AbortController().signal,
    ),
    {
      outcome: "replayed",
      record: {
        id: "task-created",
        title: "Prepare report",
        status: "open",
        projectId: "project-created",
        scheduledDate: null,
        createdAt: "2026-08-28T10:00:00Z",
        updatedAt: null,
      },
      sourceVersion: "promethee-supabase-rpc-v1",
    },
  );

  assert.equal(requests[0]?.url, "https://project.supabase.co/rest/v1/rpc/mcp_create_project_v1");
  assert.equal(requests[1]?.url, "https://project.supabase.co/rest/v1/rpc/mcp_create_task_v1");
  const projectBody = await requests[0]?.json();
  const taskBody = await requests[1]?.json();
  assert.deepEqual(projectBody, {
    p_name: "Client A",
    p_client_request_id: "request_project_rpc_01",
  });
  assert.deepEqual(taskBody, {
    p_title: "Prepare report",
    p_project_id: "project-created",
    p_client_request_id: "request_task_rpc_0001",
  });
  assert.equal(JSON.stringify(taskBody).includes(principal.subject), false);
});

test("Supabase create facade maps conflicts, unavailable projects, and rate limits without response detail", async () => {
  const writer = { ...principal, scopes: new Set(["projects:write", "tasks:write"]) };
  const outcomes: Array<Response> = [
    Response.json({ outcome: "idempotency_conflict" }),
    Response.json({ outcome: "not_found" }),
    Response.json({ message: "private quota detail" }, { status: 429 }),
  ];
  const facade = new SupabasePrometheeFacade({
    baseUrl: "https://project.supabase.co",
    publishableKey: PUBLISHABLE_KEY,
    principal: writer,
    accessToken: ACCESS_TOKEN,
    policy: SYNTHETIC_SLICE_POLICY,
    fetch: async () => outcomes.shift() ?? Response.json({}, { status: 500 }),
  });

  assert.deepEqual(
    await facade.createProject(
      writer,
      { name: "Client", clientRequestId: "request_project_rpc_02" },
      new AbortController().signal,
    ),
    { outcome: "idempotency_conflict" },
  );
  assert.deepEqual(
    await facade.createTask(
      writer,
      { title: "Task", projectId: "missing", clientRequestId: "request_task_rpc_0002" },
      new AbortController().signal,
    ),
    { outcome: "not_found" },
  );
  await assert.rejects(
    facade.createProject(
      writer,
      { name: "Client", clientRequestId: "request_project_rpc_03" },
      new AbortController().signal,
    ),
    expectApplicationError("rate_limited"),
  );
});
