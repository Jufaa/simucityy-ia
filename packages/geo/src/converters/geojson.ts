import { z } from 'zod';
const position = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90),
]);
const ring = z
  .array(position)
  .min(4)
  .refine((p) => {
    const first = p[0],
      last = p[p.length - 1];
    return first?.[0] === last?.[0] && first?.[1] === last?.[1];
  }, 'Polygon rings must be closed');
const geometry = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Point'), coordinates: position }),
  z.object({
    type: z.literal('LineString'),
    coordinates: z.array(position).min(2),
  }),
  z.object({ type: z.literal('Polygon'), coordinates: z.array(ring).min(1) }),
  z.object({
    type: z.literal('MultiPolygon'),
    coordinates: z.array(z.array(ring).min(1)).min(1),
  }),
]);
export const featureCollectionSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z
    .array(
      z.object({
        type: z.literal('Feature'),
        id: z.union([z.string(), z.number()]).optional(),
        geometry,
        properties: z.record(z.string(), z.unknown()).nullable(),
      }),
    )
    .max(10000),
});
export type NormalizedGeoJSON = z.infer<typeof featureCollectionSchema>;
/** Supported 2D geometries only. Reject unsupported/invalid geometries rather than guessing. */
export function normalizeGeoJSON(input: unknown): NormalizedGeoJSON {
  return featureCollectionSchema.parse(input);
}
