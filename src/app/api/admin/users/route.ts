
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { UserService } from '@/services/user-service';

export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || !hasPermission(user, 'users:manage')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        const service = new UserService(getDb());
        const usersWithStores = service.listAll();
        return NextResponse.json({ success: true, data: usersWithStores });
    } catch (error) {
        console.error('Fetch users error:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch users' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || !hasPermission(user, 'users:manage')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json();
        const { name, username, email, password, role, assigned_store_ids } = body;

        if (!name || !username || !email || !password || !role) {
            return NextResponse.json({ success: false, error: 'Missing required fields (name, username, email, password, role)' }, { status: 400 });
        }

        const service = new UserService(getDb());
        const newUserId = await service.create({ name, username, email, password, role, assigned_store_ids });
        return NextResponse.json({ success: true, data: { id: newUserId } });
    } catch (error) {
        console.error('Create user error:', error);
        const message = error instanceof Error ? error.message : 'Failed to create user';
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
