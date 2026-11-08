export type AuthIdentity = { id: string; email: string };
export interface AuthPort {
  getIdentity(): Promise<AuthIdentity | null>;
  requestLogin(email: string): Promise<void>;
  logout(): Promise<void>;
}
