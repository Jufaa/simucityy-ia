import OpenAI from 'openai';
import { createMetaClient, DEFAULT_MODEL } from './client.js';
import {
  parseAiCityPlan,
  parseInterventionPlan,
  citizenReplySchema,
  emergencyReportSchema,
  type AiCityPlan,
  type CitizenContext,
  type CitizenReply,
  type EmergencyReport,
  type InterventionContext,
  type InterventionPlan,
  type ReportContext,
} from './ai-plan.js';

export type AiMode = 'auto' | 'guided';

export interface AiServiceDeps {
  userKey: string;
  fallbackKey?: string | undefined;
  model?: string | undefined;
  /** OpenAI-compatible endpoint. Defaults to the Meta API. */
  baseUrl?: string | undefined;
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

  const client = createMetaClient(apiKey, deps.baseUrl);

  const params: OpenAI.Chat.ChatCompletionCreateParams = {
    model: deps.model ?? DEFAULT_MODEL,
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
      throw new Error(`Meta API error (${error.status}): ${error.message}`, {
        cause: error,
      });
    }
    if (error instanceof OpenAI.APIConnectionTimeoutError) {
      throw new Error('Meta API request timed out.', { cause: error });
    }
    throw new Error(`Unexpected error calling Meta API: ${String(error)}`, {
      cause: error,
    });
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

async function chatJson(
  system: string,
  user: string,
  deps: AiServiceDeps,
): Promise<unknown> {
  const apiKey = deps.userKey || deps.fallbackKey;
  if (!apiKey) throw new Error('No API key available for this user.');
  const client = createMetaClient(apiKey, deps.baseUrl);
  let completion: OpenAI.Chat.ChatCompletion;
  try {
    completion = await client.chat.completions.create({
      model: deps.model ?? DEFAULT_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      throw new Error(`Meta API error (${error.status}): ${error.message}`, {
        cause: error,
      });
    }
    if (error instanceof OpenAI.APIConnectionTimeoutError) {
      throw new Error('Meta API request timed out.', { cause: error });
    }
    throw new Error(`Unexpected error calling Meta API: ${String(error)}`, {
      cause: error,
    });
  }
  const content = completion.choices[0]?.message?.content ?? '';
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new Error('Model did not return valid JSON.');
  }
}

const CITY_PLAN_SYSTEM = `You design fictional cities for a simulator. Reply ONLY with a JSON object, no markdown, with exactly these fields:
{"name": string (max 80), "summary": string (max 400, neutral Spanish, describe the city), "seed": integer 0..4294967295, "mode": "district"|"city", "profile": {"buildingTarget": integer 110..190, "parkTarget": integer 2..7, "heightScale": number 0.65..1.4 (low-rise ~0.7, tall ~1.3), "lakeScale": number 0.8..1.1, "riverWidthScale": number 0.8..1.15 (wide river ~1.15, no river emphasis ~0.8)}}
"mode" is "city" only for large-city requests, otherwise "district". Pick a seed yourself when the user gives none. Never exceed the numeric bounds. Invented features outside these fields are impossible: do not promise them.`;

export async function proposeCityPlan(
  description: string | null,
  deps: AiServiceDeps,
): Promise<AiCityPlan> {
  const raw = await chatJson(
    CITY_PLAN_SYSTEM,
    description
      ? `City request (Spanish or English): ${description}`
      : 'Invent an interesting small fictional city within the bounds.',
    deps,
  );
  try {
    return parseAiCityPlan(raw);
  } catch {
    throw new Error('Model did not return a valid city plan.');
  }
}

const INTERVENTION_SYSTEM = `You are an emergency-planning agent inside a flood simulator. You receive MEASURED metrics from the simulation engine (before = no intervention arm, after = current intervention arm, null on iteration 1). Reply ONLY with a JSON object, no markdown:
{"drains": integer 0..12 (extra drains placed automatically on the lowest terrain cells), "earlyWarning": boolean (faster citizen reaction), "reinforcement": boolean (structural reinforcement / facade protection), "done": boolean (true when the measured result is good enough or nothing else can improve), "rationale": string (max 600, neutral Spanish, cite ONLY the measured numbers you received; never invent metrics)}
Rules: maximize evacuated people and minimize trapped people, exposed buildings and blocked roads. Each iteration replaces the previous drains/measure choices. Set done=true when trapped is 0 and no lever plausibly helps more, or on iteration 3. Never propose values outside the bounds.`;

export async function proposeInterventions(
  context: InterventionContext,
  deps: AiServiceDeps,
): Promise<InterventionPlan> {
  const raw = await chatJson(
    INTERVENTION_SYSTEM,
    `Objective: ${context.objective}
Measured state: ${JSON.stringify(context)}`,
    deps,
  );
  try {
    return parseInterventionPlan(raw);
  } catch {
    throw new Error('Model did not return a valid intervention plan.');
  }
}

const CITIZEN_SYSTEM = `You are one fictional citizen inside a city-disaster simulator, speaking in first person in neutral Spanish. Reply ONLY with a JSON object: {"text": string (max 600)}. Narrate ONLY the facts given (your status, the hazard, whether you have an assigned shelter, elapsed minutes). Never invent streets, names, family, injuries or outcomes that are not in the facts. If trapped, say you are waiting for rescue. Keep it human and brief (2-3 sentences).`;

export async function explainCitizen(
  context: CitizenContext,
  deps: AiServiceDeps,
): Promise<CitizenReply> {
  const raw = await chatJson(
    CITIZEN_SYSTEM,
    `Facts: ${JSON.stringify(context)}`,
    deps,
  );
  try {
    return citizenReplySchema.parse(raw);
  } catch {
    throw new Error('Model did not return a valid citizen reply.');
  }
}

const REPORT_SYSTEM = `You write emergency-planning reports for a fictional city simulator, in neutral Spanish. Reply ONLY with a JSON object: {"report": string (max 3000)}. Use ONLY the measured numbers and recommendations provided; never invent data. Structure: what happened, measured impact, what improved with the intervention, and the recommended actions. State clearly that coefficients are demonstrative, not calibrated.`;

export async function writeEmergencyReport(
  context: ReportContext,
  deps: AiServiceDeps,
): Promise<EmergencyReport> {
  const raw = await chatJson(
    REPORT_SYSTEM,
    `Measured outcome: ${JSON.stringify(context)}`,
    deps,
  );
  try {
    return emergencyReportSchema.parse(raw);
  } catch {
    throw new Error('Model did not return a valid emergency report.');
  }
}
