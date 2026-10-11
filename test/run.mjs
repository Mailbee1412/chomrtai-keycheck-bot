import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = mkdtempSync(path.join(tmpdir(), 'chomrtai-test-'));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(root, 'test', file)], {
      stdio: 'inherit',
      env: {
        ...process.env,
        DISCORD_TOKEN: process.env.DISCORD_TOKEN || 'test-token',
        DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID || 'test-client',
        SHOP_DATA_DIR: dir,
      },
    });
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

const exitCode = (await run('linkapi.mjs')) || (await run('welcome.mjs'));
rmSync(dir, { recursive: true, force: true });
process.exit(exitCode);
