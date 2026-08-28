import type { AuthContext } from "../auth/auth-context.js";
import { ApplicationError } from "../contracts/errors.js";
import { createTaskLookupSchema } from "../contracts/facade-results.js";
import { createGetTaskInputSchema } from "../contracts/tool-inputs.js";
import type { GetTaskResult } from "../contracts/tool-results.js";
import type { SlicePolicy } from "../policy/slice-policy.js";
import type { Clock } from "../ports/clock.js";
import type { PrometheeFacade } from "../ports/promethee-facade.js";
import { assertResponseBounded, callWithDeadline, parseInput, parseSource } from "./support.js";
import { requireScope, TOOL_SCOPE } from "./tool-registry.js";

export interface GetTaskDependencies {
  readonly facade: PrometheeFacade;
  readonly clock: Clock;
  readonly policy: SlicePolicy;
}

export class GetTaskUseCase {
  readonly #dependencies: GetTaskDependencies;

  constructor(dependencies: GetTaskDependencies) {
    this.#dependencies = dependencies;
  }

  async execute(principal: AuthContext, rawInput: unknown, signal?: AbortSignal): Promise<GetTaskResult> {
    requireScope(principal, TOOL_SCOPE.promethee_get_task);
    const input = parseInput(createGetTaskInputSchema(this.#dependencies.policy), rawInput);
    const rawLookup = await callWithDeadline(
      (deadlineSignal) => this.#dependencies.facade.getTask(principal, input, deadlineSignal),
      this.#dependencies.policy.upstreamTimeoutMs,
      signal,
    );
    const lookup = parseSource(createTaskLookupSchema(this.#dependencies.policy), rawLookup);
    if (lookup.record === null) {
      throw new ApplicationError("not_found", "The task was not found.");
    }
    if (lookup.record.id !== input.taskId) {
      throw new ApplicationError(
        "incompatible_source",
        "The data source returned an unsupported response.",
      );
    }

    const result: GetTaskResult = {
      task: lookup.record,
      observedAt: this.#dependencies.clock.now().toISOString(),
      freshness: "unknown",
      sourceVersion: lookup.sourceVersion,
    };
    assertResponseBounded(result, this.#dependencies.policy);
    return result;
  }
}
