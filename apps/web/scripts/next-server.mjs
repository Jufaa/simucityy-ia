import { spawn } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { config } from 'dotenv';

config({
  path: fileURLToPath(new URL('../../../.env', import.meta.url)),
  quiet: true,
});
const port = process.env.WEB_PORT ?? '3000';
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
  throw new Error('WEB_PORT must be an integer between 1 and 65535.');
}
const mode = process.argv[2];
if (mode !== 'dev' && mode !== 'start')
  throw new Error('Expected dev or start.');
const cli = fileURLToPath(import.meta.resolve('next/dist/bin/next'));
const child = spawn(
  process.execPath,
  [cli, mode, '--hostname', '127.0.0.1', '--port', port],
  {
    stdio: 'inherit',
    env: process.env,
  },
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => child.kill(signal));
child.once('error', () => {
  process.stderr.write('Web server failed to start.\n');
  process.exitCode = 1;
});
child.once('exit', (code) => {
  process.exitCode = code ?? 1;
});
