import { describe, expect, it } from 'vitest';
import * as shared from './index';

describe('minimal shared health contract', () => {
  it('exports only the contract used by the API and web health connection', () => {
    expect(Object.keys(shared)).toEqual(['healthSchema']);
  });

  it('accepts the existing health response and removes unknown fields', () => {
    expect(
      shared.healthSchema.parse({
        status: 'ok',
        service: 'simulicity-api',
        version: '0.1.0',
        privateValue: 'not public',
      }),
    ).toEqual({ status: 'ok', service: 'simulicity-api', version: '0.1.0' });
  });

  it('rejects responses outside the health contract', () => {
    expect(shared.healthSchema.safeParse({ status: 'down' }).success).toBe(
      false,
    );
  });
});
