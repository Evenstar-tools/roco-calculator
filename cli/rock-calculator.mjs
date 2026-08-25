#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  executeCli,
  serializeCliError,
} from "../src/cli/rock-calculator-cli.js";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

try {
  const result = executeCli(process.argv.slice(2), {
    cwd: process.cwd(),
    projectRoot,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const serialized = serializeCliError(error);
  process.stderr.write(`${JSON.stringify(serialized.payload)}\n`);
  process.exitCode = serialized.exitCode;
}
