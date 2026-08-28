import type { AuthContext } from "../auth/auth-context.js";
import { ApplicationError, invalidCursor } from "../contracts/errors.js";
import { createProjectPageSchema } from "../contracts/facade-results.js";
import { createListProjectsInputSchema } from "../contracts/tool-inputs.js";
import type { ListProjectsResult } from "../contracts/tool-results.js";
import type { CursorCodec, CursorContext } from "../pagination/cursor-codec.js";
import type { SlicePolicy } from "../policy/slice-policy.js";
import type { Clock } from "../ports/clock.js";
import type { PrometheeFacade } from "../ports/promethee-facade.js";
import { assertResponseBounded, assertUniqueIds, callWithDeadline, parseInput, parseSource } from "./support.js";
import { requireScope, TOOL_SCOPE } from "./tool-registry.js";

export interface ListProjectsDependencies {
  readonly facade: PrometheeFacade;
  readonly cursorCodec: CursorCodec;
  readonly clock: Clock;
  readonly policy: SlicePolicy;
}

export class ListProjectsUseCase {
  readonly #dependencies: ListProjectsDependencies;

  constructor(dependencies: ListProjectsDependencies) {
    this.#dependencies = dependencies;
  }

  async execute(principal: AuthContext, rawInput: unknown, signal?: AbortSignal): Promise<ListProjectsResult> {
    requireScope(principal, TOOL_SCOPE.promethee_list_projects);
    const input = parseInput(createListProjectsInputSchema(this.#dependencies.policy), rawInput);
    const context: CursorContext = {
      subject: principal.subject,
      clientId: principal.clientId,
      issuer: principal.issuer,
      resource: principal.resource,
      scope: TOOL_SCOPE.promethee_list_projects,
      tool: "promethee_list_projects",
      filter: "[]",
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
      (deadlineSignal) => this.#dependencies.facade.listProjects(
        principal,
        { pageToken: cursorState?.pageToken ?? null, limit },
        deadlineSignal,
      ),
      this.#dependencies.policy.upstreamTimeoutMs,
      signal,
    );
    const page = parseSource(createProjectPageSchema(this.#dependencies.policy), rawPage);
    if (page.records.length > limit) {
      throw new ApplicationError("incompatible_source", "The data source returned an unsupported response.");
    }
    assertUniqueIds(page.records);

    const result: ListProjectsResult = {
      projects: page.records,
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
