import { z } from 'zod';

const originSchema = z.string().refine((origin) => {
  try {
    const url = new URL(origin);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.username &&
      !url.password &&
      url.origin === origin
    );
  } catch {
    return false;
  }
}, 'Expected an exact HTTP(S) origin without credentials or a path.');

const configSchema = z.object({
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://127.0.0.1:3000')
    .transform((value) => value.split(',').map((origin) => origin.trim()))
    .pipe(z.array(originSchema).min(1)),

  // BYOK: 64 hex chars (32 bytes) for AES-256-GCM
  BYOK_MASTER_KEY: z
    .string()
    .regex(
      /^[0-9a-fA-F]{64}$/,
      'BYOK_MASTER_KEY must be 64 hex chars (32 bytes).',
    ),

  // Optional: global Meta API key as fallback
  META_API_KEY: z
    .string()
    .regex(/^LLM_[A-Za-z0-9_-]+$/, 'META_API_KEY must start with LLM_')
    .optional(),
});

export interface ApiConfig {
  host: string;
  port: number;
  logLevel: z.infer<typeof configSchema>['LOG_LEVEL'];
  corsOrigins: string[];
  byokMasterKey: Buffer;
  metaApiKey?: string | undefined; // 👈 añade | undefined
}

export function loadConfig(
  environment: Record<string, string | undefined>,
): ApiConfig {
  const result = configSchema.safeParse(environment);
  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path[0])),
    ];
    throw new Error(`Invalid API configuration: ${fields.join(', ')}.`);
  }
  return {
    host: result.data.HOST,
    port: result.data.PORT,
    logLevel: result.data.LOG_LEVEL,
    corsOrigins: result.data.CORS_ORIGINS,
    byokMasterKey: Buffer.from(result.data.BYOK_MASTER_KEY, 'hex'),
    metaApiKey: result.data.META_API_KEY,
  };
}
