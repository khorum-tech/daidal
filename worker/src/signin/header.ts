import { jwtVerify, type JWTVerifyGetKey } from "jose";
import { optionalString } from "./oidc";
import type { HeaderProvider, ProviderContext } from "./provider";

/**
 * Cloudflare Access, as Daidal has always used it: Access stands in front of the site and adds a signed
 * `Cf-Access-Jwt-Assertion` JWT to every request, which is checked against the team's keys (RS256, issuer, the
 * application's AUD, expiry). A JWT with no email, such as an Access service token, is refused.
 *
 * Signing out clears the application's `CF_Authorization` cookie here, then goes to the team domain's logout, which
 * ends the Access session for every application and comes back to Daidal (`returnTo`), where Access asks again. The
 * application's own `/cdn-cgi/access/logout` is not used: on a hostname that Access doesn't see the cookie for, it
 * shows "No Access cookie found" and signs nobody out.
 */
export function accessProvider(
  ctx: Pick<ProviderContext, "id" | "options">,
  settings: { teamDomain: string; audience: string },
  getKeys: () => JWTVerifyGetKey,
): HeaderProvider {
  return {
    kind: "header",
    id: ctx.id,
    name: optionalString(ctx.options, "name") ?? "Cloudflare Access",
    icon: optionalString(ctx.options, "icon") ?? "shieldCheck",
    signOutUrl: returnTo =>
      settings.teamDomain ? `${settings.teamDomain}/cdn-cgi/access/logout?returnTo=${encodeURIComponent(returnTo)}` : "/cdn-cgi/access/logout",
    signOutCookies: ["CF_Authorization"],
    async identify(request) {
      const token = request.headers.get("Cf-Access-Jwt-Assertion");
      if (!token || !settings.teamDomain || !settings.audience) return null;
      try {
        const { payload } = await jwtVerify(token, getKeys(), { issuer: settings.teamDomain, audience: settings.audience, algorithms: ["RS256"] });
        const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
        if (!email.includes("@")) return null;
        return { provider: ctx.id, subject: typeof payload.sub === "string" && payload.sub ? payload.sub : email, email };
      } catch (e) {
        console.warn("Access token rejected:", e instanceof Error ? e.name : e);
        return null;
      }
    },
  };
}

/**
 * The address the request came from, as the platform reports it. On Cloudflare that is `CF-Connecting-IP`, which
 * Cloudflare sets itself and a client can't. A self-hosted server must set the same header from the socket.
 */
export const connectingAddress = (request: Request): string | null => request.headers.get("CF-Connecting-IP");

/**
 * A forward-auth proxy (Authelia, Authentik, oauth2-proxy, Pomerium…) signs the person in and passes who they are in
 * headers. Anyone can send those headers, so they are believed only from the proxy's own addresses
 * (`trustedProxies`, required): from anywhere else they are ignored.
 *
 * Settings: `trustedProxies` (addresses, required), `emailHeader` (default `Remote-Email`), `userHeader`
 * (default `Remote-User`, the subject; the email when absent), `nameHeader` (default `Remote-Name`), `name`,
 * `icon`, `signOutUrl` (the proxy's logout page).
 */
export function forwardAuthProvider(ctx: ProviderContext): HeaderProvider {
  const proxies = Array.isArray(ctx.options.trustedProxies) ? ctx.options.trustedProxies.filter((a): a is string => typeof a === "string" && !!a.trim()) : [];
  if (!proxies.length) throw new Error(`sign-in provider "${ctx.id}" needs trustedProxies: the forward-auth proxy's addresses`);
  const trusted = new Set(proxies.map(a => a.trim()));
  const emailHeader = optionalString(ctx.options, "emailHeader") ?? "Remote-Email";
  const userHeader = optionalString(ctx.options, "userHeader") ?? "Remote-User";
  const nameHeader = optionalString(ctx.options, "nameHeader") ?? "Remote-Name";
  return {
    kind: "header",
    id: ctx.id,
    name: optionalString(ctx.options, "name") ?? "Single sign-on",
    icon: optionalString(ctx.options, "icon") ?? "shieldCheck",
    signOutUrl: optionalString(ctx.options, "signOutUrl"),
    async identify(request) {
      const from = connectingAddress(request);
      if (!from || !trusted.has(from)) return null;
      const email = request.headers.get(emailHeader)?.trim().toLowerCase() ?? "";
      if (!email.includes("@")) return null;
      const subject = request.headers.get(userHeader)?.trim() || email;
      return { provider: ctx.id, subject, email, name: request.headers.get(nameHeader)?.trim() || undefined };
    },
  };
}
