import type { AuthContext } from "../auth/auth-context.js";
import { ApplicationError, invalidCursor } from "../contracts/errors.js";
import { createTaskPageSchema } from "../contracts/facade-results.js";
import { createListTasksInputSchema } from "../contracts/tool-inputs.js";
import type { ListTasksResult } from "../contracts/tool-results.js";
import type { CursorCodec, CursorContext } from "../pagination/cursor-codec.js";
import type { SlicePolicy } from "../policy/slice-policy.js";
import type { Clock } from "../ports/clock.js";
import type { PrometheeFacade } from "../ports/promethee-facade.js";
import { assertResponseBounded, assertUniqueIds, callWithDeadline, parseInput, parseSource } from "./support.js";
import { requireScope, TOOL_SCOPE } from "./tool-registry.js";

export interface ListTasksDependencies {
  readonly facade: PrometheeFacade;
  readonly cursorCodec: CursorCodec;
  readonly clock: Clock;
  readonly policy: SlicePolicy;
}

export class ListTasksUseCase {
  readonly #dependencies: ListTasksDependencies;

  constructor(dependencies: ListTasksDependencies) {
    this.#dependencies = dependencies;
  }

  async execute(principal: AuthContext, rawInput: unknown, signal?: AbortSignal): Promise<ListTasksResult> {
    requireScope(principal, TOOL_SCOPE.promethee_list_tasks);
    const input = parseInput(createListTasksInputSchema(this.#dependencies.policy), rawInput);
    const context: CursorContext = {
      subject: principal.subject,
      clientId: principal.clientId,
      issuer: principal.issuer,
      resource: principal.resource,
      scope: TOOL_SCOPE.promethee_list_tasks,
      tool: "promethee_list_tasks",
      filter: JSON.stringify([input.projectId ?? null, input.status]),
      orderingVersion: this.#dependencies.policy.orderingVersion,
    };
    const cursorState = input.cursor === undefined
      ? undefined
      : this.#dependencies.cursorCodec.open(input.cursor, context);
    if (cursorState !== undefined && input.limit !== undefined && input.limit !== cursorState.limit) {
      throw invalidCursor();
    }
    const limit = cursorState?.limit ?? input.limit ?? this.#dependencies.policy.defaultPageSize;

    const rawPage = await callWithDeadline(
      (deadlineSignal) => this.#dependencies.facade.listTasks(
        principal,
        {
          projectId: input.projectId ?? null,
          status: input.status,
          pageToken: cursorState?.pageToken ?? null,
          limit,
        },
        deadlineSignal,
      ),
      this.#dependencies.policy.upstreamTimeoutMs,
      signal,
    );
    const page = parseSource(createTaskPageSchema(this.#dependencies.policy), rawPage);
    if (page.records.length > limit) {
      throw new ApplicationError(
        "incompatible_source",
        "The data source returned an unsupported response.",
      );
    }
    assertUniqueIds(page.records);
    if (page.records.some((record) =>
      (input.projectId !== undefined && record.projectId !== input.projectId) ||
      (input.status !== "all" && record.status !== input.status)
    )) {
      throw new ApplicationError(
        "incompatible_source",
        "The data source returned an unsupported response.",
      );
    }

    const result: ListTasksResult = {
      tasks: page.records,
      nextCursor: page.nextPageToken === null
        ? null
        : this.#dependencies.cursorCodec.seal({ pageToken: page.nextPageToken, limit }, context),
      observedAt: this.#dependencies.clock.now().toISOString(),
      freshness: "unknown",
      sourceVersion: page.sourceVersion,
    };
    assertResponseBounded(result, this.#dependencies.policy);
    return result;
  }
}
