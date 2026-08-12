#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { check, CannonPlusError } from './index.js';

const args = process.argv.slice(2);
const input = args[0];

if (!input || input === '-h' || input === '--help') {
  console.log('Usage: cannon-plus <file.cannon> [--emit-cannon <output.cannon>]');
  process.exit(input ? 0 : 1);
}

if (path.extname(input) !== '.cannon') {
  console.error('cannon-plus: source files must use the .cannon extension');
  process.exit(1);
}

let source;
try {
  source = fs.readFileSync(input, 'utf8');
} catch (error) {
  console.error(`cannon-plus: ${error.message}`);
  process.exit(2);
}

try {
  const result = check(source);
  const emitIndex = args.indexOf('--emit-cannon');
  if (emitIndex >= 0) {
    const output = args[emitIndex + 1];
    if (!output) throw new Error('--emit-cannon requires an output filename');
    fs.writeFileSync(output, result.code, 'utf8');
    console.log(`${input} -> ${output}`);
  } else {
    console.log(`${input}: valid Cannon+`);
  }
} catch (error) {
  if (error instanceof CannonPlusError) {
    const where = error.line ? `${input}:${error.line}:${error.column ?? 1}` : input;
    console.error(`${where}: ${error.message}`);
  } else {
    console.error(`cannon-plus: ${error.message}`);
  }
  process.exit(1);
}
