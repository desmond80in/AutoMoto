import type { PreSignUpTriggerEvent } from 'aws-lambda';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STAFF, stubSupabase } from '../shared/test-utils';
import { handler, NOT_STAFF_MESSAGE } from './index';

const event = (email: string) =>
  ({
    triggerSource: 'PreSignUp_ExternalProvider',
    request: { userAttributes: { email } },
    response: { autoConfirmUser: false, autoVerifyEmail: false, autoVerifyPhone: false },
  }) as unknown as PreSignUpTriggerEvent;

describe('cognito-pre-signup', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('allows and auto-confirms registered staff', async () => {
    const fetch = stubSupabase([STAFF]);
    const out = await handler(event('Ana.Desk@Example.com'));
    expect(out.response.autoConfirmUser).toBe(true);
    expect(out.response.autoVerifyEmail).toBe(true);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toContain('email=eq.ana.desk%40example.com');
    expect(url).toContain('active=is.true');
    expect((init!.headers as Record<string, string>).apikey).toBe('sb_secret_test');
  });

  it('denies an e-mail that is not staff', async () => {
    stubSupabase([]);
    await expect(handler(event('stranger@gmail.com'))).rejects.toThrow(NOT_STAFF_MESSAGE);
  });

  it('denies when no e-mail is present', async () => {
    stubSupabase([STAFF]);
    await expect(handler(event(''))).rejects.toThrow(NOT_STAFF_MESSAGE);
  });
});
