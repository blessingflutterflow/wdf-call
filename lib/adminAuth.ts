/**
 * The admin dashboard (/admin) has exactly one gate: a shared access code
 * set as ADMIN_ACCESS_CODE, sent back as the `x-admin-code` header on every
 * request. Not tied to a specific Firebase account — deliberately, so
 * there's no dependency on knowing which uid is "the admin" ahead of time.
 * Rotate it by changing the env var.
 */
export function isAuthorizedAdmin(request: Request): boolean {
  const code = process.env.ADMIN_ACCESS_CODE;
  if (!code) return false; // fail closed if it's not configured
  const provided = request.headers.get('x-admin-code');
  return !!provided && provided === code;
}
