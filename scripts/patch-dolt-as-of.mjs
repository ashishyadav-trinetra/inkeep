#!/usr/bin/env node
/**
 * patch-dolt-as-of.mjs
 *
 * Rewrites any Dolt "AS OF '<branch>'" time-travel SQL inside compiled
 * @inkeep/agents-core dist files so the code runs on standard PostgreSQL.
 *
 * Dolt syntax:   FROM <table> AS OF '${branchName}'
 * Standard SQL:  FROM <table>
 *
 * Run once after `pnpm install` during Docker build.
 */

import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'fs/promises';
import { join } from 'path';

const ROOT = process.env.WORKDIR ?? '/inkeep-agents';

// Patterns to fix: "FROM <word> AS OF '${...}'"
// The template-literal variable can be any identifier.
const AS_OF_RE = /FROM (\w+) AS OF '\$\{[^}]+\}'/g;

async function patchFile(filePath) {
  const original = readFileSync(filePath, 'utf8');
  const patched = original.replace(AS_OF_RE, 'FROM $1');
  if (patched !== original) {
    writeFileSync(filePath, patched, 'utf8');
    console.log(`  patched: ${filePath.replace(ROOT, '')}`);
    return true;
  }
  return false;
}

async function main() {
  console.log('patch-dolt-as-of: scanning node_modules for AS OF syntax...');
  let count = 0;

  // Use glob to find all matching .js files under agents-core dist
  const pattern = join(ROOT, 'node_modules/**/@inkeep/agents-core/dist/**/*.js');

  // glob() in Node 22 accepts the pattern directly
  for await (const file of glob(pattern)) {
    if (await patchFile(file)) count++;
  }

  if (count === 0) {
    // Fallback: walk node_modules/.pnpm manually
    const { readdirSync, statSync } = await import('fs');
    const pnpmDir = join(ROOT, 'node_modules/.pnpm');
    try {
      const entries = readdirSync(pnpmDir);
      for (const entry of entries) {
        if (!entry.startsWith('@inkeep+agents-core')) continue;
        const distDir = join(pnpmDir, entry, 'node_modules/@inkeep/agents-core/dist');
        try {
          for await (const file of glob(join(distDir, '**/*.js'))) {
            if (await patchFile(file)) count++;
          }
        } catch { /* dir may not exist */ }
      }
    } catch { /* pnpm dir may not exist */ }
  }

  console.log(`patch-dolt-as-of: done — ${count} file(s) patched.`);
}

main().catch((err) => {
  console.error('patch-dolt-as-of failed:', err);
  process.exit(1);
});
