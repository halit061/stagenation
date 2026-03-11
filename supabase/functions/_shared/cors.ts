/**
 * Shared CORS utility for all edge functions.
 * Restricts Access-Control-Allow-Origin to trusted origins only.
 */

const ALLOWED_ORIGINS = [
  "https://bizimevents.be",
  "https://www.bizimevents.be",
];

export function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get("Origin") || "";
  const isAllowed = ALLOWED_ORIGINS.includes(origin);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Client-Info, Apikey",
  };
  if (isAllowed) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  } else {
    // SECURITY: For non-matching origins, set fixed origin without credentials
    headers["Access-Control-Allow-Origin"] = ALLOWED_ORIGINS[0];
  }
  return headers;
}

/** Standard OPTIONS preflight response */
export function handleCorsOptions(req: Request): Response {
  return new Response("ok", { headers: getCorsHeaders(req) });
}

/**
 * SECURITY: Check if a role is super_admin (handles both naming conventions).
 * Canonical role name is 'super_admin', but 'superadmin' is also accepted for backwards compatibility.
 */
export function isSuperAdminRole(role: string): boolean {
  return role === 'super_admin' || role === 'superadmin';
}

/** Check if user has super_admin role from a roles array */
export function hasSuperAdminRole(roles: { role: string }[] | null): boolean {
  return roles?.some(r => isSuperAdminRole(r.role)) ?? false;
}
