import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ApiConfig } from '../../config/env.js';
import { encryptUserKey, decryptUserKey } from './crypto.js';
import { SqliteUserKeyRepository } from './sqlite-repository';
import { runAi } from './service.js';

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
      });
      return reply.send({ result });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const status = message.includes('timed out') ? 504 : 502;
      return reply.status(status).send({ error: message });
    }
  });
}
