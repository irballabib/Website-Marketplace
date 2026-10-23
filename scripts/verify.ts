#!/usr/bin/env node

/**
 * Verify script - runs lint, typecheck, test, and build
 * Usage: pnpm verify
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';

const commands = [
  { name: 'Lint', cmd: 'pnpm lint' },
  { name: 'TypeCheck', cmd: 'pnpm typecheck' },
  { name: 'Test', cmd: 'pnpm test' },
  { name: 'Build', cmd: 'pnpm build' },
];

console.log('🔍 Running verification checks...\n');

let failed = false;

for (const { name, cmd } of commands) {
  console.log(`\n▶ ${name}: ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit', cwd: process.cwd() });
    console.log(`✅ ${name} passed`);
  } catch (error) {
    console.error(`❌ ${name} failed`);
    failed = true;
  }
}

console.log('\n' + '='.repeat(50));
if (failed) {
  console.error('❌ Verification FAILED');
  process.exit(1);
} else {
  console.log('✅ All checks PASSED');
  process.exit(0);
}