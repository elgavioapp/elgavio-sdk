#!/usr/bin/env node
import { argv, exit, stderr } from 'node:process';
import { CliError, run } from './command.js';

run(argv.slice(2)).then(
  (code) => exit(code),
  (error: unknown) => {
    stderr.write(`elgavio: ${error instanceof Error ? error.message : String(error)}\n`);
    exit(error instanceof CliError ? 1 : 2);
  },
);
