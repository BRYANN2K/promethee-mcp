#!/usr/bin/env node

import { chmod } from 'node:fs/promises';
import { resolve } from 'node:path';

if (process.platform !== 'win32') {
  await chmod(resolve(process.cwd(), 'dist/product/src/cli.js'), 0o755);
}
