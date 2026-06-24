
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser, hasPermission } from '@/lib/auth';
import { UserService } from '@/services/user-service';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await getCurrentUser();
        if (!user || !hasPermission(user, 'users:manage')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        const { id } = await params;
        const userId = parseInt(id);
        if (isNaN(userId)) {
            return NextResponse.json({ success: false, error: 'Invalid user ID' }, { status: 400 });
        }

        const body = await request.json();
        const { name, username, email, password, role, assigned_store_ids, is_active } = body;

        const service = new UserService(getDb());
        await service.update(userId, { name, username, email, password, role, assigned_store_ids, is_active });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Update user error:', error);
        const message = error instanceof Error ? error.message : 'Failed to update user';
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await getCurrentUser();
        if (!user || !hasPermission(user, 'users:manage')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        const { id } = await params;
        const userId = parseInt(id);
        if (isNaN(userId)) {
            return NextResponse.json({ success: false, error: 'Invalid user ID' }, { status: 400 });
        }

        if (user.id === userId) {
            return NextResponse.json({ success: false, error: 'Cannot delete your own account' }, { status: 400 });
        }

        const service = new UserService(getDb());
        service.delete(userId);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Delete user error:', error);
        return NextResponse.json({ success: false, error: 'Failed to delete user' }, { status: 500 });
    }
}
