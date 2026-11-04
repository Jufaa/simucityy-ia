import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ApiConfig } from '../../config/env.js';
import { encryptUserKey, decryptUserKey } from './crypto.js';
import { SqliteUserKeyRepository } from './sqlite-repository';
import {
  explainCitizen,
  proposeCityPlan,
  proposeInterventions,
  runAi,
  writeEmergencyReport,
} from './service.js';
import {
  interventionContextSchema,
  citizenContextSchema,
  reportContextSchema,
} from './ai-plan.js';

const saveKeySchema = z.object({
  userId: z.string().min(1).max(128),
  apiKey: z
    .string()
    .max(512)
    .regex(/^LLM_[A-Za-z0-9_-]+$/, 'Invalid Meta API key format'),
});

const chatSchema = z.object({
  userId: z.string().min(1).max(128),
  mode: z.enum(['auto', 'guided']),
  prompt: z.string().min(1).max(8000),
});

const cityPlanSchema = z.object({
  userId: z.string().min(1).max(128).optional(),
  description: z.string().min(1).max(500).nullable().optional(),
});

const interventionsSchema = z.object({
  userId: z.string().min(1).max(128).optional(),
  context: interventionContextSchema,
});

const citizenSchema = z.object({
  userId: z.string().min(1).max(128).optional(),
  context: citizenContextSchema,
});

const reportSchema = z.object({
  userId: z.string().min(1).max(128).optional(),
  context: reportContextSchema,
});

export async function registerAiRoutes(
  app: FastifyInstance,
  config: ApiConfig,
): Promise<void> {
  const repo = new SqliteUserKeyRepository('./data/byok.db');

  // Save / replace a user's Meta API key (encrypted at rest).
  // BYOK is opt-in (BYOK_ENABLED=true): this API has no authentication,
  // so a caller-supplied userId alone must never grant key management.
  app.post('/ai/keys', async (request, reply) => {
    if (!config.byokEnabled) return reply.status(404).send(NOT_FOUND);
    const parsed = saveKeySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request does not match the expected schema.',
        },
      });
    }
    const encrypted = encryptUserKey(parsed.data.apiKey, config.byokMasterKey);
    await repo.save(parsed.data.userId, encrypted);
    return reply.status(204).send();
  });

  // Delete a user's key
  app.delete<{ Params: { userId: string } }>(
    '/ai/keys/:userId',
    async (request, reply) => {
      if (!config.byokEnabled) return reply.status(404).send(NOT_FOUND);
      await repo.delete(request.params.userId);
      return reply.status(204).send();
    },
  );

  // Chat endpoint: uses the user's own key
  app.post('/ai/chat', async (request, reply) => {
    if (!config.byokEnabled) return reply.status(404).send(NOT_FOUND);
    const parsed = chatSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request does not match the expected schema.',
        },
      });
    }
    const { userId, mode, prompt } = parsed.data;

    const stored = await repo.findByUserId(userId);
    if (!stored) {
      return reply.status(400).send({
        error: {
          code: 'KEY_NOT_REGISTERED',
          message: 'No API key is registered for this user.',
        },
      });
    }

    let userKey: string;
    try {
      userKey = decryptUserKey(stored.encryptedKey, config.byokMasterKey);
    } catch {
      return reply.status(500).send({
        error: {
          code: 'KEY_DECRYPT_FAILED',
          message: 'Stored key could not be decrypted.',
        },
      });
    }

    try {
      const result = await runAi(mode, prompt, {
        userKey,
        fallbackKey: config.metaApiKey,
        model: config.metaModel,
      });
      return reply.send({ result });
    } catch (err) {
      request.log.error({ err }, 'AI chat failed');
      const timedOut =
        err instanceof Error && err.message.includes('timed out');
      return reply.status(timedOut ? 504 : 502).send({
        error: {
          code: timedOut ? 'AI_TIMEOUT' : 'AI_PROVIDER_ERROR',
          message: timedOut
            ? 'AI request timed out.'
            : 'AI provider request failed.',
        },
      });
    }
  });

  // Resolves the caller's BYOK key first, then the server key. A BYOK
  // key is always a Meta key, so it keeps the Meta endpoint; the server
  // key may belong to any configured OpenAI-compatible provider.
  // Returns null when AI is not configured at all.
  async function resolveKey(userId?: string): Promise<{
    key: string;
    baseUrl?: string | undefined;
    model?: string | undefined;
  } | null> {
    if (userId && config.byokEnabled) {
      const stored = await repo.findByUserId(userId);
      if (stored) {
        try {
          return {
            key: decryptUserKey(stored.encryptedKey, config.byokMasterKey),
          };
        } catch {
          return null;
        }
      }
    }
    if (config.aiApiKey) {
      return {
        key: config.aiApiKey,
        ...(config.aiBaseUrl ? { baseUrl: config.aiBaseUrl } : {}),
        ...((config.aiModel ?? config.metaModel)
          ? { model: config.aiModel ?? config.metaModel }
          : {}),
      };
    }
    if (config.metaApiKey) {
      return {
        key: config.metaApiKey,
        ...(config.metaModel ? { model: config.metaModel } : {}),
      };
    }
    return null;
  }

  function aiError(
    request: import('fastify').FastifyRequest,
    reply: import('fastify').FastifyReply,
    err: unknown,
  ) {
    request.log.error({ err }, 'AI request failed');
    const timedOut = err instanceof Error && err.message.includes('timed out');
    return reply.status(timedOut ? 504 : 502).send({
      error: {
        code: timedOut ? 'AI_TIMEOUT' : 'AI_PROVIDER_ERROR',
        message: timedOut
          ? 'AI request timed out.'
          : 'AI provider request failed.',
      },
    });
  }

  const NOT_FOUND = {
    error: { code: 'NOT_FOUND', message: 'Route not found.' },
  } as const;
  const NOT_CONFIGURED = {
    error: {
      code: 'AI_NOT_CONFIGURED',
      message: 'AI is not configured on this server.',
    },
  } as const;

  // AI city creation: model proposes a validated plan; the generator builds it.
  app.post('/ai/city-plan', async (request, reply) => {
    const parsed = cityPlanSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request does not match the expected schema.',
        },
      });
    }
    const resolved = await resolveKey(parsed.data.userId);
    if (!resolved) return reply.status(503).send(NOT_CONFIGURED);
    try {
      const plan = await proposeCityPlan(parsed.data.description ?? null, {
        userKey: resolved.key,
        model: resolved.model,
        baseUrl: resolved.baseUrl,
      });
      return reply.send({ plan });
    } catch (err) {
      return aiError(request, reply, err);
    }
  });

  // Intervention agent: proposes bounded levers from measured metrics.
  app.post('/ai/interventions', async (request, reply) => {
    const parsed = interventionsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request does not match the expected schema.',
        },
      });
    }
    const resolved = await resolveKey(parsed.data.userId);
    if (!resolved) return reply.status(503).send(NOT_CONFIGURED);
    try {
      const plan = await proposeInterventions(parsed.data.context, {
        userKey: resolved.key,
        model: resolved.model,
        baseUrl: resolved.baseUrl,
      });
      return reply.send({ plan });
    } catch (err) {
      return aiError(request, reply, err);
    }
  });

  // One citizen narrates their measured state in first person.
  app.post('/ai/citizen', async (request, reply) => {
    const parsed = citizenSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request does not match the expected schema.',
        },
      });
    }
    const resolved = await resolveKey(parsed.data.userId);
    if (!resolved) return reply.status(503).send(NOT_CONFIGURED);
    try {
      const replyText = await explainCitizen(parsed.data.context, {
        userKey: resolved.key,
        model: resolved.model,
        baseUrl: resolved.baseUrl,
      });
      return reply.send({ reply: replyText });
    } catch (err) {
      return aiError(request, reply, err);
    }
  });

  // Emergency report written from measured outcomes only.
  app.post('/ai/report', async (request, reply) => {
    const parsed = reportSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request does not match the expected schema.',
        },
      });
    }
    const resolved = await resolveKey(parsed.data.userId);
    if (!resolved) return reply.status(503).send(NOT_CONFIGURED);
    try {
      const result = await writeEmergencyReport(parsed.data.context, {
        userKey: resolved.key,
        model: resolved.model,
        baseUrl: resolved.baseUrl,
      });
      return reply.send({ report: result.report });
    } catch (err) {
      return aiError(request, reply, err);
    }
  });
}
