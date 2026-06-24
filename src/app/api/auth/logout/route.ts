import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

async function performLogout() {
    const cookieStore = await cookies();
    cookieStore.set('auth-token', '', {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
    });
}

export async function POST() {
    try {
        await performLogout();
        return NextResponse.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        return NextResponse.json(
            { success: false, error: 'An error occurred during logout' },
            { status: 500 }
        );
    }
}

export async function GET(request: NextRequest) {
    try {
        await performLogout();
        const url = new URL('/login', request.url);
        return NextResponse.redirect(url);
    } catch (error) {
        console.error('Logout error during GET:', error);
        const url = new URL('/login', request.url);
        return NextResponse.redirect(url);
    }
}

