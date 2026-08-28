import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function readPackageVersion(moduleUrl = import.meta.url): string {
    let directory = dirname(fileURLToPath(moduleUrl));
    for (let depth = 0; depth < 8; depth += 1) {
        try {
            const manifest: unknown = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'));
            if (
                typeof manifest === 'object' &&
                manifest !== null &&
                Reflect.get(manifest, 'name') === 'promethee-mcp'
            ) {
                const version = Reflect.get(manifest, 'version');
                if (typeof version === 'string' && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(version)) {
                    return version;
                }
            }
        } catch {
            // Source, test, and packaged builds place package.json at different bounded parent depths.
        }
        const parent = dirname(directory);
        if (parent === directory) break;
        directory = parent;
    }
    throw new Error('Unable to resolve the promethee-mcp package version');
}

export const PACKAGE_VERSION = readPackageVersion();
