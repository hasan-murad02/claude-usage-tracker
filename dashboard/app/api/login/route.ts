import { NextResponse } from 'next/server';
import { COOKIE, safeEqual, token } from '@/lib/auth';

export async function POST(req: Request) {
  const expected = process.env.DASHBOARD_PASSWORD;
  const given = String((await req.formData()).get('password') ?? '');

  if (!expected || !safeEqual(token(given), token(expected))) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return NextResponse.redirect(new URL('/login?error=1', req.url), 303);
  }

  const res = NextResponse.redirect(new URL('/', req.url), 303);
  res.cookies.set(COOKIE, token(expected), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });
  return res;
}
