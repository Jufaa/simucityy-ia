import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { buildApp } from './app';
import { loadConfig } from './config/env';

// src/server.ts and dist/server.js are both three levels below the root .env.
loadDotenv({
  path: fileURLToPath(new URL('../../../.env', import.meta.url)),
  quiet: true,
});

async function main() {
  const config = loadConfig(process.env);
  const app = buildApp(config);
  const shutdown = async () => {
    await app.close();
  };
  process.once('SIGINT', () => {
    void shutdown();
  });
  process.once('SIGTERM', () => {
    void shutdown();
  });
  await app.listen({ host: config.host, port: config.port });
}

main().catch(() => {
  process.stderr.write(
    'API failed to start. Check configuration and port availability.\n',
  );
  process.exitCode = 1;
});
