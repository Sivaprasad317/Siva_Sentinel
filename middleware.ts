// Optional password protection.
// If APP_ACCESS_TOKEN is set in .env.local, every page and API call requires a login
// (username: siva, password: the token). Leave it empty when you only use the app on
// your own computer (the server listens on 127.0.0.1, so other devices cannot reach it).
import { NextResponse, type NextRequest } from 'next/server';

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function middleware(req: NextRequest) {
  const token = process.env.APP_ACCESS_TOKEN;
  if (!token) return NextResponse.next();

  const header = req.headers.get('authorization') ?? '';
  if (header.startsWith('Basic ')) {
    try {
      const [user, ...rest] = atob(header.slice(6)).split(':');
      if (user === 'siva' && safeEqual(rest.join(':'), token)) return NextResponse.next();
    } catch {
      /* fall through to 401 */
    }
  }
  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Siva", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
