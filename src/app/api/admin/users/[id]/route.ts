
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser, hashPassword, hasPermission } from '@/lib/auth';

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

        // Enforce Single Store Restriction for non-global roles
        const globalRoles = ['admin', 'general_manager', 'marketing_manager'];
        const isGlobalRole = globalRoles.includes(role);
        if (!isGlobalRole && assigned_store_ids && assigned_store_ids.length > 1) {
            return NextResponse.json({ success: false, error: 'Localized operators and managers can only be assigned to one store.' }, { status: 400 });
        }

        const db = getDb();

        // Check if user exists
        const existingInfo = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(userId) as any;
        if (!existingInfo) {
            return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
        }

        // Check for duplicates (username or email) excluding current user
        const duplicate = db.prepare('SELECT id FROM users WHERE (username = ? OR email = ?) AND id != ?').get(username, email, userId);
        if (duplicate) {
            return NextResponse.json({ success: false, error: 'User with this username or email already exists' }, { status: 400 });
        }

        let newPasswordHash = existingInfo.password_hash;
        if (password && password.trim() !== '') {
            newPasswordHash = await hashPassword(password);
        }

        const transaction = db.transaction(() => {
            // Update user info
            db.prepare(`
                UPDATE users 
                SET name = ?, username = ?, email = ?, password_hash = ?, role = ?, is_active = ?
                WHERE id = ?
            `).run(name, username, email, newPasswordHash, role, is_active ? 1 : 0, userId);

            // Update store assignments if provided
            if (assigned_store_ids && Array.isArray(assigned_store_ids)) {
                // Delete existing assignments
                db.prepare('DELETE FROM user_stores WHERE user_id = ?').run(userId);

                // Insert new assignments
                const insertStore = db.prepare('INSERT INTO user_stores (user_id, store_id) VALUES (?, ?)');
                for (const storeId of assigned_store_ids) {
                    insertStore.run(userId, storeId);
                }
            }
        });

        transaction();

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Update user error:', error);
        return NextResponse.json({ success: false, error: 'Failed to update user' }, { status: 500 });
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

        // Prevent self-deletion
        if (user.id === userId) {
            return NextResponse.json({ success: false, error: 'Cannot delete your own account' }, { status: 400 });
        }

        const db = getDb();

        const transaction = db.transaction(() => {
            // Delete user stores first (optional if cascade, but safer explicit)
            db.prepare('DELETE FROM user_stores WHERE user_id = ?').run(userId);
            // Delete user
            db.prepare('DELETE FROM users WHERE id = ?').run(userId);
        });

        transaction();

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Delete user error:', error);
        return NextResponse.json({ success: false, error: 'Failed to delete user' }, { status: 500 });
    }
}
