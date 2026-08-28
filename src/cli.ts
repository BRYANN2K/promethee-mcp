#!/usr/bin/env node

import { runCli } from './cli/index.js';

function exitQuietlyOnBrokenPipe(stream: NodeJS.WriteStream): void {
    stream.on('error', error => {
        if ((error as NodeJS.ErrnoException).code === 'EPIPE') {
            process.exit(0);
        }
        process.exitCode = 1;
    });
}

exitQuietlyOnBrokenPipe(process.stdout);
exitQuietlyOnBrokenPipe(process.stderr);

void runCli(process.argv.slice(2), process.env).then(exitCode => {
    process.exitCode = exitCode;
});
