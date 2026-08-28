import assert from "node:assert/strict";
import test from "node:test";

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import type { McpHttpHandler } from "@modelcontextprotocol/server";

import { createSyntheticJwtTokenVerifier } from "../src/auth/jwt-token-verifier.js";
import {
  startNodeServer,
  type PrometheeRuntime,
} from "../src/runtime/index.js";
import { createSyntheticRuntime } from "../src/runtime/synthetic-runtime.js";
import { createSyntheticIssuer } from "./support/synthetic-issuer.js";

test("authenticated MCP request crosses the complete synthetic stack without exposing its token", async () => {
  let delegate: PrometheeRuntime | undefined;
  const proxy: PrometheeRuntime = {
    get mcpHandler(): McpHttpHandler {
      if (delegate === undefined) throw new Error("Synthetic runtime is not initialized");
      return delegate.mcpHandler;
    },
    preflight(request): Response | undefined {
      if (delegate === undefined) throw new Error("Synthetic runtime is not initialized");
      return delegate.preflight(request);
    },
    fetch(request): Promise<Response> {
      if (delegate === undefined) throw new Error("Synthetic runtime is not initialized");
      return delegate.fetch(request);
    },
    close(): Promise<void> {
      return delegate?.close() ?? Promise.resolve();
    },
  };
  const running = await startNodeServer({ runtime: proxy, host: "127.0.0.1", port: 0 });
  const authority = `127.0.0.1:${running.address.port}`;
  const resource = `http://${authority}/mcp`;
  const now = Math.floor(Date.now() / 1_000);
  const issuer = await createSyntheticIssuer({
    now,
    issuer: `http://${authority}`,
    resource,
  });
  const token = await issuer.issue();
  const verifier = createSyntheticJwtTokenVerifier({
    issuer: issuer.issuer,
    resource: issuer.resource,
    jwks: issuer.jwks,
    allowedClientIds: new Set([issuer.clientId]),
    allowedScopes: new Set(["tasks:read"]),
    clock: () => now,
    clockToleranceSeconds: 0,
  });
  delegate = createSyntheticRuntime({
    authority,
    tokenVerifier: verifier,
    cursorKey: new Uint8Array(32).fill(17),
  });
  const transport = new StreamableHTTPClientTransport(new URL(resource), {
    authProvider: { token: async () => token },
  });
  const client = new Client(
    { name: "full-stack-synthetic-test", version: "1.0.0" },
    { versionNegotiation: { mode: "auto" } },
  );

  try {
    await client.connect(transport);
    const result = await client.callTool({
      name: "promethee_list_tasks",
      arguments: { status: "all", limit: 2 },
    });

    assert.equal(result.isError, undefined);
    const structured = result.structuredContent as { tasks?: Array<Record<string, unknown>> };
    assert.deepEqual(structured.tasks?.map(({ id }) => id), ["a-task-1", "a-task-2"]);
    assert.doesNotMatch(JSON.stringify(result), new RegExp(token, "u"));
  } finally {
    await client.close();
    await running.close();
  }
});
