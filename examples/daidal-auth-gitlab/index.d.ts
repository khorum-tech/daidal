// The shape of a Daidal sign-in provider plugin, as worker/src/signin/provider.ts defines it.
export interface ProviderContext {
  id: string;
  options: Record<string, unknown>;
  secret(name?: string): string | undefined;
  fetch: typeof fetch;
}
export interface VerifiedIdentity {
  provider: string;
  subject: string;
  email: string;
  name?: string;
}
export interface RedirectProvider {
  kind: "redirect";
  id: string;
  name: string;
  icon?: string;
  authorizeUrl(input: { redirectUri: string; state: string; codeChallenge: string; nonce: string }): Promise<string>;
  callback(input: { params: URLSearchParams; redirectUri: string; codeVerifier: string; nonce: string }): Promise<VerifiedIdentity>;
}
declare const plugin: { type: string; create(context: ProviderContext): RedirectProvider };
export default plugin;
