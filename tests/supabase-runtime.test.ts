import assert from "node:assert/strict";
import test from "node:test";

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

import { createSupabaseJwtTokenVerifierFromJwks } from "../src/auth/supabase-jwt-token-verifier.js";
import { SYNTHETIC_SLICE_POLICY } from "../src/policy/slice-policy.js";
import { createSupabaseRuntime } from "../src/runtime/supabase-runtime.js";
import { createSyntheticSupabaseIssuer } from "./support/synthetic-issuer.js";

test("Supabase runtime crosses OAuth verification, MCP and fixed RPC adapter without real network", async () => {
  const now = 1_788_000_000;
  const resource = "https://mcp.example.test/mcp";
  const issuer = await createSyntheticSupabaseIssuer({
    now,
    issuer: "https://project.supabase.co/auth/v1",
    resource,
  });
  const accessToken = await issuer.issue({
    claims: { scope: "openid email tasks:read projects:write" },
  });
  const permissionsByClientId = new Map([
    [issuer.clientId, new Set(["tasks:read", "projects:write"])],
  ]);
  const verifier = createSupabaseJwtTokenVerifierFromJwks({
    issuer: issuer.issuer,
    resource,
    jwks: issuer.jwks,
    permissionsByClientId,
    clock: () => now,
    clockToleranceSeconds: 0,
  });
  const upstreamRequests: Request[] = [];
  const runtime = createSupabaseRuntime({
    publicMcpUrl: resource,
    supabaseUrl: "https://project.supabase.co",
    publishableKey: "sb_publishable_synthetic_runtime_key",
    permissionsByClientId,
    allowedHosts: ["mcp.example.test"],
    allowedOrigins: ["https://client.example.test"],
    cursorKey: new Uint8Array(32).fill(23),
    policy: SYNTHETIC_SLICE_POLICY,
    tokenVerifier: verifier,
    clock: { now: () => new Date(now * 1_000) },
    async fetch(request) {
      upstreamRequests.push(request.clone());
      if (request.url.endsWith("mcp_create_project_v1")) {
        return Response.json({
          outcome: "created",
          record: { id: "project-created", name: "Client Alpha", status: "active" },
        });
      }
      assert.equal(request.url, "https://project.supabase.co/rest/v1/rpc/mcp_list_tasks_v1");
      return Response.json([
        {
          id: "task-a",
          title: "Prepare MCP staging review",
          status: "open",
          project_id: null,
          scheduled_date: null,
          created_at: "2026-08-28T08:00:00.000Z",
          updated_at: null,
        },
      ]);
    },
  });

  const metadataRequest = new Request(
    "https://mcp.example.test/.well-known/oauth-protected-resource/mcp",
    { headers: { Host: "mcp.example.test" } },
  );
  const metadataResponse = await runtime.fetch(metadataRequest);
  assert.equal(metadataResponse.status, 200);
  assert.deepEqual(await metadataResponse.json(), {
    resource,
    authorization_servers: [issuer.issuer],
    scopes_supported: ["openid", "email", "projects:write", "tasks:write", "tasks:read"],
    resource_name: "Promethee MCP resource server",
  });

  const challenge = await runtime.fetch(new Request(resource, {
    method: "POST",
    headers: { Host: "mcp.example.test" },
  }));
  assert.equal(challenge.status, 401);
  assert.doesNotMatch(challenge.headers.get("www-authenticate") ?? "", /tasks:read/u);

  const client = new Client(
    { name: "supabase-runtime-test", version: "1.0.0" },
    { versionNegotiation: { mode: "auto" } },
  );
  const transport = new StreamableHTTPClientTransport(new URL(resource), {
    authProvider: { token: async () => accessToken },
    fetch: (url, init) => {
      const headers = new Headers(init?.headers);
      headers.set("host", "mcp.example.test");
      return runtime.fetch(new Request(url, { ...init, headers }));
    },
  });

  try {
    await client.connect(transport);
    const result = await client.callTool({
      name: "promethee_list_tasks",
      arguments: { status: "open", limit: 1 },
    });

    assert.equal(result.isError, undefined);
    assert.deepEqual(result.structuredContent, {
      tasks: [{
        id: "task-a",
        title: "Prepare MCP staging review",
        status: "open",
        projectId: null,
        scheduledDate: null,
        createdAt: "2026-08-28T08:00:00.000Z",
        updatedAt: null,
      }],
      nextCursor: null,
      observedAt: new Date(now * 1_000).toISOString(),
      freshness: "unknown",
      sourceVersion: "promethee-supabase-rpc-v1",
    });

    const created = await client.callTool({
      name: "promethee_create_project",
      arguments: {
        name: "Client Alpha",
        clientRequestId: "request_runtime_project_01",
      },
    });
    assert.equal(created.isError, undefined);
    assert.deepEqual(created.structuredContent, {
      project: { id: "project-created", name: "Client Alpha", status: "active" },
      observedAt: new Date(now * 1_000).toISOString(),
      freshness: "unknown",
      sourceVersion: "promethee-supabase-rpc-v1",
    });

    assert.equal(upstreamRequests.length, 2);
    const readBody = await upstreamRequests[0]!.json();
    const createBody = await upstreamRequests[1]!.json();
    assert.equal(JSON.stringify(readBody).includes("user"), false);
    assert.deepEqual(createBody, {
      p_name: "Client Alpha",
      p_client_request_id: "request_runtime_project_01",
    });
    assert.equal(JSON.stringify(createBody).includes("user"), false);
    assert.equal(upstreamRequests[0]!.headers.get("authorization"), `Bearer ${accessToken}`);
    assert.equal(upstreamRequests[1]!.headers.get("authorization"), `Bearer ${accessToken}`);
  } finally {
    await client.close();
    await runtime.close();
  }
});

test("Supabase runtime rejects unsafe or incomplete configuration before serving", () => {
  const base = {
    publicMcpUrl: "https://mcp.example.test/mcp",
    supabaseUrl: "https://project.supabase.co",
    publishableKey: "sb_publishable_synthetic_runtime_key",
    permissionsByClientId: new Map([["approved-client", new Set(["tasks:read"])]]),
    allowedHosts: ["mcp.example.test"],
    allowedOrigins: ["https://client.example.test"],
    cursorKey: new Uint8Array(32).fill(23),
    policy: SYNTHETIC_SLICE_POLICY,
  };

  assert.throws(
    () => createSupabaseRuntime({ ...base, publicMcpUrl: "http://mcp.example.test/mcp" }),
    /absolute HTTPS/u,
  );
  assert.throws(
    () => createSupabaseRuntime({ ...base, supabaseUrl: "https://project.supabase.co/private" }),
    /HTTPS origin/u,
  );
  assert.throws(
    () => createSupabaseRuntime({ ...base, publishableKey: "service-role-secret" }),
    /publishable key/u,
  );
  assert.throws(
    () => createSupabaseRuntime({ ...base, allowedHosts: ["other.example.test"] }),
    /public MCP authority/u,
  );
});
