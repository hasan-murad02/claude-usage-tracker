import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const COOKIE = 'ut_auth';

// The cookie is an HMAC of the password, so the password itself is never stored client-side.
export function token(password: string) {
  return createHmac('sha256', password).update('claude-usage-tracker').digest('hex');
}

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function requireAuth() {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) throw new Error('DASHBOARD_PASSWORD is not set');
  const value = (await cookies()).get(COOKIE)?.value ?? '';
  if (!safeEqual(value, token(password))) redirect('/login');
}
