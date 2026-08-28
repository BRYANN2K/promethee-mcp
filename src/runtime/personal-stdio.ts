import { serveStdio, type StdioServerHandle } from '@modelcontextprotocol/server/stdio';

import type { PrometheeMcpApplication } from '../mcp/application.js';
import { createPrometheeMcpServer } from '../mcp/create-server.js';
import {
    startLocalPersonalOnboarding,
    type LocalPersonalOnboarding,
    type StartLocalPersonalOnboardingOptions
} from './local-personal-onboarding.js';
import type { CloseableService } from './lifecycle.js';

export interface PersonalStdioService extends CloseableService {
    readonly loginUrl: string;
    readonly onboarding: LocalPersonalOnboarding;
}

function unavailableApplication(): PrometheeMcpApplication {
    const unavailable = { async execute(): Promise<never> { throw new Error('Personal connection is unavailable'); } };
    return {
        createProject: unavailable,
        createTask: unavailable,
        listTasks: unavailable,
        getTask: unavailable,
        listProjects: unavailable
    };
}

export async function startPersonalStdioService(
    options: StartLocalPersonalOnboardingOptions
): Promise<PersonalStdioService> {
    const onboarding = await startLocalPersonalOnboarding(options);
    let stdio: StdioServerHandle;
    try {
        stdio = serveStdio(() => createPrometheeMcpServer({
            application: unavailableApplication(),
            resolveToolContext: onboarding.composition.resolveToolContext,
            connectionStatus: {
                loginUrl: onboarding.loginUrl,
                status: () => ({ connected: onboarding.composition.connections.status().connected })
            }
        }), {
            legacy: 'serve',
            ...(options.onError === undefined ? {} : { onerror: options.onError })
        });
    } catch (error) {
        await onboarding.close();
        throw error;
    }

    let closing: Promise<void> | undefined;
    return {
        loginUrl: onboarding.loginUrl,
        onboarding,
        close(): Promise<void> {
            closing ??= (async () => {
                try {
                    await stdio.close();
                } finally {
                    await onboarding.close();
                }
            })();
            return closing;
        }
    };
}
