import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
    createPersonalRuntime,
    EncryptedFilePersonalSessionPersistence,
    installProcessLifecycle,
    LocalOnboardingConfigurationError,
    resolveLocalConfigDirectory,
    startPersonalStdioService,
    startNodeServer
} from '../runtime/index.js';
import { createSupabaseRuntime } from '../runtime/supabase-runtime.js';
import { createSyntheticRuntime } from '../runtime/synthetic-runtime.js';
import {
    createSupabaseCliConfiguration,
    SupabaseCliConfigurationError
} from './supabase-config.js';
import {
    createPersonalProductionConfiguration,
    PersonalCliConfigurationError,
    type PersonalProductionConfiguration
} from './personal-config.js';
import { DEFAULT_PACKAGE_SPEC, runInteractiveOnboarding } from './onboarding.js';

export const CLI_VERSION = '0.1.0';
export const SYNTHETIC_HOST = '127.0.0.1';
export const DEFAULT_SYNTHETIC_PORT = 3210;

const HELP = `Usage: prometheeemcp [command] [options]

Connect an MCP client to Promethee tasks and projects.

Commands:
  (no command)          Configure a client on a TTY; serve MCP over stdio when piped
  --stdio               Serve MCP over stdio and host the local browser login
  serve                 Start the selected server on loopback
  doctor                Inspect effective configuration without network access

Options:
  --mode <mode>         synthetic (default), personal, or supabase; overrides PROMETHEE_MCP_MODE
  --port <1-65535>      Override PROMETHEE_MCP_PORT
  --json                Emit doctor output as one JSON object
  -h, --help            Show help
  -V, --version         Show version

The CLI never asks for Promethee credentials. Supabase mode uses environment configuration.
`;

interface CliIo {
    readonly stdin: NodeJS.ReadStream;
    readonly stdout: NodeJS.WriteStream;
    readonly stderr: NodeJS.WriteStream;
}

interface ParsedCommand {
    readonly kind: 'default' | 'stdio' | 'help' | 'version' | 'doctor' | 'serve';
    readonly mode: 'synthetic' | 'personal' | 'supabase';
    readonly port: number;
    readonly portExplicit: boolean;
    readonly json: boolean;
}

class CliUsageError extends Error {}

function parsePort(value: string, label: string, allowZero = false): number {
    if (!/^\d{1,5}$/u.test(value)) {
        throw new CliUsageError(`${label} must be an integer between ${allowZero ? '0' : '1'} and 65535`);
    }
    const port = Number(value);
    if (port < (allowZero ? 0 : 1) || port > 65_535) {
        throw new CliUsageError(`${label} must be an integer between ${allowZero ? '0' : '1'} and 65535`);
    }
    return port;
}

function effectivePort(flag: string | undefined, environment: NodeJS.ProcessEnv, allowZero = false): number {
    if (flag !== undefined) return parsePort(flag, '--port', allowZero);
    const configured = environment['PROMETHEE_MCP_PORT'];
    if (configured !== undefined) return parsePort(configured, 'PROMETHEE_MCP_PORT', allowZero);
    return DEFAULT_SYNTHETIC_PORT;
}

function effectiveMode(flag: string | undefined, environment: NodeJS.ProcessEnv): 'synthetic' | 'personal' | 'supabase' {
    const value = flag ?? environment['PROMETHEE_MCP_MODE'] ?? 'synthetic';
    if (value !== 'synthetic' && value !== 'personal' && value !== 'supabase') {
        throw new CliUsageError('--mode must be synthetic, personal, or supabase.');
    }
    return value;
}

function parseCommand(argv: readonly string[], environment: NodeJS.ProcessEnv): ParsedCommand {
    if (argv.length === 0) {
        return {
            kind: 'default',
            mode: 'personal',
            port: effectivePort(undefined, environment, true),
            portExplicit: environment['PROMETHEE_MCP_PORT'] !== undefined,
            json: false
        };
    }
    if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
        return { kind: 'help', mode: 'synthetic', port: DEFAULT_SYNTHETIC_PORT, portExplicit: false, json: false };
    }
    if (argv.length === 1 && (argv[0] === '--version' || argv[0] === '-V')) {
        return { kind: 'version', mode: 'synthetic', port: DEFAULT_SYNTHETIC_PORT, portExplicit: false, json: false };
    }

    const command = argv[0];
    if (command !== 'serve' && command !== 'doctor' && command !== '--stdio') {
        throw new CliUsageError(command?.startsWith('-') === true ? 'Unknown option.' : 'Unknown command.');
    }
    if (argv.length === 2 && (argv[1] === '--help' || argv[1] === '-h')) {
        return { kind: 'help', mode: 'synthetic', port: DEFAULT_SYNTHETIC_PORT, portExplicit: false, json: false };
    }

    let portFlag: string | undefined;
    let modeFlag: string | undefined;
    let json = false;
    for (let index = 1; index < argv.length; index += 1) {
        const option = argv[index];
        if (option === '--json') {
            if (command !== 'doctor') throw new CliUsageError('--json is available only for doctor.');
            if (json) throw new CliUsageError('--json may be specified only once.');
            json = true;
            continue;
        }
        if (option === '--port') {
            if (portFlag !== undefined) throw new CliUsageError('--port may be specified only once.');
            const value = argv[index + 1];
            if (value === undefined) throw new CliUsageError('--port requires a value.');
            portFlag = value;
            index += 1;
            continue;
        }
        if (option === '--mode') {
            if (command === '--stdio') throw new CliUsageError('--mode is unavailable for stdio onboarding.');
            if (modeFlag !== undefined) throw new CliUsageError('--mode may be specified only once.');
            const value = argv[index + 1];
            if (value === undefined) throw new CliUsageError('--mode requires a value.');
            modeFlag = value;
            index += 1;
            continue;
        }
        if (option?.startsWith('--mode=') === true) {
            if (command === '--stdio') throw new CliUsageError('--mode is unavailable for stdio onboarding.');
            if (modeFlag !== undefined) throw new CliUsageError('--mode may be specified only once.');
            modeFlag = option.slice('--mode='.length);
            continue;
        }
        if (option?.startsWith('--port=') === true) {
            if (portFlag !== undefined) throw new CliUsageError('--port may be specified only once.');
            portFlag = option.slice('--port='.length);
            continue;
        }
        throw new CliUsageError(option?.startsWith('-') === true ? 'Unknown option.' : 'Unexpected argument.');
    }

    return {
        kind: command === '--stdio' ? 'stdio' : command,
        mode: command === '--stdio' ? 'personal' : effectiveMode(modeFlag, environment),
        port: effectivePort(portFlag, environment, command === '--stdio'),
        portExplicit: portFlag !== undefined || environment['PROMETHEE_MCP_PORT'] !== undefined,
        json
    };
}

function doctorResult(port: number) {
    return {
        schemaVersion: 1,
        status: 'synthetic-only',
        mode: 'synthetic-deny-all',
        transport: 'streamable-http',
        bind: { host: SYNTHETIC_HOST, port },
        livePromethee: false,
        browserAuth: false
    } as const;
}

function writeDoctor(io: CliIo, port: number, json: boolean): void {
    const result = doctorResult(port);
    if (json) {
        io.stdout.write(`${JSON.stringify(result)}\n`);
        return;
    }
    io.stdout.write([
        'Promethee MCP doctor',
        `Status: ${result.status}`,
        `Mode: ${result.mode}`,
        `Transport: ${result.transport}`,
        `Bind: ${result.bind.host}:${String(result.bind.port)}`,
        'Live Promethee: no',
        'Browser auth: no',
        ''
    ].join('\n'));
}

function writeSupabaseDoctor(
    io: CliIo,
    port: number,
    json: boolean,
    publicMcpUrl: string
): void {
    const result = {
        schemaVersion: 1,
        status: 'configured-unverified',
        mode: 'supabase',
        transport: 'streamable-http',
        bind: { host: SYNTHETIC_HOST, port },
        publicMcpUrl,
        livePromethee: true,
        browserAuth: true,
        connectionVerified: false
    } as const;
    if (json) {
        io.stdout.write(`${JSON.stringify(result)}\n`);
        return;
    }
    io.stdout.write([
        'Promethee MCP doctor',
        `Status: ${result.status}`,
        `Mode: ${result.mode}`,
        `Transport: ${result.transport}`,
        `Bind: ${result.bind.host}:${String(result.bind.port)}`,
        `Public MCP URL: ${result.publicMcpUrl}`,
        'Live Promethee: configured, not contacted',
        'Browser auth: configured',
        ''
    ].join('\n'));
}

function writePersonalDoctor(
    io: CliIo,
    port: number,
    json: boolean,
    production: PersonalProductionConfiguration | null
): void {
    const result = {
        schemaVersion: 1,
        status: production === null ? 'waiting-for-browser-connection' : 'production-configured-unverified',
        mode: production === null ? 'personal' : 'personal-single-user',
        transport: 'streamable-http',
        bind: { host: production?.bindHost ?? SYNTHETIC_HOST, port },
        mcpUrl: production?.publicMcpUrl ?? `http://${SYNTHETIC_HOST}:${String(port)}/mcp`,
        connectionUrl: production === null
            ? `http://${SYNTHETIC_HOST}:${String(port)}/connect/session`
            : new URL('/connect/session', production.publicMcpUrl).href,
        livePromethee: true,
        browserAuth: true,
        mcpAuthentication: production === null ? 'loopback-process' : 'static-bearer',
        sessionPersistence: production === null ? 'memory-only' : 'encrypted-seven-days'
    } as const;
    if (json) {
        io.stdout.write(`${JSON.stringify(result)}\n`);
        return;
    }
    io.stdout.write([
        'Promethee MCP doctor',
        `Status: ${result.status}`,
        `Mode: ${result.mode}`,
        `Transport: ${result.transport}`,
        `Bind: ${result.bind.host}:${String(result.bind.port)}`,
        `MCP URL: ${result.mcpUrl}`,
        production === null ? 'Browser auth: required once per server start' : 'Browser auth: configured behind the trusted edge',
        production === null ? 'Session persistence: memory only' : 'Session persistence: encrypted, seven days',
        ''
    ].join('\n'));
}

function isTemporaryBindFailure(error: unknown): boolean {
    if (!(error instanceof Error) || !('code' in error)) return false;
    const code = (error as NodeJS.ErrnoException).code;
    return code === 'EADDRINUSE' || code === 'EACCES';
}

export async function runCli(
    argv: readonly string[],
    environment: NodeJS.ProcessEnv,
    io: CliIo = process
): Promise<number> {
    try {
        const parsed = parseCommand(argv, environment);
        if (parsed.kind === 'help') {
            io.stdout.write(HELP);
            return 0;
        }
        if (parsed.kind === 'version') {
            io.stdout.write(`prometheemcp ${CLI_VERSION}\n`);
            return 0;
        }
        if (parsed.kind === 'default' && io.stdin.isTTY === true && io.stdout.isTTY === true) {
            return await runInteractiveOnboarding({
                packageSpec: environment['PROMETHEE_MCP_PACKAGE_SPEC'] ?? DEFAULT_PACKAGE_SPEC,
                stdin: io.stdin,
                stdout: io.stdout,
                stderr: io.stderr
            });
        }
        if (parsed.kind === 'default' || parsed.kind === 'stdio') {
            const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../web/dist');
            const service = await startPersonalStdioService({
                configDirectory: resolveLocalConfigDirectory(environment),
                webRoot,
                preferredPort: parsed.port,
                strictPort: parsed.portExplicit && parsed.port !== 0
            });
            installProcessLifecycle(service);
            let closing = false;
            const closeOnInputEnd = () => {
                if (closing) return;
                closing = true;
                void service.close().catch(() => {
                    process.exitCode = 1;
                });
            };
            io.stdin.once('end', closeOnInputEnd);
            io.stdin.once('close', closeOnInputEnd);
            return 0;
        }
        if (parsed.kind === 'doctor') {
            if (parsed.mode === 'synthetic') {
                writeDoctor(io, parsed.port, parsed.json);
            } else if (parsed.mode === 'personal') {
                const authority = `${SYNTHETIC_HOST}:${String(parsed.port)}`;
                writePersonalDoctor(
                    io,
                    parsed.port,
                    parsed.json,
                    createPersonalProductionConfiguration(environment, authority)
                );
            } else {
                const authority = `${SYNTHETIC_HOST}:${String(parsed.port)}`;
                const config = createSupabaseCliConfiguration(environment, authority);
                writeSupabaseDoctor(io, parsed.port, parsed.json, config.publicMcpUrl);
            }
            return 0;
        }

        const authority = `${SYNTHETIC_HOST}:${String(parsed.port)}`;
        const supabaseConfig = parsed.mode === 'supabase'
            ? createSupabaseCliConfiguration(environment, authority)
            : undefined;
        const personalProduction = parsed.mode === 'personal'
            ? createPersonalProductionConfiguration(environment, authority)
            : null;
        const personalComposition = parsed.mode === 'personal'
            ? createPersonalRuntime(personalProduction === null
                ? { authority }
                : {
                    authority,
                    publicMcpUrl: personalProduction.publicMcpUrl,
                    uiOrigins: personalProduction.uiOrigins,
                    allowedHosts: personalProduction.allowedHosts,
                    mcpAccessToken: personalProduction.mcpAccessToken,
                    edgeToken: personalProduction.edgeToken,
                    cursorKey: personalProduction.cursorKey,
                    persistence: new EncryptedFilePersonalSessionPersistence({
                        file: personalProduction.sessionFile,
                        key: personalProduction.sessionKey
                    }),
                    defaultRetention: 'seven-days'
                })
            : undefined;
        const runtime = personalComposition?.runtime ?? (supabaseConfig === undefined
            ? createSyntheticRuntime({ authority })
            : createSupabaseRuntime(supabaseConfig));
        const bindHost = personalProduction?.bindHost ?? SYNTHETIC_HOST;
        const running = await startNodeServer({ runtime, host: bindHost, port: parsed.port });
        installProcessLifecycle(running);
        if (personalComposition !== undefined) {
            io.stderr.write(`Promethee MCP personal resource server listening on ${personalProduction?.publicMcpUrl ?? `http://${authority}/mcp`}\n`);
            io.stderr.write(personalProduction === null
                ? 'Open http://127.0.0.1:4175/login to connect; the user session remains in memory only.\n'
                : 'Trusted-edge pairing and encrypted seven-day session retention are enabled.\n');
        } else if (supabaseConfig === undefined) {
            io.stderr.write(`Promethee MCP synthetic resource server listening on http://${authority}/mcp\n`);
            io.stderr.write('Bearer access is deny-by-default; live Promethee and browser authentication are disabled.\n');
        } else {
            io.stderr.write(`Promethee MCP Supabase resource server listening on http://${authority}/mcp\n`);
            io.stderr.write(`Public MCP resource: ${supabaseConfig.publicMcpUrl}\n`);
            io.stderr.write('Create tools use fixed publisher RPCs and fail closed when those RPCs are unavailable.\n');
        }
        return 0;
    } catch (error) {
        if (
            error instanceof CliUsageError ||
            error instanceof SupabaseCliConfigurationError ||
            error instanceof PersonalCliConfigurationError ||
            error instanceof LocalOnboardingConfigurationError
        ) {
            io.stderr.write(`${error.message}\nRun prometheeemcp --help for usage.\n`);
            return 2;
        }
        if (isTemporaryBindFailure(error)) {
            io.stderr.write('The loopback server could not bind to the requested port.\n');
            return 10;
        }
        io.stderr.write('Promethee MCP command failed.\n');
        return 1;
    }
}
