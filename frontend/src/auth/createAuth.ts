import type { AppConfig } from '../config/loadConfig';
import { CognitoAuth } from './CognitoAuth';
import { DevAuth } from './DevAuth';
import type { AuthAdapter } from './types';

export function createAuth(cfg: AppConfig): AuthAdapter {
  return cfg.authMode === 'dev' ? new DevAuth(cfg) : new CognitoAuth(cfg);
}
