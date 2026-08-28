import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import test from "node:test";

import {
  EncryptedFilePersonalSessionPersistence,
  PersonalConnectionStore,
  SEVEN_DAY_RETENTION_MS,
} from "../src/runtime/index.js";

const SUBJECT = "2c5c93cc-1431-4c0f-98ed-65b5792e7d5a";
const SECOND_SUBJECT = "62a59316-0ae2-4bf7-bc97-881e6a57fe10";
const ACCESS_TOKEN = "synthetic.user.access-token";
const SECOND_ACCESS_TOKEN = "synthetic.second.access-token";
const REFRESH_TOKEN = "synthetic-refresh-token-value";
const SECOND_REFRESH_TOKEN = "synthetic-second-refresh-token-value";
const PUBLISHABLE_KEY = "sb_publishable_synthetic_test_key";

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function identityFetch(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/auth/v1/user") return Promise.resolve(Response.json({ id: SUBJECT }));
  throw new Error(`Unexpected request: ${request.method} ${url.pathname}`);
}

function connectionInput(expiresAt: number) {
  return {
    supabaseUrl: "https://auth.promethee.io",
    publishableKey: PUBLISHABLE_KEY,
    accessToken: ACCESS_TOKEN,
    refreshToken: REFRESH_TOKEN,
    expiresAt,
  };
}

test("accepts GoTrue legacy twelve-character refresh tokens", async () => {
  const now = 1_787_947_200_000;
  const store = new PersonalConnectionStore({
    fetch: identityFetch,
    now: () => now,
  });

  const connected = await store.connect({
    ...connectionInput(now + 3_600_000),
    refreshToken: "A1b2C3d4E5f6",
  });

  assert.equal(connected.subject, SUBJECT);
  assert.deepEqual(store.status(), { connected: true, expiresAt: now + 3_600_000 });
});

test("an already-running sibling reloads a newly persisted seven-day session", async () => {
  const directory = mkdtempSync(join(tmpdir(), "promethee-mcp-session-"));
  const file = join(directory, "session.enc");
  const key = new Uint8Array(32).fill(40);
  const now = 1_787_947_200_000;

  try {
    const first = new PersonalConnectionStore({
      fetch: identityFetch,
      now: () => now,
      persistence: new EncryptedFilePersonalSessionPersistence({ file, key }),
      defaultRetention: "seven-days",
    });
    const sibling = new PersonalConnectionStore({
      fetch: identityFetch,
      now: () => now,
      persistence: new EncryptedFilePersonalSessionPersistence({ file, key }),
      defaultRetention: "seven-days",
    });
    assert.deepEqual(sibling.status(), { connected: false });

    await first.connect(connectionInput(now + 3_600_000));

    assert.deepEqual(sibling.status(), { connected: true, expiresAt: now + 3_600_000 });
    assert.equal((await sibling.current())?.subject, SUBJECT);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a stale sibling retention change preserves the newest persisted session", async () => {
  const directory = mkdtempSync(join(tmpdir(), "promethee-mcp-session-"));
  const file = join(directory, "session.enc");
  const key = new Uint8Array(32).fill(61);
  const now = 1_787_947_200_000;
  const newestSubject = "62a59316-0ae2-4bf7-bc97-881e6a57fe10";
  const latestIdentityFetch = (request: Request) => Promise.resolve(Response.json({
    id: request.headers.get("authorization") === "Bearer synthetic.second.access-token"
      ? newestSubject
      : SUBJECT,
  }));
  const persistence = () => new EncryptedFilePersonalSessionPersistence({ file, key });
  try {
    const writer = new PersonalConnectionStore({
      fetch: latestIdentityFetch,
      now: () => now,
      persistence: persistence(),
      defaultRetention: "seven-days",
    });
    await writer.connect(connectionInput(now + 3_600_000));
    const staleSibling = new PersonalConnectionStore({
      fetch: latestIdentityFetch,
      now: () => now,
      persistence: persistence(),
      defaultRetention: "seven-days",
    });
    await writer.connect({
      ...connectionInput(now + 3_600_000),
      accessToken: "synthetic.second.access-token",
      refreshToken: "synthetic-second-refresh-token-value",
    });
    staleSibling.setRetention("seven-days");

    const fresh = new PersonalConnectionStore({
      fetch: latestIdentityFetch,
      now: () => now,
      persistence: persistence(),
      defaultRetention: "seven-days",
    });
    assert.equal((await fresh.current())?.subject, newestSubject);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("seven-day retention restores one encrypted personal session after restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "promethee-mcp-session-"));
  const file = join(directory, "session.enc");
  const key = new Uint8Array(32).fill(41);
  let now = 1_787_947_200_000;

  try {
    const persistence = new EncryptedFilePersonalSessionPersistence({ file, key });
    const first = new PersonalConnectionStore({
      fetch: identityFetch,
      now: () => now,
      persistence,
      defaultRetention: "seven-days",
    });
    await first.connect(connectionInput(now + 3_600_000));

    const encrypted = readFileSync(file);
    assert.equal(encrypted.includes(Buffer.from(ACCESS_TOKEN)), false);
    assert.equal(encrypted.includes(Buffer.from(REFRESH_TOKEN)), false);
    assert.deepEqual(first.retention(), {
      mode: "seven-days",
      retainedUntil: now + SEVEN_DAY_RETENTION_MS,
    });

    now += 1_000;
    const restored = new PersonalConnectionStore({
      fetch: identityFetch,
      now: () => now,
      persistence: new EncryptedFilePersonalSessionPersistence({ file, key }),
      defaultRetention: "seven-days",
    });
    assert.deepEqual(restored.status(), { connected: true, expiresAt: 1_787_950_800_000 });
    assert.equal((await restored.current())?.subject, SUBJECT);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("restore cannot clear a newer session that wins an expiration race", () => {
  const now = 1_787_947_200_000;
  const expired: unknown = {
    version: 1,
    mode: "seven-days",
    session: {
      ...connectionInput(now + 3_600_000),
      subject: SUBJECT,
      retainedUntil: now - 1,
    },
  };
  const newestSubject = "62a59316-0ae2-4bf7-bc97-881e6a57fe10";
  const newer: unknown = {
    version: 1,
    mode: "seven-days",
    session: {
      ...connectionInput(now + 3_600_000),
      subject: newestSubject,
      accessToken: "synthetic.second.access-token",
      refreshToken: "synthetic-second-refresh-token-value",
      retainedUntil: now + SEVEN_DAY_RETENTION_MS,
    },
  };
  let state: unknown | null = expired;
  let firstLoad = true;
  const persistence = {
    load: () => {
      if (!firstLoad) return state;
      firstLoad = false;
      const returned = state;
      state = newer;
      return returned;
    },
    save: (value: unknown) => {
      state = value;
    },
    clear: () => {
      state = null;
    },
    compareAndSwap: (expected: unknown | null, value: unknown) => {
      if (!isDeepStrictEqual(state, expected)) return false;
      state = value;
      return true;
    },
  };

  const restored = new PersonalConnectionStore({
    now: () => now,
    persistence,
    defaultRetention: "seven-days",
  });
  assert.equal(Reflect.get(Reflect.get(state as object, "session") as object, "subject"), newestSubject);
  assert.deepEqual(restored.status(), { connected: true, expiresAt: now + 3_600_000 });
});

test("expired retention is removed and no-renewal clears the persisted session", async () => {
  const directory = mkdtempSync(join(tmpdir(), "promethee-mcp-session-"));
  const file = join(directory, "session.enc");
  const key = new Uint8Array(32).fill(42);
  let now = 1_787_947_200_000;

  try {
    const persistence = new EncryptedFilePersonalSessionPersistence({ file, key });
    const connected = new PersonalConnectionStore({
      fetch: identityFetch,
      now: () => now,
      persistence,
      defaultRetention: "seven-days",
    });
    await connected.connect(connectionInput(now + SEVEN_DAY_RETENTION_MS + 3_600_000));
    connected.setRetention("memory");
    assert.deepEqual(connected.retention(), { mode: "memory" });
    const preferenceOnly = readFileSync(file);
    assert.equal(preferenceOnly.includes(Buffer.from(ACCESS_TOKEN)), false);
    assert.equal(preferenceOnly.includes(Buffer.from(REFRESH_TOKEN)), false);

    const memoryRestart = new PersonalConnectionStore({
      fetch: identityFetch,
      now: () => now,
      persistence: new EncryptedFilePersonalSessionPersistence({ file, key }),
      defaultRetention: "seven-days",
    });
    assert.deepEqual(memoryRestart.retention(), { mode: "memory" });
    assert.deepEqual(memoryRestart.status(), { connected: false });

    connected.setRetention("seven-days");
    assert.deepEqual(connected.retention(), {
      mode: "seven-days",
      retainedUntil: now + SEVEN_DAY_RETENTION_MS,
    });
    now += SEVEN_DAY_RETENTION_MS + 1;
    assert.deepEqual(connected.status(), { connected: false });
    assert.deepEqual(connected.retention(), { mode: "seven-days" });

    const expired = new PersonalConnectionStore({
      fetch: identityFetch,
      now: () => now,
      persistence: new EncryptedFilePersonalSessionPersistence({ file, key }),
      defaultRetention: "seven-days",
    });
    assert.deepEqual(expired.status(), { connected: false });
    assert.deepEqual(expired.retention(), { mode: "seven-days" });
    assert.equal(existsSync(file), true);
    const expiredPreference = readFileSync(file);
    assert.equal(expiredPreference.includes(Buffer.from(ACCESS_TOKEN)), false);
    assert.equal(expiredPreference.includes(Buffer.from(REFRESH_TOKEN)), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a late sibling refresh rejection cannot erase a newer persisted session", async () => {
  const directory = mkdtempSync(join(tmpdir(), "promethee-mcp-session-"));
  const file = join(directory, "session.enc");
  const key = new Uint8Array(32).fill(43);
  const firstRefreshStarted = deferred<void>();
  const secondRefreshStarted = deferred<void>();
  const firstRefreshResponse = deferred<Response>();
  const secondRefreshResponse = deferred<Response>();
  let now = 1_787_947_200_000;

  const refreshingFetch = (
    started: ReturnType<typeof deferred<void>>,
    response: ReturnType<typeof deferred<Response>>,
  ) => async (request: Request): Promise<Response> => {
    const path = new URL(request.url).pathname;
    if (path === "/auth/v1/user") return Response.json({ id: SUBJECT });
    if (path === "/auth/v1/token") {
      started.resolve();
      return response.promise;
    }
    throw new Error(`Unexpected request: ${request.method} ${path}`);
  };

  try {
    const first = new PersonalConnectionStore({
      fetch: refreshingFetch(firstRefreshStarted, firstRefreshResponse),
      now: () => now,
      persistence: new EncryptedFilePersonalSessionPersistence({ file, key }),
      defaultRetention: "seven-days",
    });
    await first.connect(connectionInput(now + 120_000));
    const sibling = new PersonalConnectionStore({
      fetch: refreshingFetch(secondRefreshStarted, secondRefreshResponse),
      now: () => now,
      persistence: new EncryptedFilePersonalSessionPersistence({ file, key }),
      defaultRetention: "seven-days",
    });
    now += 70_000;

    const firstCurrent = first.current();
    const siblingCurrent = sibling.current();
    await Promise.all([firstRefreshStarted.promise, secondRefreshStarted.promise]);

    firstRefreshResponse.resolve(Response.json({
      access_token: "synthetic.rotated.access-token",
      refresh_token: "synthetic-rotated-refresh-token",
      expires_in: 3_600,
      user: { id: SUBJECT },
    }));
    assert.equal((await firstCurrent)?.accessToken, "synthetic.rotated.access-token");

    secondRefreshResponse.resolve(new Response(null, { status: 401 }));
    assert.equal((await siblingCurrent)?.accessToken, "synthetic.rotated.access-token");

    const restored = new PersonalConnectionStore({
      fetch: identityFetch,
      now: () => now,
      persistence: new EncryptedFilePersonalSessionPersistence({ file, key }),
      defaultRetention: "seven-days",
    });
    assert.deepEqual(restored.status(), { connected: true, expiresAt: now + 3_600_000 });
    assert.equal((await restored.current())?.accessToken, "synthetic.rotated.access-token");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a persistence failure leaves the previous retention choice unchanged", async () => {
  let persisted: unknown = null;
  let fail = false;
  const persistence = {
    load: () => persisted,
    save: (value: unknown) => {
      if (fail) throw new Error("synthetic_write_failure");
      persisted = value;
    },
    clear: () => {
      persisted = null;
    },
    compareAndSwap: (expected: unknown | null, value: unknown) => {
      if (!isDeepStrictEqual(persisted, expected)) return false;
      if (fail) throw new Error("synthetic_write_failure");
      persisted = value;
      return true;
    },
  };
  const now = 1_787_947_200_000;
  const store = new PersonalConnectionStore({
    fetch: identityFetch,
    now: () => now,
    persistence,
    defaultRetention: "seven-days",
  });
  await store.connect(connectionInput(now + 3_600_000));
  const previous = store.retention();

  fail = true;
  assert.throws(() => store.setRetention("memory"), /session_persistence_failed/u);
  assert.deepEqual(store.retention(), previous);
  assert.deepEqual(store.status(), { connected: true, expiresAt: now + 3_600_000 });
});

test("disconnect during a deferred refresh cannot restore the removed session", async () => {
  let now = 1_787_947_200_000;
  const refreshStarted = deferred<void>();
  const refreshResponse = deferred<Response>();
  const store = new PersonalConnectionStore({
    now: () => now,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/auth/v1/user") return Response.json({ id: SUBJECT });
      if (url.pathname === "/auth/v1/token") {
        refreshStarted.resolve();
        return refreshResponse.promise;
      }
      throw new Error(`Unexpected request: ${request.method} ${url.pathname}`);
    },
  });
  await store.connect(connectionInput(now + 120_000));
  now += 70_000;

  const refreshing = store.current();
  await refreshStarted.promise;
  store.disconnect();
  assert.deepEqual(store.status(), { connected: false });

  refreshResponse.resolve(Response.json({
    access_token: "synthetic.refreshed.access-token",
    refresh_token: "synthetic-refreshed-token-value",
    expires_in: 3_600,
    user: { id: SUBJECT },
  }));
  await assert.rejects(refreshing, /session_changed/u);
  assert.deepEqual(store.status(), { connected: false });
});

test("an old deferred refresh cannot replace a newly paired subject", async () => {
  let now = 1_787_947_200_000;
  const refreshStarted = deferred<void>();
  const refreshResponse = deferred<Response>();
  const store = new PersonalConnectionStore({
    now: () => now,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/auth/v1/user") {
        return Response.json({
          id: request.headers.get("authorization") === `Bearer ${SECOND_ACCESS_TOKEN}`
            ? SECOND_SUBJECT
            : SUBJECT,
        });
      }
      if (url.pathname === "/auth/v1/token") {
        refreshStarted.resolve();
        return refreshResponse.promise;
      }
      throw new Error(`Unexpected request: ${request.method} ${url.pathname}`);
    },
  });
  await store.connect(connectionInput(now + 120_000));
  now += 70_000;

  const oldRefresh = store.current();
  await refreshStarted.promise;
  await store.connect({
    ...connectionInput(now + 3_600_000),
    accessToken: SECOND_ACCESS_TOKEN,
    refreshToken: SECOND_REFRESH_TOKEN,
  });

  refreshResponse.resolve(Response.json({
    access_token: "synthetic.refreshed.access-token",
    refresh_token: "synthetic-refreshed-token-value",
    expires_in: 3_600,
    user: { id: SUBJECT },
  }));
  await assert.rejects(oldRefresh, /session_changed/u);
  const current = await store.current();
  assert.equal(current?.subject, SECOND_SUBJECT);
  assert.equal(current?.accessToken, SECOND_ACCESS_TOKEN);
});
