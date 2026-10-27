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
});

export interface ApiConfig {
  host: string;
  port: number;
  logLevel: z.infer<typeof configSchema>['LOG_LEVEL'];
  corsOrigins: string[];
}

export function loadConfig(
  environment: Record<string, string | undefined>,
): ApiConfig {
  const result = configSchema.safeParse(environment);
  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path[0])),
    ];
    // Never serialize raw environment values or Zod input into logs.
    throw new Error(`Invalid API configuration: ${fields.join(', ')}.`);
  }
  return {
    host: result.data.HOST,
    port: result.data.PORT,
    logLevel: result.data.LOG_LEVEL,
    corsOrigins: result.data.CORS_ORIGINS,
  };
}
