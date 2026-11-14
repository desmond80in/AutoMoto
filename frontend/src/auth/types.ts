export interface AuthAdapter {
  signIn(): Promise<void>;
  handleCallback(): Promise<void>;
  getAccessToken(): Promise<string | null>;
  signOut(): Promise<void>;
}
