import assert from "node:assert/strict";
import test from "node:test";

import {
  createOAuthMetadataHandler,
  resourceMetadataUrl,
} from "../src/http/oauth-metadata.js";
import { createRequestSecurityGate } from "../src/http/request-security.js";

const RESOURCE = new URL("http://127.0.0.1:3000/mcp");
const HOST = "127.0.0.1:3000";
const ORIGIN = "http://127.0.0.1:3000";

function request(path = "/mcp", headers: Record<string, string> = {}): Request {
  return new Request(new URL(path, RESOURCE), {
    headers: { host: HOST, ...headers },
  });
}

function gate() {
  return createRequestSecurityGate({
    allowedHosts: [HOST],
    allowedOrigins: [ORIGIN],
  });
}

test("strict request gate accepts only the configured MCP authority and origin", () => {
  const secure = gate();
  assert.equal(secure(request()), undefined);
  assert.equal(secure(request("/mcp", { origin: ORIGIN })), undefined);

  for (const host of [
    "user@127.0.0.1:3000",
    "127.0.0.1:3000,evil.invalid",
    "127.0.0.1:3000/path",
    "127.0.0.1:3000\\evil",
    "127.0.0.1:3001",
  ]) {
    assert.equal(secure(request("/mcp", { host }))?.status, 403, host);
  }

  for (const origin of [
    "null",
    "http://user@127.0.0.1:3000",
    "http://127.0.0.1:3000,https://evil.invalid",
    "http://127.0.0.1:3000/path",
    "http://127.0.0.1:3000\\evil",
    "http://127.0.0.1:3001",
  ]) {
    assert.equal(secure(request("/mcp", { origin }))?.status, 403, origin);
  }

  const missingHost = new Request(RESOURCE, { headers: { origin: ORIGIN } });
  assert.equal(secure(missingHost)?.status, 403);
});

test("invalid allowlist configuration fails at startup", () => {
  assert.throws(() =>
    createRequestSecurityGate({ allowedHosts: ["*@example.com"], allowedOrigins: [ORIGIN] }),
  );
  assert.throws(() =>
    createRequestSecurityGate({ allowedHosts: [HOST], allowedOrigins: [`${ORIGIN}/path`] }),
  );
  assert.throws(() =>
    createRequestSecurityGate({ allowedHosts: [HOST], allowedOrigins: ["null"] }),
  );
});

test("metadata keeps public SDK CORS while Host remains protected", async () => {
  const secure = gate();
  const metadata = createOAuthMetadataHandler({
    oauthMetadata: {
      issuer: "http://127.0.0.1:4100/",
      authorization_endpoint: "http://127.0.0.1:4100/oauth/authorize",
      token_endpoint: "http://127.0.0.1:4100/oauth/token",
      response_types_supported: ["code"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: ["tasks:read"],
    },
    resourceServerUrl: RESOURCE,
    scopesSupported: ["tasks:read"],
    resourceName: "Promethee MCP synthetic fixture",
  });
  const path = new URL(resourceMetadataUrl(RESOURCE)).pathname;

  const discoveryRequest = request(path, { origin: "https://untrusted-browser.invalid" });
  assert.equal(secure(discoveryRequest), undefined);
  const response = metadata(discoveryRequest);
  assert.ok(response instanceof Response);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal((await response.json() as { resource: string }).resource, RESOURCE.href);

  const hostileHost = request(path, {
    host: "attacker.invalid",
    origin: "https://untrusted-browser.invalid",
  });
  assert.equal(secure(hostileHost)?.status, 403);
});
