import { z } from 'zod';

export const healthSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('simulicity-api'),
  version: z.string(),
});
export type Health = z.infer<typeof healthSchema>;
