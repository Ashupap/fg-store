import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { loginUser } from '@/lib/auth';
import { loginSchema } from '@/lib/validations';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Validate input
        const validation = loginSchema.safeParse(body);
        if (!validation.success) {
            const error = validation.error;
            return NextResponse.json(
                { success: false, error: error.issues[0]?.message || 'Validation failed' },
                { status: 400 }
            );
        }

        const { username, password } = validation.data;
        const result = await loginUser(username, password);

        if (!result.success) {
            return NextResponse.json(
                { success: false, error: result.error },
                { status: 401 }
            );
        }

        // Set cookie
        const cookieStore = await cookies();
        cookieStore.set('auth-token', result.token!, {
            httpOnly: true,
            secure: false, // process.env.NODE_ENV === 'production', // Changed to false to allow IP/HTTP access
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7, // 7 days
            path: '/',
        });

        return NextResponse.json({
            success: true,
            user: result.user,
        });
    } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json(
            { success: false, error: 'An error occurred during login' },
            { status: 500 }
        );
    }
}
