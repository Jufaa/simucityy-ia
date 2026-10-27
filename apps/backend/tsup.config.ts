import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node22',
  noExternal: ['@simulicity/shared'],
  clean: true,
});
