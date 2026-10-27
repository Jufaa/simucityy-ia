import OpenAI from 'openai';

export const META_BASE_URL = 'https://api.meta.ai/v1';
export const DEFAULT_MODEL = 'muse-spark-1.1'; // o 'muse-spark-1.3' si tienes acceso

export function createMetaClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: META_BASE_URL,
    timeout: 15000, // 15s
    maxRetries: 1,
  });
}
