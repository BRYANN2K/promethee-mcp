import assert from "node:assert/strict";
import test from "node:test";

import {
  createBearerAuthenticator,
  type AuthenticatedRequest,
} from "../src/auth/bearer-auth.js";
import { createSyntheticJwtTokenVerifier } from "../src/auth/jwt-token-verifier.js";
import { createSupabaseJwtTokenVerifierFromJwks } from "../src/auth/supabase-jwt-token-verifier.js";
import { TokenVerificationError } from "../src/auth/token-verifier.js";
import { createSecurityLogger } from "../src/observability/security-logger.js";
import {
  createSyntheticIssuer,
  createSyntheticSupabaseIssuer,
} from "./support/synthetic-issuer.js";

const NOW = 1_788_000_000;

async function fixture() {
  const issuer = await createSyntheticIssuer({ now: NOW });
  const verifier = createSyntheticJwtTokenVerifier({
    issuer: issuer.issuer,
    resource: issuer.resource,
    jwks: issuer.jwks,
    allowedClientIds: new Set([issuer.clientId]),
    allowedScopes: new Set(["tasks:read", "sessions:read", "reports:read"]),
    clock: () => NOW,
    clockToleranceSeconds: 0,
  });
  return { issuer, verifier };
}

async function expectInvalid(promise: Promise<unknown>): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof TokenVerificationError);
    assert.equal(error.message, "Invalid access token");
    return true;
  });
}

test("strict RS256 verifier returns a token-free normalized principal", async () => {
  const { issuer, verifier } = await fixture();
  const context = await verifier.verify(await issuer.issue());

  assert.deepEqual(
    {
      subject: context.subject,
      clientId: context.clientId,
      issuer: context.issuer,
      resource: context.resource,
      scopes: [...context.scopes],
      expiresAt: context.expiresAt,
    },
    {
      subject: "synthetic-user-a",
      clientId: issuer.clientId,
      issuer: issuer.issuer,
      resource: issuer.resource,
      scopes: ["tasks:read"],
      expiresAt: NOW + 300,
    },
  );
  assert.equal("token" in context, false);
});

test("Supabase verifier intersects approved client policy with explicitly granted scopes", async () => {
  const issuer = await createSyntheticSupabaseIssuer({ now: NOW });
  const verifier = createSupabaseJwtTokenVerifierFromJwks({
    issuer: issuer.issuer,
    resource: issuer.resource,
    jwks: issuer.jwks,
    permissionsByClientId: new Map([
      [issuer.clientId, new Set(["tasks:read"])],
    ]),
    clock: () => NOW,
    clockToleranceSeconds: 0,
  });

  const context = await verifier.verify(await issuer.issue({
    claims: { scope: "openid email profile tasks:read" },
  }));

  assert.deepEqual(
    {
      subject: context.subject,
      clientId: context.clientId,
      issuer: context.issuer,
      resource: context.resource,
      scopes: [...context.scopes],
      expiresAt: context.expiresAt,
    },
    {
      subject: "synthetic-user-a",
      clientId: issuer.clientId,
      issuer: issuer.issuer,
      resource: issuer.resource,
      scopes: ["tasks:read"],
      expiresAt: NOW + 300,
    },
  );
});

test("Supabase verifier rejects unapproved clients, generic audiences and malformed user claims", async () => {
  const issuer = await createSyntheticSupabaseIssuer({ now: NOW });
  const verifier = createSupabaseJwtTokenVerifierFromJwks({
    issuer: issuer.issuer,
    resource: issuer.resource,
    jwks: issuer.jwks,
    permissionsByClientId: new Map([
      [issuer.clientId, new Set(["tasks:read"])],
    ]),
    clock: () => NOW,
    clockToleranceSeconds: 0,
  });

  await expectInvalid(verifier.verify(await issuer.issue({
    claims: { client_id: "unapproved-client" },
  })));
  await expectInvalid(verifier.verify(await issuer.issue({
    claims: { aud: "authenticated" },
  })));
  await expectInvalid(verifier.verify(await issuer.issue({
    claims: { user_id: "another-user" },
  })));
  await expectInvalid(verifier.verify(await issuer.issue({
    claims: { role: "service_role" },
  })));
  await expectInvalid(verifier.verify(await issuer.issue({
    protectedHeader: { typ: "at+jwt" },
  })));
  await expectInvalid(verifier.verify(await issuer.issue({
    protectedHeader: { jku: "https://attacker.invalid/jwks.json" },
  })));
});

test("verifier fails closed for wrong trust claims and attacker-selected keys", async () => {
  const { issuer, verifier } = await fixture();
  const otherIssuer = await createSyntheticIssuer({ now: NOW, keyId: "other-key" });

  await expectInvalid(verifier.verify(await issuer.issue({ claims: { iss: "https://wrong.invalid" } })));
  await expectInvalid(verifier.verify(await issuer.issue({ claims: { aud: "authenticated" } })));
  await expectInvalid(
    verifier.verify(await issuer.issue({ claims: { aud: [issuer.resource, "https://other.invalid"] } })),
  );
  await expectInvalid(verifier.verify(await issuer.issue({ claims: { client_id: "unknown-client" } })));
  await expectInvalid(verifier.verify(await issuer.issue({ claims: { scope: "tasks:read admin" } })));
  await expectInvalid(verifier.verify(await issuer.issue({ claims: { exp: NOW - 1 } })));
  await expectInvalid(verifier.verify(await issuer.issue({ claims: { nbf: NOW + 1 } })));
  await expectInvalid(verifier.verify(await issuer.issue({ protectedHeader: { typ: "JWT" } })));
  await expectInvalid(
    verifier.verify(
      await issuer.issue({ protectedHeader: { jku: "https://attacker.invalid/jwks.json" } }),
    ),
  );
  await expectInvalid(verifier.verify(await otherIssuer.issue()));
});

test("bearer gate challenges missing, duplicated and insufficient credentials", async () => {
  const { issuer, verifier } = await fixture();
  const resourceMetadataUrl = "http://127.0.0.1:3000/.well-known/oauth-protected-resource/mcp";
  const authenticate = createBearerAuthenticator({
    verifier,
    resourceMetadataUrl,
    requiredScopes: ["tasks:read"],
  });

  const missing = await authenticate(new Request(issuer.resource));
  assert.ok(missing instanceof Response);
  assert.equal(missing.status, 401);
  assert.match(missing.headers.get("www-authenticate") ?? "", /resource_metadata=/u);

  const token = await issuer.issue();
  const duplicated = await authenticate(
    new Request(issuer.resource, { headers: { authorization: `Bearer ${token}, Bearer ${token}` } }),
  );
  assert.ok(duplicated instanceof Response);
  assert.equal(duplicated.status, 401);
  assert.doesNotMatch(await duplicated.text(), new RegExp(token, "u"));

  const queryOnly = await authenticate(new Request(`${issuer.resource}?access_token=${token}`));
  assert.ok(queryOnly instanceof Response);
  assert.equal(queryOnly.status, 401);

  const wrongScope = createBearerAuthenticator({
    verifier,
    resourceMetadataUrl,
    requiredScopes: ["reports:read"],
  });
  const insufficient = await wrongScope(
    new Request(issuer.resource, { headers: { authorization: `Bearer ${token}` } }),
  );
  assert.ok(insufficient instanceof Response);
  assert.equal(insufficient.status, 403);

  const accepted = await authenticate(
    new Request(issuer.resource, { headers: { authorization: `Bearer ${token}` } }),
  );
  assert.equal(accepted instanceof Response, false);
  assert.equal((accepted as AuthenticatedRequest).principal.subject, "synthetic-user-a");
});

test("security logger ignores arbitrary sensitive runtime properties", () => {
  const lines: string[] = [];
  const logger = createSecurityLogger({
    sink: (line) => lines.push(line),
    clock: () => new Date("2026-08-27T12:00:00Z"),
  });
  const sentinel = "SENSITIVE_TOKEN_AND_TASK_TITLE";

  logger.write({
    level: "warn",
    event: "auth.rejected",
    status: 401,
    authOutcome: "invalid",
    errorCode: sentinel,
    tool: sentinel,
    token: sentinel,
    body: sentinel,
  } as unknown as Parameters<typeof logger.write>[0]);

  assert.equal(lines.length, 1);
  assert.doesNotMatch(lines[0] ?? "", new RegExp(sentinel, "u"));
  assert.deepEqual(JSON.parse(lines[0] ?? "{}"), {
    timestamp: "2026-08-27T12:00:00.000Z",
    level: "warn",
    event: "auth.rejected",
    status: 401,
    authOutcome: "invalid",
  });

  logger.write({
    level: "warn",
    event: sentinel,
  } as unknown as Parameters<typeof logger.write>[0]);
  assert.equal(lines.length, 1);
});
