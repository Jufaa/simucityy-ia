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
  userId: z.string().min(1),
  apiKey: z
    .string()
    .regex(/^LLM_[A-Za-z0-9_-]+$/, 'Invalid Meta API key format'),
});

const chatSchema = z.object({
  userId: z.string().min(1),
  mode: z.enum(['auto', 'guided']),
  prompt: z.string().min(1).max(8000),
});

const cityPlanSchema = z.object({
  userId: z.string().min(1).optional(),
  description: z.string().min(1).max(500).nullable().optional(),
});

const interventionsSchema = z.object({
  userId: z.string().min(1).optional(),
  context: interventionContextSchema,
});

const citizenSchema = z.object({
  userId: z.string().min(1).optional(),
  context: citizenContextSchema,
});

const reportSchema = z.object({
  userId: z.string().min(1).optional(),
  context: reportContextSchema,
});

export async function registerAiRoutes(
  app: FastifyInstance,
  config: ApiConfig,
): Promise<void> {
  const repo = new SqliteUserKeyRepository('./data/byok.db');

  // Save / replace a user's Meta API key (encrypted at rest)
  app.post('/ai/keys', async (request, reply) => {
    const parsed = saveKeySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: 'Invalid body', issues: parsed.error.issues });
    }
    const encrypted = encryptUserKey(parsed.data.apiKey, config.byokMasterKey);
    await repo.save(parsed.data.userId, encrypted);
    return reply.status(204).send();
  });

  // Delete a user's key
  app.delete<{ Params: { userId: string } }>(
    '/ai/keys/:userId',
    async (request, reply) => {
      await repo.delete(request.params.userId);
      return reply.status(204).send();
    },
  );

  // Chat endpoint: uses the user's own key
  app.post('/ai/chat', async (request, reply) => {
    const parsed = chatSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: 'Invalid body', issues: parsed.error.issues });
    }
    const { userId, mode, prompt } = parsed.data;

    const stored = await repo.findByUserId(userId);
    if (!stored) {
      return reply.status(400).send({
        error: 'No API key registered for this user. Call POST /ai/keys first.',
      });
    }

    let userKey: string;
    try {
      userKey = decryptUserKey(stored.encryptedKey, config.byokMasterKey);
    } catch {
      return reply
        .status(500)
        .send({ error: 'Stored key could not be decrypted.' });
    }

    try {
      const result = await runAi(mode, prompt, {
        userKey,
        fallbackKey: config.metaApiKey,
        model: config.metaModel,
      });
      return reply.send({ result });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const status = message.includes('timed out') ? 504 : 502;
      return reply.status(status).send({ error: message });
    }
  });

  // Resolves the caller's BYOK key first, then the server fallback key.
  // Returns null when AI is not configured at all.
  async function resolveKey(userId?: string): Promise<string | null> {
    if (userId) {
      const stored = await repo.findByUserId(userId);
      if (stored) {
        try {
          return decryptUserKey(stored.encryptedKey, config.byokMasterKey);
        } catch {
          return null;
        }
      }
    }
    return config.metaApiKey ?? null;
  }

  function aiError(reply: import('fastify').FastifyReply, err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const status = message.includes('timed out') ? 504 : 502;
    return reply.status(status).send({ error: message });
  }

  const NOT_CONFIGURED =
    'AI is not configured: set META_API_KEY on the server or save a user key first.';

  // AI city creation: model proposes a validated plan; the generator builds it.
  app.post('/ai/city-plan', async (request, reply) => {
    const parsed = cityPlanSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: 'Invalid body', issues: parsed.error.issues });
    }
    const key = await resolveKey(parsed.data.userId);
    if (!key) return reply.status(503).send({ error: NOT_CONFIGURED });
    try {
      const plan = await proposeCityPlan(parsed.data.description ?? null, {
        userKey: key,
        model: config.metaModel,
      });
      return reply.send({ plan });
    } catch (err) {
      return aiError(reply, err);
    }
  });

  // Intervention agent: proposes bounded levers from measured metrics.
  app.post('/ai/interventions', async (request, reply) => {
    const parsed = interventionsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: 'Invalid body', issues: parsed.error.issues });
    }
    const key = await resolveKey(parsed.data.userId);
    if (!key) return reply.status(503).send({ error: NOT_CONFIGURED });
    try {
      const plan = await proposeInterventions(parsed.data.context, {
        userKey: key,
        model: config.metaModel,
      });
      return reply.send({ plan });
    } catch (err) {
      return aiError(reply, err);
    }
  });

  // One citizen narrates their measured state in first person.
  app.post('/ai/citizen', async (request, reply) => {
    const parsed = citizenSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: 'Invalid body', issues: parsed.error.issues });
    }
    const key = await resolveKey(parsed.data.userId);
    if (!key) return reply.status(503).send({ error: NOT_CONFIGURED });
    try {
      const replyText = await explainCitizen(parsed.data.context, {
        userKey: key,
        model: config.metaModel,
      });
      return reply.send({ reply: replyText });
    } catch (err) {
      return aiError(reply, err);
    }
  });

  // Emergency report written from measured outcomes only.
  app.post('/ai/report', async (request, reply) => {
    const parsed = reportSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: 'Invalid body', issues: parsed.error.issues });
    }
    const key = await resolveKey(parsed.data.userId);
    if (!key) return reply.status(503).send({ error: NOT_CONFIGURED });
    try {
      const result = await writeEmergencyReport(parsed.data.context, {
        userKey: key,
        model: config.metaModel,
      });
      return reply.send({ report: result.report });
    } catch (err) {
      return aiError(reply, err);
    }
  });
}
