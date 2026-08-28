import assert from "node:assert/strict";
import { test } from "node:test";

import type { AuthContext } from "../src/auth/auth-context.js";
import {
  SYNTHETIC_SUBJECT_A,
  SYNTHETIC_SUBJECT_B,
  SyntheticPrometheeFacade,
} from "../src/adapters/synthetic/index.js";
import { ListProjectsUseCase } from "../src/application/list-projects.js";
import { ListTasksUseCase } from "../src/application/list-tasks.js";
import { ApplicationError } from "../src/contracts/errors.js";
import { AesGcmCursorCodec } from "../src/pagination/cursor-codec.js";
import { SYNTHETIC_SLICE_POLICY } from "../src/policy/slice-policy.js";
import type { Clock } from "../src/ports/clock.js";

const FIXED_NOW = Date.parse("2026-08-27T12:00:00Z");

class MutableClock implements Clock {
  milliseconds = FIXED_NOW;
  now(): Date {
    return new Date(this.milliseconds);
  }
}

function principal(subject: string): AuthContext {
  return {
    subject,
    clientId: "synthetic-client",
    issuer: "https://issuer.invalid",
    resource: "https://mcp.invalid",
    scopes: new Set(["tasks:read"]),
    expiresAt: FIXED_NOW + 3_600_000,
  };
}

function harness() {
  const facade = new SyntheticPrometheeFacade();
  const clock = new MutableClock();
  const cursorCodec = new AesGcmCursorCodec(new Uint8Array(32).fill(9), clock, SYNTHETIC_SLICE_POLICY);
  return {
    clock,
    tasks: new ListTasksUseCase({ facade, cursorCodec, clock, policy: SYNTHETIC_SLICE_POLICY }),
    projects: new ListProjectsUseCase({ facade, cursorCodec, clock, policy: SYNTHETIC_SLICE_POLICY }),
  };
}

function hasCode(code: string): (error: unknown) => boolean {
  return (error) => error instanceof ApplicationError && error.code === code;
}

test("opaque cursor traverses an immutable fixture without gaps or duplicates", async () => {
  const { tasks } = harness();
  const user = principal(SYNTHETIC_SUBJECT_A);
  const first = await tasks.execute(user, { status: "all", limit: 2 });
  assert.notEqual(first.nextCursor, null);
  const second = await tasks.execute(user, { status: "all", cursor: first.nextCursor });

  const identifiers = [...first.tasks, ...second.tasks].map(({ id }) => id);
  assert.deepEqual(identifiers, ["a-task-1", "a-task-2", "a-task-3", "a-task-injection"]);
  assert.equal(new Set(identifiers).size, identifiers.length);
  assert.equal(second.nextCursor, null);
});

test("cursor ciphertext does not reveal subject or backend page token", async () => {
  const { tasks } = harness();
  const first = await tasks.execute(principal(SYNTHETIC_SUBJECT_A), { status: "all", limit: 2 });

  assert.notEqual(first.nextCursor, null);
  assert.doesNotMatch(first.nextCursor ?? "", /synthetic-user|offset|a-task/i);
});

test("tampered and expired cursors use the same stable public error", async () => {
  const { clock, tasks } = harness();
  const user = principal(SYNTHETIC_SUBJECT_A);
  const first = await tasks.execute(user, { status: "all", limit: 2 });
  const cursor = first.nextCursor ?? "";
  const tampered = `${cursor.slice(0, -1)}${cursor.endsWith("a") ? "b" : "a"}`;

  await assert.rejects(tasks.execute(user, { status: "all", cursor: tampered }), hasCode("invalid_cursor"));
  clock.milliseconds += SYNTHETIC_SLICE_POLICY.cursorTtlMs;
  await assert.rejects(tasks.execute(user, { status: "all", cursor }), hasCode("invalid_cursor"));
});

test("cursor is cryptographically bound to subject, tool and filters", async () => {
  const { projects, tasks } = harness();
  const userA = principal(SYNTHETIC_SUBJECT_A);
  const first = await tasks.execute(userA, { status: "all", limit: 2 });
  const cursor = first.nextCursor;

  await assert.rejects(
    tasks.execute(principal(SYNTHETIC_SUBJECT_B), { status: "all", cursor }),
    hasCode("invalid_cursor"),
  );
  await assert.rejects(
    tasks.execute(userA, { status: "open", cursor }),
    hasCode("invalid_cursor"),
  );
  await assert.rejects(
    projects.execute(userA, { cursor }),
    hasCode("invalid_cursor"),
  );
  await assert.rejects(
    tasks.execute({ ...userA, clientId: "another-client" }, { status: "all", cursor }),
    hasCode("invalid_cursor"),
  );
  await assert.rejects(
    tasks.execute({ ...userA, resource: "https://another-resource.invalid/mcp" }, { status: "all", cursor }),
    hasCode("invalid_cursor"),
  );
});

test("cursor preserves its page size and rejects a changed explicit limit", async () => {
  const { tasks } = harness();
  const user = principal(SYNTHETIC_SUBJECT_A);
  const first = await tasks.execute(user, { status: "all", limit: 2 });

  await assert.rejects(
    tasks.execute(user, { status: "all", cursor: first.nextCursor, limit: 3 }),
    hasCode("invalid_cursor"),
  );
  const replayOne = await tasks.execute(user, { status: "all", cursor: first.nextCursor });
  const replayTwo = await tasks.execute(user, { status: "all", cursor: first.nextCursor });
  assert.deepEqual(replayOne.tasks, replayTwo.tasks);
});
