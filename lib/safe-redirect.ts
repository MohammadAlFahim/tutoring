/**
 * Returns a safe same-origin relative path for post-login redirects.
 *
 * Only accepts a single-slash absolute path (e.g. "/chat", "/admin/analytics").
 * Anything that could redirect off-site — protocol-relative "//evil.com",
 * backslash tricks "/\evil.com", userinfo "@evil.com", or an absolute URL — is
 * rejected and the fallback is returned. Prevents the classic open-redirect
 * where `${origin}${next}` reinterprets the app host as URL userinfo.
 */
export function safeNextPath(
  raw: string | null | undefined,
  fallback = "/chat",
): string {
  if (!raw) return fallback;
  // Must be an absolute path, not protocol-relative or backslash-escaped.
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return fallback;
  }
  // Reject anything that isn't a plain path (no scheme, no userinfo, no host).
  if (/[\\]/.test(raw)) return fallback;
  return raw;
}
