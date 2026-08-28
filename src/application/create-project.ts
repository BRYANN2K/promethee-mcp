import type { AuthContext } from "../auth/auth-context.js";
import { ApplicationError } from "../contracts/errors.js";
import { createProjectMutationSchema } from "../contracts/facade-results.js";
import { createCreateProjectInputSchema } from "../contracts/tool-inputs.js";
import type { CreateProjectResult } from "../contracts/tool-results.js";
import type { SlicePolicy } from "../policy/slice-policy.js";
import type { Clock } from "../ports/clock.js";
import type { PrometheeFacade } from "../ports/promethee-facade.js";
import { assertResponseBounded, callWithDeadline, parseInput, parseSource } from "./support.js";
import { requireScope, TOOL_SCOPE } from "./tool-registry.js";

export interface CreateProjectDependencies {
  readonly facade: PrometheeFacade;
  readonly clock: Clock;
  readonly policy: SlicePolicy;
}

export class CreateProjectUseCase {
  readonly #dependencies: CreateProjectDependencies;

  constructor(dependencies: CreateProjectDependencies) {
    this.#dependencies = dependencies;
  }

  async execute(
    principal: AuthContext,
    rawInput: unknown,
    signal?: AbortSignal,
  ): Promise<CreateProjectResult> {
    requireScope(principal, TOOL_SCOPE.promethee_create_project);
    const input = parseInput(createCreateProjectInputSchema(this.#dependencies.policy), rawInput);
    const rawResult = await callWithDeadline(
      (deadlineSignal) => this.#dependencies.facade.createProject(principal, input, deadlineSignal),
      this.#dependencies.policy.upstreamTimeoutMs,
      signal,
    );
    const mutation = parseSource(
      createProjectMutationSchema(this.#dependencies.policy),
      rawResult,
    );
    if (mutation.outcome === "idempotency_conflict") {
      throw new ApplicationError(
        "idempotency_conflict",
        "The request identifier was already used for a different operation.",
      );
    }

    const result: CreateProjectResult = {
      project: mutation.record,
      observedAt: this.#dependencies.clock.now().toISOString(),
      freshness: "unknown",
      sourceVersion: mutation.sourceVersion,
    };
    assertResponseBounded(result, this.#dependencies.policy);
    return result;
  }
}
