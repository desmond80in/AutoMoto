import { Amplify } from 'aws-amplify';
import { fetchAuthSession, signInWithRedirect, signOut } from 'aws-amplify/auth';
import type { AppConfig } from '../config/loadConfig';
import type { AuthAdapter } from './types';

export class CognitoAuth implements AuthAdapter {
  constructor(cfg: AppConfig) {
    Amplify.configure({
      Auth: {
        Cognito: {
          userPoolId: cfg.cognito.userPoolId,
          userPoolClientId: cfg.cognito.userPoolClientId,
          loginWith: {
            oauth: {
              domain: cfg.cognito.domain,
              scopes: ['openid', 'email', 'profile'],
              redirectSignIn: cfg.cognito.redirectSignIn,
              redirectSignOut: cfg.cognito.redirectSignOut,
              responseType: 'code',
              providers: ['Google'],
            },
          },
        },
      },
    });
  }

  signIn(): Promise<void> {
    return signInWithRedirect({ provider: 'Google' });
  }

  /** Amplify completes the code exchange on /auth/callback; wait until tokens are available. */
  async handleCallback(): Promise<void> {
    for (let i = 0; i < 40; i++) {
      if (await this.getAccessToken()) return;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error('Sign-in did not complete.');
  }

  async getAccessToken(): Promise<string | null> {
    try {
      return (await fetchAuthSession()).tokens?.accessToken?.toString() ?? null;
    } catch {
      return null;
    }
  }

  signOut(): Promise<void> {
    return signOut();
  }
}
