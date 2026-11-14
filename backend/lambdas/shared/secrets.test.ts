import { afterEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();
vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: class {
    send = send;
  },
  GetParameterCommand: class {
    constructor(readonly input: unknown) {}
  },
}));

const load = async () => {
  vi.resetModules();
  return (await import('./secrets')).getSecret;
};

describe('getSecret', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    send.mockReset();
  });

  it('prefers a plain env var', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'direct');
    expect(await (await load())('ANTHROPIC_API_KEY')).toBe('direct');
    expect(send).not.toHaveBeenCalled();
  });

  it('reads the decrypted SecureString once per container', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('ANTHROPIC_API_KEY_PARAM', '/workshop/pov/anthropic-api-key');
    send.mockResolvedValue({ Parameter: { Value: ' sk-test \n' } });
    const getSecret = await load();
    expect(await getSecret('ANTHROPIC_API_KEY')).toBe('sk-test');
    expect(await getSecret('ANTHROPIC_API_KEY')).toBe('sk-test');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0].input).toEqual({ Name: '/workshop/pov/anthropic-api-key', WithDecryption: true });
  });

  it('treats the Terraform placeholder as not set', async () => {
    vi.stubEnv('SUPABASE_SECRET_KEY', '');
    vi.stubEnv('SUPABASE_SECRET_KEY_PARAM', '/workshop/pov/supabase-secret-key');
    send.mockResolvedValue({ Parameter: { Value: 'unset' } });
    await expect((await load())('SUPABASE_SECRET_KEY')).rejects.toThrow('Secret SUPABASE_SECRET_KEY is not set');
  });
});
