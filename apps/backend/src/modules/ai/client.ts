import OpenAI from 'openai';

export const META_BASE_URL = 'https://api.meta.ai/v1';
export const DEFAULT_MODEL = 'muse-spark-1.3';

/** Model override for accounts without access to the default model. */
export function resolveModel(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const value = environment.META_MODEL?.trim();
  return value ? value : DEFAULT_MODEL;
}

export function createMetaClient(
  apiKey: string,
  baseURL: string = META_BASE_URL,
): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL,
    timeout: 15000, // 15s
    maxRetries: 1,
  });
}
