import type { AuthContext } from "../auth/auth-context.js";
import { ApplicationError } from "../contracts/errors.js";
import { createTaskMutationSchema } from "../contracts/facade-results.js";
import { createCreateTaskInputSchema } from "../contracts/tool-inputs.js";
import type { CreateTaskResult } from "../contracts/tool-results.js";
import type { SlicePolicy } from "../policy/slice-policy.js";
import type { Clock } from "../ports/clock.js";
import type { PrometheeFacade } from "../ports/promethee-facade.js";
import { assertResponseBounded, callWithDeadline, parseInput, parseSource } from "./support.js";
import { requireScope, TOOL_SCOPE } from "./tool-registry.js";

export interface CreateTaskDependencies {
  readonly facade: PrometheeFacade;
  readonly clock: Clock;
  readonly policy: SlicePolicy;
}

export class CreateTaskUseCase {
  readonly #dependencies: CreateTaskDependencies;

  constructor(dependencies: CreateTaskDependencies) {
    this.#dependencies = dependencies;
  }

  async execute(
    principal: AuthContext,
    rawInput: unknown,
    signal?: AbortSignal,
  ): Promise<CreateTaskResult> {
    requireScope(principal, TOOL_SCOPE.promethee_create_task);
    const input = parseInput(createCreateTaskInputSchema(this.#dependencies.policy), rawInput);
    const rawResult = await callWithDeadline(
      (deadlineSignal) => this.#dependencies.facade.createTask(principal, input, deadlineSignal),
      this.#dependencies.policy.upstreamTimeoutMs,
      signal,
    );
    const mutation = parseSource(createTaskMutationSchema(this.#dependencies.policy), rawResult);
    if (mutation.outcome === "idempotency_conflict") {
      throw new ApplicationError(
        "idempotency_conflict",
        "The request identifier was already used for a different operation.",
      );
    }
    if (mutation.outcome === "not_found") {
      throw new ApplicationError("not_found", "The project is unavailable.");
    }

    const result: CreateTaskResult = {
      task: mutation.record,
      observedAt: this.#dependencies.clock.now().toISOString(),
      freshness: "unknown",
      sourceVersion: mutation.sourceVersion,
    };
    assertResponseBounded(result, this.#dependencies.policy);
    return result;
  }
}
