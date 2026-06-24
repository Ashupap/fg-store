import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        // Restrict to admin and general_manager roles
        if (!user || (user.role !== 'admin' && user.role !== 'general_manager')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        const db = getDb();

        const auditLogs = db.prepare(`
            SELECT 
                al.id,
                al.action_type,
                al.table_name,
                al.record_id,
                al.before_state,
                al.after_state,
                al.changed_by_id,
                al.changed_by_name,
                al.change_reason,
                al.timestamp
            FROM audit_logs al
            ORDER BY al.timestamp DESC, al.id DESC
        `).all() as any[];

        return NextResponse.json({ success: true, data: auditLogs });
    } catch (error: any) {
        console.error('Fetch audit logs error:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch audit logs' }, { status: 500 });
    }
}
