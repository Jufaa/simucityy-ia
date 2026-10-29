import type { NextConfig } from 'next';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({
  path: resolve(process.cwd(), '../../.env'),
  override: false,
  quiet: true,
});
const nextConfig: NextConfig = {
  transpilePackages: ['@simulicity/shared', '@simulicity/hazards'],
  poweredByHeader: false,
};
export default nextConfig;
