import assert from "node:assert/strict";
import test from "node:test";

import { DirectSupabasePrometheeFacade } from "../src/adapters/supabase/direct-supabase-facade.js";
import type { AuthContext } from "../src/auth/auth-context.js";
import { SYNTHETIC_SLICE_POLICY } from "../src/policy/slice-policy.js";

const principal: AuthContext = {
  subject: "2c5c93cc-1431-4c0f-98ed-65b5792e7d5a",
  clientId: "personal-loopback",
  issuer: "https://auth.promethee.io/auth/v1",
  resource: "http://127.0.0.1:3210/mcp",
  scopes: new Set(["tasks:read", "projects:read", "tasks:write", "projects:write"]),
  expiresAt: 4_102_444_800,
};

const ACCESS_TOKEN = "synthetic.user.access-token";
const PUBLISHABLE_KEY = "sb_publishable_synthetic_test_key";

test("direct facade lists only the authenticated user's bounded task rows", async () => {
  const requests: Request[] = [];
  const facade = new DirectSupabasePrometheeFacade({
    baseUrl: "https://auth.promethee.io",
    publishableKey: PUBLISHABLE_KEY,
    principal,
    accessToken: ACCESS_TOKEN,
    policy: SYNTHETIC_SLICE_POLICY,
    async fetch(request) {
      requests.push(request.clone());
      return Response.json([
        {
          id: "task-1",
          text: "Prepare report",
          completed: false,
          project_id: null,
          scheduled_date: null,
          created_at: 1_787_904_000_000,
          updated_at: 1_787_904_001_000,
        },
      ]);
    },
  });

  const page = await facade.listTasks(
    principal,
    { projectId: null, status: "open", pageToken: null, limit: 2 },
    new AbortController().signal,
  );

  assert.deepEqual(page, {
    records: [{
      id: "task-1",
      title: "Prepare report",
      status: "open",
      projectId: null,
      scheduledDate: null,
      createdAt: new Date(1_787_904_000_000).toISOString(),
      updatedAt: new Date(1_787_904_001_000).toISOString(),
    }],
    nextPageToken: null,
    sourceVersion: "promethee-postgrest-user-v1",
  });
  const url = new URL(requests[0]!.url);
  assert.equal(url.pathname, "/rest/v1/tasks");
  assert.equal(url.searchParams.get("user_id"), `eq.${principal.subject}`);
  assert.equal(url.searchParams.get("deleted"), "eq.false");
  assert.equal(url.searchParams.get("completed"), "eq.false");
  assert.equal(url.searchParams.get("limit"), "3");
  assert.equal(requests[0]!.headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
});

test("direct facade creates an idempotent unassigned task using the public mobile contract", async () => {
  const requests: Request[] = [];
  const now = 1_787_947_200_000;
  const facade = new DirectSupabasePrometheeFacade({
    baseUrl: "https://auth.promethee.io",
    publishableKey: PUBLISHABLE_KEY,
    principal,
    accessToken: ACCESS_TOKEN,
    policy: SYNTHETIC_SLICE_POLICY,
    now: () => now,
    async fetch(request) {
      requests.push(request.clone());
      if (request.method === "POST") {
        const body = await request.clone().json() as Record<string, unknown>;
        return Response.json([{
          id: body["id"],
          text: body["text"],
          completed: false,
          project_id: null,
          scheduled_date: null,
          created_at: now,
          updated_at: now,
        }]);
      }
      const url = new URL(request.url);
      return url.searchParams.get("select") === "position"
        ? Response.json([{ position: 6 }])
        : Response.json([]);
    },
  });

  const result = await facade.createTask(
    principal,
    { title: "hello", projectId: null, clientRequestId: "live-hello-20260828" },
    new AbortController().signal,
  ) as {
    outcome: string;
    record: {
      id: string;
      title: string;
      status: string;
      projectId: string | null;
      scheduledDate: string | null;
      createdAt: string | null;
      updatedAt: string | null;
    };
  };

  assert.equal(result.outcome, "created");
  assert.match(result.record.id, /^[0-9a-f-]{36}$/u);
  assert.deepEqual(result.record, {
    id: result.record.id,
    title: "hello",
    status: "open",
    projectId: null,
    scheduledDate: null,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  });
  const post = requests.find((request) => request.method === "POST");
  assert.ok(post);
  const body = await post.clone().json() as Record<string, unknown>;
  assert.match(String(body["id"]), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  assert.equal(body["user_id"], principal.subject);
  assert.equal(body["text"], "hello");
  assert.equal(body["position"], 7);
  assert.equal(body["project_id"], null);
  assert.equal(body["source"], "manual");
  assert.equal(post.headers.get("prefer"), "return=representation");
});
