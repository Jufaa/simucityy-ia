import { z } from 'zod';

const mapConfigSchema = z.object({
  longitude: z.coerce.number().finite().min(-180).max(180),
  latitude: z.coerce.number().finite().min(-85).max(85),
  styleUrl: z
    .url()
    .refine(
      (value) => value.startsWith('https://'),
      'Map style must use HTTPS.',
    ),
});
export function getMapConfig() {
  return mapConfigSchema.parse({
    longitude: process.env.NEXT_PUBLIC_INITIAL_LONGITUDE ?? -80.1918,
    latitude: process.env.NEXT_PUBLIC_INITIAL_LATITUDE ?? 25.7617,
    styleUrl:
      process.env.NEXT_PUBLIC_MAP_STYLE_URL ??
      'https://tiles.openfreemap.org/styles/liberty',
  });
}
