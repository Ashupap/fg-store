import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

export async function GET() {
    try {
        const user = await getCurrentUser();

        if (!user) {
            return NextResponse.json(
                { success: false, error: 'Not authenticated' },
                { status: 401 }
            );
        }

        return NextResponse.json({ success: true, user });
    } catch (error) {
        console.error('Auth check error:', error);
        return NextResponse.json(
            { success: false, error: 'An error occurred' },
            { status: 500 }
        );
    }
}
