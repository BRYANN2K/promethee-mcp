import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

export type SupportedMcpClient = 'codex' | 'claude';

export interface ClientInstallPlan {
    readonly client: SupportedMcpClient;
    readonly executable: string;
    readonly args: readonly string[];
}

export interface InteractiveOnboardingOptions {
    readonly packageSpec: string;
    readonly stdin?: NodeJS.ReadableStream;
    readonly stdout?: NodeJS.WritableStream;
    readonly stderr?: NodeJS.WritableStream;
}

const PACKAGE_SPEC_PATTERN = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/releases\/download\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\.tgz$/u;

export const DEFAULT_PACKAGE_SPEC = 'https://github.com/BRYANN2K/promethee-mcp/releases/download/v0.1.1/promethee-mcp-0.1.1.tgz';

function validatePackageSpec(value: string): string {
    if (value.length > 512 || !PACKAGE_SPEC_PATTERN.test(value)) {
        throw new TypeError('The GitHub Release package URL is invalid');
    }
    return value;
}

function npxArgs(packageSpec: string): string[] {
    return ['npx', '-y', `--package=${validatePackageSpec(packageSpec)}`, '--', 'prometheemcp', '--stdio'];
}

export function createClientInstallPlan(
    client: SupportedMcpClient,
    packageSpec: string
): ClientInstallPlan {
    const command = npxArgs(packageSpec);
    if (client === 'codex') {
        return {
            client,
            executable: 'codex',
            args: ['mcp', 'add', 'promethee', '--', ...command]
        };
    }
    return {
        client,
        executable: 'claude',
        args: ['mcp', 'add', '--scope', 'user', 'promethee', '--', ...command]
    };
}

export function genericMcpConfiguration(packageSpec: string): string {
    return JSON.stringify({
        mcpServers: {
            promethee: {
                command: 'npx',
                args: [
                    '-y',
                    `--package=${validatePackageSpec(packageSpec)}`,
                    '--',
                    'prometheemcp',
                    '--stdio'
                ]
            }
        }
    }, null, 2);
}

function renderCommand(plan: ClientInstallPlan): string {
    return [plan.executable, ...plan.args].join(' ');
}

function executePlan(plan: ClientInstallPlan): Promise<number> {
    return new Promise((resolve) => {
        const child = spawn(plan.executable, [...plan.args], {
            shell: false,
            stdio: 'inherit'
        });
        child.once('error', () => resolve(127));
        child.once('exit', (code) => resolve(code ?? 1));
    });
}

export async function runInteractiveOnboarding(options: InteractiveOnboardingOptions): Promise<number> {
    const stdin = options.stdin ?? process.stdin;
    const stdout = options.stdout ?? process.stdout;
    const stderr = options.stderr ?? process.stderr;
    const terminal = createInterface({ input: stdin, output: stdout, terminal: true });
    try {
        stdout.write([
            'Promethee MCP',
            '',
            'Choose the MCP client to configure:',
            '  1. Codex',
            '  2. Claude Code',
            '  3. Copy generic JSON configuration',
            '  0. Exit',
            ''
        ].join('\n'));
        const choice = (await terminal.question('Choice: ')).trim();
        if (choice === '0' || choice === '') return 0;
        if (choice === '3') {
            stdout.write(`\n${genericMcpConfiguration(options.packageSpec)}\n`);
            stdout.write('\nAdd this configuration to your MCP client, reconnect it, then ask it to connect Promethee.\n');
            return 0;
        }
        if (choice !== '1' && choice !== '2') {
            stderr.write('Choose 1, 2, 3, or 0.\n');
            return 2;
        }

        const plan = createClientInstallPlan(choice === '1' ? 'codex' : 'claude', options.packageSpec);
        stdout.write(`\nCommand:\n${renderCommand(plan)}\n\n`);
        const confirmation = (await terminal.question(`Add Promethee MCP to ${plan.client === 'codex' ? 'Codex' : 'Claude Code'} now? [y/N] `))
            .trim()
            .toLowerCase();
        if (confirmation !== 'y' && confirmation !== 'yes') {
            stdout.write('No configuration was changed. Copy the command above when you are ready.\n');
            return 0;
        }
        const exitCode = await executePlan(plan);
        if (exitCode !== 0) {
            stderr.write('The client could not be configured automatically. Run the printed command manually.\n');
            return 10;
        }
        stdout.write('Promethee MCP was added. Reconnect your client, then ask it to connect Promethee.\n');
        return 0;
    } finally {
        terminal.close();
    }
}
