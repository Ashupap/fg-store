import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // STRICT BYPASS for Guide
    if (pathname.startsWith('/guide')) {
        const response = NextResponse.next();
        response.headers.set('X-Guide-Debug', 'Allowed');
        return response;
    }

    // Public paths
    const publicPaths = [
        '/',
        '/login',
        '/api/auth/login',
        '/api/auth/logout',
    ];

    if (publicPaths.some(path => pathname === path || pathname.startsWith('/public/'))) {
        return NextResponse.next();
    }

    // Static assets
    if (pathname.startsWith('/_next') || pathname.includes('.')) {
        return NextResponse.next();
    }

    // Auth Check
    const token = request.cookies.get('auth-token');
    if (!token) {
        const loginUrl = new URL('/login', request.url);
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
