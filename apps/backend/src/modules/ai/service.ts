import OpenAI from 'openai';
import { createMetaClient, DEFAULT_MODEL } from './client.js';

export type AiMode = 'auto' | 'guided';

export interface AiServiceDeps {
  userKey: string;
  fallbackKey?: string | undefined; // 👈 añade | undefined
}

export interface GuidedParams {
  [key: string]: unknown;
}

const SYSTEM_PROMPTS: Record<AiMode, string> = {
  auto: 'Eres un asistente útil y conciso.',
  guided:
    'Eres un asistente que SOLO responde con un objeto JSON válido. No incluyas markdown ni texto extra.',
};

export async function runAi(
  mode: AiMode,
  userPrompt: string,
  deps: AiServiceDeps,
): Promise<string | GuidedParams> {
  const apiKey = deps.userKey || deps.fallbackKey;
  if (!apiKey) {
    throw new Error('No API key available for this user.');
  }

  const client = createMetaClient(apiKey);

  const params: OpenAI.Chat.ChatCompletionCreateParams = {
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPTS[mode] },
      { role: 'user', content: userPrompt },
    ],
  };

  if (mode === 'guided') {
    params.response_format = { type: 'json_object' };
  }

  let completion: OpenAI.Chat.ChatCompletion;
  try {
    completion = await client.chat.completions.create(params);
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      // 401 = clave inválida, 429 = rate limit, 5xx = error del proveedor
      throw new Error(`Meta API error (${error.status}): ${error.message}`);
    }
    if (error instanceof OpenAI.APIConnectionTimeoutError) {
      throw new Error('Meta API request timed out.');
    }
    throw new Error(`Unexpected error calling Meta API: ${String(error)}`);
  }

  const content = completion.choices[0]?.message?.content ?? '';

  if (mode === 'auto') {
    return content;
  }

  // guided: parse + validate JSON
  try {
    const parsed = JSON.parse(content) as GuidedParams;
    return parsed;
  } catch {
    throw new Error('Model did not return valid JSON in guided mode.');
  }
}
