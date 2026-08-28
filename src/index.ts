import { pathToFileURL } from 'node:url';

import { runCli } from './cli/index.js';

export * from './mcp/index.js';
export * from './runtime/index.js';

const entryPath = process.argv[1];
if (entryPath !== undefined && import.meta.url === pathToFileURL(entryPath).href) {
    void runCli(['serve'], process.env).then(exitCode => {
        process.exitCode = exitCode;
    });
}
