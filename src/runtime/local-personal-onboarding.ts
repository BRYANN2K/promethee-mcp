import { randomBytes } from 'node:crypto';
import {
    chmodSync,
    lstatSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync
} from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';

import type { SupabaseFetch } from '../adapters/supabase/index.js';
import {
    EncryptedFilePersonalSessionPersistence,
    type PersonalSessionPersistence
} from './encrypted-personal-session-file.js';
import { startNodeServer, type RunningNodeServer } from './node-server.js';
import { createPersonalRuntime, type PersonalRuntimeComposition } from './personal-runtime.js';

const LOCAL_HOST = '127.0.0.1';
const DEFAULT_PORT_ATTEMPTS = 20;
const KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export class LocalOnboardingConfigurationError extends Error {}

export interface StartLocalPersonalOnboardingOptions {
    readonly configDirectory: string;
    readonly webRoot: string;
    readonly preferredPort?: number;
    readonly strictPort?: boolean;
    readonly portAttempts?: number;
    readonly fetch?: SupabaseFetch;
    readonly now?: () => number;
    readonly onError?: (error: Error) => void;
}

export interface LocalPersonalOnboarding {
    readonly origin: string;
    readonly loginUrl: string;
    readonly composition: PersonalRuntimeComposition;
    readonly server: RunningNodeServer;
    close(): Promise<void>;
}

class LocalKeyFilePersonalSessionPersistence implements PersonalSessionPersistence {
    readonly #keyFile: string;
    readonly #sessionFile: string;

    public constructor(directory: string) {
        if (!isAbsolute(directory) || directory.length > 4_096 || directory.includes('\0')) {
            throw new LocalOnboardingConfigurationError('The local config directory must be an absolute path.');
        }
        this.#keyFile = join(directory, 'session.key');
        this.#sessionFile = join(directory, 'session.enc');
    }

    #readKey(): Uint8Array | null {
        let stat;
        try {
            stat = lstatSync(this.#keyFile);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
            throw error;
        }
        if (
            !stat.isFile() ||
            stat.isSymbolicLink() ||
            stat.size < 43 ||
            stat.size > 44 ||
            (process.platform !== 'win32' && (stat.mode & 0o077) !== 0)
        ) {
            throw new Error('invalid_local_session_key');
        }
        const serialized = readFileSync(this.#keyFile, 'utf8').trim();
        if (!KEY_PATTERN.test(serialized)) throw new Error('invalid_local_session_key');
        const key = Buffer.from(serialized, 'base64url');
        if (key.byteLength !== 32 || key.toString('base64url') !== serialized) {
            throw new Error('invalid_local_session_key');
        }
        return key;
    }

    #key(): Uint8Array {
        const existing = this.#readKey();
        if (existing !== null) return existing;
        mkdirSync(dirname(this.#keyFile), { recursive: true, mode: 0o700 });
        const generated = randomBytes(32).toString('base64url');
        try {
            writeFileSync(this.#keyFile, `${generated}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
            chmodSync(this.#keyFile, 0o600);
            return Buffer.from(generated, 'base64url');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
            const raced = this.#readKey();
            if (raced === null) throw new Error('local_session_key_unavailable');
            return raced;
        }
    }

    #delegate(key: Uint8Array): EncryptedFilePersonalSessionPersistence {
        return new EncryptedFilePersonalSessionPersistence({ file: this.#sessionFile, key });
    }

    public load(): unknown | null {
        let sessionExists = true;
        try {
            const stat = lstatSync(this.#sessionFile);
            if (!stat.isFile() || stat.isSymbolicLink()) {
                throw new Error('invalid_local_session_file');
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') sessionExists = false;
            else throw error;
        }
        if (!sessionExists) return null;
        const key = this.#readKey();
        if (key === null) {
            rmSync(this.#sessionFile, { force: true });
            return null;
        }
        return this.#delegate(key).load();
    }

    public save(value: unknown): void {
        this.#delegate(this.#key()).save(value);
    }

    public clear(): void {
        const key = this.#readKey();
        if (key === null) {
            rmSync(this.#sessionFile, { force: true });
            return;
        }
        this.#delegate(key).clear();
    }

    public compareAndSwap(expected: unknown | null, value: unknown): boolean {
        return this.#delegate(this.#key()).compareAndSwap(expected, value);
    }
}

export function resolveLocalConfigDirectory(environment: NodeJS.ProcessEnv, platform = process.platform): string {
    const configured = environment['PROMETHEE_MCP_CONFIG_DIR'];
    if (configured !== undefined) {
        if (!isAbsolute(configured) || configured.length > 4_096 || configured.includes('\0')) {
            throw new LocalOnboardingConfigurationError('PROMETHEE_MCP_CONFIG_DIR must be an absolute path.');
        }
        return configured;
    }
    if (platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'prometheemcp');
    if (platform === 'win32') {
        const appData = environment['APPDATA'];
        return appData !== undefined && isAbsolute(appData)
            ? join(appData, 'prometheemcp')
            : join(homedir(), 'AppData', 'Roaming', 'prometheemcp');
    }
    const xdg = environment['XDG_CONFIG_HOME'];
    return xdg !== undefined && isAbsolute(xdg)
        ? join(xdg, 'prometheemcp')
        : join(homedir(), '.config', 'prometheemcp');
}

function isBindFailure(error: unknown): boolean {
    const code = error instanceof Error && 'code' in error
        ? (error as NodeJS.ErrnoException).code
        : undefined;
    return code === 'EADDRINUSE' || code === 'EACCES';
}

async function ephemeralPort(): Promise<number> {
    const server = createServer();
    return await new Promise<number>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, LOCAL_HOST, () => {
            const address = server.address();
            if (address === null || typeof address === 'string') {
                server.close();
                reject(new Error('Loopback port selection failed'));
                return;
            }
            const selected = address.port;
            server.close((error) => error === undefined ? resolve(selected) : reject(error));
        });
    });
}

function boundedAttempts(value: number | undefined): number {
    return Number.isSafeInteger(value) && value !== undefined && value >= 1 && value <= 100
        ? value
        : DEFAULT_PORT_ATTEMPTS;
}

export async function startLocalPersonalOnboarding(
    options: StartLocalPersonalOnboardingOptions
): Promise<LocalPersonalOnboarding> {
    const persistence = new LocalKeyFilePersonalSessionPersistence(options.configDirectory);
    const preferredPort = options.preferredPort ?? 3210;
    const attempts = options.strictPort === true ? 1 : boundedAttempts(options.portAttempts);
    let lastBindError: unknown;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
        const port = preferredPort === 0
            ? await ephemeralPort()
            : preferredPort + attempt;
        if (port < 1 || port > 65_535) break;
        const authority = `${LOCAL_HOST}:${String(port)}`;
        const origin = `http://${authority}`;
        const composition = createPersonalRuntime({
            authority,
            allowedHosts: [authority],
            uiOrigins: [origin],
            persistence,
            defaultRetention: 'seven-days',
            webRoot: options.webRoot,
            ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
            ...(options.now === undefined ? {} : { now: options.now }),
            ...(options.onError === undefined ? {} : { onError: options.onError })
        });
        try {
            const server = await startNodeServer({
                runtime: composition.runtime,
                host: LOCAL_HOST,
                port,
                ...(options.onError === undefined ? {} : { onError: options.onError })
            });
            let closing: Promise<void> | undefined;
            return {
                origin,
                loginUrl: `${origin}/login`,
                composition,
                server,
                close(): Promise<void> {
                    closing ??= server.close();
                    return closing;
                }
            };
        } catch (error) {
            if (!isBindFailure(error)) throw error;
            lastBindError = error;
        }
    }
    throw lastBindError ?? new Error('No bounded loopback port is available');
}
