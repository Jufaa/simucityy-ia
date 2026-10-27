import { healthSchema } from '@simulicity/shared';

/** The browser sees only the validated public health contract, never upstream details. */
export async function checkApiHealth(
  fetcher: typeof fetch = fetch,
  apiUrl = process.env.API_URL ?? 'http://127.0.0.1:4000',
): Promise<Response> {
  try {
    const url = new URL(apiUrl);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      throw new Error('Invalid API_URL');
    }
    url.pathname = `${url.pathname.replace(/\/$/, '')}/health`;
    url.search = '';
    url.hash = '';
    const response = await fetcher(url.toString(), {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error('Unhealthy API');
    const health = healthSchema.parse(await response.json());
    return Response.json(health, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json(
      {
        error: {
          code: 'API_UNAVAILABLE',
          message: 'The API health check is unavailable.',
        },
      },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
