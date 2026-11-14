import type { PreTokenGenerationV2TriggerEvent } from 'aws-lambda';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STAFF, stubSupabase } from '../shared/test-utils';
import { _clearCache, ACCESS_REMOVED_MESSAGE, handler } from './index';

const SUB = '6f0c2a1e-1111-2222-3333-444455556666';
const event = (email = 'ana.desk@example.com') =>
  ({
    version: '2',
    triggerSource: 'TokenGeneration_RefreshTokens',
    request: { userAttributes: { email, sub: SUB }, groupConfiguration: {}, scopes: [] },
    response: {},
  }) as unknown as PreTokenGenerationV2TriggerEvent;

describe('cognito-pre-token (V2_0)', () => {
  beforeEach(() => _clearCache());
  afterEach(() => vi.unstubAllGlobals());

  it('adds the Supabase/RLS claims to both access and ID tokens', async () => {
    stubSupabase([{ ...STAFF, cognito_sub: SUB }]);
    const out = await handler(event());
    const expected = {
      role: 'authenticated',
      staff_id: STAFF.id,
      shop_id: STAFF.shop_id,
      app_roles: 'frontdesk kiosk display',
      staff_email: 'ana.desk@example.com',
    };
    expect(out.response.claimsAndScopeOverrideDetails).toEqual({
      accessTokenGeneration: { claimsToAddOrOverride: expected },
      idTokenGeneration: { claimsToAddOrOverride: expected },
    });
  });

  it('links cognito_sub on first sign-in', async () => {
    const fetch = stubSupabase([{ ...STAFF, cognito_sub: null }]);
    await handler(event());
    const patch = fetch.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(patch).toBeDefined();
    expect(patch![0]).toContain('cognito_sub=is.null');
    expect(JSON.parse(String(patch![1]!.body))).toEqual({ cognito_sub: SUB });
  });

  it('blocks token issue (including refresh) when staff is missing or inactive', async () => {
    stubSupabase([]);
    await expect(handler(event())).rejects.toThrow(ACCESS_REMOVED_MESSAGE);
  });

  it('caches the lookup for 60 seconds', async () => {
    const fetch = stubSupabase([{ ...STAFF, cognito_sub: SUB }]);
    await handler(event());
    await handler(event());
    expect(fetch.mock.calls.filter(([, init]) => !init?.method || init.method === 'GET')).toHaveLength(1);
  });
});
