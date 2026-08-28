import type { AuthContext } from '../auth/auth-context.js';

/**
 * Deliberately narrow seam between MCP protocol handling and application use
 * cases. Concrete use-case classes only need to satisfy this structural type.
 */
export interface ToolUseCase {
    execute(principal: AuthContext, input: unknown, signal?: AbortSignal): Promise<unknown>;
}

export type ReadUseCase = ToolUseCase;

export interface PrometheeMcpApplication {
    createProject: ToolUseCase;
    createTask: ToolUseCase;
    listTasks: ToolUseCase;
    getTask: ToolUseCase;
    listProjects: ToolUseCase;
}
