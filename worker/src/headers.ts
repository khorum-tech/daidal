/**
 * Security headers for everything the site sends: the static files (through `dist/_headers`, which
 * scripts/assemble.mjs writes from this) and the Worker's own responses.
 *
 * The app page carries its full Content-Security-Policy itself, as a meta tag SvelteKit writes with the hash of its
 * one inline script (`kit.csp` in app/vite.config.ts). A meta tag can't say who may frame the page, so the header
 * policy adds that, and the rest that holds for every response: no plugins, no <base> rewriting, forms only here.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  "content-security-policy": "frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  "cross-origin-opener-policy": "same-origin",
};

/** [headers] with the security headers set, unless the response already set one of its own. */
export function secure(headers: Headers): Headers {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!headers.has(k)) headers.set(k, v);
  return headers;
}

/** [response] with the security headers added; a response straight from the assets binding is read-only, so copy it. */
export function secured(response: Response): Response {
  const out = new Response(response.body, response);
  secure(out.headers);
  return out;
}
